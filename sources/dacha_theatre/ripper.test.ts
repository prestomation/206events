import { describe, it, expect } from "vitest";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractHumanitixLinks, extractDachaEvents, parseDachaEvents, DachaEventPage } from "./ripper.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return readFileSync(join(__dirname, "sample-data.html"), "utf-8");
}

const SAMPLE_URL = "https://events.humanitix.com/dream-carl-dream";
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
        it("extracts page with 5 performances from sample data", () => {
            const html = loadSampleHtml();
            const { page, parseError } = extractDachaEvents(html, SAMPLE_URL);
            expect(parseError).toBeUndefined();
            expect(page).toBeDefined();
            expect(page!.performances).toHaveLength(5);
            expect(page!.title).toBe("Dream, Carl, Dream!");
            expect(page!.location).toContain("12th Avenue Arts");
        });

        it("returns parseError for empty HTML", () => {
            const { page, parseError } = extractDachaEvents("<html><body>no events</body></html>", SAMPLE_URL);
            expect(page).toBeUndefined();
            expect(parseError?.type).toBe("ParseError");
        });

        it("returns empty page (not a ParseError) for JS-rendered SPA shell without ticket links", () => {
            // Humanitix is a React SPA; Browserbase Fetch API does not wait for
            // async data loading, so the rendered HTML may have no dateId anchors.
            // Treat this as an empty page so the build stays clean (expectEmpty).
            const spaShell = `<html><body><h1>Dream, Carl, Dream!</h1><div id="app"></div></body></html>`;
            const { page, parseError } = extractDachaEvents(spaShell, SAMPLE_URL);
            expect(parseError).toBeUndefined();
            expect(page).toBeDefined();
            expect(page!.performances).toHaveLength(0);
        });

        it("extracts first performance correctly", () => {
            const html = loadSampleHtml();
            const { page } = extractDachaEvents(html, SAMPLE_URL);
            const first = page!.performances[0];
            expect(first.dateId).toBe("aaa0001");
            expect(first.dateStr).toBe("Fri, Jun 5, 7:30pm - 10pm PDT");
        });
    });

    describe("parseDachaEvents", () => {
        function makePage(): DachaEventPage {
            const html = loadSampleHtml();
            const { page } = extractDachaEvents(html, SAMPLE_URL);
            return page!;
        }

        it("parses all 5 future events", () => {
            const page = makePage();
            const { events, errors } = parseDachaEvents(page, now, timezone);
            expect(errors).toHaveLength(0);
            expect(events).toHaveLength(5);
        });

        it("excludes past events", () => {
            const page = makePage();
            const futureNow = ZonedDateTime.parse("2030-01-01T00:00:00-08:00");
            const { events } = parseDachaEvents(page, futureNow, timezone);
            expect(events).toHaveLength(0);
        });

        it("generates stable IDs from dateId", () => {
            const page = makePage();
            const { events } = parseDachaEvents(page, now, timezone);
            expect(events[0].id).toBe("dacha-aaa0001");
        });

        it("sets correct event properties", () => {
            const page = makePage();
            const { events } = parseDachaEvents(page, now, timezone);
            const first = events[0];
            expect(first.summary).toBe("Dream, Carl, Dream!");
            expect(first.location).toContain("12th Avenue Arts");
            expect(first.url).toMatch(/humanitix\.com/);
        });

        it("converts dates to America/Los_Angeles", () => {
            const page = makePage();
            const { events } = parseDachaEvents(page, now, timezone);
            for (const e of events) {
                expect(e.date.zone().id()).toBe("America/Los_Angeles");
            }
        });

        it("computes duration from time range", () => {
            const page = makePage();
            const { events } = parseDachaEvents(page, now, timezone);
            // First event: 7:30pm - 10pm = 150 minutes
            expect(events[0].duration.toMinutes()).toBe(150);
        });
    });
});
