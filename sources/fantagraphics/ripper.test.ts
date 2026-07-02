import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FantagraphicsRipper, { parseTribeEvent, parseTribeCost, buildLocation } from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleData = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));

describe('FantagraphicsRipper', () => {
    const ripper = new FantagraphicsRipper();

    test('parses the Seattle "Hot Off the Press Book Fair" event correctly', () => {
        const events = ripper.parseEvents(sampleData.events);
        expect(events.length).toBe(1);

        const event = events[0] as RipperCalendarEvent;
        expect('date' in event).toBe(true);
        expect(event.summary).toBe('Seattle, WA: Hot Off the Press Book Fair at the Fantagraphics Bookstore & Gallery');
        expect(event.date.year()).toBe(2026);
        expect(event.date.monthValue()).toBe(7);
        expect(event.date.dayOfMonth()).toBe(11);
        expect(event.date.hour()).toBe(17);
        expect(event.date.minute()).toBe(0);
        expect(event.date.zone().id()).toBe('America/Los_Angeles');
        expect(event.duration.toHours()).toBe(4);
        expect(event.location).toContain('1201 S Vale St');
        expect(event.location).toContain('Seattle');
        expect(event.location).toContain('WA 98108');
        expect(event.url).toBe('https://blog.fantagraphics.com/events/seattle-wa-hot-off-the-press-book-fair-at-the-fantagraphics-bookstore-gallery-2/');
        expect(event.imageUrl).toContain('IMG_1475.jpeg');
        expect(event.description).not.toContain('<p>');
        expect(event.description).toContain('Hot Off the Press Book Fair');
        expect(event.cost).toBeUndefined(); // sample cost is an empty string
    });

    test('filters out non-Seattle-venue events (Portland, Los Angeles)', () => {
        // Sanity check the fixture actually contains non-Seattle venues,
        // otherwise this test would pass vacuously.
        const venueNames = sampleData.events.map((e: any) => e.venue?.venue);
        expect(venueNames).toContain('Floating World Comics');
        expect(venueNames).toContain('Secret Headquarters');

        const events = ripper.parseEvents(sampleData.events);
        const summaries = events
            .filter((e): e is RipperCalendarEvent => 'date' in e)
            .map(e => e.summary);

        expect(summaries.some(s => s.includes('Portland'))).toBe(false);
        expect(summaries.some(s => s.includes('Los Angeles'))).toBe(false);
        expect(summaries.some(s => s.includes('Seattle'))).toBe(true);
    });

    test('produces no parse errors on the sample data', () => {
        const events = ripper.parseEvents(sampleData.events);
        const errors = events.filter((e): e is RipperError => 'type' in e);
        expect(errors).toEqual([]);
    });

    test('handles a malformed/missing-date event with a ParseError, not null or a crash', () => {
        const malformed = [
            {
                id: 99999,
                title: 'Broken Event',
                slug: 'broken-event',
                url: 'https://blog.fantagraphics.com/events/broken-event/',
                // start_date intentionally omitted
                venue: { venue: 'Fantagraphics Bookstore and Gallery', address: '1201 S Vale St', city: 'Seattle', state: 'WA', zip: '98108' },
            },
        ];
        const result = parseTribeEvent(malformed[0] as any);
        expect(result).not.toBeNull();
        expect('type' in result).toBe(true);
        expect((result as RipperError).type).toBe('ParseError');

        // Also exercise it through the full filter+parse pipeline.
        const events = ripper.parseEvents(malformed as any);
        expect(events.length).toBe(1);
        expect('type' in events[0]).toBe(true);
    });

    test('handles an invalid timezone string with a ParseError, not a crash', () => {
        const malformed = {
            id: 88888,
            title: 'Bad Timezone Event',
            slug: 'bad-timezone-event',
            url: 'https://blog.fantagraphics.com/events/bad-timezone-event/',
            start_date: '2026-08-01 18:00:00',
            timezone: 'Not/A_Real_Zone',
            venue: { venue: 'Fantagraphics Bookstore and Gallery', address: '1201 S Vale St', city: 'Seattle', state: 'WA', zip: '98108' },
        };
        const result = parseTribeEvent(malformed as any);
        expect('type' in result).toBe(true);
        expect((result as RipperError).type).toBe('ParseError');
        expect((result as RipperError).reason).toContain('Invalid timezone');

        // Also exercise it through the full filter+parse pipeline — a bad
        // timezone on one event must not throw and abort the others.
        const events = ripper.parseEvents([malformed] as any);
        expect(events.length).toBe(1);
        expect('type' in events[0]).toBe(true);
    });

    test('produces stable, deterministic event ids across repeated parses', () => {
        const firstPass = ripper.parseEvents(sampleData.events)
            .filter((e): e is RipperCalendarEvent => 'date' in e)
            .map(e => e.id);
        const secondPass = ripper.parseEvents(sampleData.events)
            .filter((e): e is RipperCalendarEvent => 'date' in e)
            .map(e => e.id);

        expect(firstPass.length).toBeGreaterThan(0);
        expect(firstPass).toEqual(secondPass);
        expect(firstPass[0]).toBe('seattle-wa-hot-off-the-press-book-fair-at-the-fantagraphics-bookstore-gallery-2');
    });
});

describe('parseTribeCost', () => {
    test('returns undefined for an empty string', () => {
        expect(parseTribeCost('')).toBeUndefined();
        expect(parseTribeCost(undefined)).toBeUndefined();
    });

    test('parses "Free" as a $0 cost', () => {
        expect(parseTribeCost('Free')).toEqual({ min: 0 });
    });

    test('parses a flat dollar amount', () => {
        expect(parseTribeCost('$10')).toEqual({ min: 10 });
    });

    test('parses a dollar range', () => {
        expect(parseTribeCost('$10 - $20')).toEqual({ min: 10, max: 20 });
    });

    test('parses a dollar range using an en dash (WordPress wptexturize output)', () => {
        expect(parseTribeCost('$10.00 – $20.00')).toEqual({ min: 10, max: 20 });
    });

    test('parses a dollar range using an em dash', () => {
        expect(parseTribeCost('$10—$20')).toEqual({ min: 10, max: 20 });
    });
});

describe('buildLocation', () => {
    test('falls back to the default venue address when fields are missing', () => {
        expect(buildLocation(undefined)).toContain('1201 S Vale St');
        expect(buildLocation({ venue: 'Fantagraphics Bookstore and Gallery' })).toContain('1201 S Vale St');
    });

    test('builds a full address from a complete venue object', () => {
        const location = buildLocation({
            venue: 'Fantagraphics Bookstore and Gallery',
            address: '1201 S Vale St',
            city: 'Seattle',
            state: 'WA',
            zip: '98108',
        });
        expect(location).toBe('Fantagraphics Bookstore and Gallery, 1201 S Vale St, Seattle, WA 98108');
    });
});
