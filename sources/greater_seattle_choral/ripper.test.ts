import { describe, expect, test } from 'vitest';
import { extractCalendarData, parseEvents, parsePriceMin } from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

// Fixed "now" set before all sample events so nothing is filtered as past
const NOW_STR = '2026-06-30T00:00:00-07:00';
const NOW = ZonedDateTime.parse(NOW_STR);

describe('extractCalendarData', () => {
    test('extracts calendarData object from sample HTML', () => {
        const data = extractCalendarData(loadSample());
        expect(data).not.toBeNull();
        expect(Object.keys(data!).length).toBeGreaterThan(0);
    });

    test('returns null when calendarData is not present', () => {
        expect(extractCalendarData('<html>no calendar here</html>')).toBeNull();
    });

    test('parsed data has expected structure', () => {
        const data = extractCalendarData(loadSample());
        expect(data).not.toBeNull();
        const firstWeek = Object.values(data!)[0];
        const firstEvent = Object.values(firstWeek)[0];
        expect(firstEvent).toHaveProperty('eid');
        expect(firstEvent).toHaveProperty('name');
        expect(firstEvent).toHaveProperty('instances');
        expect(firstEvent).toHaveProperty('status');
    });
});

describe('parseEvents', () => {
    test('returns only Seattle events from sample data', () => {
        const html = loadSample();
        const results = parseEvents(html, NOW);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        expect(events.length).toBeGreaterThan(0);
        // All events should have location containing Seattle
        for (const evt of events) {
            expect(evt.location).toContain('Seattle');
        }
    });

    test('finds Seattle Center Classical event', () => {
        const html = loadSample();
        const results = parseEvents(html, NOW);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        const classical = events.find(e => e.summary.includes('Seattle Center Classical'));
        expect(classical).toBeDefined();
        expect(classical!.date.year()).toBe(2026);
        expect(classical!.date.monthValue()).toBe(7);
        expect(classical!.date.dayOfMonth()).toBe(5);
        expect(classical!.location).toContain('305 Harrison St');
        expect(classical!.location).toContain('Seattle');
    });

    test('event IDs are stable and unique', () => {
        const html = loadSample();
        const results = parseEvents(html, NOW);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        const ids = events.map(e => e.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);

        // IDs should follow gscc-{eid}-{date}-{time} pattern
        for (const id of ids) {
            expect(id).toMatch(/^gscc-\d+-\d{4}-\d{2}-\d{2}-\d{4}$/);
        }
    });

    test('excludes non-Seattle events', () => {
        const html = loadSample();
        const results = parseEvents(html, NOW);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        // Starbershop is in Shoreline, not Seattle — should be excluded
        const starbershop = events.find(e => e.summary.includes('Starbershop'));
        expect(starbershop).toBeUndefined();

        // Bellevue events should be excluded
        const bellevueEvt = events.find(e => e.location?.includes('Bellevue'));
        expect(bellevueEvt).toBeUndefined();
    });

    test('returns ParseError when calendarData is missing', () => {
        const results = parseEvents('<html>no calendar</html>', NOW);
        expect(results.length).toBe(1);
        const err = results[0] as RipperError;
        expect(err.type).toBe('ParseError');
        expect(err.reason).toContain('calendarData');
    });

    test('filters past events', () => {
        const html = loadSample();
        // Use a far-future "now" to filter everything
        const farFuture = ZonedDateTime.parse('2030-01-01T00:00:00-08:00');
        const results = parseEvents(html, farFuture);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);
        expect(events.length).toBe(0);
    });

    test('event has correct subtitle in summary when present', () => {
        const html = loadSample();
        const results = parseEvents(html, NOW);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        const classical = events.find(e => e.summary.includes('Seattle Center Classical'));
        expect(classical).toBeDefined();
        expect(classical!.summary).toContain('Seattle Sings Singalong at the Center');
    });

    test('event description includes org name', () => {
        const html = loadSample();
        const results = parseEvents(html, NOW);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        const classical = events.find(e => e.summary.includes('Seattle Center Classical'));
        expect(classical).toBeDefined();
        expect(classical!.description).toContain('Greater Seattle Choral Consortium');
    });

    test('excludes Audition-type events', () => {
        const html = loadSample();
        const results = parseEvents(html, NOW);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        // Auditions are appointment-based singer tryouts, not public events
        const audition = events.find(e => e.summary.toLowerCase().includes('audition'));
        expect(audition).toBeUndefined();
    });

    test('parsePriceMin handles all price formats', () => {
        expect(parsePriceMin(null)).toBeUndefined();
        expect(parsePriceMin('')).toBeUndefined();
        expect(parsePriceMin('.free')).toBe(0);
        expect(parsePriceMin('.freewill')).toBe(0);
        expect(parsePriceMin('$15')).toBe(15);
        expect(parsePriceMin('$12.50')).toBe(12.5);
        expect(parsePriceMin('Adults $25, Students $10')).toBe(25);
        expect(parsePriceMin('no price info')).toBeUndefined();
    });

    test('Buon Natale St Marks show is included (Seattle) but Lynnwood show is excluded', () => {
        const html = loadSample();
        const results = parseEvents(html, NOW);
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        const buonNatale = events.filter(e => e.summary.includes('Buon Natale'));
        // St. Mark's Cathedral (Seattle) should be included
        expect(buonNatale.some(e => e.location?.includes('St. Mark'))).toBe(true);
        // Trinity Lutheran (Lynnwood) should be excluded
        expect(buonNatale.some(e => e.location?.includes('Lynnwood'))).toBe(false);
    });
});
