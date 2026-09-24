import { describe, it, expect } from 'vitest';
import { ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import FoundercalRipper, {
    extractListing,
    extractJsonLdEvent,
    parseEventPage,
    locationFromPlace,
    isOnlineOnly,
    parseCost,
    JsonLdEvent,
    ParsedEvent,
} from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TZ = ZoneId.of('America/Los_Angeles');
const load = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

function parsed(file: string, p: string): ParsedEvent {
    const result = parseEventPage(extractJsonLdEvent(load(file)), p, TZ);
    if ('type' in result) throw new Error(`unexpected error: ${result.reason}`);
    return result;
}

describe('foundercal listing', () => {
    it('extracts unique event card paths and start times from the city page', () => {
        const listing = extractListing(load('sample-data.html'));
        expect(listing).toHaveLength(8);
        expect(listing[0]).toEqual({
            path: '/events/free-coworking-wednesdays-surf-incubator-316402475',
            start: '2026-09-23T15:00:00.000Z',
        });
        expect(new Set(listing.map(l => l.path)).size).toBe(8);
    });

    it('returns an empty list for a page with no cards', () => {
        expect(extractListing('<html><body>nothing</body></html>')).toEqual([]);
    });
});

describe('foundercal event page', () => {
    it('parses a fully-specified event (end time, address, free)', () => {
        const { event, unknownFields } = parsed('sample-event-founders-live.html', '/events/founders-live-seattle-JAe8TzA1NLTQEdj');
        expect(event.id).toBe('foundercal-founders-live-seattle-JAe8TzA1NLTQEdj');
        expect(event.summary).toBe('Founders Live Seattle');
        expect(event.date.toString()).toContain('2026-09-24T18:00-07:00');
        expect(event.duration.toMinutes()).toBe(180);
        expect(event.location).toBe('thinkspace SEATTLE, 1700 Westlake Ave N #200, Seattle, WA 98109, USA');
        expect(event.url).toBe('https://luma.com/founderslive-seattle-2026-09');
        expect(event.cost).toEqual({ min: 0 });
        expect(event.description).toContain('Organizer: Founders Live');
        expect(event.description).toContain('https://foundercal.com/events/founders-live-seattle-JAe8TzA1NLTQEdj');
        expect(unknownFields).toEqual([]);
    });

    it('flags duration when no endDate, and does not assert a price when isAccessibleForFree is false', () => {
        const { event, unknownFields } = parsed('sample-event-surf-coworking.html', '/events/free-coworking-wednesdays-surf-incubator-316402475');
        expect(event.location).toBe('SURF Incubator, 999 Third Ave Ste 700, Seattle, WA');
        expect(event.duration.toHours()).toBe(2);
        expect(event.cost).toBeUndefined();
        expect(unknownFields).toEqual(['duration']);
    });

    it('flags location when the place is only the city name', () => {
        const { event, unknownFields } = parsed('sample-event-no-address.html', '/events/seattle-consumer-ai-founders-meetup-b2c-Qwj7KKrxWsGHTFt');
        expect(event.location).toBeUndefined();
        expect(unknownFields).toEqual(['location']);
    });

    it('returns a ParseError (never null) when the page has no JSON-LD Event', () => {
        const result = parseEventPage(extractJsonLdEvent('<html></html>'), '/events/x', TZ);
        expect('type' in result && result.type).toBe('ParseError');
    });

    it('returns a ParseError for an invalid startDate', () => {
        const result = parseEventPage({ '@type': 'Event', name: 'X', startDate: 'not-a-date' }, '/events/x', TZ);
        expect('type' in result && result.type).toBe('ParseError');
    });

    it('builds location strings without duplicating the venue name', () => {
        expect(locationFromPlace({ name: 'AI House', address: { streetAddress: 'AI House, 2801 Alaskan Wy, Seattle, WA 98121, USA' } }))
            .toBe('AI House, 2801 Alaskan Wy, Seattle, WA 98121, USA');
        expect(locationFromPlace({ name: 'Citywide (Seattle)', address: { streetAddress: 'Seattle, WA' } })).toBeUndefined();
        expect(locationFromPlace({ name: 'Stoup Brewing', address: {} })).toBe('Stoup Brewing');
        expect(locationFromPlace(undefined)).toBeUndefined();
    });

    it('detects online-only events', () => {
        expect(isOnlineOnly({ eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode' })).toBe(true);
        expect(isOnlineOnly({ eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode' })).toBe(false);
    });
});

describe('parseCost', () => {
    const base: JsonLdEvent = { name: 'Some Event' };

    it('prefers the offers.price (live example, 2026-09-24: a Luma event with a $55-$75 sliding range)', () => {
        expect(parseCost({ ...base, isAccessibleForFree: false, offers: { price: '55.00', priceCurrency: 'USD' } }))
            .toEqual({ min: 55 });
    });

    it('treats isAccessibleForFree: true as free', () => {
        expect(parseCost({ ...base, isAccessibleForFree: true })).toEqual({ min: 0 });
    });

    it('treats a bare isAccessibleForFree: false (no offers) as paid, amount unknown', () => {
        expect(parseCost({ ...base, name: '[Save the Date] DubHacks 2026', isAccessibleForFree: false }))
            .toEqual({ paid: true });
    });

    it('does not assert paid when the title says "free" and isAccessibleForFree is an unreliable false (live example, 2026-09-24)', () => {
        expect(parseCost({ ...base, name: 'Free Coworking Wednesdays @ SURF Incubator', isAccessibleForFree: false }))
            .toBeUndefined();
    });

    it('returns undefined when there is no signal at all', () => {
        expect(parseCost(base)).toBeUndefined();
    });
});

describe('FoundercalRipper.rip', () => {
    it('fetches each future card and emits events plus uncertainty errors', async () => {
        const pages: Record<string, string> = {
            'https://foundercal.com/cities/seattle': `
                <a href="/events/free-coworking-wednesdays-surf-incubator-316402475" class="card group" data-type="meetup" data-start="2099-01-01T00:00:00.000Z">
                <a href="/events/founders-live-seattle-JAe8TzA1NLTQEdj" class="card group" data-type="pitch" data-start="2099-01-02T00:00:00.000Z">
                <a href="/events/past-event" class="card group" data-type="pitch" data-start="2000-01-01T00:00:00.000Z">`,
            // Force the JSON-LD dates into the future so the test doesn't age out.
            'https://foundercal.com/events/free-coworking-wednesdays-surf-incubator-316402475':
                load('sample-event-surf-coworking.html').replace(/2026-09-23/g, '2099-01-01'),
            'https://foundercal.com/events/founders-live-seattle-JAe8TzA1NLTQEdj':
                load('sample-event-founders-live.html').replace(/2026-09-25/g, '2099-01-02'),
        };
        const originalFetch = globalThis.fetch;
        const requested: string[] = [];
        globalThis.fetch = (async (url: string) => {
            requested.push(url);
            const body = pages[url];
            return new Response(body ?? 'not found', { status: body ? 200 : 404 });
        }) as typeof fetch;
        try {
            const ripper = new FoundercalRipper();
            const [cal] = await ripper.rip({
                config: {
                    name: 'foundercal',
                    url: new URL('https://foundercal.com/cities/seattle'),
                    calendars: [{ name: 'seattle', friendlyname: 'foundercal', timezone: TZ }],
                    tags: ['Tech'],
                },
            } as any);
            expect(requested).not.toContain('https://foundercal.com/events/past-event');
            expect(cal.events.map(e => e.id)).toEqual([
                'foundercal-free-coworking-wednesdays-surf-incubator-316402475',
                'foundercal-founders-live-seattle-JAe8TzA1NLTQEdj',
            ]);
            expect(cal.errors.filter(e => e.type === 'ParseError')).toHaveLength(0);
            const uncertain = cal.errors.filter(e => e.type === 'Uncertainty');
            expect(uncertain).toHaveLength(1);
            expect((uncertain[0] as any).partialFingerprint).toMatch(/^[0-9a-f]{16}$/);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
