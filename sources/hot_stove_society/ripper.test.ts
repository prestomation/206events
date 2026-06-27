import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractEventUrls, parseEventPage } from "./ripper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const listingHtml = readFileSync(join(__dirname, "sample-events-listing.html"), "utf-8");
const detailHtml = readFileSync(join(__dirname, "sample-event-detail.html"), "utf-8");
const detailUrl = "https://www.hotstovesociety.com/store/event/date-night-nola-crawfish-etouffee-with-chef-sean-mcfadyen/";

describe("extractEventUrls", () => {
    it("extracts event URLs from the listing page", () => {
        const urls = extractEventUrls(listingHtml);
        expect(urls.length).toBeGreaterThan(0);
        expect(urls[0]).toMatch(/https:\/\/www\.hotstovesociety\.com\/store\/event\//);
    });

    it("deduplicates repeated event URLs", () => {
        const urls = extractEventUrls(listingHtml);
        const unique = new Set(urls);
        expect(urls.length).toBe(unique.size);
    });
});

describe("parseEventPage", () => {
    it("extracts name, date, and duration from LD+JSON", () => {
        const result = parseEventPage(detailHtml, detailUrl);
        expect("date" in result).toBe(true);
        if (!("date" in result)) return;

        expect(result.summary).toBe("Date Night: NOLA Crawfish Etouffee with Chef Sean McFadyen");
        // startDate in LD+JSON is "2026-07-10T17:30:00Z" — BentoBox local-as-Z bug
        // parsed as Pacific local time: July 10, 2026 at 17:30 (5:30 PM)
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(7);
        expect(result.date.dayOfMonth()).toBe(10);
        expect(result.date.hour()).toBe(17);
        expect(result.date.minute()).toBe(30);
    });

    it("computes duration from startDate and endDate", () => {
        const result = parseEventPage(detailHtml, detailUrl);
        if (!("date" in result)) throw new Error("Expected event");
        // 5:30 PM to 7:30 PM = 2 hours = 120 minutes
        expect(result.duration.toMinutes()).toBe(120);
    });

    it("includes image URL", () => {
        const result = parseEventPage(detailHtml, detailUrl);
        if (!("date" in result)) throw new Error("Expected event");
        expect(result.imageUrl).toBeTruthy();
        expect(result.imageUrl).toMatch(/getbento\.com/);
    });

    it("includes location", () => {
        const result = parseEventPage(detailHtml, detailUrl);
        if (!("date" in result)) throw new Error("Expected event");
        expect(result.location).toContain("2000 4th Ave");
        expect(result.location).toContain("Seattle");
    });

    it("uses slug as stable ID", () => {
        const result = parseEventPage(detailHtml, detailUrl);
        if (!("date" in result)) throw new Error("Expected event");
        expect(result.id).toBe("hot-stove-society-date-night-nola-crawfish-etouffee-with-chef-sean-mcfadyen");
    });

    it("marks cost as paid", () => {
        const result = parseEventPage(detailHtml, detailUrl);
        if (!("date" in result)) throw new Error("Expected event");
        expect(result.cost?.paid).toBe(true);
    });

    it("returns ParseError for a page with no Event LD+JSON", () => {
        const result = parseEventPage("<html><body>nothing here</body></html>", "https://example.com/");
        expect("type" in result).toBe(true);
        if (!("type" in result)) return;
        expect(result.type).toBe("ParseError");
    });
});
