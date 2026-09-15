import { describe, expect, test, vi, afterEach } from 'vitest';
import SeattleBookClubRipper, { parseEvent } from './ripper.js';
import { ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function loadSampleSchedule(): any[] {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
    return data.schedule;
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: 'seattle-book-club',
            url: new URL('https://api.eveyevents.com/production-v2/storefront/calendar?shop=seattle-book-club.myshopify.com'),
            tags: ['Books'],
            geo: null,
            disabled: false,
            proxy: false,
            calendars: [
                {
                    name: 'events',
                    friendlyname: 'Seattle Book Club',
                    timezone: TIMEZONE,
                },
            ],
            ...overrides,
        },
    } as any;
}

describe('parseEvent - from sample JSON', () => {
    const schedule = loadSampleSchedule();

    test('parses every sample entry as an event, none as errors', () => {
        const results = schedule.map(raw => parseEvent(raw, TIMEZONE));
        const errors = results.filter(r => 'type' in r);
        expect(errors).toEqual([]);
        expect(results.length).toBe(schedule.length);
    });

    test('event has required fields', () => {
        const results = schedule.map(raw => parseEvent(raw, TIMEZONE)) as RipperCalendarEvent[];
        for (const event of results) {
            expect(event.id).toBeTruthy();
            expect(event.summary).toBeTruthy();
            expect(event.date).toBeTruthy();
            expect(event.duration).toBeTruthy();
        }
    });

    test('gives each occurrence a stable id derived from the source product id and date', () => {
        const results = schedule.map(raw => parseEvent(raw, TIMEZONE)) as RipperCalendarEvent[];
        const bambino = results.find(e => e.summary === 'Books at Bambino');
        expect(bambino?.id).toBe('seattle-book-club-305151-2026-09-26');
    });

    test('appends city/state to the bare venue name for geocoding', () => {
        const results = schedule.map(raw => parseEvent(raw, TIMEZONE)) as RipperCalendarEvent[];
        const bambino = results.find(e => e.summary === 'Books at Bambino');
        expect(bambino?.location).toBe('Cafe Bambino, Seattle, WA');
    });

    test('derives a min/max cost range from ticket prices', () => {
        const results = schedule.map(raw => parseEvent(raw, TIMEZONE)) as RipperCalendarEvent[];
        const pies = results.find(e => e.summary === 'Books A La Mode');
        expect(pies?.cost).toEqual({ min: 27, max: 33 });
    });

    test('collapses a single ticket price to a min-only cost', () => {
        const results = schedule.map(raw => parseEvent(raw, TIMEZONE)) as RipperCalendarEvent[];
        const bambino = results.find(e => e.summary === 'Books at Bambino');
        expect(bambino?.cost).toEqual({ min: 19 });
    });

    test('derives duration from start/end', () => {
        const results = schedule.map(raw => parseEvent(raw, TIMEZONE)) as RipperCalendarEvent[];
        const bambino = results.find(e => e.summary === 'Books at Bambino');
        expect(bambino?.duration.toMinutes()).toBe(90);
    });

    test('carries the product image URL', () => {
        const results = schedule.map(raw => parseEvent(raw, TIMEZONE)) as RipperCalendarEvent[];
        const bambino = results.find(e => e.summary === 'Books at Bambino');
        expect(bambino?.imageUrl).toContain('cdn.shopify.com');
    });
});

describe('parseEvent - malformed input', () => {
    test('returns a ParseError for a missing title', () => {
        const result = parseEvent({ start: '2026-09-01T18:00:00.000Z', source_data: { id: 1 } }, TIMEZONE);
        expect(result).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for a missing source_data.id', () => {
        const result = parseEvent({ start: '2026-09-01T18:00:00.000Z', title: 'No id' }, TIMEZONE);
        expect(result).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for a missing start date', () => {
        const result = parseEvent({ title: 'No start', source_data: { id: 1 } }, TIMEZONE);
        expect(result).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for an unparseable start date', () => {
        const result = parseEvent({ start: 'not-a-date', title: 'Bad date', source_data: { id: 1 } }, TIMEZONE);
        expect(result).toMatchObject({ type: 'ParseError' });
    });

    test('falls back to a default duration when end is missing', () => {
        const result = parseEvent({ start: '2026-09-01T18:00:00.000Z', title: 'No end', source_data: { id: 1 } }, TIMEZONE);
        expect('type' in result).toBe(false);
        if (!('type' in result)) {
            expect(result.duration.toHours()).toBe(1);
        }
    });

    test('leaves location undefined when the source gives no location', () => {
        const result = parseEvent({ start: '2026-09-01T18:00:00.000Z', title: 'No location', source_data: { id: 1 } }, TIMEZONE);
        expect('type' in result).toBe(false);
        if (!('type' in result)) {
            expect(result.location).toBeUndefined();
        }
    });

    test('leaves cost undefined when the source gives no price', () => {
        const result = parseEvent({ start: '2026-09-01T18:00:00.000Z', title: 'No price', source_data: { id: 1 } }, TIMEZONE);
        expect('type' in result).toBe(false);
        if (!('type' in result)) {
            expect(result.cost).toBeUndefined();
        }
    });
});

describe('SeattleBookClubRipper - rip()', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    function jsonResponse(body: any) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }

    test('fetches several months of the API and returns deduplicated parsed events', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-15T12:00:00-07:00'));

        const schedule = loadSampleSchedule();
        // Every monthly request returns the same overlapping sample schedule;
        // dedup on (source id, start) should collapse repeats down to the
        // sample's own unique occurrence count.
        const mockFetch = vi.fn().mockImplementation(() => jsonResponse({ events: [], schedule }));
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new SeattleBookClubRipper();
        const result = await ripper.rip(makeRipper());

        expect(mockFetch).toHaveBeenCalledTimes(6); // LOOKAHEAD_MONTHS
        const requestedUrl = new URL(mockFetch.mock.calls[0][0] as string);
        expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://api.eveyevents.com/production-v2/storefront/calendar');
        expect(requestedUrl.searchParams.get('shop')).toBe('seattle-book-club.myshopify.com');
        expect(requestedUrl.searchParams.get('startDate')).toBe('2026-09-01');
        expect(requestedUrl.searchParams.get('currentDate')).toBe('2026-09-15');

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('events');
        expect(result[0].events.length).toBe(schedule.length);
        expect(result[0].errors).toEqual([]);
    });

    test('deduplicates a malformed entry that recurs across overlapping months', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-15T12:00:00-07:00'));

        const malformed = [{ title: 'Broken Listing', start: 'not-a-date', source_data: { id: 999 } }];
        const mockFetch = vi.fn().mockImplementation(() => jsonResponse({ events: [], schedule: malformed }));
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new SeattleBookClubRipper();
        const result = await ripper.rip(makeRipper());

        expect(mockFetch).toHaveBeenCalledTimes(6);
        // Same broken entry appears in every overlapping month's response, but
        // should only be reported once, not once per month.
        expect(result[0].errors).toHaveLength(1);
    });

    test('filters out past occurrences', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-15T12:00:00-07:00'));

        const schedule = [
            { title: 'Already happened', start: '2026-09-01T18:00:00.000Z', end: '2026-09-01T19:00:00.000Z', source_data: { id: 1 } },
            { title: 'Still upcoming', start: '2026-09-20T18:00:00.000Z', end: '2026-09-20T19:00:00.000Z', source_data: { id: 2 } },
        ];
        const mockFetch = vi.fn().mockImplementation(() => jsonResponse({ events: [], schedule }));
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new SeattleBookClubRipper();
        const result = await ripper.rip(makeRipper());

        expect(result[0].events.map(e => e.summary)).toEqual(['Still upcoming']);
    });

    test('throws when the first (current) month returns a non-OK status', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new SeattleBookClubRipper();
        await expect(ripper.rip(makeRipper())).rejects.toThrow(/503/);
    });

    test('tolerates a later month failing without discarding already-fetched events', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-15T12:00:00-07:00'));

        const schedule = loadSampleSchedule();
        const mockFetch = vi.fn()
            .mockImplementationOnce(() => jsonResponse({ events: [], schedule }))
            .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' }))
            .mockImplementation(() => jsonResponse({ events: [], schedule: [] }));
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new SeattleBookClubRipper();
        const result = await ripper.rip(makeRipper());

        expect(mockFetch).toHaveBeenCalledTimes(6);
        expect(result[0].events.length).toBe(schedule.length);
        expect(result[0].errors).toEqual([]);
    });

    test('throws when no calendars are configured', async () => {
        const ripper = new SeattleBookClubRipper();
        await expect(ripper.rip(makeRipper({ calendars: [] }))).rejects.toThrow(/requires at least one calendar/);
    });
});
