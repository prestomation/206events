import { describe, it, expect } from "vitest";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
    extractListItems,
    extractEventJsonLd,
    hasTimeComponent,
    isPublicEvent,
    parseEventFromJsonLd,
    PsmsEventJsonLd,
} from "./ripper.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

const zone = ZoneId.of("America/Los_Angeles");

function loadSampleList(): string {
    return readFileSync(join(__dirname, "sample-events-list.html"), "utf-8");
}

function loadSampleJsonLd(): Record<string, PsmsEventJsonLd> {
    return JSON.parse(readFileSync(join(__dirname, "sample-event-jsonld.json"), "utf-8"));
}

function makeDetailHtml(jsonLd: object): string {
    return `<html><head><script type="application/ld+json">[${JSON.stringify(jsonLd)}]</script></head></html>`;
}

describe("extractListItems", () => {
    it("extracts every eventid from the feed-item cards", () => {
        const items = extractListItems(loadSampleList());
        expect(items.map(i => i.eventid)).toEqual([
            "225695", "225696", "225697", "192496", "192511", "225698",
            "192497", "192508", "192509", "192510", "225705", "192494",
            "192495", "192492", "192493",
        ]);
    });

    it("returns an empty list for HTML with no feed-item cards", () => {
        expect(extractListItems("<html><body>no events</body></html>")).toEqual([]);
    });
});

describe("extractEventJsonLd", () => {
    it("extracts an Event object from an array-wrapped JSON-LD block", () => {
        const { idClinic } = loadSampleJsonLd();
        const result = extractEventJsonLd(makeDetailHtml(idClinic));
        expect(result?.name).toBe("First Fall Hildegard Hendrickson Mushroom ID clinic");
    });

    it("returns null when no JSON-LD script tag is present", () => {
        expect(extractEventJsonLd("<html><body>no data</body></html>")).toBeNull();
    });
});

describe("hasTimeComponent", () => {
    it("is true for a datetime string", () => {
        expect(hasTimeComponent("2026-09-28T16:00:00")).toBe(true);
    });

    it("is false for a date-only string", () => {
        expect(hasTimeComponent("2026-10-24")).toBe(false);
    });
});

describe("isPublicEvent", () => {
    const samples = loadSampleJsonLd();

    it("keeps a free public ID clinic", () => {
        expect(isPublicEvent(samples.idClinic)).toBe(true);
    });

    it("keeps a public general meeting", () => {
        expect(isPublicEvent(samples.generalMeeting)).toBe(true);
    });

    it("filters a Zoom-hosted board meeting", () => {
        expect(isPublicEvent(samples.boardMeeting)).toBe(false);
    });

    it("filters a members-only event by description text", () => {
        expect(isPublicEvent(samples.membersOnlySocial)).toBe(false);
    });

    it("keeps the public (paid, pre-registration) Ben Woo Foray", () => {
        expect(isPublicEvent(samples.benWooForay)).toBe(true);
    });
});

describe("parseEventFromJsonLd", () => {
    const samples = loadSampleJsonLd();

    it("parses a timed event with an explicit start/end time", () => {
        const result = parseEventFromJsonLd(samples.idClinic, "https://example.com/1", "225695", zone);
        if (!("date" in result)) throw new Error(`expected event, got error: ${result.reason}`);
        expect(result.id).toBe("psms-225695");
        expect(result.date.toString()).toContain("2026-09-28T16:00");
        expect(result.duration.toHours()).toBe(3);
        expect(result.location).toBe("Center for Urban Horticulture, 3501 NE 41st Street (Mary Gates Drive), Seattle, WA");
    });

    it("defaults to noon for a date-only single-day event", () => {
        const result = parseEventFromJsonLd(samples.wildMushroomShow, "https://example.com/2", "192509", zone);
        if (!("date" in result)) throw new Error(`expected event, got error: ${result.reason}`);
        expect(result.date.hour()).toBe(12);
        expect(result.location).toContain("Shoreline Community College");
    });

    it("spans multiple days for a date-only multi-day event", () => {
        const result = parseEventFromJsonLd(samples.benWooForay, "https://example.com/3", "192511", zone);
        if (!("date" in result)) throw new Error(`expected event, got error: ${result.reason}`);
        expect(result.duration.toDays()).toBe(3);
        expect(result.location).toContain("Randle");
    });

    it("returns a ParseError when startDate is missing", () => {
        const result = parseEventFromJsonLd({ name: "No date" }, "https://example.com/4", "1", zone);
        expect("type" in result && result.type).toBe("ParseError");
    });
});

describe("end-to-end sample data", () => {
    it("keeps a future event and applies the correct default duration", () => {
        const now = ZonedDateTime.parse("2026-01-01T00:00:00-08:00");
        const samples = loadSampleJsonLd();
        const result = parseEventFromJsonLd(samples.generalMeeting, "https://example.com/5", "192496", zone);
        if (!("date" in result)) throw new Error("expected event");
        expect(result.date.isAfter(now)).toBe(true);
    });
});
