import { describe, it, expect } from "vitest";
import { ZonedDateTime, ZoneId, LocalDateTime } from "@js-joda/core";
import { parseItem, fetchDuwamishEvents, extractAssetImageUrl, DuwamishApiItem, DuwamishApiResponse } from "./ripper.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleData: DuwamishApiResponse = JSON.parse(
    fs.readFileSync(path.join(__dirname, "sample-data.json"), "utf-8")
);

const ZONE = ZoneId.of("America/Los_Angeles");

// A fixed "now" well before any test events (early 2026-05-01)
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 1, 0, 0), ZONE);

describe("parseItem", () => {
    it("parses a valid event", () => {
        const item: DuwamishApiItem = {
            id: "abc123",
            title: "Eco-Tour ",
            startDate: 1782583200498,
            endDate: 1782588600498,
            fullUrl: "/events/2026/5/30/eco-tour-x5zxl",
            location: {
                addressTitle: "Duwamish Longhouse & Cultural Center",
                addressLine1: "4705 West Marginal Way Southwest",
                addressLine2: "Seattle, WA, 98106",
            },
        };

        const result = parseItem(item, NOW, ZONE);
        expect("date" in result).toBe(true);
        if (!("date" in result)) return;

        expect(result.summary).toBe("Eco-Tour");
        expect(result.url).toBe("https://www.duwamishtribe.org/events/2026/5/30/eco-tour-x5zxl");
        expect(result.location).toBe(
            "Duwamish Longhouse & Cultural Center, 4705 West Marginal Way Southwest, Seattle, WA, 98106"
        );
        // Duration: (1782588600498 - 1782583200498) ms = 5400000 ms = 90 minutes
        expect(result.duration?.toMinutes()).toBe(90);
    });

    it("strips trailing whitespace and (Copy) suffix from title", () => {
        const item: DuwamishApiItem = {
            id: "xyz",
            title: "Healing Circle - RSVP  (Copy) ",
            startDate: 1782583200000,
        };
        const result = parseItem(item, NOW, ZONE);
        expect("date" in result).toBe(true);
        if (!("date" in result)) return;
        expect(result.summary).toBe("Healing Circle - RSVP");
    });

    it("returns ParseError for empty title after cleanup", () => {
        const item: DuwamishApiItem = {
            id: "empty",
            title: "   (Copy)  ",
            startDate: 1782583200000,
        };
        const result = parseItem(item, NOW, ZONE);
        expect("type" in result).toBe(true);
        if (!("type" in result)) return;
        expect(result.type).toBe("ParseError");
    });

    it("defaults to 1-hour duration when endDate is missing", () => {
        const item: DuwamishApiItem = {
            id: "nodur",
            title: "Annual Meeting",
            startDate: 1782583200000,
        };
        const result = parseItem(item, NOW, ZONE);
        expect("date" in result).toBe(true);
        if (!("date" in result)) return;
        expect(result.duration?.toHours()).toBe(1);
    });

    it("uses fallback location when none provided", () => {
        const item: DuwamishApiItem = {
            id: "noloc",
            title: "Song and Dance Practice",
            startDate: 1782583200000,
        };
        const result = parseItem(item, NOW, ZONE);
        expect("date" in result).toBe(true);
        if (!("date" in result)) return;
        expect(result.location).toContain("4705 West Marginal Way");
    });

    it("maps the per-event assetUrl into imageUrl", () => {
        const item: DuwamishApiItem = {
            id: "img",
            title: "Frybread Class",
            startDate: 1782583200000,
            assetUrl: "https://images.squarespace-cdn.com/content/v1/5ad0f1b9c258b4273c53d08f/1756497848067-FSPE90H3EAZP74XN0215/FryBread+Classs+with+Cecile+Hansen.jpg",
        };
        const result = parseItem(item, NOW, ZONE);
        expect("date" in result).toBe(true);
        if (!("date" in result)) return;
        expect(result.imageUrl).toBe(
            "https://images.squarespace-cdn.com/content/v1/5ad0f1b9c258b4273c53d08f/1756497848067-FSPE90H3EAZP74XN0215/FryBread+Classs+with+Cecile+Hansen.jpg"
        );
    });

    it("leaves imageUrl undefined for placeholder static assetUrls with no filename", () => {
        const item: DuwamishApiItem = {
            id: "placeholder",
            title: "Land Back Celebration",
            startDate: 1782583200000,
            assetUrl: "https://static1.squarespace.com/static/5ad0f1b9c258b4273c53d08f/5ad0f927575d1fe016dddca8/6a03b48cc3ccac52f1073908/1778698148913/",
        };
        const result = parseItem(item, NOW, ZONE);
        expect("date" in result).toBe(true);
        if (!("date" in result)) return;
        expect(result.imageUrl).toBeUndefined();
    });

    it("extractAssetImageUrl rejects non-image and non-http values", () => {
        expect(extractAssetImageUrl(undefined)).toBeUndefined();
        expect(extractAssetImageUrl("data:image/png;base64,xxx")).toBeUndefined();
        expect(extractAssetImageUrl("https://example.com/page")).toBeUndefined();
        expect(extractAssetImageUrl("https://example.com/flyer.png?format=750w")).toBe(
            "https://example.com/flyer.png?format=750w"
        );
    });

    it("generates a stable id from date and slugified title", () => {
        const item: DuwamishApiItem = {
            id: "abc",
            title: "Eco-Tour",
            startDate: 1782583200498, // 2026-06-27 in PDT
        };
        const result = parseItem(item, NOW, ZONE);
        expect("date" in result).toBe(true);
        if (!("date" in result)) return;
        expect(result.id).toMatch(/^duwamish-\d{4}-\d{2}-\d{2}-eco-tour$/);
    });
});

describe("fetchDuwamishEvents with sample data", () => {
    it("filters out private events and past events from sample data", async () => {
        const sampleItems = (sampleData as unknown as DuwamishApiResponse).items ?? [];

        // Use a now that is before the June events but after May events
        const testNow = ZonedDateTime.of(LocalDateTime.of(2026, 5, 29, 0, 0), ZONE);
        const testNowMs = testNow.toInstant().toEpochMilli();

        const mockFetch = async (_url: string | URL, _init?: RequestInit): Promise<Response> => {
            return {
                ok: true,
                json: async () => sampleData,
            } as unknown as Response;
        };

        const { events, errors } = await fetchDuwamishEvents(
            new URL("https://www.duwamishtribe.org/events"),
            mockFetch,
            testNow,
            ZONE,
        );

        // No private events
        for (const e of events) {
            expect(e.summary.toLowerCase()).not.toContain("private");
        }

        // All events are future
        for (const e of events) {
            expect(e.date.toInstant().toEpochMilli()).toBeGreaterThan(testNowMs);
        }

        // Should have found some events
        expect(events.length).toBeGreaterThan(0);
    });
});
