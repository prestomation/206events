import { describe, expect, test } from 'vitest';
import ArtLoveSalonRipper, { extractJsonAfterMarker, extractNextFlightData } from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

describe('extractNextFlightData / extractJsonAfterMarker', () => {
    test('reassembles a JSON array split across multiple __next_f.push chunks', () => {
        const html = [
            '<script>self.__next_f.push([1,"5:{\\"a\\":[{\\"id\\":1,"])</script>',
            '<script>self.__next_f.push([1,"\\"name\\":\\"Foo\\"}]}"])</script>',
        ].join('\n');
        const full = extractNextFlightData(html);
        const arr = extractJsonAfterMarker(full, '"a":[', '[', ']');
        expect(arr).toBeDefined();
        expect(JSON.parse(arr!)).toEqual([{ id: 1, name: 'Foo' }]);
    });

    test('ignores brackets inside quoted strings when bracket-matching', () => {
        const html = '<script>self.__next_f.push([1,"5:{\\"a\\":[{\\"name\\":\\"[bracket] in title\\"}]}"])</script>';
        const full = extractNextFlightData(html);
        const arr = extractJsonAfterMarker(full, '"a":[', '[', ']');
        expect(JSON.parse(arr!)).toEqual([{ name: '[bracket] in title' }]);
    });

    test('returns undefined when the marker is not present', () => {
        const full = extractNextFlightData('<script>self.__next_f.push([1,"5:{}"])</script>');
        expect(extractJsonAfterMarker(full, '"initialEvents":[', '[', ']')).toBeUndefined();
    });
});

describe('ArtLoveSalonRipper - findCandidateEvents (live sample data)', () => {
    const ripper = new ArtLoveSalonRipper();
    const html = loadSample('sample-data.html');

    test('finds only single-day events for Art Love Salon / Conru Foundation', () => {
        const candidates = ripper.findCandidateEvents(html);
        expect(candidates.length).toBeGreaterThan(0);
        for (const c of candidates) {
            const org = c.org;
            const orgId = typeof org === 'object' && org ? org.id : undefined;
            expect([462, 1]).toContain(orgId);
            expect(c.start_date.slice(0, 10)).toBe(c.end_date.slice(0, 10));
        }
    });

    test('excludes other organizations on the citywide aggregator', () => {
        const candidates = ripper.findCandidateEvents(html);
        const names = candidates.map(c => c.name.trim());
        expect(names).not.toContain('Never Turn Back: Echoes of African American Music'); // MoPOP
    });

    test('excludes a multi-day container event', () => {
        const candidates = ripper.findCandidateEvents(html);
        expect(candidates.some(c => c.name.trim() === 'Art & Culture Week 2026')).toBe(false);
    });
});

describe('ArtLoveSalonRipper - parseEventDetail (live sample data)', () => {
    const ripper = new ArtLoveSalonRipper();
    const html = loadSample('sample-event-detail.html');

    test('parses the hours field into a start time and duration', () => {
        const result = ripper.parseEventDetail(html, 1328);
        expect(result).toHaveProperty('date');
        if ('date' in result) {
            expect(result.summary).toContain('Tai Chi');
            expect(result.date.hour()).toBe(12);
            expect(result.date.minute()).toBe(0);
            expect(result.duration.toMinutes()).toBe(60);
            expect(result.id).toBe('art-love-salon-1328');
            expect(result.location).toBe('Art Love Salon, 110 Union St, Seattle, WA 98121');
            expect(result.url).toBe('https://publicdisplay.art/event/1328');
        }
    });
});

describe('ArtLoveSalonRipper - parseEventDetail error handling', () => {
    const ripper = new ArtLoveSalonRipper();

    test('returns a ParseError (not null, not thrown) when no initialEvent data is found', () => {
        const result = ripper.parseEventDetail('<html><body>nothing here</body></html>', 999);
        expect(result).toHaveProperty('type', 'ParseError');
    });

    test('returns a ParseError when the hours field is missing or unparsable', () => {
        const html = '<script>self.__next_f.push([1,"5:{\\"initialEvent\\":{\\"id\\":42,\\"name\\":\\"No Hours Event\\",\\"start_date\\":\\"2026-10-01 00:00:00\\",\\"hours\\":\\"TBD\\"}}"])</script>';
        const result = ripper.parseEventDetail(html, 42);
        expect(result).toHaveProperty('type', 'ParseError');
    });
});

describe('ArtLoveSalonRipper - to24Hour', () => {
    const ripper = new ArtLoveSalonRipper();

    test('converts 12-hour clock strings to 24-hour', () => {
        expect(ripper.to24Hour('12', 'AM')).toBe(0);
        expect(ripper.to24Hour('12', 'PM')).toBe(12);
        expect(ripper.to24Hour('1', 'PM')).toBe(13);
        expect(ripper.to24Hour('11', 'AM')).toBe(11);
    });
});
