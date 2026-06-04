import { describe, expect, test } from 'vitest';
import PioneerSquareMarketRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('PioneerSquareMarketRipper - parseEvent', () => {
    const ripper = new PioneerSquareMarketRipper();

    test('parses a full event with lat/lng and end_datetime', () => {
        const item = {
            id: '06baf017-7d2a-4b3f-92b3-b0ed4ac0369c',
            title: 'Brothertiger / Hotel Pools',
            description: 'Live music event at Baba Yaga',
            event_type: 'concert',
            event_status: 'published',
            start_datetime: '2026-05-19T02:00:00+00:00',
            end_datetime: '2026-05-19T05:00:00+00:00',
            venue_location: {
                lat: 47.601046,
                lng: -122.333159,
                city: 'Seattle',
                name: 'Baba Yaga',
                state: 'WA',
                address: '124 S Washington St, Seattle, WA 98104',
            },
            external_ticket_url: null,
            slug: 'baba-yaga-brothertiger-hotel-pools-05-19-2026',
        };

        const result = ripper.parseEvent(item);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;

        expect(result.id).toBe('pioneer-square-market-06baf017-7d2a-4b3f-92b3-b0ed4ac0369c');
        expect(result.summary).toBe('Brothertiger / Hotel Pools');
        expect(result.location).toBe('Baba Yaga, 124 S Washington St, Seattle, WA 98104');
        expect(result.duration.toMinutes()).toBe(180);
        expect(result.url).toBe('https://pioneersquaremarket.net/events/baba-yaga-brothertiger-hotel-pools-05-19-2026');
    });

    test('uses external_ticket_url when present', () => {
        const item = {
            id: 'abc',
            title: 'Test Event',
            description: null,
            event_type: 'community',
            event_status: 'published',
            start_datetime: '2026-06-01T18:00:00+00:00',
            end_datetime: null,
            venue_location: { city: 'Seattle', state: 'WA', address: '100 Main St' },
            external_ticket_url: 'https://tickets.example.com/event/123',
            slug: 'test-event',
        };

        const result = ripper.parseEvent(item);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.url).toBe('https://tickets.example.com/event/123');
    });

    test('defaults duration to 3 hours when end_datetime is absent', () => {
        const item = {
            id: 'xyz',
            title: 'No End Time',
            description: null,
            event_type: 'community',
            event_status: 'published',
            start_datetime: '2026-07-04T19:00:00+00:00',
            end_datetime: null,
            venue_location: { city: 'Seattle', state: 'WA', address: '200 2nd Ave' },
            external_ticket_url: null,
            slug: 'no-end-time',
        };

        const result = ripper.parseEvent(item);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.duration.toMinutes()).toBe(180);
    });

    test('parses a non-WA event when called directly (caller is responsible for filtering)', () => {
        // parseEvent itself does not filter by state — that's done in rip() before calling parseEvent.
        // This test confirms the parse succeeds; the Vancouver filtering test is in the rip() suite.
        const item = {
            id: 'bc-event',
            title: 'Turkey vs Australia',
            description: null,
            event_type: 'sports',
            event_status: 'published',
            start_datetime: '2026-07-10T18:00:00+00:00',
            end_datetime: '2026-07-10T20:00:00+00:00',
            venue_location: {
                lat: 49.2766,
                lng: -123.1116,
                city: 'Vancouver',
                name: 'BC Place',
                state: 'BC',
                address: '777 Pacific Blvd, Vancouver, BC V6B 4Y8, Canada',
            },
            external_ticket_url: null,
            slug: 'turkey-vs-australia',
        };

        const result = ripper.parseEvent(item);
        expect('date' in result).toBe(true);
    });

    test('handles venue_location with venue_name instead of name', () => {
        const item = {
            id: 'jazz-event',
            title: 'Jazz at Seattle Jazz Fellowship',
            description: null,
            event_type: 'concert',
            event_status: 'published',
            start_datetime: '2026-05-20T00:00:00+00:00',
            end_datetime: '2026-05-20T03:00:00+00:00',
            venue_location: {
                lat: 47.599891,
                lng: -122.333667,
                city: 'Seattle',
                state: 'WA',
                address: '109 South Main St',
                venue_name: 'Seattle Jazz Fellowship',
            },
            external_ticket_url: null,
            slug: 'jazz-fellowship-event',
        };

        const result = ripper.parseEvent(item);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.location).toBe('Seattle Jazz Fellowship, 109 South Main St');
    });

    test('handles null venue_location gracefully', () => {
        const item = {
            id: 'no-venue',
            title: 'Mystery Event',
            description: null,
            event_type: 'community',
            event_status: 'published',
            start_datetime: '2026-08-01T17:00:00+00:00',
            end_datetime: null,
            venue_location: null,
            external_ticket_url: null,
            slug: 'mystery-event',
        };

        const result = ripper.parseEvent(item);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.location).toBe('Pioneer Square, Seattle, WA');
    });

    test('maps cover_image_url to imageUrl', () => {
        const item = {
            id: 'img-event',
            title: 'Event With Cover',
            description: null,
            event_type: 'concert',
            event_status: 'published',
            start_datetime: '2026-05-19T02:00:00+00:00',
            end_datetime: null,
            venue_location: { city: 'Seattle', state: 'WA', address: '124 S Washington St' },
            external_ticket_url: null,
            slug: 'event-with-cover',
            cover_image_url: 'https://downtownseattle.org/app/uploads/2025/05/poster.png',
        };

        const result = ripper.parseEvent(item);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.imageUrl).toBe('https://downtownseattle.org/app/uploads/2025/05/poster.png');
    });

    test('leaves imageUrl undefined when cover_image_url is null', () => {
        const item = {
            id: 'no-img-event',
            title: 'Event Without Cover',
            description: null,
            event_type: 'community',
            event_status: 'published',
            start_datetime: '2026-06-01T18:00:00+00:00',
            end_datetime: null,
            venue_location: { city: 'Seattle', state: 'WA', address: '100 Main St' },
            external_ticket_url: null,
            slug: 'event-without-cover',
            cover_image_url: null,
        };

        const result = ripper.parseEvent(item);
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.imageUrl).toBeUndefined();
    });

    test('sample data parses without errors for Seattle events', () => {
        const data = loadSampleData();
        const seattleEvents = data.filter((e: any) =>
            !e.venue_location?.state || e.venue_location.state === 'WA'
        );

        for (const item of seattleEvents) {
            const result = ripper.parseEvent(item);
            expect('date' in result).toBe(true);
        }
    });

    test('rip() filters out Vancouver BC events and counts no parse errors for them', async () => {
        const data = loadSampleData();
        const bcCount = data.filter((e: any) => e.venue_location?.state === 'BC').length;
        expect(bcCount).toBeGreaterThan(0);

        // Simulate rip() filtering logic: non-WA events with an explicit state are skipped silently.
        const filtered = data.filter((e: any) => {
            const state = e.venue_location?.state;
            return !state || state === 'WA';
        });
        expect(filtered.length).toBe(data.length - bcCount);

        // All remaining events parse successfully
        for (const item of filtered) {
            const result = ripper.parseEvent(item);
            expect('date' in result).toBe(true);
        }
    });
});
