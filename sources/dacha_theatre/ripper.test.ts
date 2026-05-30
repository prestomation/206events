import { describe, it, expect } from "vitest";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractHumanitixLinks, extractDachaEvents, parseDachaEvents } from "./ripper.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return readFileSync(join(__dirname, "sample-data.html"), "utf-8");
}

const timezone = ZoneId.of("America/Los_Angeles");
const now = ZonedDateTime.parse("2026-01-01T00:00:00-08:00");

describe("DachaTheatreRipper", () => {
    describe("extractHumanitixLinks", () => {
        it("extracts clean Humanitix URL from homepage HTML", () => {
            const html = '<a href="https://events.humanitix.com/dream-carl-dream?_gl=tracking">Get tickets</a>';
            const links = extractHumanitixLinks(html);
            expect(links).toHaveLength(1);
            expect(links[0]).toBe("https://events.humanitix.com/dream-carl-dream");
        });

        it("deduplicates multiple links to the same event", () => {
            const html = `
                <a href="https://events.humanitix.com/dream-carl-dream?foo=bar">Tickets</a>
                <a href="https://events.humanitix.com/dream-carl-dream?baz=qux">Get Tickets</a>
            `;
            const links = extractHumanitixLinks(html);
            expect(links).toHaveLength(1);
        });

        it("returns empty array when no Humanitix links found", () => {
            const links = extractHumanitixLinks("<html><body>no events</body></html>");
            expect(links).toHaveLength(0);
        });

        it("extracts multiple distinct production links", () => {
            const html = `
                <a href="https://events.humanitix.com/show-one">Show One</a>
                <a href="https://events.humanitix.com/show-two">Show Two</a>
            `;
            const links = extractHumanitixLinks(html);
            expect(links).toHaveLength(2);
        });
    });

    describe("extractDachaEvents", () => {
        it("extracts 22 events from sample data", () => {
            const html = loadSampleHtml();
            const { events, parseError } = extractDachaEvents(html);
            expect(parseError).toBeUndefined();
            expect(events).toHaveLength(22);
        });

        it("returns error when no Event array found", () => {
            const { events, parseError } = extractDachaEvents("<html><body>no events</body></html>");
            expect(events).toHaveLength(0);
            expect(parseError?.type).toBe("ParseError");
        });

        it("extracts correct event fields", () => {
            const html = loadSampleHtml();
            const { events } = extractDachaEvents(html);
            const first = events[0];
            expect(first["@type"]).toBe("Event");
            expect(first.name).toBe("Dream, Carl, Dream!");
            expect(first.startDate).toBe("2026-06-05T19:30:00-0700");
            expect(first.location?.name).toBe("12th Avenue Arts - Mainstage");
        });
    });

    describe("parseDachaEvents", () => {
        it("parses all future events from sample data", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractDachaEvents(html);
            const { events, errors } = parseDachaEvents(raw, now, timezone);
            expect(errors).toHaveLength(0);
            expect(events).toHaveLength(22);
        });

        it("excludes past events", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractDachaEvents(html);
            const futureNow = ZonedDateTime.parse("2030-01-01T00:00:00-08:00");
            const { events } = parseDachaEvents(raw, futureNow, timezone);
            expect(events).toHaveLength(0);
        });

        it("generates stable IDs from slug and start datetime", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractDachaEvents(html);
            const { events } = parseDachaEvents(raw, now, timezone);
            expect(events[0].id).toMatch(/^dacha-dream-carl-dream-/);
            // All IDs unique (22 distinct showings)
            const ids = events.map(e => e.id);
            expect(new Set(ids).size).toBe(22);
        });

        it("sets correct event properties", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractDachaEvents(html);
            const { events } = parseDachaEvents(raw, now, timezone);
            const first = events[0];
            expect(first.summary).toBe("Dream, Carl, Dream!");
            expect(first.location).toContain("12th Avenue Arts");
            expect(first.location).toContain("1620 12th Ave");
            expect(first.url).toMatch(/humanitix\.com/);
        });

        it("converts dates to America/Los_Angeles timezone", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractDachaEvents(html);
            const { events } = parseDachaEvents(raw, now, timezone);
            for (const e of events) {
                expect(e.date.zone().id()).toBe("America/Los_Angeles");
            }
        });

        it("computes duration from endDate", () => {
            const html = loadSampleHtml();
            const { events: raw } = extractDachaEvents(html);
            const { events } = parseDachaEvents(raw, now, timezone);
            // First event: 19:30-22:00 = 2.5 hours = 150 minutes
            expect(events[0].duration.toMinutes()).toBe(150);
        });
    });
});
