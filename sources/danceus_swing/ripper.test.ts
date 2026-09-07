import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import DanceUSSwingRipper from './ripper.js';
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

describe('DanceUSSwingRipper.parsePageHtml', () => {
    const ripper = new DanceUSSwingRipper();
    const results = ripper.parsePageHtml(loadSampleHtml());
    const events = results.filter(isEvent);
    const errors = results.filter(isError);

    it('parses every Seattle event on the sample page', () => {
        // The fixture has 47 JSON-LD events; 2 are outside Seattle (Kirkland,
        // Mercer Island) and are filtered out.
        expect(events.length).toBe(45);
    });

    it('produces no ParseErrors', () => {
        const parseErrors = errors.filter(e => e.type === 'ParseError');
        expect(parseErrors).toEqual([]);
    });

    it('excludes non-Seattle venues (Kirkland, Mercer Island)', () => {
        const names = events.map(e => e.summary);
        expect(names).not.toContain(expect.stringMatching(/Kirkland Dance Center/));
        for (const e of events) {
            expect(e.location).not.toMatch(/Kirkland Dance Center/);
        }
    });

    it('parses a normal event with a real start time', () => {
        const event = events.find(e => e.summary === 'Lindy Hop Level 1');
        expect(event).toBeDefined();
        expect(event!.date.hour()).toBe(18);
        expect(event!.date.minute()).toBe(30);
        expect(event!.date.year()).toBe(2026);
        expect(event!.date.monthValue()).toBe(9);
        expect(event!.date.dayOfMonth()).toBe(1);
        expect(event!.location).toBe('Salsa con Todo / Swing Dance SCT, Seattle, WA');
        expect(event!.lat).toBeCloseTo(47.603243, 5);
        expect(event!.lng).toBeCloseTo(-122.330286, 5);
        expect(event!.url).toBe('https://www.danceus.org/event/1788244188752938/lindy-hop-level-seattle-wa/');
        expect(event!.imageUrl).toContain('danceus.org');
    });

    it('flags an event with no listed start time as uncertain', () => {
        const event = events.find(e => e.summary === 'Lindy 1 - TUE 8/25-9/29');
        expect(event).toBeDefined();
        // Placeholder noon start, not the source's literal midnight sentinel.
        expect(event!.date.hour()).toBe(12);
        expect(event!.date.minute()).toBe(0);

        const uncertainty = errors.find(
            (e): e is Extract<RipperError, { type: 'Uncertainty' }> =>
                e.type === 'Uncertainty' && e.event.id === event!.id,
        );
        expect(uncertainty).toBeDefined();
        expect(uncertainty!.unknownFields).toContain('startTime');
    });

    it('parses a price into cost.min', () => {
        const event = events.find(e => e.summary === 'Lindy Hop/Swing 4-Week Series Class');
        expect(event).toBeDefined();
        expect(event!.cost).toEqual({ min: 108 });
    });

    it('leaves cost undefined when no price is shown', () => {
        const event = events.find(e => e.summary === 'Swing Saturdays @ Salsa Con Todo');
        expect(event).toBeDefined();
        expect(event!.cost).toBeUndefined();
    });

    it('gives every event a stable, unique id derived from the source url', () => {
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);

        const event = events.find(e => e.summary === 'Lindy Hop Level 1');
        expect(event!.id).toBe('danceus-1788244188752938-2026-09-01');
    });

    it('ignores an unrelated JSON-LD block (e.g. breadcrumbs) and finds the Event array', () => {
        const html = `
            <script type="application/ld+json">{"@context":"http://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
            ${loadSampleHtml().match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)![0]}
        `;
        const result = ripper.parsePageHtml(html);
        const parsedEvents = result.filter(isEvent);
        // The doc passed here has no visible event cards, so every event
        // falls back to the unknown-time placeholder — just confirm the
        // Event JSON-LD block was found and parsed, not the breadcrumb one.
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
