import { describe, expect, test, vi, afterEach } from 'vitest';
import SeattleBluesDanceCollectiveRipper, { parseEvent, parseTimeRange } from './ripper.js';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function loadSampleJson(): any[] {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: 'seattle-blues-dance-collective',
            url: new URL('https://seattlebluesdance.com/events.json'),
            tags: ['Dance', 'Music'],
            geo: null,
            disabled: false,
            proxy: false,
            calendars: [
                {
                    name: 'events',
                    friendlyname: 'Seattle Blues Dance Collective',
                    timezone: TIMEZONE,
                },
            ],
            ...overrides,
        },
    } as any;
}

describe('parseTimeRange', () => {
    test('parses a same-day PM range', () => {
        const result = parseTimeRange('6:00 PM - 9:00 PM');
        expect(result?.start.toString()).toBe('18:00');
        expect(result?.durationMinutes).toBe(180);
    });

    test('parses a range that crosses midnight', () => {
        const result = parseTimeRange('9:00 PM - 12:00 AM');
        expect(result?.start.toString()).toBe('21:00');
        expect(result?.durationMinutes).toBe(180);
    });

    test('treats "All Day" as a stated full-day fact', () => {
        const result = parseTimeRange('All Day');
        expect(result?.start.toString()).toBe('00:00');
        expect(result?.durationMinutes).toBe(24 * 60);
    });

    test('returns null for unrecognized text', () => {
        expect(parseTimeRange('sometime soon')).toBeNull();
    });
});

describe('parseEvent - from sample JSON', () => {
    const jsonData = loadSampleJson();

    test('parses every sample entry as an event, none as errors', () => {
        const results = jsonData.map(parseEvent);
        const errors = results.filter(r => 'type' in r);
        expect(errors).toEqual([]);
        expect(results.length).toBe(jsonData.length);
    });

    test('event has required fields', () => {
        const results = jsonData.map(parseEvent) as RipperCalendarEvent[];
        for (const event of results) {
            expect(event.id).toBeTruthy();
            expect(event.summary).toBeTruthy();
            expect(event.date).toBeTruthy();
            expect(event.duration).toBeTruthy();
            expect(event.url).toBe('https://seattlebluesdance.com/');
        }
    });

    test('gives each occurrence a stable, uid-derived id', () => {
        const results = jsonData.map(parseEvent) as RipperCalendarEvent[];
        const emeraldBlues = results.find(e => e.summary === 'Emerald Blues at the Reverie');
        expect(emeraldBlues?.id).toBe('sbdc-ca08ffd1e4eba2e2ebfee62c0004e3687094ab7e1050e4b553ce5dd4b610c933');
    });

    test('resolves a full-address location string for geocoding', () => {
        const results = jsonData.map(parseEvent) as RipperCalendarEvent[];
        const emeraldBlues = results.find(e => e.summary === 'Emerald Blues at the Reverie');
        expect(emeraldBlues?.location).toContain('Reverie Ballroom');
    });

    test('leaves location undefined when the source gives an empty string', () => {
        const results = jsonData.map(parseEvent) as RipperCalendarEvent[];
        const practice = results.find(e => e.summary === 'What the Blues: Open Practice & Social');
        expect(practice?.location).toBeUndefined();
    });

    test('leaves description undefined when the source gives an empty string', () => {
        const results = jsonData.map(parseEvent) as RipperCalendarEvent[];
        const bacovino = results.find(e => e.summary === 'Elnah Jordan and Alex Chadsey: Live Music Night at Bacovino');
        expect(bacovino?.description).toBeUndefined();
    });

    test('start time and duration reflect a same-day time range', () => {
        const results = jsonData.map(parseEvent) as RipperCalendarEvent[];
        const bacovino = results.find(e => e.summary === 'Elnah Jordan and Alex Chadsey: Live Music Night at Bacovino');
        expect(bacovino?.date.hour()).toBe(18);
        expect(bacovino?.date.minute()).toBe(0);
        expect(bacovino?.duration.toHours()).toBe(3);
    });

    test('start time and duration reflect a range crossing midnight', () => {
        const results = jsonData.map(parseEvent) as RipperCalendarEvent[];
        const emeraldBlues = results.find(e => e.summary === 'Emerald Blues at the Reverie');
        expect(emeraldBlues?.date.hour()).toBe(21);
        expect(emeraldBlues?.duration.toHours()).toBe(3);
    });
});

describe('parseEvent - malformed input', () => {
    test('returns a ParseError for a missing title', () => {
        const result = parseEvent({ date: '2026-09-01', time: '6:00 PM - 8:00 PM', uid: 'abc' });
        expect(result).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for a missing uid', () => {
        const result = parseEvent({ date: '2026-09-01', time: '6:00 PM - 8:00 PM', title: 'No uid' });
        expect(result).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for a malformed date', () => {
        const result = parseEvent({ date: 'not-a-date', time: '6:00 PM - 8:00 PM', title: 'Bad date', uid: 'abc' });
        expect(result).toMatchObject({ type: 'ParseError' });
    });

    test('returns a ParseError for unparseable time text', () => {
        const result = parseEvent({ date: '2026-09-01', time: 'whenever', title: 'Bad time', uid: 'abc' });
        expect(result).toMatchObject({ type: 'ParseError' });
    });
});

describe('SeattleBluesDanceCollectiveRipper - rip()', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    function jsonResponse(body: any) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }

    test('fetches several months of the API and returns deduplicated parsed events', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-14T12:00:00-07:00'));

        const jsonData = loadSampleJson();
        // Every monthly request returns the same overlapping sample data;
        // dedup on `uid` should collapse repeats down to the sample's own
        // unique event count.
        const mockFetch = vi.fn().mockImplementation(() => jsonResponse(jsonData));
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new SeattleBluesDanceCollectiveRipper();
        const result = await ripper.rip(makeRipper());

        expect(mockFetch).toHaveBeenCalledTimes(6); // LOOKAHEAD_MONTHS
        const requestedUrl = mockFetch.mock.calls[0][0] as string;
        expect(requestedUrl).toContain('https://seattlebluesdance.com/events.json?');
        expect(requestedUrl).toContain('month=9');
        expect(requestedUrl).toContain('year=2026');

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('events');
        expect(result[0].events.length).toBe(jsonData.length);
        expect(result[0].errors).toEqual([]);
    });

    test('requests distinct month/year per lookahead step', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-20T12:00:00-08:00'));

        const mockFetch = vi.fn().mockImplementation(() => jsonResponse([]));
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new SeattleBluesDanceCollectiveRipper();
        await ripper.rip(makeRipper());

        const requestedMonths = mockFetch.mock.calls.map((call) => new URL(call[0] as string).searchParams.get('month'));
        expect(requestedMonths).toEqual(['11', '12', '1', '2', '3', '4']);
    });

    test('throws when the API returns a non-OK status', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new SeattleBluesDanceCollectiveRipper();
        await expect(ripper.rip(makeRipper())).rejects.toThrow(/503/);
    });

    test('throws when no calendars are configured', async () => {
        const ripper = new SeattleBluesDanceCollectiveRipper();
        await expect(ripper.rip(makeRipper({ calendars: [] }))).rejects.toThrow(/No calendars configured/);
    });
});
