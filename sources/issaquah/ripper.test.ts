import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import IssaquahRipper, { feedUrl, normalizeLocation, parseIcs } from "./ripper.js";
import { RipperCalendarEvent } from "../../lib/config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of("America/Los_Angeles");

function readSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), "utf-8");
}

function eventsOf(results: ReturnType<typeof parseIcs>): RipperCalendarEvent[] {
    return results.filter((r): r is RipperCalendarEvent => "date" in r);
}

describe("normalizeLocation", () => {
    test("strips HTML and builds a comma-separated address", () => {
        expect(normalizeLocation("<p>Issaquah Train Depot</p> - 78 1st Ave NE  Issaquah WA 98027"))
            .toBe("Issaquah Train Depot, 78 1st Ave NE, Issaquah, WA 98027");
    });
    test("handles a plain venue name", () => {
        expect(normalizeLocation("Pickering Barn - 1730 10th Ave. N.W.  Issaquah WA 98027"))
            .toBe("Pickering Barn, 1730 10th Ave. N.W., Issaquah, WA 98027");
    });
    test("handles a blank street", () => {
        expect(normalizeLocation("<p>Park Pointe</p> -   Issaquah WA 98027"))
            .toBe("Park Pointe, Issaquah, WA 98027");
    });
    test("handles a blank venue and street", () => {
        expect(normalizeLocation(" -   Issaquah WA 98027")).toBe("Issaquah, WA 98027");
    });
    test("keeps another city in the address", () => {
        expect(normalizeLocation(" -  232 228th Ave SE  Sammamish WA 98074"))
            .toBe("232 228th Ave SE, Sammamish, WA 98074");
    });
});

describe("parseIcs", () => {
    test("parses the community events sample", () => {
        const results = parseIcs(readSample("sample-community-events.ics"), "test");
        const errors = results.filter(r => !("date" in r));
        expect(errors).toEqual([]);
        const events = eventsOf(results);
        expect(events.length).toBe(10);

        const openMic = events.find(e => e.id === "issaquah-14362")!;
        expect(openMic.summary).toBe("Open Mic Night");
        expect(openMic.date.toLocalDateTime().toString()).toBe("2026-12-02T18:00");
        expect(openMic.date.zone().id()).toBe(TIMEZONE.id());
        expect(openMic.duration.toHours()).toBe(3);
        expect(openMic.location).toBe("Issaquah Train Depot, 78 1st Ave NE, Issaquah, WA 98027");
        expect(openMic.url).toBe("https://www.issaquahwa.gov/Calendar.aspx?EID=14362");

        // Folded LOCATION line is unfolded by ical.js.
        const kib = events.find(e => e.summary === "Keep Issaquah Beautiful Day")!;
        expect(kib.location).toBe("Historic Shell Station, 232 Front Street N, Issaquah, WA 98027");
    });

    test("treats date-only events as all-day", () => {
        const events = eventsOf(parseIcs(readSample("sample-community-events.ics"), "test"));
        const salmon = events.filter(e => e.summary === "Salmon Days 2026");
        expect(salmon.length).toBe(2);
        for (const e of salmon) {
            expect(e.date.toLocalTime().toString()).toBe("00:00");
            expect(e.duration.toHours()).toBe(24);
            expect(e.location).toBe("Olde Town, Issaquah, WA 98027");
        }
    });

    test("parses the parks sample with stable ids", () => {
        const a = eventsOf(parseIcs(readSample("sample-parks-events.ics"), "test"));
        const b = eventsOf(parseIcs(readSample("sample-parks-events.ics"), "test"));
        expect(a.length).toBe(14);
        expect(a.map(e => e.id)).toEqual(b.map(e => e.id));
        expect(new Set(a.map(e => e.id)).size).toBe(a.length);
    });

    test("returns a ParseError for garbage input", () => {
        const results = parseIcs("not an ics", "ctx");
        expect(results.length).toBe(1);
        expect("date" in results[0]).toBe(false);
    });

    test("returns a ParseError for a VEVENT without SUMMARY", () => {
        const ics = [
            "BEGIN:VCALENDAR", "VERSION:2.0",
            "BEGIN:VEVENT", "UID:1", "DTSTART;TZID=America/Los_Angeles:20261202T180000", "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
        const results = parseIcs(ics, "ctx");
        expect(results.length).toBe(1);
        expect((results[0] as any).type).toBe("ParseError");
    });
});

describe("IssaquahRipper", () => {
    test("builds one calendar per configured category", async () => {
        const fetched: string[] = [];
        const ripper = new IssaquahRipper();
        const fakeFetch = async (url: string) => {
            fetched.push(url);
            const body = url.includes("catID=37")
                ? readSample("sample-community-events.ics")
                : readSample("sample-parks-events.ics");
            return new Response(body, { status: 200 });
        };
        const config = {
            name: "issaquah",
            url: new URL("https://www.issaquahwa.gov/Calendar.aspx"),
            proxy: false,
            geo: null,
            calendars: [
                { name: "community-events", friendlyname: "Community", timezone: TIMEZONE, tags: ["Community"], config: { catID: 37 } },
                { name: "parks-events", friendlyname: "Parks", timezone: TIMEZONE, tags: ["Parks"], config: { catID: 40 } },
            ],
        } as any;
        // rip() takes its fetch from getFetchForConfig (plain fetch for
        // proxy: false), so stub the global fetch.
        const origFetch = globalThis.fetch;
        globalThis.fetch = fakeFetch as any;
        try {
            const cals = await ripper.rip({ config } as any);
            expect(cals.map(c => c.name)).toEqual(["community-events", "parks-events"]);
            expect(cals[0].tags).toEqual(["Community"]);
            expect(fetched).toEqual([feedUrl(37), feedUrl(40)]);
            for (const c of cals) expect(c.errors).toEqual([]);
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});
