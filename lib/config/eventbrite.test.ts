import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { EventbriteRipper } from './eventbrite.js';
import { RipperCalendarEvent, RipperError } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tz = ZoneId.of('America/Los_Angeles');

// Sample data lives in the (Seattle) source dirs, which `npm run init-city`
// deletes for template copies — the suite self-skips when they're gone.
const HAVE_SAMPLES = ['elliott-bay', 'substation']
    .every(s => existsSync(join(__dirname, `../../sources/${s}/sample-data.json`)));

function loadSample(source: string): any {
    const raw = readFileSync(join(__dirname, `../../sources/${source}/sample-data.json`), 'utf-8');
    return JSON.parse(raw);
}

// Synthetic fixtures for edge-case tests
const SYNTHETIC_EVENTS = {
    noName: { id: 'syn-1', name: null, start: { timezone: 'America/Los_Angeles', local: '2026-03-10T19:00:00' }, end: null, venue: null, url: null, description: null },
    noStart: { id: 'syn-2', name: { text: 'Show Without Dates' }, start: null, end: null, venue: null, url: null, description: null },
    noId: { id: undefined, name: null, start: { local: '2026-03-10T19:00:00', timezone: 'America/Los_Angeles' }, end: null, venue: null, url: null, description: null },
    noVenue: { id: 'syn-3', name: { text: 'Online Event' }, description: null, url: 'https://eventbrite.com/e/syn-3', start: { timezone: 'America/Los_Angeles', local: '2026-03-01T18:00:00' }, end: { timezone: 'America/Los_Angeles', local: '2026-03-01T20:00:00' }, venue: null },
    noEnd: { id: 'syn-4', name: { text: 'Open-Ended Event' }, description: null, url: 'https://eventbrite.com/e/syn-4', start: { timezone: 'America/Los_Angeles', local: '2026-03-01T18:00:00' }, end: null, venue: null },
};

describe.skipIf(!HAVE_SAMPLES)('EventbriteRipper', () => {
    describe('parsing — Elliott Bay sample (38 events, daytime shows)', () => {
        it('extracts all events with no errors', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('elliott-bay');
            const events = ripper.parseEvents(data.events, tz, '1521 10th Ave, Seattle, WA 98122');

            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(valid.length).toBe(38);
            expect(errors.length).toBe(0);
        });

        it('parses summary, date, and time', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.summary).toBe('[SOLD OUT] B.K. Borison, AND NOW, BACK TO YOU');
            expect(first.date.year()).toBe(2026);
            expect(first.date.monthValue()).toBe(2);
            expect(first.date.dayOfMonth()).toBe(27);
            expect(first.date.hour()).toBe(19);
        });

        it('calculates duration from end time (1 hour show)', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.duration.toHours()).toBe(1);
        });

        it('uses venue name and address from API response', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.location).toContain('Elliott Bay Book Company');
            expect(first.location).toContain('1521 10th Avenue');
            expect(first.location).toContain('Seattle');
        });

        it('sets description and URL', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.description).toContain('meteorologists');
            expect(first.url).toContain('eventbrite.com');
        });

        it('maps the event logo to imageUrl, preferring full-resolution original', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('elliott-bay');
            const [first] = ripper.parseEvents(data.events, tz, '') as RipperCalendarEvent[];
            const expected = data.events[0].logo.original?.url ?? data.events[0].logo.url;
            expect(first.imageUrl).toBe(expected);
            expect(first.imageUrl).toMatch(/^https:\/\/img\.evbuc\.com\//);
        });
    });

    describe('image handling', () => {
        it('falls back to the cropped logo.url when original is absent', () => {
            const ripper = new EventbriteRipper();
            const ev = {
                id: 'img-1',
                name: { text: 'Cropped-only image' },
                start: { timezone: 'America/Los_Angeles', local: '2026-03-01T18:00:00' },
                end: { timezone: 'America/Los_Angeles', local: '2026-03-01T20:00:00' },
                venue: null,
                url: 'https://eventbrite.com/e/img-1',
                description: null,
                logo: { url: 'https://img.evbuc.com/cropped.jpg' },
            };
            const [e] = ripper.parseEvents([ev], tz, '') as RipperCalendarEvent[];
            expect(e.imageUrl).toBe('https://img.evbuc.com/cropped.jpg');
        });

        it('leaves imageUrl undefined when the event has no logo', () => {
            const ripper = new EventbriteRipper();
            const [e] = ripper.parseEvents([SYNTHETIC_EVENTS.noVenue], tz, 'X') as RipperCalendarEvent[];
            expect(e.imageUrl).toBeUndefined();
        });
    });

    describe('parsing — Substation sample (5 events, late-night shows)', () => {
        const DEFAULT_LOCATION = '645 NW 45th St, Seattle, WA 98107';

        it('extracts all events with no errors', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('substation');
            const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, 3);

            const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            const errors = events.filter(e => 'type' in e) as RipperError[];
            expect(valid.length).toBe(5);
            expect(errors.length).toBe(0);
        });

        it('calculates duration spanning midnight (5-hour show, 21:00–02:00)', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('substation').events, tz, DEFAULT_LOCATION, 3) as RipperCalendarEvent[];
            expect(first.summary).toBe('Dark Entries: Industrial Night');
            expect(first.date.hour()).toBe(21);
            expect(first.duration.toHours()).toBe(5);
        });

        it('uses defaultDurationHours (3) when end time is absent', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noEnd], tz, DEFAULT_LOCATION, 3);
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.duration.toHours()).toBe(3);
        });

        it('falls back to defaultLocation when venue is null', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('substation');
            const events = ripper.parseEvents(data.events, tz, DEFAULT_LOCATION, 3) as RipperCalendarEvent[];
            const last = events[events.length - 1];
            expect(last.location).toBe(DEFAULT_LOCATION);
        });

        it('assigns the correct event ID', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('substation').events, tz, DEFAULT_LOCATION, 3) as RipperCalendarEvent[];
            expect(first.id).toBe('1100000001');
        });
    });

    describe('deduplication', () => {
        it('ignores duplicate IDs across calls', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('substation');
            const doubled = [...data.events, ...data.events];
            const events = ripper.parseEvents(doubled, tz, '', 3);
            expect(events.filter(e => 'summary' in e).length).toBe(5);
        });

        it('deduplicates across a larger dataset (Elliott Bay)', () => {
            const ripper = new EventbriteRipper();
            const data = loadSample('elliott-bay');
            const doubled = [...data.events, ...data.events];
            const events = ripper.parseEvents(doubled, tz, '');
            expect(events.filter(e => 'summary' in e).length).toBe(38);
        });
    });

    describe('series expansion (fetchAllEvents)', () => {
        function jsonResponse(body: any): Response {
            return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
        }

        it('expands a series parent into its dated occurrences', async () => {
            const ripper = new EventbriteRipper();
            const seriesParent = { id: 'series-1', is_series_parent: true, name: { text: 'Weekly Open Mic (series)' } };
            const occurrence1 = { id: 'occ-1', is_series_parent: false, series_id: 'series-1', name: { text: 'Weekly Open Mic' }, start: { local: '2026-07-02T20:30:00', timezone: 'America/Los_Angeles' } };
            const occurrence2 = { id: 'occ-2', is_series_parent: false, series_id: 'series-1', name: { text: 'Weekly Open Mic' }, start: { local: '2026-07-09T20:30:00', timezone: 'America/Los_Angeles' } };

            const calls: string[] = [];
            const fetchFn = async (url: string | URL) => {
                calls.push(url.toString());
                if (url.toString().includes('/organizers/')) {
                    return jsonResponse({ events: [seriesParent], pagination: { has_more_items: false } });
                }
                if (url.toString().includes('/series/series-1/events/')) {
                    return jsonResponse({ events: [occurrence1, occurrence2], pagination: { has_more_items: false } });
                }
                throw new Error(`Unexpected URL: ${url}`);
            };

            const events = await ripper.fetchAllEvents('org-1', 'a-fake-but-long-enough-token', fetchFn as any);
            expect(events.map(e => e.id)).toEqual(['occ-1', 'occ-2']);
            expect(calls.some(c => c.includes('/series/series-1/events/'))).toBe(true);
        });

        it('leaves non-series events untouched', async () => {
            const ripper = new EventbriteRipper();
            const plainEvent = { id: 'plain-1', is_series_parent: false, name: { text: 'One-off Show' } };
            const fetchFn = async () => jsonResponse({ events: [plainEvent], pagination: { has_more_items: false } });

            const events = await ripper.fetchAllEvents('org-1', 'a-fake-but-long-enough-token', fetchFn as any);
            expect(events).toEqual([plainEvent]);
        });

        it('drops a series that fails to expand instead of failing the whole fetch', async () => {
            const ripper = new EventbriteRipper();
            const seriesParent = { id: 'series-2', is_series_parent: true, name: { text: 'Broken Series' } };
            const fetchFn = async (url: string | URL) => {
                if (url.toString().includes('/organizers/')) {
                    return jsonResponse({ events: [seriesParent], pagination: { has_more_items: false } });
                }
                return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) } as Response;
            };

            const events = await ripper.fetchAllEvents('org-1', 'a-fake-but-long-enough-token', fetchFn as any);
            expect(events).toEqual([]);
        });

        it('follows pagination across both the organizer and series endpoints', async () => {
            const ripper = new EventbriteRipper();
            const seriesParent = { id: 'series-3', is_series_parent: true, name: { text: 'Paginated Series' } };
            const occA = { id: 'occ-a', is_series_parent: false, series_id: 'series-3' };
            const occB = { id: 'occ-b', is_series_parent: false, series_id: 'series-3' };
            const plainEvent = { id: 'plain-2', is_series_parent: false };

            const fetchFn = async (url: string | URL) => {
                const u = url.toString();
                if (u.includes('/organizers/') && u.includes('page=1')) {
                    return jsonResponse({ events: [seriesParent], pagination: { has_more_items: true } });
                }
                if (u.includes('/organizers/') && u.includes('page=2')) {
                    return jsonResponse({ events: [plainEvent], pagination: { has_more_items: false } });
                }
                if (u.includes('/series/series-3/events/') && u.includes('page=1')) {
                    return jsonResponse({ events: [occA], pagination: { has_more_items: true } });
                }
                if (u.includes('/series/series-3/events/') && u.includes('page=2')) {
                    return jsonResponse({ events: [occB], pagination: { has_more_items: false } });
                }
                throw new Error(`Unexpected URL: ${url}`);
            };

            const events = await ripper.fetchAllEvents('org-1', 'a-fake-but-long-enough-token', fetchFn as any);
            expect(events.map(e => e.id).sort()).toEqual(['occ-a', 'occ-b', 'plain-2']);
        });
    });

    describe('error handling', () => {
        it('returns ParseError for event with no name', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noName], tz, '');
            const [e] = events.filter(e => 'type' in e) as RipperError[];
            expect(e.type).toBe('ParseError');
            expect(e.reason).toContain('no name');
        });

        it('returns ParseError for event with no start time', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noStart], tz, '');
            const [e] = events.filter(e => 'type' in e) as RipperError[];
            expect(e.type).toBe('ParseError');
        });

        it('uses "unknown" as context when event has no ID', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noId], tz, '');
            const [e] = events.filter(e => 'type' in e) as RipperError[];
            expect(e.context).toBe('unknown');
        });
    });

    describe('defaults', () => {
        it('falls back to defaultLocation when venue is null', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noVenue], tz, 'Fallback Location');
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.location).toBe('Fallback Location');
        });

        it('defaults to 2-hour duration when defaultDurationHours is not specified', () => {
            const ripper = new EventbriteRipper();
            const events = ripper.parseEvents([SYNTHETIC_EVENTS.noEnd], tz, '');
            const [e] = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
            expect(e.duration.toHours()).toBe(2);
        });

        it('uses event timezone from API response, not fallback tz', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            expect(first.date.zone().id()).toBe('America/Los_Angeles');
        });
    });

    describe('cost extraction', () => {
        const baseEvent = {
            id: 'cost-1', name: { text: 'Priced Event' }, description: null, url: null, venue: null,
            start: { timezone: 'America/Los_Angeles', local: '2026-03-01T18:00:00' },
            end: { timezone: 'America/Los_Angeles', local: '2026-03-01T20:00:00' },
        };

        it('marks paid events from sample data without ticket_availability as paid-unknown', () => {
            const ripper = new EventbriteRipper();
            const [first] = ripper.parseEvents(loadSample('elliott-bay').events, tz, '') as RipperCalendarEvent[];
            // Sample's first event: is_free false, no ticket_availability expansion
            expect(first.cost).toEqual({ paid: true });
        });

        it('maps is_free to a free cost', () => {
            const ripper = new EventbriteRipper();
            const [e] = ripper.parseEvents([{ ...baseEvent, is_free: true }], tz, '') as RipperCalendarEvent[];
            expect(e.cost).toEqual({ min: 0 });
        });

        it('reads the face-value range from the ticket_availability expansion', () => {
            const ripper = new EventbriteRipper();
            const ev = { ...baseEvent, is_free: false, ticket_availability: {
                minimum_ticket_price: { currency: 'USD', major_value: '12.00', value: 1200 },
                maximum_ticket_price: { currency: 'USD', major_value: '35.00', value: 3500 },
            }};
            const [e] = ripper.parseEvents([ev], tz, '') as RipperCalendarEvent[];
            expect(e.cost).toEqual({ min: 12, max: 35 });
        });

        it('omits max when min and max ticket prices are equal', () => {
            const ripper = new EventbriteRipper();
            const ev = { ...baseEvent, is_free: false, ticket_availability: {
                minimum_ticket_price: { currency: 'USD', major_value: '20.00', value: 2000 },
                maximum_ticket_price: { currency: 'USD', major_value: '20.00', value: 2000 },
            }};
            const [e] = ripper.parseEvents([ev], tz, '') as RipperCalendarEvent[];
            expect(e.cost).toEqual({ min: 20 });
        });

        it('leaves cost unset when is_free is absent', () => {
            const ripper = new EventbriteRipper();
            const [e] = ripper.parseEvents([{ ...baseEvent }], tz, '') as RipperCalendarEvent[];
            expect(e.cost).toBeUndefined();
        });
    });
});
