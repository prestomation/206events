import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import BenaroyaHallRipper from "./ripper.js";
import { Ripper, RipperCalendar } from "../../lib/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// sample-data.json mirrors the live Umbraco `GetGridCalendarShows` response
// shape (a flat JSON array of performances). It uses deliberately stable
// dates so the suite never ages out: year 2099 for performances that must
// always be "upcoming" and year 2020 for the one that must always be "past"
// (JSON can't carry comments, so the rationale lives here).
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
            text: () => Promise.resolve(JSON.stringify(SAMPLE)),
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

    it("posts the fixed -1/empty-string filter defaults correctly", async () => {
        await new BenaroyaHallRipper().rip(makeRipper());
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(
            "https://benaroyahall.org/umbraco/api/performances/GetGridCalendarShows",
        );
        const body = new URLSearchParams(init.body as string);
        // These six default to "-1" in the site's own Vue state.
        expect(body.get("keywordId")).toBe("-1");
        expect(body.get("genre")).toBe("-1");
        expect(body.get("seriesKeywordId")).toBe("-1");
        expect(body.get("audienceKeywordId")).toBe("-1");
        expect(body.get("accessibilityKeywordId")).toBe("-1");
        expect(body.get("timeSlot")).toBe("-1");
        // These three default to "" instead — getting this asymmetry wrong
        // makes the endpoint silently return an empty body (see ripper.ts).
        expect(body.get("locationKeywordId")).toBe("");
        expect(body.get("programs")).toBe("");
        expect(body.get("query")).toBe("");
        expect(body.get("selectedFilters")).toBe("[]");
    });

    it("routes performances to the correct hall by venue name", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        // Taper has two future performances.
        expect(byName(cals, "benaroya-taper").events.length).toBe(2);
        expect(byName(cals, "benaroya-nordstrom").events.length).toBe(1);
        // Octave 9 routes to the catch-all "other" calendar even though its
        // venue name carries no literal "Benaroya Hall" substring.
        const other = byName(cals, "benaroya-other");
        expect(other.events.length).toBe(1);
        expect(other.events[0].summary).toBe("Octave 9 New Music Showcase");
    });

    it("skips performances with no venue, and hidden listings, without error", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const allSummaries = cals.flatMap((c) => c.events.map((e) => e.summary));
        expect(allSummaries).not.toContain("Performance With No Venue");
        expect(allSummaries).not.toContain("Hidden Listing");
        const allErrors = cals.flatMap((c) => c.errors);
        expect(
            allErrors.some((e) => e.reason?.includes("No Venue")),
        ).toBe(false);
    });

    it("skips an off-site (non-Benaroya) performance without error, not just an unmatched-venue one", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const allSummaries = cals.flatMap((c) => c.events.map((e) => e.summary));
        // "Garfield High School Auditorium" matches no specific route and
        // isn't in ON_SITE_VENUE_SUBSTRINGS, so the catch-all must NOT claim
        // it — this is the regression the old Sitecore-era ripper guarded
        // against (community concerts at off-site venues), and the rewrite's
        // routeVenue() must keep guarding against it even though the new
        // API's venue names no longer carry a literal "Benaroya Hall" suffix.
        expect(allSummaries).not.toContain("Community Concert at Garfield");
        const allErrors = cals.flatMap((c) => c.errors);
        expect(
            allErrors.some((e) => e.reason?.includes("Garfield")),
        ).toBe(false);
        // And it must not have been miscounted into the catch-all either.
        expect(byName(cals, "benaroya-other").events.length).toBe(1);
    });

    it("filters out past performances", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const allSummaries = cals.flatMap((c) => c.events.map((e) => e.summary));
        expect(allSummaries).not.toContain("Past Season Gala");
    });

    it("emits a ParseError for an unparseable performance start", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const taper = byName(cals, "benaroya-taper");
        const badDateErr = taper.errors.find((e) =>
            e.reason?.includes("Unparseable performance start"),
        );
        expect(badDateErr).toBeDefined();
        expect(badDateErr!.type).toBe("ParseError");
    });

    it("populates event fields: stable id, time, location, url, image, description", async () => {
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const taper = byName(cals, "benaroya-taper");
        const mahler = taper.events.find((e) => e.summary.includes("Mahler 7"))!;
        expect(mahler).toBeDefined();
        // Stable id derived from the upstream performance id.
        expect(mahler.id).toBe("benaroya-hall-1001");
        // HTML entity decoded.
        expect(mahler.summary).toBe("Mahler 7 & Encore");
        // Naive local (Pacific) start parsed directly into the zone, no
        // UTC-offset conversion needed.
        expect(mahler.date.toString()).toContain("2099-06-11T19:30");
        expect(mahler.location).toContain("S. Mark Taper Foundation Auditorium");
        expect(mahler.location).toContain("200 University St");
        expect(mahler.url).toBe(
            "https://benaroyahall.org/pdps/concertstickets/calendar/2099-2100/99mahler7/",
        );
        expect(mahler.imageUrl).toBe(
            "https://benaroyahall.org/media/abc123/mahler-hero.jpg",
        );
        // HTML tags stripped from the description (whitespace collapsed).
        expect(mahler.description).toBe("Program notes for Mahler .");
        expect(mahler.duration.toString()).toBe("PT2H");
        expect(mahler.cost).toEqual({ paid: true });
    });

    it("falls back to buyPageUrl when learnMoreUrl is absent", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () =>
                Promise.resolve(
                    JSON.stringify([
                        {
                            id: 4001,
                            title: "No Learn-More Link",
                            start: "2099-10-10T19:00:00.0000000",
                            venue: "S. Mark Taper Foundation Auditorium",
                            learnMoreUrl: "",
                            buyPageUrl: "/buy/?performanceId=4001",
                            isPast: false,
                            hideInSearchResults: false,
                        },
                    ]),
                ),
        });
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        const event = byName(cals, "benaroya-taper").events[0];
        expect(event.url).toBe(
            "https://benaroyahall.org/buy/?performanceId=4001",
        );
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
            text: () => Promise.resolve(""),
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

    it("treats an empty response body as zero events, not a crash", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () => Promise.resolve(""),
        });
        const cals = await new BenaroyaHallRipper().rip(makeRipper());
        for (const c of cals) {
            expect(c.events).toHaveLength(0);
            expect(c.errors).toHaveLength(0);
        }
    });
});
