import { describe, it, expect, vi, afterEach } from 'vitest';
import { ZonedDateTime, ZoneId, LocalDateTime } from '@js-joda/core';
import { Ripper, RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import OrcaRunningRipper, { parseRace, parseRunSignUpDateTime, parseRaceFee, currentFee } from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

// The fixture's future events are dated 9/19/2026 and 9/20/2026, so "now" is
// pinned before both.
const now = ZonedDateTime.of(LocalDateTime.of(2026, 9, 1, 0, 0), TIMEZONE);

function loadSample() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('parseRunSignUpDateTime', () => {
    it('parses single-digit month/day/hour', () => {
        const result = parseRunSignUpDateTime('9/1/2026 8:30');
        expect(result?.toString()).toBe('2026-09-01T08:30');
    });

    it('parses zero-padded values', () => {
        const result = parseRunSignUpDateTime('12/05/2026 17:00');
        expect(result?.toString()).toBe('2026-12-05T17:00');
    });

    it('returns undefined for unparseable input', () => {
        expect(parseRunSignUpDateTime('not a date')).toBeUndefined();
        expect(parseRunSignUpDateTime(undefined)).toBeUndefined();
    });
});

describe('parseRaceFee', () => {
    it('strips currency formatting', () => {
        expect(parseRaceFee('$81.00')).toBe(81);
    });

    it('returns undefined for missing/unparseable fees', () => {
        expect(parseRaceFee(undefined)).toBeUndefined();
        expect(parseRaceFee('Free')).toBeUndefined();
    });
});

describe('currentFee', () => {
    const periods = [
        { registration_opens: '1/1/2026 00:00', registration_closes: '2/1/2026 00:00', race_fee: '$50.00' },
        { registration_opens: '2/1/2026 00:00', registration_closes: '9/1/2026 00:00', race_fee: '$60.00' },
        { registration_opens: '9/1/2026 00:00', registration_closes: '9/19/2026 00:00', race_fee: '$70.00' },
    ];

    it('picks the currently-open window', () => {
        const nowLocal = LocalDateTime.of(2026, 3, 1, 0, 0);
        expect(currentFee(periods, nowLocal)).toBe(60);
    });

    it('falls back to the soonest future window when none is open yet', () => {
        const nowLocal = LocalDateTime.of(2025, 12, 1, 0, 0);
        expect(currentFee(periods, nowLocal)).toBe(50);
    });

    it('falls back to the last window once registration has fully closed', () => {
        const nowLocal = LocalDateTime.of(2026, 10, 1, 0, 0);
        expect(currentFee(periods, nowLocal)).toBe(70);
    });

    it('returns undefined with no periods', () => {
        expect(currentFee(undefined, LocalDateTime.of(2026, 1, 1, 0, 0))).toBeUndefined();
        expect(currentFee([], LocalDateTime.of(2026, 1, 1, 0, 0))).toBeUndefined();
    });
});

describe('parseRace', () => {
    it('produces one event per future race day from the real API sample', () => {
        const sample = loadSample();
        const results = parseRace(33861, sample, now);
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const errors = results.filter((r): r is RipperError => 'type' in r);

        expect(errors).toHaveLength(0);
        // Saturday half + Sunday 8-miler are on different dates -> 2 grouped events
        expect(events).toHaveLength(2);

        const saturday = events.find(e => e.date.toLocalDate().toString() === '2026-09-19');
        expect(saturday).toBeDefined();
        expect(saturday!.summary).toBe('The Brooks Orca Half Marathon presented by REI');
        expect(saturday!.location).toContain('1222 Harbor Ave SW');
        expect(saturday!.url).toBe('https://www.orcarunning.com/orca-half/');
        expect(saturday!.id).toBe('orca-running-33861-2026-09-19');
        // 07:20 start from the fixture
        expect(saturday!.date.hour()).toBe(7);
        expect(saturday!.date.minute()).toBe(20);
    });

    it('drops past events and keeps only future ones', () => {
        const sample = loadSample();
        const results = parseRace(33861, sample, now);
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        for (const e of events) {
            expect(e.date.isAfter(now)).toBe(true);
        }
    });

    it('groups multiple same-day heats into one event with a combined description and cost range', () => {
        const response = {
            race: {
                name: 'Test Pumpkin Run',
                url: 'https://runsignup.com/Race/WA/Seattle/TestPumpkin',
                external_race_url: null,
                address: { street: '123 Main St', city: 'Seattle', state: 'WA', zipcode: '98101' },
                events: [
                    {
                        name: '5K',
                        start_time: '10/11/2026 09:00',
                        registration_periods: [
                            { registration_opens: '1/1/2026 00:00', registration_closes: '12/31/2026 00:00', race_fee: '$34.00' },
                        ],
                    },
                    {
                        name: '10K',
                        start_time: '10/11/2026 09:15',
                        registration_periods: [
                            { registration_opens: '1/1/2026 00:00', registration_closes: '12/31/2026 00:00', race_fee: '$44.00' },
                        ],
                    },
                ],
            },
        };

        const results = parseRace(184601, response, now);
        expect(results).toHaveLength(1);
        const event = results[0] as RipperCalendarEvent;
        expect(event.date.hour()).toBe(9);
        expect(event.date.minute()).toBe(0);
        expect(event.description).toBe('Includes: 5K, 10K');
        expect(event.cost).toEqual({ min: 34, max: 44 });
        expect(event.url).toBe('https://runsignup.com/Race/WA/Seattle/TestPumpkin');
    });

    it('falls back to a default duration when no end_time is present', () => {
        const response = {
            race: {
                name: 'No End Time Race',
                url: 'https://runsignup.com/Race/WA/Seattle/NoEndTime',
                events: [{ name: '5K', start_time: '10/11/2026 09:00' }],
            },
        };
        const results = parseRace(1, response, now);
        const event = results[0] as RipperCalendarEvent;
        expect(event.duration.toHours()).toBe(3);
        expect(event.cost).toBeUndefined();
    });

    it('uses the provided end_time span when present', () => {
        const response = {
            race: {
                name: 'Timed Race',
                url: 'https://runsignup.com/Race/WA/Seattle/Timed',
                events: [{ name: 'Main', start_time: '12/5/2026 17:00', end_time: '12/5/2026 19:00' }],
            },
        };
        const results = parseRace(1, response, now);
        const event = results[0] as RipperCalendarEvent;
        expect(event.duration.toHours()).toBe(2);
    });

    it('returns a ParseError when the API response has no race object', () => {
        const results = parseRace(999, {}, now);
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ type: 'ParseError' });
    });

    it('returns no events (not an error) when a race has nothing upcoming', () => {
        const response = {
            race: {
                name: 'Dormant Race',
                url: 'https://runsignup.com/Race/WA/Seattle/Dormant',
                events: [{ name: '5K', start_time: '1/1/2020 09:00' }],
            },
        };
        expect(parseRace(1, response, now)).toEqual([]);
    });
});

describe('OrcaRunningRipper.rip', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function mockRipper(config?: Record<string, unknown>): Ripper {
        return {
            config: {
                name: 'orca_running',
                url: 'https://www.orcarunning.com/races/',
                proxy: false,
                calendars: [
                    {
                        name: 'orca-running',
                        friendlyname: 'Orca Running (Seattle Races)',
                        timezone: 'America/Los_Angeles',
                        config,
                    },
                ],
            } as any,
        } as Ripper;
    }

    it('throws when raceIds is missing from config', async () => {
        await expect(new OrcaRunningRipper().rip(mockRipper(undefined))).rejects.toThrow(/raceIds/);
    });

    it('throws when raceIds is present but empty or malformed', async () => {
        await expect(new OrcaRunningRipper().rip(mockRipper({ raceIds: [] }))).rejects.toThrow(/raceIds/);
        await expect(new OrcaRunningRipper().rip(mockRipper({ raceIds: ['33861'] }))).rejects.toThrow(/raceIds/);
    });

    it('fetches each configured race and returns a ParseError for one that 404s alongside a successful one', async () => {
        // A far-future date so this test doesn't start failing once real
        // wall-clock time (used internally by rip()) catches up to it.
        const okResponse = {
            race: {
                name: 'Future Fun Run',
                url: 'https://runsignup.com/Race/WA/Seattle/FutureFunRun',
                events: [{ name: '5K', start_time: '1/1/2099 09:00', end_time: '1/1/2099 11:00' }],
            },
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(okResponse) })
            .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
        vi.stubGlobal('fetch', fetchMock);

        const calendars = await new OrcaRunningRipper().rip(mockRipper({ raceIds: [1, 999999] }));
        const cal = calendars[0];

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(cal.events).toHaveLength(1);
        expect(cal.events[0].summary).toBe('Future Fun Run');
        expect(cal.errors).toHaveLength(1);
        expect(cal.errors[0]).toMatchObject({ type: 'ParseError', context: '999999' });
    });
});
