import { describe, expect, test } from 'vitest';
import CardfestNWRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('CardfestNWRipper - parseJsonLdEvents', () => {
    const ripper = new CardfestNWRipper();

    test('extracts all Event nodes from the JSON-LD @graph', () => {
        const html = loadSampleData();
        const nodes = ripper.parseJsonLdEvents(html);
        expect(nodes.length).toBeGreaterThan(0);
        for (const node of nodes) {
            expect(node['@type']).toBe('Event');
        }
    });

    test('parses the first Everett event correctly', () => {
        const html = loadSampleData();
        const nodes = ripper.parseJsonLdEvents(html);
        const everett = nodes.find(n => n.name?.includes('Everett') && n.startDate === '2026-07-18');
        expect(everett).toBeDefined();
        expect(everett?.url).toBe('https://www.ontreasure.com/events/cardfest-northwest-everett-july-18-2026-07182026/tickets');
        expect(everett?.location?.name).toBe('Edward D. Hansen Conference Center');
        expect(everett?.location?.address?.streetAddress).toBe('2000 Hewitt Ave');
    });

    test('ignores non-Event nodes (e.g. Organization)', () => {
        const html = loadSampleData();
        const nodes = ripper.parseJsonLdEvents(html);
        expect(nodes.every(n => n['@type'] === 'Event')).toBe(true);
    });

    test('returns an empty array when no ld+json script is present', () => {
        const nodes = ripper.parseJsonLdEvents('<html><body>no structured data here</body></html>');
        expect(nodes).toHaveLength(0);
    });
});

describe('CardfestNWRipper - parseEventNode', () => {
    const ripper = new CardfestNWRipper();

    test('parses a full Event node with location correctly', () => {
        const node = {
            '@type': 'Event',
            name: 'Cardfest NW — Everett Collectibles Show',
            startDate: '2026-07-18',
            url: 'https://www.ontreasure.com/events/cardfest-northwest-everett-july-18-2026-07182026/tickets',
            image: 'https://framerusercontent.com/images/4H8ASD0dnmOJrclzfFWlXROtyY.png',
            location: {
                '@type': 'Place',
                name: 'Edward D. Hansen Conference Center',
                address: {
                    '@type': 'PostalAddress',
                    streetAddress: '2000 Hewitt Ave',
                    addressLocality: 'Everett',
                    addressRegion: 'WA',
                    postalCode: '98201',
                    addressCountry: 'US',
                },
            },
        };

        const result = ripper.parseEventNode(node);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;

        expect(result.id).toBe('cardfestnw-cardfest-nw-everett-collectibles-show-2026-07-18');
        expect(result.summary).toBe('Cardfest NW — Everett Collectibles Show');
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(7);
        expect(result.date.dayOfMonth()).toBe(18);
        expect(result.date.hour()).toBe(10); // Default start hour, no time on site
        expect(result.duration.toHours()).toBe(6);
        expect(result.location).toBe('Edward D. Hansen Conference Center, 2000 Hewitt Ave, Everett, WA, 98201');
        expect(result.url).toBe('https://www.ontreasure.com/events/cardfest-northwest-everett-july-18-2026-07182026/tickets');
        expect(result.imageUrl).toBe('https://framerusercontent.com/images/4H8ASD0dnmOJrclzfFWlXROtyY.png');
        expect(result.cost).toEqual({ paid: true });
    });

    test('handles a relative venue-landing-page url (not a per-event ticket link)', () => {
        const node = {
            '@type': 'Event',
            name: 'Cardfest NW — Lynnwood Collectibles Show',
            startDate: '2026-08-01',
            url: 'https://cardfestnw.com/lynwood',
            location: {
                '@type': 'Place',
                name: 'Lynnwood Event Center',
                address: {
                    '@type': 'PostalAddress',
                    streetAddress: '3711 196th St SW',
                    addressLocality: 'Lynnwood',
                    addressRegion: 'WA',
                    postalCode: '98036',
                    addressCountry: 'US',
                },
            },
        };

        const result = ripper.parseEventNode(node);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.url).toBe('https://cardfestnw.com/lynwood');
        expect(result.date.dayOfMonth()).toBe(1);
        expect(result.date.monthValue()).toBe(8);
    });

    test('produces distinct stable ids for the same title on different dates', () => {
        const base = {
            '@type': 'Event',
            name: 'Cardfest NW — Bellevue Collectibles Show',
            url: 'https://cardfestnw.com/bellevue',
        };
        const first = ripper.parseEventNode({ ...base, startDate: '2026-08-08' });
        const second = ripper.parseEventNode({ ...base, startDate: '2026-08-09' });
        expect('date' in first).toBe(true);
        expect('date' in second).toBe(true);
        if (!('date' in first) || !('date' in second)) return;
        expect(first.id).not.toBe(second.id);
        expect(first.id).toBe('cardfestnw-cardfest-nw-bellevue-collectibles-show-2026-08-08');
        expect(second.id).toBe('cardfestnw-cardfest-nw-bellevue-collectibles-show-2026-08-09');
    });

    test('returns ParseError when name is missing', () => {
        const result = ripper.parseEventNode({ '@type': 'Event', startDate: '2026-08-08' });
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    test('returns ParseError when startDate is missing', () => {
        const result = ripper.parseEventNode({ '@type': 'Event', name: 'Some Show' });
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    test('returns ParseError for an unparseable startDate', () => {
        const result = ripper.parseEventNode({ '@type': 'Event', name: 'Some Show', startDate: 'not-a-date' });
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    test('omits location when the node has none', () => {
        const result = ripper.parseEventNode({
            '@type': 'Event',
            name: 'Some Show',
            startDate: '2026-09-01',
        });
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.location).toBeUndefined();
    });
});
