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

// Fixed "now": May 25, 2026 noon Pacific.
// The May 22-25 Folklife festival ends at 7pm on May 25, so it's still active at noon.
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 25, 12, 0), PACIFIC);

function loadSampleHtml() {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

// Helpers to build minimal HTML fragments matching the real page structure
function makeFestalSection(href: string, title: string, dateText: string, desc = 'Description.') {
    return (
        '<div class="fifty-fifty__header">' +
        `<h2 class="fifty-fifty__title"><a href="${href}">${title}</a></h2>` +
        '</div>' +
        '<div class="fifty-fifty__content">' +
        `<b>${dateText}</b><br>${desc}` +
        '</div>'
    );
}

describe('parseFestalDate', () => {
    it('parses a same-month range with explicit year', () => {
        // 4 days: (4-1)*24+8 = 80h, spanning May 22 11am → May 25 7pm
        const result = parseFestalDate('May 22-25, 2026', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 5, startDay: 22, durationHours: 80 });
    });

    it('parses a same-month 2-day range with explicit year', () => {
        // 2 days: (2-1)*24+8 = 32h, spanning Jun 6 11am → Jun 7 7pm
        const result = parseFestalDate('June 6-7, 2026', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 6, startDay: 6, durationHours: 32 });
    });

    it('parses a single day with explicit year', () => {
        const result = parseFestalDate('June 13, 2026', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 6, startDay: 13, durationHours: 8 });
    });

    it('parses a single day abbreviated month without year', () => {
        const result = parseFestalDate('Jul 11', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 7, startDay: 11, durationHours: 8 });
    });

    it('parses a cross-month range with spaces and year (real page format)', () => {
        // "October 31 - November 1, 2026" — live page uses spaces around the hyphen
        // 2 days: (2-1)*24+8 = 32h
        const result = parseFestalDate('October 31 - November 1, 2026', NOW);
        expect(result).toEqual({ startYear: 2026, startMonth: 10, startDay: 31, durationHours: 32 });
    });

    it('parses a 3-day same-month range', () => {
        // 3 days: (3-1)*24+8 = 56h
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
    it('returns null for a PDF link (intro section)', () => {
        const html = parse(makeFestalSection('/Documents/schedule.pdf', 'Festál: History', 'General info text'));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        expect(parseFestalSection(h2, NOW, PACIFIC)).toBeNull();
    });

    it('returns null for an external link', () => {
        const html = parse(makeFestalSection('https://example.com/', 'Podcast', 'Listen now'));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        expect(parseFestalSection(h2, NOW, PACIFIC)).toBeNull();
    });

    it('returns null for a postponed festival', () => {
        const html = parse(makeFestalSection(
            '/events/featured-events/festal/iranian',
            'Seattle Iranian Festival',
            'Festival Postponed. Date TBD'
        ));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        expect(parseFestalSection(h2, NOW, PACIFIC)).toBeNull();
    });

    it('returns null for an intro section with non-date bold text', () => {
        const html = parse(makeFestalSection(
            '/Documents/2026_schedule.pdf',
            'Festál: Nearly Three Decades',
            'Visit the festival pages listed below for more information.'
        ));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        expect(parseFestalSection(h2, NOW, PACIFIC)).toBeNull();
    });

    it('returns null for a fully past event', () => {
        const html = parse(makeFestalSection(
            '/events/festivals/northwest-folklife',
            'Northwest Folklife Festival',
            'May 22-25, 2026'
        ));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        // May 22-25 ends at 7pm on May 25; May 26 noon is fully past
        const afterFestival = ZonedDateTime.of(LocalDateTime.of(2026, 5, 26, 12, 0), PACIFIC);
        expect(parseFestalSection(h2, afterFestival, PACIFIC)).toBeNull();
    });

    it('keeps a multi-day event still in progress on its last day', () => {
        const html = parse(makeFestalSection(
            '/events/festivals/northwest-folklife',
            'Northwest Folklife Festival',
            'May 22-25, 2026'
        ));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        // May 22-25 ends at 7pm on May 25; noon on May 25 is still during the festival
        const result = parseFestalSection(h2, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('date');
    });

    it('parses a valid future single-day festival', () => {
        const html = parse(makeFestalSection(
            '/events/featured-events/festal/indigenous-people-festival',
            'Indigenous People Festival',
            'June 13, 2026'
        ));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        const result = parseFestalSection(h2, NOW, PACIFIC);
        expect(result).not.toBeNull();
        if (!result || !('date' in result)) return;
        expect(result.date.monthValue()).toBe(6);
        expect(result.date.dayOfMonth()).toBe(13);
        expect(result.date.hour()).toBe(11);
        expect(result.duration.toHours()).toBe(8);
        expect(result.summary).toBe('Indigenous People Festival');
    });

    it('builds absolute URLs from relative hrefs', () => {
        const html = parse(makeFestalSection(
            '/events/featured-events/festal/pagdiriwang-philippine-festival',
            'Pagdiriwang Philippine Festival',
            'June 6-7, 2026'
        ));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        const result = parseFestalSection(h2, NOW, PACIFIC);
        if (!result || !('date' in result)) return;
        expect(result.url).toBe('https://www.seattlecenter.com/events/featured-events/festal/pagdiriwang-philippine-festival');
    });

    it('generates a stable ID from year, month, day, and title', () => {
        const html = parse(makeFestalSection(
            '/events/featured-events/festal/pagdiriwang-philippine-festival',
            'Pagdiriwang Philippine Festival',
            'June 6-7, 2026'
        ));
        const h2 = html.querySelector('h2.fifty-fifty__title')!;
        const result = parseFestalSection(h2, NOW, PACIFIC);
        if (!result || !('date' in result)) return;
        expect(result.id).toBe('seattle-center-festal-2026-06-06-pagdiriwang-philippine-festival');
    });
});

describe('parseFestalFromHtml (integration)', () => {
    it('extracts 4 events: Northwest Folklife still running + 3 future festivals', () => {
        const html = parse(loadSampleHtml());
        const { events, errors } = parseFestalFromHtml(html, NOW, PACIFIC);
        expect(errors).toHaveLength(0);
        // 4 events: Northwest Folklife (ends May 25 7pm, NOW is noon),
        //           Pagdiriwang (Jun 6-7), Indigenous People (Jun 13),
        //           Día de Muertos (Oct 31-Nov 1)
        // Skipped: PDF intro, Iranian Festival (postponed), external podcast link
        expect(events).toHaveLength(4);
    });

    it('filters out Northwest Folklife once it has fully ended', () => {
        const afterFestival = ZonedDateTime.of(LocalDateTime.of(2026, 5, 26, 12, 0), PACIFIC);
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, afterFestival, PACIFIC);
        const titles = events.map(e => e.summary);
        expect(titles).not.toContain('Northwest Folklife Festival');
        expect(events).toHaveLength(3);
    });

    it('skips the postponed Iranian Festival', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        expect(events.map(e => e.summary)).not.toContain('Seattle Iranian Festival');
    });

    it('skips the PDF intro section', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        expect(events.map(e => e.summary)).not.toContain('Festál: Nearly Three Decades & Still Going Strong');
    });

    it('sets correct duration for a 2-day festival (Jun 6-7: 32h)', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        const pagdiriwang = events.find(e => e.summary === 'Pagdiriwang Philippine Festival')!;
        expect(pagdiriwang.duration.toHours()).toBe(32); // (2-1)*24+8 = 32h
    });

    it('sets correct duration for cross-month festival (Oct 31-Nov 1: 32h)', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFestalFromHtml(html, NOW, PACIFIC);
        const diadeMuertos = events.find(e => e.summary.includes('Muertos'))!;
        expect(diadeMuertos.duration.toHours()).toBe(32); // (2-1)*24+8 = 32h
        expect(diadeMuertos.date.monthValue()).toBe(10);
        expect(diadeMuertos.date.dayOfMonth()).toBe(31);
    });

    it('all events have Seattle Center as their location', () => {
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
