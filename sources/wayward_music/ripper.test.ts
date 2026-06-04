import { describe, it, expect } from "vitest";
import { parseDescription, parseEvent } from "./ripper.js";
import { ZoneRegion } from "@js-joda/core";
import sampleData from "./sample-data.json";
import '@js-joda/timezone';

const TIMEZONE = ZoneRegion.of("America/Los_Angeles");

describe("parseDescription", () => {
    it("strips HTML tags", () => {
        const html = "<p>Hello <em>world</em></p>";
        expect(parseDescription(html)).toBe("Hello world");
    });

    it("removes Read More link", () => {
        const html = '<p>Event description.</p>\n<p>More... <a class="read-more" href="#">Read More <span class="meta-nav">&rarr;</span></a></p>';
        const result = parseDescription(html);
        expect(result).not.toContain("Read More");
        expect(result).toContain("Event description.");
    });

    it("decodes HTML entities", () => {
        const html = "<p>Tom &amp; Jerry &#8217;s</p>";
        expect(parseDescription(html)).toContain("Tom & Jerry");
        expect(parseDescription(html)).toContain("’s");
    });

    it("collapses whitespace", () => {
        const html = "<p>First.</p>\n\n<p>Second.</p>";
        expect(parseDescription(html)).toBe("First. Second.");
    });
});

describe("parseEvent", () => {
    it("parses a valid WordPress post into a RipperCalendarEvent", () => {
        const post = sampleData[0];
        const result = parseEvent(post as any, TIMEZONE);
        expect("date" in result).toBe(true);
        if ("date" in result) {
            expect(result.id).toBe(`wayward-music-${post.id}`);
            expect(result.summary).toBe("Coen Rios: Pacific Tribute");
            expect(result.date.year()).toBe(2026);
            expect(result.date.monthValue()).toBe(5);
            expect(result.date.dayOfMonth()).toBe(22);
            expect(result.date.hour()).toBe(20);
            expect(result.location).toContain("Chapel Performance Space");
            expect(result.url).toContain("waywardmusic.org");
            expect(result.description).not.toContain("<");
        }
    });

    it("parses event with 7:00 PM time correctly", () => {
        const post = sampleData[1];
        const result = parseEvent(post as any, TIMEZONE);
        expect("date" in result).toBe(true);
        if ("date" in result) {
            expect(result.date.hour()).toBe(19);
        }
    });

    it("decodes HTML entities in title", () => {
        const post = sampleData[2];
        const result = parseEvent(post as any, TIMEZONE);
        if ("date" in result) {
            expect(result.summary).toContain("’");
        }
    });

    it("returns ParseError for unparseable date", () => {
        const post = { ...sampleData[0], date: "not-a-date" };
        const result = parseEvent(post as any, TIMEZONE);
        expect("type" in result).toBe(true);
        if ("type" in result) {
            expect(result.type).toBe("ParseError");
        }
    });

    it("generates stable ids from post id", () => {
        const post = { ...sampleData[0], id: 12345 };
        const result = parseEvent(post as any, TIMEZONE);
        if ("date" in result) {
            expect(result.id).toBe("wayward-music-12345");
        }
    });

    it("maps the embedded featured image to imageUrl", () => {
        const post = sampleData[0];
        const result = parseEvent(post as any, TIMEZONE);
        if ("date" in result) {
            expect(result.imageUrl).toBe(
                "https://www.waywardmusic.org/wp-content/uploads/2026/04/coen-rios-pacific-tribute.jpg"
            );
        }
    });

    it("leaves imageUrl undefined when no featured media is embedded", () => {
        const post = sampleData[1];
        const result = parseEvent(post as any, TIMEZONE);
        if ("date" in result) {
            expect(result.imageUrl).toBeUndefined();
        }
    });

    it("sets 2-hour default duration", () => {
        const post = sampleData[0];
        const result = parseEvent(post as any, TIMEZONE);
        if ("date" in result) {
            expect(result.duration.toMinutes()).toBe(120);
        }
    });
});

describe("sample data integration", () => {
    it("parses all sample events without errors", () => {
        const results = sampleData.map(p => parseEvent(p as any, TIMEZONE));
        const errors = results.filter(r => "type" in r);
        const events = results.filter(r => "date" in r);
        expect(errors.length).toBe(0);
        expect(events.length).toBe(3);
    });
});
