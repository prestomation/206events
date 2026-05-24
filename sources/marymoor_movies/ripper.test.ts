import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime, LocalTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parse } from 'node-html-parser';

import {
    parseHeading,
    parseDoorsTime,
    inferYear,
    parsePanel,
    parsePanelsFromHtml,
} from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

// Fixed "now": May 24, 2026 noon Pacific — before any 2026 movie night
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 24, 12, 0), PACIFIC);

function loadSampleHtml() {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('parseHeading', () => {
    it('parses a normal "Wednesday, July 8th: TITLE" heading', () => {
        const r = parseHeading("Wednesday, July 8th: FERRIS BUELLER'S DAY OFF");
        expect(r).toEqual({ month: 7, day: 8, title: "FERRIS BUELLER'S DAY OFF" });
    });

    it('parses a heading with no space between month and day', () => {
        const r = parseHeading('Wednesday, July15th: MAMA MIA');
        expect(r).toEqual({ month: 7, day: 15, title: 'MAMA MIA' });
    });

    it('parses an abbreviated month name', () => {
        const r = parseHeading('Tuesday, Aug 18th: INCREDIBLES');
        expect(r).toEqual({ month: 8, day: 18, title: 'INCREDIBLES' });
    });

    it('rejects an unparseable heading', () => {
        expect(parseHeading('this is not a heading')).toBeNull();
    });

    it('rejects a heading with no movie title', () => {
        expect(parseHeading('Wednesday, July 8th:')).toBeNull();
    });

    it('rejects an unknown month', () => {
        expect(parseHeading('Wednesday, Foobruary 8th: SOMETHING')).toBeNull();
    });
});

describe('parseDoorsTime', () => {
    it('parses a normal "Doors Open at: 7:30pm" string', () => {
        expect(parseDoorsTime('Doors Open at: 7:30pm Movie starts at 9:30pm')).toEqual(LocalTime.of(19, 30));
    });

    it('parses a "6:30pm" doors-open time', () => {
        expect(parseDoorsTime('Doors Open at: 6:30pm')).toEqual(LocalTime.of(18, 30));
    });

    it('treats the bare "m" suffix typo as "pm"', () => {
        expect(parseDoorsTime('Doors Open at: 7:00m')).toEqual(LocalTime.of(19, 0));
    });

    it('returns null when no doors-open time is present', () => {
        expect(parseDoorsTime('Some text without a doors time')).toBeNull();
    });

    it('handles 12am as midnight', () => {
        expect(parseDoorsTime('Doors Open at: 12:00am')).toEqual(LocalTime.of(0, 0));
    });

    it('handles 12pm as noon', () => {
        expect(parseDoorsTime('Doors Open at: 12:00pm')).toEqual(LocalTime.of(12, 0));
    });
});

describe('inferYear', () => {
    it('uses the current year when the date is later this year', () => {
        // NOW is May 24, 2026 → July 8 is later in 2026
        expect(inferYear(7, 8, NOW)).toBe(2026);
    });

    it('rolls forward to next year when the date has already passed this year', () => {
        // NOW is May 24, 2026 → March 1 has already happened
        expect(inferYear(3, 1, NOW)).toBe(2027);
    });

    it('keeps the current year for today', () => {
        expect(inferYear(NOW.monthValue(), NOW.dayOfMonth(), NOW)).toBe(NOW.year());
    });

    it('returns null for an invalid calendar date (Feb 30)', () => {
        expect(inferYear(2, 30, NOW)).toBeNull();
    });

    it('returns null for an invalid calendar date (Apr 31)', () => {
        expect(inferYear(4, 31, NOW)).toBeNull();
    });
});

describe('parsePanel invalid-date handling', () => {
    it('returns ParseError when the heading parses but the date is impossible', () => {
        const html = parse('<div class="fusion-panel">'
            + '<span class="fusion-toggle-heading">Wednesday, Feb 30th: NEVERLAND</span>'
            + '<div class="panel-body">Doors Open at: 7:00pm Movie starts at 9:00pm: NEVERLAND</div>'
            + '</div>');
        const panel = html.querySelector('.fusion-panel')!;
        const result = parsePanel(panel, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect(result!).toHaveProperty('type', 'ParseError');
    });
});

describe('parsePanelsFromHtml (integration)', () => {
    it('extracts all 8 movie nights from the live sample', () => {
        const html = parse(loadSampleHtml());
        const { events, errors } = parsePanelsFromHtml(html, NOW, PACIFIC);

        expect(errors).toHaveLength(0);
        expect(events).toHaveLength(8);

        // First event: Wednesday July 8th, FERRIS BUELLER'S DAY OFF, doors 7:30pm
        const first = events[0];
        expect(first.date.year()).toBe(2026);
        expect(first.date.monthValue()).toBe(7);
        expect(first.date.dayOfMonth()).toBe(8);
        expect(first.date.hour()).toBe(19);
        expect(first.date.minute()).toBe(30);
        expect(first.summary).toContain('Ferris');
        expect(first.summary).toContain('Outdoor Movies at Marymoor');
        expect(first.location).toContain('Marymoor Park');
        expect(first.url).toContain('simpletix.com');
        expect(first.id).toBe('marymoor-movies-2026-07-08-ferris-bueller-s-day-off');
    });

    it('parses the heading with no space between month and day', () => {
        const html = parse(loadSampleHtml());
        const { events } = parsePanelsFromHtml(html, NOW, PACIFIC);
        // 2nd event: "Wednesday, July15th: MAMA MIA" (note: heading misspells
        // it as "MAMA MIA"; the body has the correct "MAMMA MIA". We take the
        // title from the heading.)
        const mamaMia = events.find(e => e.summary.toLowerCase().includes('mama mia'));
        expect(mamaMia).toBeDefined();
        expect(mamaMia!.date.monthValue()).toBe(7);
        expect(mamaMia!.date.dayOfMonth()).toBe(15);
    });

    it('parses the panel whose doors-open time has the "m" typo', () => {
        const html = parse(loadSampleHtml());
        const { events } = parsePanelsFromHtml(html, NOW, PACIFIC);
        // "Wednesday, July 29th: HOW TO LOSE A GUY IN 10 DAYS" with "Doors Open at: 7:00m"
        const howToLose = events.find(e => e.summary.toLowerCase().includes('how to lose'));
        expect(howToLose).toBeDefined();
        expect(howToLose!.date.monthValue()).toBe(7);
        expect(howToLose!.date.dayOfMonth()).toBe(29);
        expect(howToLose!.date.hour()).toBe(19);
        expect(howToLose!.date.minute()).toBe(0);
    });

    it('drops past events relative to "now"', () => {
        // Pretend now is after the series is over
        const after = ZonedDateTime.of(LocalDateTime.of(2026, 9, 1, 0, 0), PACIFIC);
        const html = parse(loadSampleHtml());
        const { events } = parsePanelsFromHtml(html, after, PACIFIC);
        // All 2026 events are past, but the loop rolls them to 2027 → all 8 in the future
        expect(events).toHaveLength(8);
        for (const e of events) {
            expect(e.date.year()).toBe(2027);
            expect(e.date.isAfter(after)).toBe(true);
        }
    });

    it('every event has a stable id derived from date + title', () => {
        const html = parse(loadSampleHtml());
        const { events } = parsePanelsFromHtml(html, NOW, PACIFIC);
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(events.length);
        for (const id of ids) {
            expect(id).toMatch(/^marymoor-movies-\d{4}-\d{2}-\d{2}-/);
        }
    });

    it('every event has a 3-hour duration', () => {
        const html = parse(loadSampleHtml());
        const { events } = parsePanelsFromHtml(html, NOW, PACIFIC);
        for (const e of events) {
            expect(e.duration.toHours()).toBe(3);
        }
    });
});
