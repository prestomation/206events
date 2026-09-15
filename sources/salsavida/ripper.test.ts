import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import SalsaVidaRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');
}

function isEvent(e: { date?: unknown } | { type?: unknown }): e is RipperCalendarEvent {
    return 'date' in e;
}

function isError(e: { date?: unknown } | { type?: unknown }): e is RipperError {
    return 'type' in e;
}

describe('SalsaVidaRipper.parsePageHtml', () => {
    const ripper = new SalsaVidaRipper();
    const results = ripper.parsePageHtml(loadSampleHtml());
    const events = results.filter(isEvent);
    const errors = results.filter(isError);

    it('parses every Seattle event on the sample page', () => {
        // The fixture's ItemList has 20 occurrences; 6 are outside Seattle
        // proper (Kirkland, Kent, Shoreline) and are filtered out.
        expect(events.length).toBe(14);
    });

    it('produces no ParseErrors', () => {
        const parseErrors = errors.filter(e => e.type === 'ParseError');
        expect(parseErrors).toEqual([]);
    });

    it('excludes non-Seattle venues (Kirkland, Kent, Shoreline)', () => {
        for (const e of events) {
            expect(e.location).not.toMatch(/Kirkland|Kent, WA|Shoreline/);
        }
    });

    it('parses a normal event with full structured data', () => {
        const event = events.find(e => e.summary === 'Monday Salsa Practica at Reverie Ballroom' && e.date.dayOfMonth() === 21);
        expect(event).toBeDefined();
        expect(event!.date.hour()).toBe(21);
        expect(event!.date.minute()).toBe(0);
        expect(event!.date.year()).toBe(2026);
        expect(event!.date.monthValue()).toBe(9);
        expect(event!.location).toBe('Reverie Ballroom, 915 E Pine St, Seattle, WA 98122, USA');
        expect(event!.lat).toBeCloseTo(47.6150751, 5);
        expect(event!.lng).toBeCloseTo(-122.319791, 5);
        expect(event!.url).toBe('https://www.salsavida.com/event/washington/seattle/monday-salsa-practica-at-reverie-ballroom/');
        expect(event!.imageUrl).toContain('salsavida.com');
        expect(event!.cost).toEqual({ min: 10 });
        expect(event!.duration.toMinutes()).toBe(120);
    });

    it('gives distinct ids to the same recurring event on different dates', () => {
        const sundials = events.filter(e => e.summary === 'Monday Salsa Practica at Reverie Ballroom');
        expect(sundials.length).toBe(2);
        expect(sundials[0].id).not.toBe(sundials[1].id);
    });

    it('decodes HTML entities in the summary', () => {
        const event = events.find(e => e.summary.includes('Salsa & Bachata Socials'));
        expect(event).toBeDefined();
    });
});
