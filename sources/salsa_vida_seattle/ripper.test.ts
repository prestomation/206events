import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import SalsaVidaSeattleRipper from './ripper.js';
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

describe('SalsaVidaSeattleRipper.parsePageHtml', () => {
    const ripper = new SalsaVidaSeattleRipper();
    const results = ripper.parsePageHtml(loadSampleHtml());
    const events = results.filter(isEvent);
    const errors = results.filter(isError);

    it('parses every Seattle event on the sample page', () => {
        // The fixture's JSON-LD ItemList has 20 events; 6 are outside Seattle
        // (Shoreline x2, Kent x2, Kirkland x2) and are filtered out.
        expect(events.length).toBe(14);
    });

    it('produces no ParseErrors', () => {
        const parseErrors = errors.filter(e => e.type === 'ParseError');
        expect(parseErrors).toEqual([]);
    });

    it('excludes non-Seattle venues (Shoreline, Kent, Kirkland)', () => {
        for (const e of events) {
            expect(e.location).not.toMatch(/Shoreline|Kent, WA|Kirkland/);
        }
    });

    it('parses a normal event with a real start time, location, and cost', () => {
        const event = events.find(e => e.summary === 'Friday Night Social Dance at Salsa Con Todo');
        expect(event).toBeDefined();
        expect(event!.date.hour()).toBe(22);
        expect(event!.date.minute()).toBe(10);
        expect(event!.date.year()).toBe(2026);
        expect(event!.date.monthValue()).toBe(9);
        expect(event!.date.dayOfMonth()).toBe(4);
        expect(event!.location).toBe('Salsa Con Todo, 211 N 36th St, Seattle, WA 98103, USA');
        expect(event!.lat).toBeCloseTo(47.6523547, 5);
        expect(event!.lng).toBeCloseTo(-122.3561776, 5);
        expect(event!.url).toBe('https://www.salsavida.com/event/washington/seattle/friday-night-social-dance-at-salsa-con-todo/');
        expect(event!.cost).toEqual({ min: 15 });
    });

    it('computes duration from startDate/endDate when both are present', () => {
        const event = events.find(e => e.summary === 'Friday Night Social Dance at Salsa Con Todo');
        expect(event).toBeDefined();
        // 2026-09-04T22:10 -> 2026-09-05T01:00, a 2h50m window.
        expect(event!.duration.toMinutes()).toBe(170);
    });

    it('falls back to a default duration when endDate is missing', () => {
        const event = events.find(e => e.summary === 'Sueños de Salsa Wednesday Social');
        expect(event).toBeDefined();
        expect(event!.duration.toHours()).toBe(2);
    });

    it('treats offers.price of "0" as free', () => {
        const event = events.find(e => e.summary === 'PARKCHATA at Waterfront Park');
        expect(event).toBeDefined();
        expect(event!.cost).toEqual({ min: 0 });
    });

    it('gives every event a stable, unique id derived from the source url and date', () => {
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);

        const event = events.find(e => e.summary === 'Sueños de Salsa Wednesday Social' && e.date.dayOfMonth() === 2);
        expect(event!.id).toBe('salsa-vida-suenos-de-salsa-wednesday-social-2026-09-02');
    });

    it('gives the same recurring listing distinct ids on different occurrence dates', () => {
        const occurrences = events.filter(e => e.summary === 'Sueños de Salsa Wednesday Social');
        expect(occurrences.length).toBe(2);
        expect(occurrences[0].id).not.toBe(occurrences[1].id);
    });

    it('decodes HTML entities in the summary', () => {
        const event = events.find(e => e.summary.startsWith('Saturday Salsa'));
        expect(event).toBeDefined();
        expect(event!.summary).toBe('Saturday Salsa & Bachata Socials at Reverie Ballroom');
    });

    it('ignores an unrelated JSON-LD block (e.g. breadcrumbs) and finds the ItemList of events', () => {
        const html = `
            <script type="application/ld+json">{"@context":"http://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"item":"https://example.com/"}]}</script>
            ${loadSampleHtml().match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)![0]}
        `;
        const result = ripper.parsePageHtml(html);
        const parsedEvents = result.filter(isEvent);
        expect(parsedEvents.length).toBe(14);
    });

    it('returns a ParseError when JSON-LD is missing', () => {
        const result = ripper.parsePageHtml('<html><body>no data here</body></html>');
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ type: 'ParseError' });
    });

    it('returns a ParseError when JSON-LD is malformed', () => {
        const html = '<script type="application/ld+json">{not valid json</script>';
        const result = ripper.parsePageHtml(html);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ type: 'ParseError' });
    });
});
