import { describe, it, expect } from "vitest";
import { LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseEventDate, parseTitleHtml, parseMonthHtml } from "./ripper.js";
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));
const timezone = ZoneId.of("America/Los_Angeles");

function loadSample(): string {
    return readFileSync(join(__dirname, "sample-data.html"), "utf-8");
}

describe("parseEventDate", () => {
    it("parses a standard am time", () => {
        const result = parseEventDate("July 4, 2026 10:00 am");
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(10);
        expect(result!.minute()).toBe(0);
        expect(result!.dayOfMonth()).toBe(4);
    });

    it("parses a pm time", () => {
        const result = parseEventDate("July 1, 2026 6:00 pm");
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(18);
    });

    it("handles 12:00 pm (noon) correctly", () => {
        const result = parseEventDate("July 5, 2026 12:00 pm");
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(12);
    });

    it("handles 12:00 am (midnight) correctly", () => {
        const result = parseEventDate("July 5, 2026 12:00 am");
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(0);
    });

    it("strips trailing unix timestamp from end date strings", () => {
        const result = parseEventDate("July 10, 2026 8:00 pm*1783713600*");
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(20);
    });

    it("returns null for unparseable input", () => {
        expect(parseEventDate("not a date")).toBeNull();
        expect(parseEventDate("")).toBeNull();
    });
});

describe("parseTitleHtml", () => {
    it("parses a simple event", () => {
        const html = '<div class=pe-hover-title>Cosplay Meetup! (10 avail)</div><div class=pe-hover-date>July 2, 2026 6:00 pm</div><div class=pe-hover-date>July 2, 2026 8:00 pm*1783022400*</div>';
        const result = parseTitleHtml(html, "155598", "https://seattlemakers.org/events/cosplay-meetup-39/");
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.summary).toBe("Cosplay Meetup!");
        expect(result.id).toBe("seattle-makers-155598");
        expect(result.startStr).toBe("July 2, 2026 6:00 pm");
        expect(result.endStr).toBe("July 2, 2026 8:00 pm");
    });

    it("strips availability count from title", () => {
        const html = '<div class=pe-hover-title>Screen Printing Certification (2 avail)</div><div class=pe-hover-date>July 1, 2026 6:30 pm</div><div class=pe-hover-date>July 1, 2026 9:00 pm*1782939600*</div>';
        const result = parseTitleHtml(html, "154027", "https://seattlemakers.org/events/screen-printing-certification-28/");
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.summary).toBe("Screen Printing Certification");
    });

    it("decodes HTML entities in title", () => {
        const html = '<div class=pe-hover-title>Woodshop Basics (4 Part Series &#8211; Wednesdays) (0 avail)</div><div class=pe-hover-date>July 1, 2026 6:30 pm</div><div class=pe-hover-date>July 22, 2026 9:30 pm*1784755800*</div>';
        const result = parseTitleHtml(html, "152647", "https://seattlemakers.org/events/woodshop-basics/");
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.summary).toBe("Woodshop Basics (4 Part Series – Wednesdays)");
    });

    it("handles missing end date gracefully", () => {
        const html = '<div class=pe-hover-title>Test Event</div><div class=pe-hover-date>July 1, 2026 6:00 pm</div>';
        const result = parseTitleHtml(html, "99999", "https://seattlemakers.org/events/test/");
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.endStr).toBeNull();
    });

    it("returns error when title HTML is malformed", () => {
        const result = parseTitleHtml("<div>no hover divs here</div>", "00000", "https://example.com");
        expect('error' in result).toBe(true);
    });
});

describe("parseMonthHtml", () => {
    it("extracts events from sample data", () => {
        const html = loadSample();
        const events = parseMonthHtml(html);
        expect(events.length).toBeGreaterThan(5);
    });

    it("deduplicates by post ID", () => {
        const html = loadSample();
        const events = parseMonthHtml(html);
        const ids = events.map(e => e.postId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("includes expected events from sample", () => {
        const html = loadSample();
        const events = parseMonthHtml(html);
        const titles = events.map(e => {
            const m = e.titleHtml.match(/<div class=pe-hover-title>(.*?)<\/div>/);
            return m?.[1] ?? '';
        });
        expect(titles.some(t => t.includes("Cosplay Meetup"))).toBe(true);
        expect(titles.some(t => t.includes("Woodshop"))).toBe(true);
    });

    it("returns empty array for HTML with no events", () => {
        expect(parseMonthHtml("<html><body>no events</body></html>")).toHaveLength(0);
    });
});

describe("integration: parseMonthHtml + parseTitleHtml", () => {
    it("produces valid events from sample data", () => {
        const html = loadSample();
        const rawEvents = parseMonthHtml(html);
        const now = ZonedDateTime.parse("2026-01-01T00:00:00-08:00");

        const events = [];
        for (const { postId, url, titleHtml } of rawEvents) {
            const parsed = parseTitleHtml(titleHtml, postId, url);
            if ('error' in parsed) continue;
            if (parsed.summary.toLowerCase() === 'closed') continue;
            const startLdt = parseEventDate(parsed.startStr);
            if (!startLdt) continue;
            const startZdt = startLdt.atZone(timezone);
            if (startZdt.isBefore(now)) continue;
            events.push({ ...parsed, startZdt });
        }

        expect(events.length).toBeGreaterThan(5);
        for (const e of events) {
            expect(e.id).toMatch(/^seattle-makers-\d+$/);
            expect(e.summary).toBeTruthy();
            expect(e.summary).not.toMatch(/\(\d+ avail\)$/);
            expect(e.url).toMatch(/seattlemakers\.org/);
            expect(e.startZdt.zone().id()).toBe("America/Los_Angeles");
        }
    });

    it("excludes Closed entries", () => {
        const html = loadSample();
        const rawEvents = parseMonthHtml(html);
        const now = ZonedDateTime.parse("2026-01-01T00:00:00-08:00");

        const events = [];
        for (const { postId, url, titleHtml } of rawEvents) {
            const parsed = parseTitleHtml(titleHtml, postId, url);
            if ('error' in parsed) continue;
            if (parsed.summary.toLowerCase() === 'closed') continue;
            const startLdt = parseEventDate(parsed.startStr);
            if (!startLdt) continue;
            events.push(parsed);
        }

        expect(events.every(e => e.summary.toLowerCase() !== 'closed')).toBe(true);
    });
});
