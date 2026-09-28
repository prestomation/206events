import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import EnumclawRipper, { feedUrl, normalizeLocation, parseIcs } from "./ripper.js";
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
        expect(normalizeLocation("<p>Old Osceola Schoolhouse</p> - 45623 220th Ave SE  Enumclaw WA 98022"))
            .toBe("Old Osceola Schoolhouse, 45623 220th Ave SE, Enumclaw, WA 98022");
    });
    test("handles a blank street", () => {
        expect(normalizeLocation("<p>Cole Street from Myrtle to the tent on Cole</p> -   Enumclaw WA 98022"))
            .toBe("Cole Street from Myrtle to the tent on Cole, Enumclaw, WA 98022");
    });
    test("fills in the city name when the source omits it", () => {
        expect(normalizeLocation("<p>Glacier Middle School</p> -    WA 98022"))
            .toBe("Glacier Middle School, Enumclaw, WA 98022");
    });
    test("handles a blank venue and street", () => {
        expect(normalizeLocation(" -   Enumclaw WA 98022")).toBe("Enumclaw, WA 98022");
    });
});

describe("parseIcs", () => {
    test("parses the community events sample", () => {
        const results = parseIcs(readSample("sample-community-events.ics"), "test");
        const errors = results.filter(r => !("date" in r));
        expect(errors).toEqual([]);
        const events = eventsOf(results);
        expect(events.length).toBe(6);

        const workshop = events.find(e => e.id === "enumclaw-4943")!;
        expect(workshop.summary).toBe("Pumpkin Succulent Workshop #1");
        expect(workshop.date.toLocalDateTime().toString()).toBe("2026-10-11T11:00");
        expect(workshop.date.zone().id()).toBe(TIMEZONE.id());
        expect(workshop.duration.toHours()).toBe(2);
        expect(workshop.location).toBe("Old Osceola Schoolhouse, 45623 220th Ave SE, Enumclaw, WA 98022");
        expect(workshop.url).toBe("https://www.cityofenumclaw.net/m/calendar/event/detail/4943");

        // City name omitted from LOCATION on the source page.
        const craftShow = events.find(e => e.id === "enumclaw-4944")!;
        expect(craftShow.location).toBe("Glacier Middle School, Enumclaw, WA 98022");

        // Known source-data quirk: this LOCATION's "venue" segment (before
        // " - ") is a promotional sentence rather than a venue name, so it
        // passes through normalizeLocation as-is. The street address
        // portion is still correct and geocodable.
        const harvest = events.find(e => e.id === "enumclaw-4941")!;
        expect(harvest.location).toBe(
            "Join the community in the garden for a free event!, 46620 228th Ave SE, Enumclaw, WA 98022"
        );
    });

    test("produces stable, unique ids", () => {
        const a = eventsOf(parseIcs(readSample("sample-community-events.ics"), "test"));
        const b = eventsOf(parseIcs(readSample("sample-community-events.ics"), "test"));
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

describe("EnumclawRipper", () => {
    test("builds the community-events calendar", async () => {
        const fetched: string[] = [];
        const ripper = new EnumclawRipper();
        const fakeFetch = async (url: string) => {
            fetched.push(url);
            return new Response(readSample("sample-community-events.ics"), { status: 200 });
        };
        const config = {
            name: "enumclaw",
            url: new URL("https://www.cityofenumclaw.net/calendar.aspx"),
            proxy: false,
            geo: null,
            calendars: [
                { name: "community-events", friendlyname: "Community", timezone: TIMEZONE, tags: ["Community"], config: { catID: 23 } },
            ],
        } as any;
        // rip() takes its fetch from getFetchForConfig (plain fetch for
        // proxy: false), so stub the global fetch.
        const origFetch = globalThis.fetch;
        globalThis.fetch = fakeFetch as any;
        try {
            const cals = await ripper.rip({ config } as any);
            expect(cals.map(c => c.name)).toEqual(["community-events"]);
            expect(cals[0].tags).toEqual(["Community"]);
            expect(fetched).toEqual([feedUrl(23)]);
            for (const c of cals) expect(c.errors).toEqual([]);
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});
