import { describe, it, expect, vi, afterEach } from "vitest";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
    extractSitemapUrls,
    extractEventJsonLd,
    parseEventFromJsonLd,
} from "./ripper.js";
import ShibuyaHifiRipper from "./ripper.js";
import { Ripper } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

const timezone = ZoneId.of("America/Los_Angeles");
// Fixed "now" so tests are deterministic
const now = ZonedDateTime.parse("2026-08-01T00:00:00-07:00");

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
            expect(url).toMatch(/^https:\/\/www\.shibuyahifi\.com\/event-details\//);
        }
    });

    it("ignores non-event-details URLs", () => {
        const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://www.shibuyahifi.com/event-details/my-show</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://www.shibuyahifi.com/event-list</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://other.com/event-details/not-this</loc><lastmod>2026-01-01</lastmod></url>
</urlset>`;
        const urls = extractSitemapUrls(xml);
        expect(urls).toHaveLength(1);
        expect(urls[0]).toBe("https://www.shibuyahifi.com/event-details/my-show");
    });

    it("orders URLs by lastmod descending, regardless of document order", () => {
        // The real Wix sitemap lists hundreds of past sessions in an order
        // that is neither chronological nor alphabetical. A page fetched by
        // document position alone can miss the actually-current events, so
        // extractSitemapUrls must resolve order from <lastmod> itself.
        const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://www.shibuyahifi.com/event-details/oldest</loc><lastmod>2025-01-01</lastmod></url>
  <url><loc>https://www.shibuyahifi.com/event-details/newest</loc><lastmod>2026-09-09</lastmod></url>
  <url><loc>https://www.shibuyahifi.com/event-details/middle</loc><lastmod>2026-05-01</lastmod></url>
</urlset>`;
        const urls = extractSitemapUrls(xml);
        expect(urls).toEqual([
            "https://www.shibuyahifi.com/event-details/newest",
            "https://www.shibuyahifi.com/event-details/middle",
            "https://www.shibuyahifi.com/event-details/oldest",
        ]);
    });
});

describe("extractEventJsonLd", () => {
    it("returns Event JSON-LD from event detail page HTML", () => {
        const [gauchoEvent] = loadSampleData();
        const html = makeEventHtml(gauchoEvent);
        const result = extractEventJsonLd(html);
        expect(result).not.toBeNull();
        expect(result?.["@type"]).toBe("Event");
        expect(result?.name).toBe(gauchoEvent.name);
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

describe("parseEventFromJsonLd", () => {
    it("parses an event and always uses the fixed venue address", () => {
        const [gauchoEvent] = loadSampleData();
        const url = "https://www.shibuyahifi.com/event-details/steely-dan-gaucho-3";
        const result = parseEventFromJsonLd(gauchoEvent, url, timezone);
        expect("date" in result).toBe(true);
        if ("date" in result) {
            expect(result.id).toBe("shibuya-hifi-steely-dan-gaucho-3-2026-09-10");
            expect(result.summary).toBe(gauchoEvent.name);
            expect(result.location).toBe("Shibuya Hifi, 4912 Leary Ave NW, Seattle, WA 98107");
            expect(result.imageUrl).toBe(gauchoEvent.image.url);
            expect(result.url).toBe(url);
        }
    });

    it("calculates duration from startDate and endDate", () => {
        const event = loadSampleData()[0]; // 17:00-18:30 = 90 minutes
        const url = "https://www.shibuyahifi.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.duration.toMinutes()).toBe(90);
        }
    });

    it("defaults to 90 minute duration when no endDate", () => {
        const event = loadSampleData()[1]; // Kamasi Washington — no endDate
        const url = "https://www.shibuyahifi.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.duration.toMinutes()).toBe(90);
        }
    });

    it("returns ParseError for invalid startDate", () => {
        const event = { ...loadSampleData()[0], startDate: "not-a-date" };
        const url = "https://www.shibuyahifi.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        expect("type" in result).toBe(true);
        if ("type" in result) {
            expect(result.type).toBe("ParseError");
        }
    });

    it("produces stable IDs from event URL slug", () => {
        const event = loadSampleData()[0];
        const url = "https://www.shibuyahifi.com/event-details/my-stable-slug";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.id).toBe("shibuya-hifi-my-stable-slug-2026-09-10");
        }
    });

    it("converts dates to America/Los_Angeles timezone", () => {
        const event = loadSampleData()[0];
        const url = "https://www.shibuyahifi.com/event-details/test";
        const result = parseEventFromJsonLd(event, url, timezone);
        if ("date" in result) {
            expect(result.date.zone().id()).toBe("America/Los_Angeles");
        }
    });
});

describe("sample data integration", () => {
    it("filters out past events, keeping only future ones", () => {
        const sampleData = loadSampleData();
        const results = sampleData
            .map((event: any) => {
                const url = event.location?.url ?? "https://www.shibuyahifi.com/event-details/test";
                return parseEventFromJsonLd(event, url, timezone);
            })
            .filter((r: any) => "date" in r && !r.date.isBefore(now));

        // Steely Dan (2026-09-10) and Kamasi Washington (2026-09-09) are future
        // relative to 2026-08-01; Tatsuro Yamashita (2026-03-14) is past.
        expect(results.length).toBe(2);
    });
});

describe("rip()", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function eventJsonLd(name: string, startDate: string) {
        return { "@type": "Event", name, startDate };
    }

    function eventHtml(name: string, startDate: string): string {
        return `<html><head><script type="application/ld+json">${JSON.stringify(eventJsonLd(name, startDate))}</script></head></html>`;
    }

    it("finds a future event even when it sits past the fetch cap in raw sitemap document order", async () => {
        // Mirrors the real venue's sitemap: hundreds of long-past sessions
        // listed ahead of the current one in document order. Only sorting
        // by <lastmod> before applying the 100-URL cap keeps this event
        // reachable.
        const staleEntries = Array.from({ length: 150 }, (_, i) =>
            `<url><loc>https://www.shibuyahifi.com/event-details/stale-${i}</loc><lastmod>2024-01-01</lastmod></url>`,
        ).join("\n");
        const sitemap = `<?xml version="1.0"?>
<urlset>
${staleEntries}
<url><loc>https://www.shibuyahifi.com/event-details/current-show</loc><lastmod>2026-09-09</lastmod></url>
</urlset>`;

        const mockFetch = vi.fn((url: string) => {
            if (url.endsWith("event-pages-sitemap.xml")) {
                return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(sitemap) });
            }
            if (url.includes("current-show")) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    text: () => Promise.resolve(eventHtml("Current Show", "2099-01-01T20:00:00-08:00")),
                });
            }
            // Stale entries would 200 with an event too, but should never be
            // fetched at all once sorting keeps them out of the capped slice.
            return Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve(eventHtml("Stale Show", "2020-01-01T20:00:00-08:00")),
            });
        });
        vi.stubGlobal("fetch", mockFetch);

        const ripper: Ripper = {
            config: {
                name: "shibuya-hifi",
                url: "https://www.shibuyahifi.com/event-pages-sitemap.xml",
                proxy: false,
                tags: ["Music"],
                calendars: [
                    { name: "shibuya-hifi", friendlyname: "Shibuya Hifi", timezone },
                ],
            } as any,
        } as Ripper;

        const [calendar] = await new ShibuyaHifiRipper().rip(ripper);

        expect(calendar.events.some(e => e.summary === "Current Show")).toBe(true);
        // Fewer than 150 fetch calls proves the cap was applied to the
        // *sorted* list, not the raw 150+1 document order.
        expect(mockFetch.mock.calls.length).toBeLessThan(102);
    });
});
