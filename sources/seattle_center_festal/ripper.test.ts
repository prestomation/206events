import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parse } from 'node-html-parser';

import { parseFestalDate, parseFestalSection, parseFestalFromHtml } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

// Fixed "now": May 25, 2026 noon Pacific — all 2026 Festál events after May are upcoming
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 25, 12, 0), PACIFIC);

function loadSampleHtml() {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('parseFestalDate', () => {
    it('parses a same-month range with explicit year', () => {
        // 4 days: (4-1)*24+8 = 80h, spanning May 22 11am → May 25 7pm
        const result = parseFestalDate('May 22-25, 2026', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 5, startDay: 22, durationHours: 80 });
    });

    it('parses a same-month 2-day range without year', () => {
        // 2 days: (2-1)*24+8 = 32h, spanning Jun 6 11am → Jun 7 7pm
        const result = parseFestalDate('Jun 6-7', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 6, startDay: 6, durationHours: 32 });
    });

    it('parses a single day without year', () => {
        const result = parseFestalDate('Jun 13', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 6, startDay: 13, durationHours: 8 });
    });

    it('parses a single day with explicit year', () => {
        const result = parseFestalDate('Jul 11, 2026', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 7, startDay: 11, durationHours: 8 });
    });

    it('parses a cross-month range (Oct 31-Nov 1)', () => {
        // 2 days: (2-1)*24+8 = 32h, spanning Oct 31 11am → Nov 1 7pm
        const result = parseFestalDate('Oct 31-Nov 1', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 10, startDay: 31, durationHours: 32 });
    });

    it('parses a 3-day same-month range', () => {
        // 3 days: (3-1)*24+8 = 56h, spanning Apr 10 11am → Apr 12 7pm
        const result = parseFestalDate('Apr 10-12, 2026', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 4, startDay: 10, durationHours: 56 });
    });

    it('returns null for unrecognized format (postponed notice)', () => {
        expect(parseFestalDate('Festival Postponed. Date TBD', NOW)).toBeNull();
    });

    it('returns null for unrecognized format (prose string)', () => {
        expect(parseFestalDate('Next summer sometime', NOW)).toBeNull();
    });

    it('rolls to next year when the date has already passed', () => {
        // Jan 15 < May 25 so it rolls to 2027
        const result = parseFestalDate('Jan 15', NOW);
        expect(result?.startYear).toBe(2027);
    });
});

describe('parseFestalSection', () => {
    it('returns null for an h3 with no anchor', () => {
        const html = parse('<div><h3>No anchor here</h3><p><strong>Jun 6-7</strong><br>Desc.</p></div>');
        const h3 = html.querySelector('h3')!;
        expect(parseFestalSection(h3, NOW, PACIFIC)).toBeNull();
    });

    it('returns null for a postponed festival', () => {
        const html = parse(
            '<div>' +
            '<h3><a href="/events/festivals/test">Test Festival</a></h3>' +
            '<p><strong>Festival Postponed. Date TBD</strong><br>Description.</p>' +
            '</div>'
        );
        const h3 = html.querySelector('h3')!;
        expect(parseFestalSection(h3, NOW, PACIFIC)).toBeNull();
    });

    it('returns null for a fully past event', () => {
        const html = parse(
            '<div>' +
            '<h3><a href="/events/festivals/folklife">Northwest Folklife Festival</a></h3>' +
            '<p><strong>May 22-25, 2026</strong><br>Description.</p>' +
            '</div>'
        );
        const h3 = html.querySelector('h3')!;
        // May 22-25 ends at 7pm on May 25; NOW is May 26 noon — fully past
        const afterFestival = ZonedDateTime.of(LocalDateTime.of(2026, 5, 26, 12, 0), PACIFIC);
        expect(parseFestalSection(h3, afterFestival, PACIFIC)).toBeNull();
    });

    it('keeps a multi-day event that started before now but has not yet ended', () => {
        const html = parse(
            '<div>' +
            '<h3><a href="/events/festivals/folklife">Northwest Folklife Festival</a></h3>' +
            '<p><strong>May 22-25, 2026</strong><br>Description.</p>' +
            '</div>'
        );
        const h3 = html.querySelector('h3')!;
        // May 22-25 ends at 7pm on May 25; noon on May 25 is still during the festival
        expect(parseFestalSection(h3, NOW, PACIFIC)).not.toBeNull();
        const result = parseFestalSection(h3, NOW, PACIFIC);
        expect(result).toHaveProperty('date');
    });

    it('returns ParseError for an unrecognizable date', () => {
        const html = parse(
            '<div>' +
            '<h3><a href="/events/festivals/test">Test Festival</a></h3>' +
            '<p><strong>Sometime in the future</strong><br>Description.</p>' +
            '</div>'
        );
        const h3 = html.querySelector('h3')!;
        const result = parseFestalSection(h3, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('type', 'ParseError');
    });

    it('parses a valid future single-day festival', () => {
        const html = parse(
            '<div>' +
            '<h3><a href="/events/featured-events/festal/indigenous">Indigenous People Festival</a></h3>' +
            '<p><strong>Jun 13</strong><br>Traditional music and dance.</p>' +
            '</div>'
        );
        const h3 = html.querySelector('h3')!;
        const result = parseFestalSection(h3, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('date');
        if (!('date' in result!)) return;
        expect(result.date.monthValue()).toBe(6);
        expect(result.date.dayOfMonth()).toBe(13);
        expect(result.date.hour()).toBe(11);
        expect(result.duration.toHours()).toBe(8);
        expect(result.summary).toBe('Indigenous People Festival');
    });

    it('builds absolute URLs for relative hrefs', () => {
        const html = parse(
            '<div>' +
            '<h3><a href="/events/festivals/folklife">Northwest Folklife</a></h3>' +
            '<p><strong>Jun 20</strong><br>Desc.</p>' +
            '</div>'
        );
        const h3 = html.querySelector('h3')!;
        const result = parseFestalSection(h3, NOW, PACIFIC);
        if (!result || !('date' in result)) return;
        expect(result.url).toBe('https://www.seattlecenter.com/events/festivals/folklife');
    });

    it('generates a stable ID from year, month, day, and title', () => {
        const html = parse(
            '<div>' +
            '<h3><a href="/events/festivals/test">Pagdiriwang Philippine Festival</a></h3>' +
            '<p><strong>Jun 6-7</strong><br>Desc.</p>' +
            '</div>'
        );
        const h3 = html.querySelector('h3')!;
        const result = parseFestalSection(h3, NOW, PACIFIC);
        if (!result || !('date' in result)) return;
        expect(result.id).toBe('seattle-center-festal-2026-06-06-pagdiriwang-philippine-festival');
    });
});

describe('parseFestalFromHtml (integration)', () => {
    it('extracts 4 events from sample data at noon on the last day of a multi-day festival', () => {
        const html = parse(loadSampleHtml());
        const { events, errors } = parseFestalFromHtml(html, NOW, PACIFIC);
        expect(errors).toHaveLength(0);
        // 4 events: Northwest Folklife (still running — ends May 25 7pm, NOW is noon),
        //           Pagdiriwang (Jun 6-7), Indigenous People (Jun 13), Día de Muertos (Oct 31-Nov 1)
        // Skipped: Iranian Festival (postponed)
        expect(events).toHaveLength(4);
    });

    it('filters out Northwest Folklife once it has fully ended', () => {
        const afterFestival = ZonedDateTime.of(LocalDateTime.of(2026, 5, 26, 12, 0), PACIFIC);
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, afterFestival, PACIFIC);
        const titles = events.map(e => e.summary);
        expect(titles).not.toContain('Northwest Folklife Festival');
        expect(events).toHaveLength(3); // only the 3 future events remain
    });

    it('skips the postponed Iranian Festival', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        const titles = events.map(e => e.summary);
        expect(titles).not.toContain('Seattle Iranian Festival');
    });

    it('sets correct duration for a 2-day festival (spans 11am day-1 to 7pm day-2)', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        const pagdiriwang = events.find(e => e.summary === 'Pagdiriwang Philippine Festival')!;
        expect(pagdiriwang.duration.toHours()).toBe(32); // (2-1)*24+8 = 32h
    });

    it('sets correct duration for a cross-month festival (Oct 31-Nov 1)', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        const diadeMuertos = events.find(e => e.summary.includes('Muertos'))!;
        expect(diadeMuertos.duration.toHours()).toBe(32); // (2-1)*24+8 = 32h
        expect(diadeMuertos.date.monthValue()).toBe(10);
        expect(diadeMuertos.date.dayOfMonth()).toBe(31);
    });

    it('sets the Seattle Center as default location', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        for (const event of events) {
            expect(event.location).toContain('Seattle Center');
        }
    });

    it('all events have stable IDs matching the expected pattern', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(events.length);
        for (const id of ids) {
            expect(id).toMatch(/^seattle-center-festal-\d{4}-\d{2}-\d{2}-/);
        }
    });
});
