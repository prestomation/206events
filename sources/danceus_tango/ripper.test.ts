import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import DanceUSTangoRipper from './ripper.js';
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

describe('DanceUSTangoRipper.parsePageHtml', () => {
    const ripper = new DanceUSTangoRipper();
    const results = ripper.parsePageHtml(loadSampleHtml());
    const events = results.filter(isEvent);
    const errors = results.filter(isError);

    it('parses every Seattle event on the sample page', () => {
        // The fixture has 25 JSON-LD events, all Seattle-locality.
        expect(events.length).toBe(25);
    });

    it('produces no ParseErrors', () => {
        const parseErrors = errors.filter(e => e.type === 'ParseError');
        expect(parseErrors).toEqual([]);
    });

    it('parses a normal event with a real start time', () => {
        const event = events.find(e => e.summary === "Absolute Beginner's Argentine Tango Series");
        expect(event).toBeDefined();
        expect(event!.date.hour()).toBe(18);
        expect(event!.date.minute()).toBe(30);
        expect(event!.date.year()).toBe(2026);
        expect(event!.date.monthValue()).toBe(9);
        expect(event!.date.dayOfMonth()).toBe(2);
        expect(event!.location).toBe('Salsa Con Todo, Seattle, WA');
        expect(event!.lat).toBeCloseTo(47.652397, 5);
        expect(event!.lng).toBeCloseTo(-122.356139, 5);
        expect(event!.url).toBe('https://www.danceus.org/event/1771616149751684/absolute-beginners-argentine-tango-series-seattle-wa/');
    });

    it('parses a price into cost.min', () => {
        const event = events.find(e => e.summary === "Absolute Beginner's Argentine Tango Series");
        expect(event).toBeDefined();
        expect(event!.cost).toEqual({ min: 130 });
    });

    it('leaves cost undefined when no price is shown', () => {
        const event = events.find(e => e.summary === 'Argentine Tango for Absolute Beginners');
        expect(event).toBeDefined();
        expect(event!.cost).toBeUndefined();
    });

    it('gives every event a stable, unique id derived from the source url', () => {
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);

        const event = events.find(e => e.summary === "Absolute Beginner's Argentine Tango Series");
        expect(event!.id).toBe('danceus-tango-1771616149751684-2026-09-02');
    });

    it('flags an event with no listed start time as uncertain', () => {
        const html = `
            <script type="application/ld+json">
              [{"@type":"Event","name":"No-Time Practica","url":"https://www.danceus.org/event/999/no-time-practica-seattle-wa/","startDate":"2026-09-10","location":{"name":"Corner Store Studio","address":{"addressLocality":"Seattle"}}}]
            </script>
            <div class="search-event-card">
              <a class="search-event-card-title" href="/event/999/no-time-practica-seattle-wa/"><span>title</span></a>
            </div>
        `;
        const result = ripper.parsePageHtml(html);
        const event = result.filter(isEvent).find(e => e.summary === 'No-Time Practica');
        expect(event).toBeDefined();
        // Placeholder noon start, not the source's literal midnight sentinel.
        expect(event!.date.hour()).toBe(12);
        expect(event!.date.minute()).toBe(0);

        const uncertainty = result.filter(isError).find(
            (e): e is Extract<RipperError, { type: 'Uncertainty' }> =>
                e.type === 'Uncertainty' && e.event.id === event!.id,
        );
        expect(uncertainty).toBeDefined();
        expect(uncertainty!.unknownFields).toContain('startTime');
    });

    it('ignores an unrelated JSON-LD block (e.g. breadcrumbs) and finds the Event array', () => {
        const html = `
            <script type="application/ld+json">{"@context":"http://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
            ${loadSampleHtml().match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)![0]}
        `;
        const result = ripper.parsePageHtml(html);
        const parsedEvents = result.filter(isEvent);
        expect(parsedEvents.length).toBeGreaterThan(0);
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
