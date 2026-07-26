import { describe, expect, test } from 'vitest';
import CardfestNWRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('CardfestNWRipper - extractJsonLdEvents', () => {
    const ripper = new CardfestNWRipper();

    test('extracts only Event nodes from the @graph, skipping Organization', () => {
        const html = loadSampleData();
        const events = ripper.extractJsonLdEvents(html);
        expect(events).toHaveLength(3);
        expect(events.every(e => e['@type'] === 'Event')).toBe(true);
    });

    test('returns empty array when no JSON-LD is present', () => {
        expect(ripper.extractJsonLdEvents('<html><body>no events here</body></html>')).toEqual([]);
    });

    test('skips malformed JSON-LD blocks without throwing', () => {
        const html = '<script type="application/ld+json">{not valid json</script>';
        expect(ripper.extractJsonLdEvents(html)).toEqual([]);
    });
});

describe('CardfestNWRipper - parseEvent', () => {
    const ripper = new CardfestNWRipper();

    test('parses the Everett event with a full street address', () => {
        const html = loadSampleData();
        const [everett] = ripper.extractJsonLdEvents(html);
        const result = ripper.parseEvent(everett);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.id).toBe('cardfestnw-cardfest-nw-everett-collectibles-show-2026-07-18');
        expect(result.summary).toBe('Cardfest NW — Everett Collectibles Show');
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(7);
        expect(result.date.dayOfMonth()).toBe(18);
        expect(result.date.hour()).toBe(10); // placeholder time — source publishes no time
        expect(result.duration.toHours()).toBe(4);
        expect(result.location).toBe('Edward D. Hansen Conference Center, 2000 Hewitt Ave, Everett, WA');
        expect(result.url).toBe('https://www.ontreasure.com/events/cardfest-northwest-everett-july-18-2026-07182026/tickets');
        expect(result.imageUrl).toBe('https://framerusercontent.com/images/4H8ASD0dnmOJrclzfFWlXROtyY.png');
        expect(result.cost).toEqual({ paid: true });
    });

    test('parses the Lynnwood event which has no image field', () => {
        const html = loadSampleData();
        const events = ripper.extractJsonLdEvents(html);
        const lynnwood = events.find(e => e.name?.includes('Lynnwood'))!;
        const result = ripper.parseEvent(lynnwood);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.imageUrl).toBeUndefined();
        expect(result.location).toBe('Lynnwood Convention Center, 3711 196th St SW, Lynnwood, WA');
    });

    test('returns ParseError when name is missing', () => {
        const result = ripper.parseEvent({ '@type': 'Event', startDate: '2026-07-18' });
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    test('returns ParseError when startDate is missing', () => {
        const result = ripper.parseEvent({ '@type': 'Event', name: 'Some Show' });
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    test('returns ParseError for an unparseable startDate', () => {
        const result = ripper.parseEvent({ '@type': 'Event', name: 'Some Show', startDate: 'not-a-date' });
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    test('falls back gracefully when location is entirely absent', () => {
        const result = ripper.parseEvent({ '@type': 'Event', name: 'Mystery Show', startDate: '2026-09-01' });
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.location).toBeUndefined();
    });
});
