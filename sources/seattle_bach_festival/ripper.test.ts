import { describe, expect, test } from 'vitest';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractOccurrences, parseEventsPage, parseOccurrenceDate } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
const zone = ZoneId.of('America/Los_Angeles');
const now = ZonedDateTime.of(LocalDateTime.of(2026, 9, 23, 12, 0), zone);

describe('Seattle Bach Festival ripper', () => {
    test('parses occurrence dates, with and without an end time', () => {
        const a = parseOccurrenceDate('7:30PM, Friday, October 23, 2026');
        expect(a?.start.toString()).toBe('2026-10-23T19:30');
        expect(a?.end).toBeUndefined();
        const b = parseOccurrenceDate('10:00AM, Saturday, October 3, 2026 - 4:00PM');
        expect(b?.start.toString()).toBe('2026-10-03T10:00');
        expect(b?.end?.toString()).toBe('2026-10-03T16:00');
        expect(parseOccurrenceDate('TBA')).toBeNull();
    });

    test('extracts every occurrence on the page', () => {
        const occ = extractOccurrences(html);
        expect(occ.length).toBe(20);
        expect(occ.every(o => o.title && o.dateText)).toBe(true);
    });

    test('keeps only Seattle occurrences and reports no errors', () => {
        const { events, errors } = parseEventsPage(html, zone, now);
        expect(errors).toHaveLength(0);
        expect(events.length).toBe(11);
        expect(events.every(e => /Seattle/.test(e.location ?? ''))).toBe(true);
        expect(new Set(events.map(e => e.id)).size).toBe(events.length);
    });

    test('maps a Seattle B Minor Mass performance', () => {
        const { events } = parseEventsPage(html, zone, now);
        const e = events.find(ev => ev.summary === "Bach's B Minor Mass");
        expect(e).toBeDefined();
        expect(e!.date.toLocalDateTime().toString()).toBe('2026-10-24T19:30');
        expect(e!.location).toBe('First Baptist Church Seattle, 1111 Harvard Ave, Seattle, WA 98122');
        expect(e!.url).toBe('https://seattlebachfestival.org/event/b-minor-mass/');
        expect(e!.cost).toEqual({ paid: true });
        expect(e!.duration.toHours()).toBe(2);
    });

    test('free Cantata Trail sessions are marked free', () => {
        const { events } = parseEventsPage(html, zone, now);
        const e = events.find(ev => ev.summary.startsWith('The Cantata Trail') && ev.date.monthValue() === 10);
        expect(e?.cost).toEqual({ min: 0 });
        expect(e?.location).toContain('110 Union St');
    });

    test('uses the listed end time for duration', () => {
        const { events } = parseEventsPage(html, zone, now);
        const e = events.find(ev => ev.summary === 'Day of Historical Keyboards');
        expect(e?.duration.toHours()).toBe(6);
        expect(e?.location).toContain('Seattle, WA 98195');
    });

    test('skips past occurrences', () => {
        const later = ZonedDateTime.of(LocalDateTime.of(2027, 1, 1, 0, 0), zone);
        const { events } = parseEventsPage(html, zone, later);
        expect(events.every(e => e.date.year() === 2027)).toBe(true);
    });
});
