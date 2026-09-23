import { describe, expect, test, vi } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DayOfWeek, LocalDate, ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import BellevueRipper, {
    extractItems, inferDate, listingUrl, normalizeAddress, parseItem, parseWhen,
} from "./ripper.js";
import { RipperCalendarEvent, UncertaintyError } from "../../lib/config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const TODAY = LocalDate.of(2026, 9, 23);

function readSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), "utf-8");
}

describe("inferDate", () => {
    test("picks the year whose weekday matches", () => {
        expect(inferDate(10, 3, DayOfWeek.SATURDAY, TODAY)!.toString()).toBe("2026-10-03");
        // Jan 2 2027 is a Saturday; Jan 2 2026 was a Friday.
        expect(inferDate(1, 2, DayOfWeek.SATURDAY, TODAY)!.toString()).toBe("2027-01-02");
    });
    test("returns null when no nearby year matches", () => {
        // Oct 3 is a Saturday in 2026, Sunday in 2027, Friday in 2025.
        expect(inferDate(10, 3, DayOfWeek.MONDAY, TODAY)).toBeNull();
    });
});

describe("parseWhen", () => {
    test("parses a time range", () => {
        const w = parseWhen("September 26 Saturday 10:00AM - 5:00PM", TODAY);
        if (typeof w === "string") throw new Error(w);
        expect(w.date.toString()).toBe("2026-09-26");
        expect(w.start!.toString()).toBe("10:00");
        expect(w.duration!.toMinutes()).toBe(420);
    });
    test("parses 12PM correctly", () => {
        const w = parseWhen("September 26 Saturday 12:00PM - 1:00PM", TODAY);
        if (typeof w === "string") throw new Error(w);
        expect(w.start!.toString()).toBe("12:00");
        expect(w.duration!.toMinutes()).toBe(60);
    });
    test("parses all day", () => {
        const w = parseWhen("November 11 Wednesday All day", TODAY);
        if (typeof w === "string") throw new Error(w);
        expect(w.allDay).toBe(true);
        expect(w.duration!.toHours()).toBe(24);
    });
    test("date with no time", () => {
        const w = parseWhen("October 24 Saturday", TODAY);
        if (typeof w === "string") throw new Error(w);
        expect(w.start).toBeNull();
        expect(w.allDay).toBe(false);
    });
    test("rejects garbage", () => {
        expect(typeof parseWhen("sometime soon", TODAY)).toBe("string");
        expect(typeof parseWhen("October 24 Saturday noonish", TODAY)).toBe("string");
    });
});

describe("normalizeAddress", () => {
    test("appends Bellevue when no city given", () => {
        expect(normalizeAddress(" Downtown Park,\n  10201 NE 4th St  ")).toBe("Downtown Park, 10201 NE 4th St, Bellevue, WA");
    });
    test("keeps an address that already names WA", () => {
        expect(normalizeAddress("Kelsey Creek Farm, 410 130th Pl. SE Bellevue, WA 98005"))
            .toBe("Kelsey Creek Farm, 410 130th Pl. SE Bellevue, WA 98005");
    });
});

describe("extractItems / parseItem", () => {
    test("extracts all cards from the first page", () => {
        const items = extractItems(readSample("sample-data-page0.html"));
        expect(items.length).toBe(10);
        const kpop = items.find(i => i.slug === "rpd-k-pop-play-day-2")!;
        expect(kpop.title).toBe("RPD+ K-Pop Play Day 2");
        expect(kpop.when).toBe("September 26 Saturday 10:00AM - 5:00PM");

        const results = parseItem(kpop, TODAY);
        expect(results.length).toBe(1);
        const ev = results[0] as RipperCalendarEvent;
        expect(ev.id).toBe("bellevue-rpd-k-pop-play-day-2-2026-09-26");
        expect(ev.date.toLocalDateTime().toString()).toBe("2026-09-26T10:00");
        expect(ev.date.zone().id()).toBe(TIMEZONE.id());
        expect(ev.location).toBe("City Hall Plaza, 450 110th Ave NE, Bellevue, WA");
        expect(ev.url).toBe("https://bellevuewa.gov/events/rpd-k-pop-play-day-2");
    });

    test("every card on the sample pages parses", () => {
        for (const f of ["sample-data-page0.html", "sample-data-page2.html"]) {
            for (const item of extractItems(readSample(f))) {
                const results = parseItem(item, TODAY);
                expect(results.some(r => "date" in r), `${f}: ${item.slug} ${item.when}`).toBe(true);
            }
        }
    });

    test("a date without a time emits an UncertaintyError", () => {
        const results = parseItem({ slug: "tree-giveaway", title: "Tree Giveaway", when: "October 24 Saturday", address: "1790 Richards Rd, Bellevue, WA 98005" }, TODAY);
        expect(results.length).toBe(2);
        const ev = results[0] as RipperCalendarEvent;
        const unc = results[1] as UncertaintyError;
        expect(unc.type).toBe("Uncertainty");
        expect(unc.unknownFields).toEqual(["startTime", "duration"]);
        expect(unc.event.id).toBe(ev.id);
    });

    test("an unparseable date is a ParseError", () => {
        const results = parseItem({ slug: "x", title: "X", when: "TBD", address: "" }, TODAY);
        expect(results.length).toBe(1);
        expect((results[0] as any).type).toBe("ParseError");
    });
});

describe("BellevueRipper", () => {
    test("paginates until an empty page, skips closures and duplicates", async () => {
        const fetched: string[] = [];
        const pages: Record<number, string> = {
            0: readSample("sample-data-page0.html"),
            1: readSample("sample-data-page2.html"),
            2: "<html><body></body></html>",
        };
        const fakeFetch = async (url: string) => {
            fetched.push(url);
            const page = parseInt(new URL(url).searchParams.get("page") ?? "0", 10);
            return new Response(pages[page] ?? "", { status: 200 });
        };
        const origFetch = globalThis.fetch;
        globalThis.fetch = fakeFetch as any;
        // The listing omits years; pin "now" to when the samples were saved.
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-23T12:00:00-07:00"));
        try {
            const config = {
                name: "bellevue",
                url: new URL("https://bellevuewa.gov/calendar"),
                proxy: false,
                geo: null,
                calendars: [{ name: "community-events", friendlyname: "Bellevue", timezone: TIMEZONE, tags: ["Community"], config: { category: "community-events" } }],
            } as any;
            const [cal] = await new BellevueRipper().rip({ config } as any);
            expect(fetched).toEqual([0, 1, 2].map(p => listingUrl("community-events", p)));
            expect(cal.events.some(e => /^City Hall closed/i.test(e.summary))).toBe(false);
            const ids = cal.events.map(e => e.id);
            expect(new Set(ids).size).toBe(ids.length);
            // 10 cards on page 0 + 2 on page 2, minus the Christmas closure notice.
            expect(cal.events.length).toBe(11);
            expect(cal.errors.filter(e => e.type === "ParseError")).toEqual([]);
        } finally {
            vi.useRealTimers();
            globalThis.fetch = origFetch;
        }
    });
});
