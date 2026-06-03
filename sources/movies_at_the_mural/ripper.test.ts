import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parse } from 'node-html-parser';

import {
    parseTitleAndDate,
    inferYear,
    extractBackgroundImageUrl,
    parseFeaturedItem,
    parseFeaturedItemsFromHtml,
} from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

// Fixed "now": May 24, 2026 noon Pacific — before any 2026 movie night
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 24, 12, 0), PACIFIC);

function loadSampleHtml() {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('parseTitleAndDate', () => {
    it('parses "Wonka | Jul 24"', () => {
        expect(parseTitleAndDate('Wonka | Jul 24')).toEqual({ title: 'Wonka', month: 7, day: 24 });
    });

    it('parses a multi-word title', () => {
        expect(parseTitleAndDate('The Princess Bride | Jul 31'))
            .toEqual({ title: 'The Princess Bride', month: 7, day: 31 });
    });

    it('parses a full month name', () => {
        expect(parseTitleAndDate('Coco | August 14'))
            .toEqual({ title: 'Coco', month: 8, day: 14 });
    });

    it('tolerates an ordinal suffix on the day', () => {
        expect(parseTitleAndDate('Hamilton | Aug 7th'))
            .toEqual({ title: 'Hamilton', month: 8, day: 7 });
    });

    it('tolerates a trailing period on the month', () => {
        expect(parseTitleAndDate('Coco | Aug. 14'))
            .toEqual({ title: 'Coco', month: 8, day: 14 });
    });

    it('rejects text with no pipe separator', () => {
        expect(parseTitleAndDate('Wonka Jul 24')).toBeNull();
    });

    it('rejects an unknown month', () => {
        expect(parseTitleAndDate('Wonka | Foo 24')).toBeNull();
    });

    it('rejects a title-less heading', () => {
        expect(parseTitleAndDate(' | Jul 24')).toBeNull();
    });
});

describe('inferYear', () => {
    it('uses the current year when the date is later this year', () => {
        // NOW is May 24, 2026 → July 24 is later in 2026
        expect(inferYear(7, 24, NOW)).toBe(2026);
    });

    it('rolls forward to next year when the date has already passed', () => {
        // NOW is May 24, 2026 → March 1 has already happened
        expect(inferYear(3, 1, NOW)).toBe(2027);
    });

    it('keeps the current year for today', () => {
        expect(inferYear(NOW.monthValue(), NOW.dayOfMonth(), NOW)).toBe(NOW.year());
    });

    it('returns null for Feb 30', () => {
        expect(inferYear(2, 30, NOW)).toBeNull();
    });
});

describe('extractBackgroundImageUrl', () => {
    it('parses an unquoted url() value', () => {
        expect(extractBackgroundImageUrl('background-image: url(/assets/foo.jpg);'))
            .toBe('/assets/foo.jpg');
    });

    it('parses a quoted url() value', () => {
        expect(extractBackgroundImageUrl("background-image: url('https://example.com/foo.jpg');"))
            .toBe('https://example.com/foo.jpg');
    });

    it('returns null when no background-image is present', () => {
        expect(extractBackgroundImageUrl('color: red')).toBeNull();
    });

    it('returns null for an undefined style attribute', () => {
        expect(extractBackgroundImageUrl(undefined)).toBeNull();
    });
});

describe('parseFeaturedItem invalid-date handling', () => {
    it('returns ParseError when the title is unparseable', () => {
        const html = parse(
            '<a class="featured-item" href="events/event-calendar/movies-at-the-mural-x" style="background-image: url(/foo.jpg);">'
            + '<h3 class="featured-item__title"><p>This is not a movie title</p></h3>'
            + '</a>'
        );
        const item = html.querySelector('a.featured-item')!;
        const result = parseFeaturedItem(item, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect(result!).toHaveProperty('type', 'ParseError');
    });

    it('returns ParseError when the date is impossible', () => {
        const html = parse(
            '<a class="featured-item" href="events/event-calendar/movies-at-the-mural-x">'
            + '<h3 class="featured-item__title"><p>Neverland | Feb 30</p></h3>'
            + '</a>'
        );
        const item = html.querySelector('a.featured-item')!;
        const result = parseFeaturedItem(item, NOW, PACIFIC);
        expect(result).not.toBeNull();
        expect(result!).toHaveProperty('type', 'ParseError');
    });
});

describe('parseFeaturedItemsFromHtml (integration)', () => {
    it('extracts all 5 movie nights from the live sample', () => {
        const html = parse(loadSampleHtml());
        const { events, errors } = parseFeaturedItemsFromHtml(html, NOW, PACIFIC);

        expect(errors).toHaveLength(0);
        expect(events).toHaveLength(5);

        const summaries = events.map(e => e.summary);
        expect(summaries).toContain('Wonka — Movies at the Mural');
        expect(summaries).toContain('The Princess Bride — Movies at the Mural');
        expect(summaries).toContain('Hamilton — Movies at the Mural');
        expect(summaries).toContain('Coco — Movies at the Mural');
        expect(summaries).toContain('Masters of the Universe — Movies at the Mural');
    });

    it('puts the first event on Friday July 24, 2026 at 9 PM Pacific', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFeaturedItemsFromHtml(html, NOW, PACIFIC);
        const wonka = events.find(e => e.summary.startsWith('Wonka'))!;
        expect(wonka.date.year()).toBe(2026);
        expect(wonka.date.monthValue()).toBe(7);
        expect(wonka.date.dayOfMonth()).toBe(24);
        expect(wonka.date.hour()).toBe(21);
        expect(wonka.date.minute()).toBe(0);
    });

    it('builds absolute URLs from the relative href', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFeaturedItemsFromHtml(html, NOW, PACIFIC);
        const wonka = events.find(e => e.summary.startsWith('Wonka'))!;
        expect(wonka.url).toBe('https://www.seattlecenter.com/events/event-calendar/movies-at-the-mural-wonka');
    });

    it('builds absolute image URLs from the background-image style', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFeaturedItemsFromHtml(html, NOW, PACIFIC);
        const wonka = events.find(e => e.summary.startsWith('Wonka'))!;
        expect(wonka.imageUrl).toBe('https://www.seattlecenter.com/assets/Images/Events/Productions/ArtsPrograms/MATM/2026/SCP-MATM-26-Wonka-Gallery-595x360.jpg');
    });

    it('every event has the Mural Amphitheatre location', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFeaturedItemsFromHtml(html, NOW, PACIFIC);
        for (const e of events) {
            expect(e.location).toContain('Mural Amphitheatre');
            expect(e.location).toContain('Seattle Center');
        }
    });

    it('every event has a stable id derived from date + title', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFeaturedItemsFromHtml(html, NOW, PACIFIC);
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(events.length);
        for (const id of ids) {
            expect(id).toMatch(/^movies-at-the-mural-\d{4}-\d{2}-\d{2}-/);
        }
    });

    it('every event has a 2h30m duration', () => {
        const html = parse(loadSampleHtml());
        const { events } = parseFeaturedItemsFromHtml(html, NOW, PACIFIC);
        for (const e of events) {
            expect(e.duration.toMinutes()).toBe(150);
        }
    });

    it('drops past events relative to "now"', () => {
        const after = ZonedDateTime.of(LocalDateTime.of(2026, 9, 1, 0, 0), PACIFIC);
        const html = parse(loadSampleHtml());
        const { events } = parseFeaturedItemsFromHtml(html, after, PACIFIC);
        // All 2026 events are past after Sept 1, so the loop rolls them to 2027.
        expect(events).toHaveLength(5);
        for (const e of events) {
            expect(e.date.year()).toBe(2027);
            expect(e.date.isAfter(after)).toBe(true);
        }
    });

    it('ignores featured-items whose href does not point to movies-at-the-mural', () => {
        const html = parse(
            '<a class="featured-item" href="events/event-calendar/some-other-event">'
            + '<h3 class="featured-item__title"><p>Wonka | Jul 24</p></h3>'
            + '</a>'
            + '<a class="featured-item" href="events/event-calendar/movies-at-the-mural-wonka">'
            + '<h3 class="featured-item__title"><p>Wonka | Jul 24</p></h3>'
            + '</a>'
        );
        const { events } = parseFeaturedItemsFromHtml(html, NOW, PACIFIC);
        expect(events).toHaveLength(1);
    });
});
