import { describe, expect, test, vi, afterEach } from 'vitest';
import CIDBIARipper from './ripper.js';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function loadSampleJson() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: 'cidbia',
            url: new URL('https://app.proxi.co/api/public/events/66a82b2c8cb3161b7d22dc0d'),
            tags: ['Community', 'International District'],
            geo: null,
            disabled: false,
            proxy: false,
            calendars: [
                {
                    name: 'cidbia-events',
                    friendlyname: 'CIDBIA Events',
                    timezone: TIMEZONE,
                },
            ],
            ...overrides,
        },
    } as any;
}

describe('CIDBIARipper - parseEvents from sample JSON', () => {
    const ripper = new CIDBIARipper();
    const jsonData = loadSampleJson();
    const now = ZonedDateTime.now(TIMEZONE);

    test('parses every occurrence in the sample as an event, none as errors', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const errors = results.filter(r => 'type' in r);
        expect(errors).toEqual([]);
        expect(events.length).toBe(jsonData.occurrences.length);
    });

    test('event has required fields', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        for (const event of events) {
            expect(event.id).toBeTruthy();
            expect(event.summary).toBeTruthy();
            expect(event.date).toBeTruthy();
            expect(event.duration).toBeTruthy();
            expect(event.url).toBe('https://www.seattlechinatownid.com/local-events');
        }
    });

    test('resolves location from the venues table via venue_id', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const dragVillage = events.find(e => e.summary === 'Drag Village at Tabletop Village');
        expect(dragVillage?.location).toContain('Tabletop Village');
    });

    test('resolves location from venue_override_address when no venue_id', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const artMarket = events.find(e => e.summary === 'Connecting Through Culture Community Art Market');
        expect(artMarket?.location).toContain('12th Avenue South');
    });

    test('resolves a relative cover_image against the Proxi API origin', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const withImage = events.find(e => e.summary === 'Drag Village at Tabletop Village');
        expect(withImage?.imageUrl).toMatch(/^https:\/\/app\.proxi\.co\//);
    });

    test('leaves imageUrl undefined when the source has no cover_image', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const noImage = events.find(e => e.summary === "Seattle Shines Pop Up Event");
        expect(noImage?.imageUrl).toBeUndefined();
    });

    test('sets cost to free only when the event is tagged "Free"', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const free = events.find(e => e.summary === 'Celebrate Little Saigon 2026');
        expect(free?.cost).toEqual({ min: 0 });
        const untagged = events.find(e => e.summary === 'Drag Village at Tabletop Village');
        expect(untagged?.cost).toBeUndefined();
    });

    test('start time is converted into the calendar timezone', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        // "2026-08-09T01:30:00Z" is 2026-08-08T18:30 in America/Los_Angeles (PDT, UTC-7)
        const dragVillage = events.find(e => e.summary === 'Drag Village at Tabletop Village');
        expect(dragVillage?.date.year()).toBe(2026);
        expect(dragVillage?.date.monthValue()).toBe(8);
        expect(dragVillage?.date.dayOfMonth()).toBe(8);
        expect(dragVillage?.date.hour()).toBe(18);
        expect(dragVillage?.date.minute()).toBe(30);
    });

    test('gives recurring instances of the same event distinct, stable ids', async () => {
        const results1 = await ripper.parseEvents(jsonData, now, {});
        const results2 = await ripper.parseEvents(jsonData, now, {});
        const events1 = results1.filter((r): r is RipperCalendarEvent => 'date' in r);
        const events2 = results2.filter((r): r is RipperCalendarEvent => 'date' in r);

        const pokemonIds1 = events1.filter(e => e.summary === 'Pokémon Club').map(e => e.id);
        const pokemonIds2 = events2.filter(e => e.summary === 'Pokémon Club').map(e => e.id);

        expect(pokemonIds1.length).toBeGreaterThan(1);
        // Same ids every parse (stable across builds)...
        expect(pokemonIds1).toEqual(pokemonIds2);
        // ...but distinct per occurrence (not one id reused for every date).
        expect(new Set(pokemonIds1).size).toBe(pokemonIds1.length);
    });

    test('prefers the fuller "description" field over the short "summary" teaser', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const dragVillage = events.find(e => e.summary === 'Drag Village at Tabletop Village');
        // The sample's `summary` for this event is a ~60-char teaser; `description`
        // is the ~950-char full write-up. The ICS description should be the latter.
        expect(dragVillage?.description?.length).toBeGreaterThan(200);
        expect(dragVillage?.description).toContain('16 performers');
    });

    test('duration reflects occurrence_end when present', async () => {
        const results = await ripper.parseEvents(jsonData, now, {});
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const dragVillage = events.find(e => e.summary === 'Drag Village at Tabletop Village');
        // start 2026-08-09T01:30:00Z, end 2026-08-09T04:30:00Z => 3 hours
        expect(dragVillage?.duration.toHours()).toBe(3);
    });
});

describe('CIDBIARipper - malformed input', () => {
    const ripper = new CIDBIARipper();
    const now = ZonedDateTime.now(TIMEZONE);

    test('returns a ParseError when the response has no occurrences array', async () => {
        const results = await ripper.parseEvents({ organization: {} }, now, {});
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for an occurrence missing its event object', async () => {
        const results = await ripper.parseEvents({ occurrences: [{ occurrence_start: '2026-08-09T01:30:00Z' }] }, now, {});
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for an event missing a name', async () => {
        const results = await ripper.parseEvents({
            occurrences: [{ event: { id: { $oid: 'abc' }, start_time: '2026-08-09T01:30:00Z', status: 'published' } }],
        }, now, {});
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for an event missing a start time', async () => {
        const results = await ripper.parseEvents({
            occurrences: [{ event: { id: { $oid: 'abc' }, name: 'No start time', status: 'published' } }],
        }, now, {});
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ type: 'ParseError' });
    });

    test('skips (does not error on) a non-published event', async () => {
        const results = await ripper.parseEvents({
            occurrences: [{
                event: {
                    id: { $oid: 'abc' },
                    name: 'Draft event',
                    start_time: '2026-08-09T01:30:00Z',
                    status: 'draft',
                },
            }],
        }, now, {});
        expect(results).toEqual([]);
    });
});

describe('CIDBIARipper - rip()', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    function jsonResponse(body: any) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }

    test('fetches the Proxi API with a from/to window and returns parsed events', async () => {
        const jsonData = loadSampleJson();
        const mockFetch = vi.fn().mockImplementation(() => jsonResponse(jsonData));
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new CIDBIARipper();
        const result = await ripper.rip(makeRipper());

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const requestedUrl = mockFetch.mock.calls[0][0] as string;
        expect(requestedUrl).toContain('https://app.proxi.co/api/public/events/66a82b2c8cb3161b7d22dc0d?');
        expect(requestedUrl).toContain('from=');
        expect(requestedUrl).toContain('to=');

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('cidbia-events');
        expect(result[0].events.length).toBe(jsonData.occurrences.length);
        expect(result[0].errors).toEqual([]);
    });

    test('computes the from date from the calendar timezone, not the system clock', async () => {
        // 2026-08-16T03:00:00Z is 2026-08-15T20:00:00-07:00 in Seattle — still
        // "today" locally even though UTC has already rolled to the 16th.
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-16T03:00:00Z'));

        const mockFetch = vi.fn().mockImplementation(() => jsonResponse({ occurrences: [], venues: [] }));
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new CIDBIARipper();
        await ripper.rip(makeRipper());

        const requestedUrl = new URL(mockFetch.mock.calls[0][0] as string);
        expect(requestedUrl.searchParams.get('from')).toContain('2026-08-15');
    });

    test('throws when the API returns a non-OK status', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new CIDBIARipper();
        await expect(ripper.rip(makeRipper())).rejects.toThrow(/503/);
    });

    test('throws when no calendars are configured', async () => {
        const ripper = new CIDBIARipper();
        await expect(ripper.rip(makeRipper({ calendars: [] }))).rejects.toThrow(/No calendars configured/);
    });
});
