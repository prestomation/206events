import { describe, expect, test, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import CraftMapSeattleRipper, { extractListingUrls, extractFairSlug, parseFairDetail } from "./ripper.js";
import { RipperCalendarEvent, UncertaintyError } from "../../lib/config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of("America/Los_Angeles");

function readSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), "utf-8");
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: "craft-map-seattle",
            url: new URL("https://www.thecraftmap.com/fairs/washington/seattle"),
            tags: ["MakersMarket"],
            geo: null,
            disabled: false,
            proxy: false,
            calendars: [{
                name: "craft-map-seattle",
                friendlyname: "The Craft Map - Seattle Craft Fairs",
                timezone: TIMEZONE,
            }],
            ...overrides,
        },
    } as any;
}

describe("extractListingUrls", () => {
    test("extracts fair detail URLs from the listing's JSON-LD ItemList", () => {
        const html = readSample("sample-data.html");
        const urls = extractListingUrls(html);
        expect(urls.length).toBe(33);
        expect(urls).toContain("https://www.thecraftmap.com/fair/the-market-experience-930-am-seattle-wa");
        expect(urls).toContain("https://www.thecraftmap.com/fair/panda-fest-seattle-2026-seattle-wa");
    });

    test("returns an empty array when there is no ItemList block", () => {
        expect(extractListingUrls("<p>No fairs found.</p>")).toEqual([]);
    });
});

describe("extractFairSlug", () => {
    test("extracts the slug from a fair detail URL", () => {
        expect(extractFairSlug("https://www.thecraftmap.com/fair/panda-fest-seattle-2026-seattle-wa"))
            .toBe("panda-fest-seattle-2026-seattle-wa");
    });

    test("falls back to the full URL when the pattern doesn't match", () => {
        expect(extractFairSlug("https://www.thecraftmap.com/other")).toBe("https://www.thecraftmap.com/other");
    });
});

describe("parseFairDetail", () => {
    test("parses a fair with a resolved location, always flagging the missing start time", () => {
        const html = readSample("sample-event.html");
        const results = parseFairDetail(html, "https://www.thecraftmap.com/fair/the-market-experience-930-am-seattle-wa");

        expect(results).toHaveLength(2);
        const event = results[0] as RipperCalendarEvent;
        expect(event.id).toBe("the-market-experience-930-am-seattle-wa-2027-08-28");
        expect(event.summary).toBe("The Market Experience (9:30 AM)");
        expect(event.location).toBe("Meet your guide at the corner:, Western Ave and Virginia St, Seattle, WA");
        expect(event.url).toBe("https://www.thecraftmap.com/fair/the-market-experience-930-am-seattle-wa");
        expect(event.description).toContain("Pike Place Market");

        expect(event.date.year()).toBe(2027);
        expect(event.date.monthValue()).toBe(8);
        expect(event.date.dayOfMonth()).toBe(28);
        expect(event.date.hour()).toBe(12);
        expect(event.date.minute()).toBe(0);
        expect(event.date.zone().toString()).toBe("America/Los_Angeles");
        expect(event.duration.toHours()).toBe(3);

        const uncertainty = results[1] as UncertaintyError;
        expect(uncertainty.type).toBe("Uncertainty");
        expect(uncertainty.unknownFields).toEqual(["startTime", "duration"]);
        expect(uncertainty.source).toBe("craft-map-seattle");
        expect(uncertainty.event.id).toBe(event.id);
        expect(uncertainty.partialFingerprint).toBeTruthy();
    });

    test("falls back to a Seattle placeholder and flags location when the venue is TBA", () => {
        const html = readSample("sample-event-no-location.html");
        const results = parseFairDetail(html, "https://www.thecraftmap.com/fair/reserve-your-vendors-table-today-seattle-wa");

        expect(results).toHaveLength(2);
        const event = results[0] as RipperCalendarEvent;
        expect(event.summary).toBe("Reserve Your Vendors Table Today!");
        expect(event.location).toBe("Seattle, WA");

        const uncertainty = results[1] as UncertaintyError;
        expect(uncertainty.unknownFields).toEqual(["startTime", "duration", "location"]);
    });

    test("keeps a real venue name when only the street address is missing, rather than collapsing to the generic fallback", () => {
        const html = `<script type="application/ld+json">{"@type":"Event","name":"Fisher Pavilion Market","startDate":"2026-09-05","location":{"name":"Fisher Pavilion","address":{"addressLocality":"Seattle","addressRegion":"WA"}}}</script>`;
        const results = parseFairDetail(html, "https://www.thecraftmap.com/fair/fisher-pavilion-market-seattle-wa");

        expect(results).toHaveLength(2);
        const event = results[0] as RipperCalendarEvent;
        expect(event.location).toBe("Fisher Pavilion, Seattle, WA");

        // Still flagged uncertain — the street address itself is unknown —
        // but the real venue name is preserved rather than discarded.
        const uncertainty = results[1] as UncertaintyError;
        expect(uncertainty.unknownFields).toEqual(["startTime", "duration", "location"]);
    });

    test("returns a ParseError when no JSON-LD Event block is present", () => {
        const results = parseFairDetail("<p>Not found</p>", "https://www.thecraftmap.com/fair/missing");
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe("ParseError");
    });

    test("returns a ParseError when the Event block is missing name or startDate", () => {
        const html = `<script type="application/ld+json">{"@type":"Event","name":"No Date"}</script>`;
        const results = parseFairDetail(html, "https://www.thecraftmap.com/fair/no-date");
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe("ParseError");
    });
});

describe("CraftMapSeattleRipper.rip", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("fetches the listing, resolves each fair's detail page, and drops past events", async () => {
        const listingHtml = `
            <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"ItemList","numberOfItems":2,"itemListElement":[
                {"@type":"ListItem","position":1,"name":"Market","url":"https://www.thecraftmap.com/fair/market"},
                {"@type":"ListItem","position":2,"name":"Past Fair","url":"https://www.thecraftmap.com/fair/past-fair"}
            ]}
            </script>
        `;
        const marketHtml = readSample("sample-event.html");
        const pastFairHtml = `<script type="application/ld+json">{"@type":"Event","name":"Past Fair","startDate":"2020-01-01","location":{"name":"TBA","address":{"streetAddress":"TBA"}}}</script>`;

        const calledUrls: string[] = [];
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            calledUrls.push(url);
            if (url === "https://www.thecraftmap.com/fairs/washington/seattle") {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(listingHtml) });
            }
            if (url === "https://www.thecraftmap.com/fair/market") {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(marketHtml) });
            }
            if (url === "https://www.thecraftmap.com/fair/past-fair") {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(pastFairHtml) });
            }
            return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("") });
        });
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new CraftMapSeattleRipper();
        const result = await ripper.rip(makeRipper());

        expect(result).toHaveLength(1);
        expect(calledUrls[0]).toBe("https://www.thecraftmap.com/fairs/washington/seattle");
        expect(calledUrls).toHaveLength(3); // listing + 2 fair detail fetches

        const { events, errors } = result[0];

        const now = ZonedDateTime.now(TIMEZONE);
        for (const event of events) {
            expect(event.date.isBefore(now)).toBe(false);
        }
        expect(events.map(e => e.summary)).toEqual(["The Market Experience (9:30 AM)"]);

        // The past fair's event was dropped, and so was its paired Uncertainty.
        const uncertaintyErrors = errors.filter(e => e.type === "Uncertainty");
        expect(uncertaintyErrors).toHaveLength(1);
        expect((uncertaintyErrors[0] as UncertaintyError).event.summary).toBe("The Market Experience (9:30 AM)");
    });

    test("isolates a per-fair fetch failure without discarding other fairs", async () => {
        const listingHtml = `
            <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"ItemList","numberOfItems":2,"itemListElement":[
                {"@type":"ListItem","position":1,"name":"Market","url":"https://www.thecraftmap.com/fair/market"},
                {"@type":"ListItem","position":2,"name":"Broken","url":"https://www.thecraftmap.com/fair/broken"}
            ]}
            </script>
        `;
        const marketHtml = readSample("sample-event.html");

        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (url === "https://www.thecraftmap.com/fairs/washington/seattle") {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(listingHtml) });
            }
            if (url === "https://www.thecraftmap.com/fair/market") {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(marketHtml) });
            }
            return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") });
        });
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new CraftMapSeattleRipper();
        const result = await ripper.rip(makeRipper());
        const { events, errors } = result[0];

        expect(events.map(e => e.summary)).toEqual(["The Market Experience (9:30 AM)"]);
        expect(errors.some(e => e.type === "ParseError" && e.context === "https://www.thecraftmap.com/fair/broken")).toBe(true);
    });
});
