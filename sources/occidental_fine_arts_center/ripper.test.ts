import { describe, expect, test } from 'vitest';
import OccidentalFineArtsCenterRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

describe('OccidentalFineArtsCenterRipper - findCandidateEvents (live sample data)', () => {
    const ripper = new OccidentalFineArtsCenterRipper();
    const html = loadSample('sample-data.html');

    test('finds only single-day events for Occidental Fine Arts Center', () => {
        const candidates = ripper.findCandidateEvents(html);
        expect(candidates.length).toBeGreaterThan(0);
        for (const c of candidates) {
            const org = c.org;
            const orgId = typeof org === 'object' && org ? org.id : undefined;
            expect(orgId).toBe(774);
            expect(c.start_date.slice(0, 10)).toBe(c.end_date.slice(0, 10));
        }
    });

    test('excludes other organizations on the citywide aggregator', () => {
        const candidates = ripper.findCandidateEvents(html);
        const names = candidates.map(c => c.name.trim());
        expect(names).not.toContain('Never Turn Back: Echoes of African American Music'); // different org
    });

    test('excludes a multi-day container event', () => {
        const candidates = ripper.findCandidateEvents(html);
        expect(candidates.some(c => c.name.trim() === 'Never Turn Back: Echoes of African American Music')).toBe(false);
    });
});

describe('OccidentalFineArtsCenterRipper - parseEventDetail (live sample data)', () => {
    const ripper = new OccidentalFineArtsCenterRipper();
    const html = loadSample('sample-event-detail.html');

    test('parses the hours field into a start time and duration', () => {
        const result = ripper.parseEventDetail(html, 3851);
        expect(result).toHaveProperty('date');
        if ('date' in result) {
            expect(result.summary).toContain('Live Music Lunch Hour');
            expect(result.date.hour()).toBe(12);
            expect(result.date.minute()).toBe(0);
            expect(result.duration.toMinutes()).toBe(120);
            expect(result.id).toBe('occidental-fine-arts-center-3851');
            expect(result.location).toBe('Occidental Fine Arts Center, 311 1/2 Occidental Ave South, Seattle, WA 98104');
            expect(result.url).toBe('https://publicdisplay.art/event/3851');
            expect(result.imageUrl).toBe('https://artlove.org/art/photos/events/3851_big_0e9cb7d54f30eace.jpg');
        }
    });
});

describe('OccidentalFineArtsCenterRipper - parseEventDetail error handling', () => {
    const ripper = new OccidentalFineArtsCenterRipper();

    test('returns a ParseError (not null, not thrown) when no initialEvent data is found', () => {
        const result = ripper.parseEventDetail('<html><body>nothing here</body></html>', 999);
        expect(result).toHaveProperty('type', 'ParseError');
    });

    test('returns a ParseError when the hours field is missing or unparsable', () => {
        const html = '<script>self.__next_f.push([1,"5:{\\"initialEvent\\":{\\"id\\":42,\\"name\\":\\"No Hours Event\\",\\"start_date\\":\\"2026-10-01 00:00:00\\",\\"hours\\":\\"TBD\\"}}"])</script>';
        const result = ripper.parseEventDetail(html, 42);
        expect(result).toHaveProperty('type', 'ParseError');
    });

    test('returns a distinct ParseError (not "Could not parse hours \\"null\\"") when hours is JSON null', () => {
        const html = '<script>self.__next_f.push([1,"5:{\\"initialEvent\\":{\\"id\\":43,\\"name\\":\\"No Hours Published\\",\\"start_date\\":\\"2026-10-01 00:00:00\\",\\"hours\\":null}}"])</script>';
        const result = ripper.parseEventDetail(html, 43);
        expect(result).toHaveProperty('type', 'ParseError');
        if ('type' in result) {
            expect(result.reason).toContain('No hours published');
            expect(result.reason).not.toContain('"null"');
        }
    });

    test('returns a ParseError (not a thrown TypeError) when the name field is missing or null', () => {
        const html = '<script>self.__next_f.push([1,"5:{\\"initialEvent\\":{\\"id\\":44,\\"name\\":null,\\"start_date\\":\\"2026-10-01 00:00:00\\",\\"hours\\":\\"4:00 PM - 5:00 PM\\"}}"])</script>';
        expect(() => ripper.parseEventDetail(html, 44)).not.toThrow();
        const result = ripper.parseEventDetail(html, 44);
        expect(result).toHaveProperty('type', 'ParseError');
    });
});

describe('OccidentalFineArtsCenterRipper - parseEventDetail duration edge cases', () => {
    const ripper = new OccidentalFineArtsCenterRipper();

    function eventHtml(hours: string): string {
        const escaped = hours.replace(/"/g, '\\"');
        return `<script>self.__next_f.push([1,"5:{\\"initialEvent\\":{\\"id\\":7,\\"name\\":\\"Edge Case Event\\",\\"start_date\\":\\"2026-10-01 00:00:00\\",\\"hours\\":\\"${escaped}\\"}}"])</script>`;
    }

    test('a range spanning midnight wraps through end of day rather than going negative', () => {
        // The real Occidental event 3698 has hours "5:00 PM - 8:00 AM".
        const result = ripper.parseEventDetail(eventHtml('5:00 PM - 8:00 AM'), 7);
        if ('duration' in result) expect(result.duration.toMinutes()).toBe(15 * 60);
        else throw new Error('expected an event, got ' + JSON.stringify(result));
    });

    test('an identical start/end time falls back to the default duration instead of becoming a 24-hour event', () => {
        const result = ripper.parseEventDetail(eventHtml('12:00 PM - 12:00 PM'), 7);
        if ('duration' in result) {
            expect(result.duration.toMinutes()).toBe(120);
            expect(result.duration.toMinutes()).not.toBe(24 * 60);
        } else {
            throw new Error('expected an event, got ' + JSON.stringify(result));
        }
    });
});
