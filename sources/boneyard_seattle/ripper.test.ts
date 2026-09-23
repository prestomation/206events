import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { Duration, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import '@js-joda/timezone';
import { extractBoneyardEvents, extractWarmupDataJson, parseBoneyardRecord, parseTimeText, wixImageToUrl } from "./ripper.js";

const tz = ZoneId.of("America/Los_Angeles");
const html = readFileSync(join(__dirname, "sample-data.html"), "utf8");
const warmup = extractWarmupDataJson(html)!;
const beforeAll = ZonedDateTime.of(2026, 9, 1, 0, 0, 0, 0, tz);

describe("parseTimeText", () => {
    it("parses a pm range", () => {
        const r = parseTimeText("09/11, 7-9pm")!;
        expect(r.start).toEqual(LocalTime.of(19, 0));
        expect(r.duration).toEqual(Duration.ofHours(2));
    });
    it("parses a noon range", () => {
        const r = parseTimeText("09/12, 12-1pm")!;
        expect(r.start).toEqual(LocalTime.of(12, 0));
        expect(r.duration).toEqual(Duration.ofHours(1));
    });
    it("parses a single time with no end", () => {
        const r = parseTimeText("09/19, 7pm")!;
        expect(r.start).toEqual(LocalTime.of(19, 0));
        expect(r.duration).toBeUndefined();
    });
    it("treats an am-to-pm range correctly", () => {
        const r = parseTimeText("10/03, 11-1pm")!;
        expect(r.start).toEqual(LocalTime.of(11, 0));
        expect(r.duration).toEqual(Duration.ofHours(2));
    });
    it("returns undefined for a date-only range", () => {
        expect(parseTimeText("09/04-06")).toBeUndefined();
    });
});

describe("wixImageToUrl", () => {
    it("converts a wix:image reference", () => {
        expect(wixImageToUrl("wix:image://v1/abc_123~mv2.jpg/foo.jpg#originWidth=1")).toBe("https://static.wixstatic.com/media/abc_123~mv2.jpg");
        expect(wixImageToUrl(undefined)).toBeUndefined();
    });
});

describe("extractBoneyardEvents", () => {
    it("parses the sample CMS records", () => {
        const { events, errors } = extractBoneyardEvents(warmup, tz, beforeAll);
        // 8 records, one of which is a "Bar closed until 6pm" hours notice.
        expect(events).toHaveLength(7);
        expect(errors.filter(e => e.type === "ParseError")).toHaveLength(0);
        expect(events.some(e => /closed/i.test(e.summary))).toBe(false);

        const puppy = events.find(e => e.summary === "Puppy Social")!;
        expect(puppy.date.toLocalDate().toString()).toBe("2026-09-12");
        expect(puppy.date.toLocalTime()).toEqual(LocalTime.of(12, 0));
        expect(puppy.duration).toEqual(Duration.ofHours(1));
        expect(puppy.location).toContain("2603 S Jackson St");
        expect(puppy.imageUrl).toMatch(/^https:\/\/static\.wixstatic\.com\/media\//);
        expect(puppy.description).toContain("Puppies < 12months");

        const moon = events.find(e => e.summary === "Live Music with Moon Ghost")!;
        expect(moon.date.toLocalTime()).toEqual(LocalTime.of(19, 0));
        // "." category placeholder is not used as a subtitle
        expect(moon.description).not.toMatch(/^\.$/m);

        const drag = events.find(e => e.summary.startsWith("Drag & Karaoke"))!;
        expect(drag.summary).toBe("Drag & Karaoke ft. Sunnie Whintures");
    });

    it("filters past events", () => {
        const now = ZonedDateTime.of(2026, 9, 23, 12, 0, 0, 0, tz);
        const { events } = extractBoneyardEvents(warmup, tz, now);
        expect(events.map(e => e.summary)).toEqual(["Doodle Meetup", "Sniff & Sip"]);
    });

    it("produces stable ids", () => {
        const a = extractBoneyardEvents(warmup, tz, beforeAll).events.map(e => e.id);
        const b = extractBoneyardEvents(warmup, tz, beforeAll).events.map(e => e.id);
        expect(a).toEqual(b);
        expect(new Set(a).size).toBe(a.length);
    });

    it("reports a ParseError on missing collection", () => {
        const { events, errors } = extractBoneyardEvents(JSON.stringify({ appsWarmupData: {} }), tz, beforeAll);
        expect(events).toHaveLength(0);
        expect(errors[0].type).toBe("ParseError");
    });

    it("emits an UncertaintyError when the time is missing", () => {
        const json = JSON.stringify({ appsWarmupData: { dataBinding: { dataStore: { recordsByCollectionId: { EventsAtTavern: {
            a: { eventName: "Pup Fest", date: "2026-10-04", time1: "10/04-05" },
        } } } } } });
        const { events, errors } = extractBoneyardEvents(json, tz, beforeAll);
        expect(events).toHaveLength(1);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe("Uncertainty");
    });
});

describe("parseBoneyardRecord", () => {
    it("returns a ParseError for a record without a date", () => {
        const r = parseBoneyardRecord({ eventName: "X" }, tz);
        expect("type" in r && r.type).toBe("ParseError");
    });
});
