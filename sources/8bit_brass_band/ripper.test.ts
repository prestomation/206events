import { describe, it, expect } from "vitest";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
    extractSitemapUrls,
    extractEventJsonLd,
    isWashingtonEvent,
    parseEventFromJsonLd,
} from "./ripper.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

const timezone = ZoneId.of("America/Los_Angeles");
// Fixed "now" so tests are deterministic
const now = ZonedDateTime.parse("2026-01-01T00:00:00-08:00");

function loadSampleData() {
    return JSON.parse(readFileSync(join(__dirname, "sample-data.json"), "utf-8"));
}

function loadSampleSitemap() {
    return readFileSync(join(__dirname, "sample-sitemap.xml"), "utf-8");
}

function makeEventHtml(jsonLd: object): string {
    return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head></html>`;
}

describe("extractSitemapUrls", () => {
    it("extracts event-details URLs from sitemap XML", () => {
        const sitemap = loadSampleSitemap();
        const urls = extractSitemapUrls(sitemap);
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
            expect(url).toMatch(/^https:\/\/www\.8bitbrassband\.com\/event-details\//);
        }
    });

    it("ignores non-event-details URLs", () => {
        const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://www.8bitbrassband.com/event-details/my-show</loc></url>
  <url><loc>https://www.8bitbrassband.com/event-list</loc></url>
  <url><loc>https://other.com/event-details/not-this</loc></url>
</urlset>`;
        const urls = extractSitemapUrls(xml);
        expect(urls).toHaveLength(1);
        expect(urls[0]).toBe("https://www.8bitbrassband.com/event-details/my-show");
    });
});

describe("extractEventJsonLd", () => {
    it("returns Event JSON-LD from event detail page HTML", () => {
        const [seattleEvent] = loadSampleData();
        const html = makeEventHtml(seattleEvent);
        const result = extractEventJsonLd(html);
        expect(result).not.toBeNull();
        expect(result?.["@type"]).toBe("Event");
        expect(result?.name).toBe(seattleEvent.name);
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

describe("isWashingtonEvent", () => {
    it("includes events with WA in address", () => {
        expect(isWashingtonEvent({ address: "2505 1st Ave, Seattle, WA 98121, USA" })).toBe(true);
    });

    it("excludes events with OR in address", () => {
        expect(isWashingtonEvent({ address: "Portland, OR, USA" })).toBe(false);
    });

    it("excludes events with TX in address", () => {
        expect(isWashingtonEvent({ address: "Austin, TX, USA" })).toBe(false);
    });

    it("excludes events with LA in address", () => {
        expect(isWashingtonEvent({ address: "New Orleans, LA, USA" })).toBe(false);
    });

    it("includes events with no address (Seattle-based band)", () => {
        expect(isWashingtonEvent({ name: "See website for neighborhoods & stage maps" })).toBe(true);
    });

    it("includes events with undefined location (location not specified)", () => {
        expect(isWashingtonEvent(undefined)).toBe(true);
    });
});

describe("parseEventFromJsonLd", () => {
    it("parses a Seattle event correctly", () => {
        const [seattleEvent] = loadSampleData();
        const url = "https://www.8bitbrassband.com/event-details/8bit-at-the-croc";
        const result = parseEventFromJsonLd(seattleEvent, url, timezone);
        expect("date" in result).toBe(true);
        if ("date" in result) {
            expect(result.id).toBe("8bit-brass-band-8bit-at-the-croc");
            expect(result.summary).toBe(seattleEvent.name);
            expect(result.location).toContain("Seattle");
            expect(result.imageUrl).toBe(seattleEvent.image.url);
            expect(result.url).toBe(url);
        }
    });

    it("uses location address when available", () => {
        const event = loadSampleData()[0];
        const url = "https://www.8bitbrassband.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.location).toBe("2505 1st Ave, Seattle, WA 98121, USA");
        }
    });

    it("falls back to location name when no address", () => {
        const honkEvent = loadSampleData()[2]; // HONK! Fest West — no address
        const url = "https://www.8bitbrassband.com/event-details/honk-fest-west-2026";
        const result = parseEventFromJsonLd(honkEvent, url, timezone);
        if ("date" in result) {
            expect(result.location).toContain("See website for neighborhoods & stage maps");
        }
    });

    it("calculates duration from startDate and endDate", () => {
        const event = loadSampleData()[0]; // 20:00–00:00 = 4 hours
        const url = "https://www.8bitbrassband.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.duration.toHours()).toBe(4);
        }
    });

    it("defaults to 3 hour duration when no endDate", () => {
        const event = { ...loadSampleData()[1], endDate: undefined };
        const url = "https://www.8bitbrassband.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.duration.toHours()).toBe(3);
        }
    });

    it("returns ParseError for invalid startDate", () => {
        const event = { ...loadSampleData()[0], startDate: "not-a-date" };
        const url = "https://www.8bitbrassband.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        expect("type" in result).toBe(true);
        if ("type" in result) {
            expect(result.type).toBe("ParseError");
        }
    });

    it("produces stable IDs from event URL slug", () => {
        const event = loadSampleData()[0];
        const url = "https://www.8bitbrassband.com/event-details/my-stable-slug";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.id).toBe("8bit-brass-band-my-stable-slug");
        }
    });

    it("converts dates to America/Los_Angeles timezone", () => {
        const event = loadSampleData()[0];
        const url = "https://www.8bitbrassband.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.date.zone().id()).toBe("America/Los_Angeles");
        }
    });
});

describe("sample data integration", () => {
    it("filters out past events and non-WA events", () => {
        const sampleData = loadSampleData();
        const results = sampleData
            .filter((event: any) => isWashingtonEvent(event.location))
            .map((event: any) => {
                const url = event.location?.url ?? "https://www.8bitbrassband.com/event-details/test";
                return parseEventFromJsonLd(event, url, timezone);
            })
            .filter((r: any) => "date" in r && !r.date.isBefore(now));

        // Seattle events with future dates (relative to 2026-01-01):
        // - 8-Bit Brass Band at The Crocodile: 2026-04-05 (future)
        // - 8-Bit Brass Band at Nectar Lounge: 2026-06-15 (future)
        // - HONK! Fest West: 2026-05-29 (future, no address = included)
        // Non-WA events (New Orleans, Austin) should be excluded
        // Past Seattle event (2025-12-01) should be excluded
        expect(results.length).toBe(3);
    });
});
