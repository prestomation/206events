import { describe, it, expect } from "vitest";
import { LocalDate, ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
    extractSitemapUrls,
    extractSlugDate,
    extractEventJsonLd,
    isSeattleEvent,
    parseEventFromJsonLd,
} from "./ripper.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

const timezone = ZoneId.of("America/Los_Angeles");
// Fixed "now" so tests are deterministic
const now = ZonedDateTime.parse("2026-07-01T00:00:00-07:00");

function loadSampleData(): Record<string, any> {
    return JSON.parse(readFileSync(join(__dirname, "sample-data.json"), "utf-8"));
}

function loadSampleSitemap(): string {
    return readFileSync(join(__dirname, "sample-sitemap.xml"), "utf-8");
}

function makeEventHtml(jsonLd: object): string {
    return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head></html>`;
}

function slugFromUrl(url: string): string {
    return url.split("/events-1/")[1];
}

describe("extractSitemapUrls", () => {
    it("extracts events-1 URLs from sitemap XML", () => {
        const sitemap = loadSampleSitemap();
        const urls = extractSitemapUrls(sitemap);
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
            expect(url).toMatch(/^https:\/\/www\.seattleastro\.org\/events-1\//);
        }
    });

    it("ignores non-events-1 URLs", () => {
        const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://www.seattleastro.org/events-1/board-meeting-2026-08-12-19-00</loc></url>
  <url><loc>https://www.seattleastro.org/events</loc></url>
  <url><loc>https://other.com/events-1/not-this</loc></url>
</urlset>`;
        const urls = extractSitemapUrls(xml);
        expect(urls).toHaveLength(1);
        expect(urls[0]).toBe("https://www.seattleastro.org/events-1/board-meeting-2026-08-12-19-00");
    });
});

describe("extractSlugDate", () => {
    it("extracts the date from a standard event slug", () => {
        const date = extractSlugDate("https://www.seattleastro.org/events-1/board-meeting-2026-08-12-19-00");
        expect(date).not.toBeNull();
        expect(date?.equals(LocalDate.of(2026, 8, 12))).toBe(true);
    });

    it("extracts the date from a slug with a Wix de-dupe suffix", () => {
        const date = extractSlugDate("https://www.seattleastro.org/events-1/snoqualmie-point-park-stargazing-2026-11-07-18-00-2");
        expect(date).not.toBeNull();
        expect(date?.equals(LocalDate.of(2026, 11, 7))).toBe(true);
    });

    it("returns null for a slug with no date", () => {
        expect(extractSlugDate("https://www.seattleastro.org/events-1/test-event")).toBeNull();
    });
});

describe("extractEventJsonLd", () => {
    it("returns Event JSON-LD from event detail page HTML", () => {
        const data = loadSampleData();
        const event = data["board-meeting-2026-08-12-19-00"];
        const html = makeEventHtml(event);
        const result = extractEventJsonLd(html);
        expect(result).not.toBeNull();
        expect(result?.["@type"]).toBe("Event");
        expect(result?.name).toBe(event.name);
    });

    it("returns null when no JSON-LD found", () => {
        const result = extractEventJsonLd("<html><body>no events here</body></html>");
        expect(result).toBeNull();
    });

    it("returns null for non-Event JSON-LD", () => {
        const html = `<script type="application/ld+json">{"@type":"Organization","name":"Test"}</script>`;
        const result = extractEventJsonLd(html);
        expect(result).toBeNull();
    });
});

describe("isSeattleEvent", () => {
    it("includes events with a Seattle, WA address", () => {
        expect(isSeattleEvent({ address: "5013 S Angeline St, Seattle, WA 98118, USA" })).toBe(true);
    });

    it("excludes events in other Puget Sound cities", () => {
        expect(isSeattleEvent({ address: "Duvall, WA 98019, USA" })).toBe(false);
        expect(isSeattleEvent({ address: "35800 SE Winery Rd, Snoqualmie, WA 98065, USA" })).toBe(false);
    });

    it("excludes events with no address (e.g. virtual Zoom meetings)", () => {
        expect(isSeattleEvent({ name: "Zoom" })).toBe(false);
        expect(isSeattleEvent(undefined)).toBe(false);
    });
});

describe("parseEventFromJsonLd", () => {
    it("parses a Seattle event correctly", () => {
        const data = loadSampleData();
        const event = data["lakewood-playground-star-party-2026-08-27-18-30"];
        const url = "https://www.seattleastro.org/events-1/lakewood-playground-star-party-2026-08-27-18-30";
        const result = parseEventFromJsonLd(event, url, timezone);
        expect("date" in result).toBe(true);
        if ("date" in result) {
            expect(result.id).toBe("seattle-astronomical-society-lakewood-playground-star-party-2026-08-27-18-30");
            expect(result.summary).toBe(event.name);
            expect(result.location).toBe("5013 S Angeline St, Seattle, WA 98118, USA");
            expect(result.imageUrl).toBe(event.image.url);
            expect(result.url).toBe(url);
        }
    });

    it("calculates duration from startDate and endDate", () => {
        const data = loadSampleData();
        const event = data["board-meeting-2026-08-12-19-00"]; // 19:00-21:00 = 2 hours
        const url = "https://www.seattleastro.org/events-1/board-meeting-2026-08-12-19-00";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.duration.toHours()).toBe(2);
        }
    });

    it("defaults to 2 hour duration when no endDate", () => {
        const data = loadSampleData();
        const event = { ...data["board-meeting-2026-08-12-19-00"], endDate: undefined };
        const url = "https://www.seattleastro.org/events-1/board-meeting-2026-08-12-19-00";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.duration.toHours()).toBe(2);
        }
    });

    it("returns ParseError for invalid startDate", () => {
        const data = loadSampleData();
        const event = { ...data["board-meeting-2026-08-12-19-00"], startDate: "not-a-date" };
        const url = "https://www.seattleastro.org/events-1/board-meeting-2026-08-12-19-00";
        const result = parseEventFromJsonLd(event, url, timezone);
        expect("type" in result).toBe(true);
        if ("type" in result) {
            expect(result.type).toBe("ParseError");
        }
    });

    it("converts dates to America/Los_Angeles timezone", () => {
        const data = loadSampleData();
        const event = data["board-meeting-2026-08-12-19-00"];
        const url = "https://www.seattleastro.org/events-1/board-meeting-2026-08-12-19-00";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.date.zone().id()).toBe("America/Los_Angeles");
        }
    });
});

describe("sample data integration", () => {
    it("filters to future, Seattle-only events", () => {
        const sitemap = loadSampleSitemap();
        const data = loadSampleData();

        const urls = extractSitemapUrls(sitemap).filter(url => {
            const slugDate = extractSlugDate(url);
            return slugDate !== null && !slugDate.isBefore(now.toLocalDate());
        });

        const results = urls
            .map(url => {
                const jsonLd = data[slugFromUrl(url)];
                return { url, jsonLd };
            })
            .filter(({ jsonLd }) => jsonLd && isSeattleEvent(jsonLd.location))
            .map(({ url, jsonLd }) => parseEventFromJsonLd(jsonLd, url, timezone))
            .filter((r): r is Exclude<typeof r, { type: string }> => "date" in r && !r.date.isBefore(now));

        // Future Seattle events: Board Meeting, Membership Meetup, Lakewood Playground Star Party.
        // Excluded: test-event (no date), Duvall/Snoqualmie (non-Seattle), 2025 board meeting (past).
        expect(results.length).toBe(3);
        expect(results.map(r => r.summary).sort()).toEqual([
            "Board Meeting",
            "Lakewood Playground Star Party",
            "Membership Meetup",
        ]);
    });
});
