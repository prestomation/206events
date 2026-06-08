import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import BenaroyaHallRipper from "./ripper.js";
import { Ripper, RipperCalendar } from "../../lib/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// sample-data.json mirrors the live Sitecore GraphQL response shape. It uses
// deliberately stable dates so the suite never ages out: year 2099 for events
// that must always be "upcoming" and year 2020 for the one that must always be
// "past" (JSON can't carry comments, so the rationale lives here).
const SAMPLE = JSON.parse(
    readFileSync(join(__dirname, "sample-data.json"), "utf-8"),
);

function makeRipper(): Ripper {
    const tz = ZoneId.of("America/Los_Angeles");
    return {
        config: {
            name: "benaroya-hall",
            calendars: [
                {
                    name: "benaroya-taper",
                    friendlyname: "Benaroya Hall - S. Mark Taper Auditorium",
                    timezone: tz,
                    config: { venueMatch: "Taper" },
                },
                {
                    name: "benaroya-nordstrom",
                    friendlyname: "Benaroya Hall - Nordstrom Recital Hall",
                    timezone: tz,
                    config: { venueMatch: "Nordstrom" },
                },
                {
                    name: "benaroya-other",
                    friendlyname: "Benaroya Hall - Octave 9 & Other Spaces",
                    timezone: tz,
                    config: { venueMatch: "Benaroya Hall", catchAll: true },
                },
            ],
            proxy: false,
        } as any,
    } as Ripper;
}

function byName(cals: RipperCalendar[], name: string): RipperCalendar {
    const c = cals.find((c) => c.name === name);
    if (!c) throw new Error(`calendar ${name} not found`);
    return c;
}

describe("BenaroyaHallRipper", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: "OK",
            json: () => Promise.resolve({ data: SAMPLE }),
        });
        vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("returns all three configured calendars", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        expect(cals.map((c) => c.name).sort()).toEqual([
            "benaroya-nordstrom",
            "benaroya-other",
            "benaroya-taper",
        ]);
    });

    it("routes performances to the correct hall by venue name", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        // Taper event has two future performances.
        expect(byName(cals, "benaroya-taper").events.length).toBe(2);
        expect(byName(cals, "benaroya-nordstrom").events.length).toBe(1);
        // Octave 9 routes to the catch-all "other" calendar.
        const other = byName(cals, "benaroya-other");
        expect(other.events.length).toBe(1);
        expect(other.events[0].summary).toBe("Octave 9 New Music Showcase");
    });

    it("skips off-site (non-Benaroya) performances without error", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const allSummaries = cals.flatMap((c) =>
            c.events.map((e) => e.summary),
        );
        expect(allSummaries).not.toContain("Community Concert at Garfield");
        // The off-site skip is an intentional filter, not a parse error.
        const garfieldErrors = cals.flatMap((c) =>
            c.errors.filter((e) => e.reason?.includes("Garfield")),
        );
        expect(garfieldErrors).toHaveLength(0);
    });

    it("filters out past performances", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const allSummaries = cals.flatMap((c) =>
            c.events.map((e) => e.summary),
        );
        expect(allSummaries).not.toContain("Past Season Gala");
    });

    it("emits a ParseError for an unparseable performance date", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const taper = byName(cals, "benaroya-taper");
        const badDateErr = taper.errors.find((e) =>
            e.reason?.includes("Unparseable performance date"),
        );
        expect(badDateErr).toBeDefined();
        expect(badDateErr!.type).toBe("ParseError");
    });

    it("populates event fields: stable id, time, location, url, image", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const taper = byName(cals, "benaroya-taper");
        const mahler = taper.events.find((e) =>
            e.summary.includes("Mahler 7"),
        )!;
        expect(mahler).toBeDefined();
        // Stable id derived from source content (item name + performance date).
        expect(mahler.id).toBe("benaroya-hall-99mahler7-20990612023000");
        // 20990612T023000Z == 2099-06-11 19:30 Pacific (PDT, -07:00).
        expect(mahler.date.toString()).toContain("2099-06-11T19:30");
        expect(mahler.location).toContain(
            "S. Mark Taper Foundation Auditorium",
        );
        expect(mahler.location).toContain("200 University St");
        expect(mahler.url).toBe(
            "https://www.seattlesymphony.org/en/concerttickets/calendar/2099-2100/99mahler7",
        );
        expect(mahler.imageUrl).toBe(
            "https://www.seattlesymphony.org/-/media/A613396DF87D4E0F87D473A9385D62A5.ashx",
        );
        expect(mahler.duration.toString()).toBe("PT2H");
    });

    it("omits imageUrl when the event has no image", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const recital = byName(cals, "benaroya-nordstrom").events[0];
        expect(recital.imageUrl).toBeUndefined();
    });

    it("reports a fetch failure on every calendar instead of silent zero", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 403,
            statusText: "Forbidden",
            json: () => Promise.resolve({}),
        });
        // Fake timers so the retry backoff sleeps resolve instantly.
        vi.useFakeTimers();
        const p = new BenaroyaHallRipper().rip(makeRipper());
        await vi.runAllTimersAsync();
        const cals = await p;
        vi.useRealTimers();
        for (const c of cals) {
            expect(c.events).toHaveLength(0);
            expect(c.errors.length).toBeGreaterThanOrEqual(1);
            expect(c.errors[0].type).toBe("ParseError");
        }
    });
});
