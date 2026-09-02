import { describe, it, expect, vi } from 'vitest';
import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SeattleHumaneRipper from './ripper.js';
import { RipperCalendarEvent, UncertaintyError } from '../../lib/config/schema.js';
import { ZonedDateTime, ZoneId, LocalDate } from '@js-joda/core';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: 'seattle-humane',
            url: new URL('https://www.seattlehumane.org/ways-to-give/events/'),
            tags: ['Community'],
            geo: null,
            disabled: false,
            proxy: false,
            calendars: [{
                name: 'seattle-humane',
                friendlyname: 'Seattle Humane',
                timezone: TIMEZONE,
            }],
            ...overrides,
        },
    } as any;
}

// A fixed "now" so date-relative assertions (resolveYear) don't depend on
// the real wall-clock date. Matches the sample page's snapshot date.
const NOW = ZonedDateTime.of(LocalDate.of(2026, 9, 2).atTime(0, 0), TIMEZONE);

describe('SeattleHumaneRipper', () => {
    describe('rip()', () => {
        it('parses the sample page into dated events, skipping non-dated content', async () => {
            const ripper = new SeattleHumaneRipper();
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(loadSampleHtml()),
            }));

            const result = await ripper.rip(makeRipper());

            expect(result).toHaveLength(1);
            // 4 dated events (PAX West, Cider Summit, Together for Pets
            // Luncheon, Sea-Meow Con) — "Summer Camp" has no date line and
            // is skipped, not reported as an error.
            expect(result[0].events.map(e => e.summary).sort()).toEqual([
                'Cider Summit',
                'PAX West',
                'Sea-Meow Con',
                'Together for Pets Luncheon',
            ]);

            vi.unstubAllGlobals();
        });

        it('throws when the fetch fails', async () => {
            const ripper = new SeattleHumaneRipper();
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }));

            await expect(ripper.rip(makeRipper())).rejects.toThrow('HTTP 403');

            vi.unstubAllGlobals();
        });
    });

    describe('parseAccordionItems', () => {
        it('extracts every accordion item, including the non-dated one', () => {
            const ripper = new SeattleHumaneRipper();
            const html = parse(loadSampleHtml());
            const items = ripper.parseAccordionItems(html);

            expect(items.map(i => i.title)).toEqual([
                'Summer Camp',
                'PAX West',
                'Cider Summit',
                'Together for Pets Luncheon',
                'Sea-Meow Con',
            ]);
        });

        it('captures the learn-more link for a dated item', () => {
            const ripper = new SeattleHumaneRipper();
            const html = parse(loadSampleHtml());
            const items = ripper.parseAccordionItems(html);
            const paxWest = items.find(i => i.title === 'PAX West');

            expect(paxWest?.url).toBe('https://west.paxsite.com/en-us.html');
        });
    });

    describe('hasDateLine', () => {
        const ripper = new SeattleHumaneRipper();

        it('is false for a plain descriptive blurb', () => {
            expect(ripper.hasDateLine('Camps run Monday to Thursday, 8:30 a.m.-3:30 p.m.<br />Tuition is $695.')).toBe(false);
        });

        it('is true for a line with a date and a time separator', () => {
            expect(ripper.hasDateLine('September 25 | 11a.m.-1 p.m.<br />Hyatt Regency Bellevue')).toBe(true);
        });
    });

    describe('parseDateLine', () => {
        const ripper = new SeattleHumaneRipper();

        it('parses a day-range line', () => {
            expect(ripper.parseDateLine('September 4-7 | 10 a.m. - 6 p.m.')).toEqual({
                month: 9, day: 4, endDay: 7, startTimeText: '10 a.m.', endTimeText: '6 p.m.',
            });
        });

        it('parses a weekday-prefixed single-day line', () => {
            expect(ripper.parseDateLine('Friday, September 11 | 3 - 8 p.m.')).toEqual({
                month: 9, day: 11, endDay: undefined, startTimeText: '3', endTimeText: '8 p.m.',
            });
        });

        it('parses an "&"-joined day-list line', () => {
            expect(ripper.parseDateLine('November 7 & 8 | 10 a.m. - 5 p.m.')).toEqual({
                month: 11, day: 7, endDay: 8, startTimeText: '10 a.m.', endTimeText: '5 p.m.',
            });
        });

        it('parses a single-day line with no space before the meridiem', () => {
            expect(ripper.parseDateLine('September 25 | 11a.m.-1 p.m.')).toEqual({
                month: 9, day: 25, endDay: undefined, startTimeText: '11a.m.', endTimeText: '1 p.m.',
            });
        });

        it('returns null for a location line', () => {
            expect(ripper.parseDateLine('Washington State Convention Center, Arch and Summit Buildings')).toBeNull();
        });

        it('returns null for an unrecognized month name', () => {
            expect(ripper.parseDateLine('Whenever 4-7 | 10 a.m. - 6 p.m.')).toBeNull();
        });
    });

    describe('parseTime', () => {
        const ripper = new SeattleHumaneRipper();

        it('parses an explicit am time', () => {
            expect(ripper.parseTime('10 a.m.', undefined)).toEqual({ hour: 10, minute: 0, meridiem: 'am' });
        });

        it('parses an explicit pm time with no space before the meridiem', () => {
            expect(ripper.parseTime('11a.m.', undefined)).toEqual({ hour: 11, minute: 0, meridiem: 'am' });
        });

        it('inherits the meridiem when none is printed', () => {
            expect(ripper.parseTime('3', 'pm')).toEqual({ hour: 15, minute: 0, meridiem: 'pm' });
        });

        it('treats bare 12 with an inherited pm meridiem as noon', () => {
            expect(ripper.parseTime('12', 'pm')).toEqual({ hour: 12, minute: 0, meridiem: 'pm' });
        });

        it('returns null for unparseable text', () => {
            expect(ripper.parseTime('mid-afternoon', undefined)).toBeNull();
        });
    });

    describe('extractMeridiem', () => {
        const ripper = new SeattleHumaneRipper();

        it('reads a trailing pm marker', () => {
            expect(ripper.extractMeridiem('8 p.m.')).toBe('pm');
        });

        it('returns undefined when no marker is present', () => {
            expect(ripper.extractMeridiem('3')).toBeUndefined();
        });
    });

    describe('resolveYear', () => {
        const ripper = new SeattleHumaneRipper();

        it('uses the current year for a date later this year', () => {
            expect(ripper.resolveYear(11, 7, NOW)).toBe(2026);
        });

        it('rolls over to next year for a date already past this year', () => {
            expect(ripper.resolveYear(6, 28, NOW)).toBe(2027);
        });
    });

    describe('parseItem', () => {
        const ripper = new SeattleHumaneRipper();

        it('parses a single-line day-range event with a confident duration', () => {
            const results = ripper.parseItem({
                title: 'PAX West',
                detailsHtml: 'September 4-7 | 10 a.m. - 6 p.m.<br />Washington State Convention Center, Arch and Summit Buildings',
                url: 'https://west.paxsite.com/en-us.html',
            }, NOW);

            expect(results).toHaveLength(1);
            const event = results[0] as RipperCalendarEvent;
            expect(event.id).toBe('seattle-humane-pax-west-2026-09-04');
            expect(event.date.hour()).toBe(10);
            expect(event.date.dayOfMonth()).toBe(4);
            // Sept 4 10:00am -> Sept 7 6:00pm.
            expect(event.duration.toMinutes()).toBe(3 * 24 * 60 + 8 * 60);
            expect(event.location).toBe('Washington State Convention Center, Arch and Summit Buildings, WA');
            expect(event.url).toBe('https://west.paxsite.com/en-us.html');
        });

        it('parses a two-line multi-day event, taking the start from the first line and the end from the last', () => {
            const results = ripper.parseItem({
                title: 'Cider Summit',
                detailsHtml: 'Friday, September 11 | 3 - 8 p.m.<br />Saturday, September 12 | 12 - 5 p.m.<br />South Lake Union Discovery Center Lawn',
            }, NOW);

            const event = results[0] as RipperCalendarEvent;
            expect(event.date.dayOfMonth()).toBe(11);
            expect(event.date.hour()).toBe(15);
            expect(event.location).toBe('South Lake Union Discovery Center Lawn, WA');
        });

        it('parses a single-day event', () => {
            const results = ripper.parseItem({
                title: 'Together for Pets Luncheon',
                detailsHtml: 'September 25 | 11a.m.-1 p.m.<br />Hyatt Regency Bellevue',
            }, NOW);

            const event = results[0] as RipperCalendarEvent;
            expect(event.date.hour()).toBe(11);
            expect(event.duration.toMinutes()).toBe(120);
            expect(event.location).toBe('Hyatt Regency Bellevue, WA');
        });

        it('rolls a past month over to next year', () => {
            const results = ripper.parseItem({
                title: 'Clear the Shelters',
                detailsHtml: 'June 28 | 10 a.m. - 2 p.m.<br />Seattle Humane, 13212 SE Eastgate Way, Bellevue, WA',
            }, NOW);

            const event = results[0] as RipperCalendarEvent;
            expect(event.date.year()).toBe(2027);
        });

        it('returns a ParseError when no date line is present', () => {
            const results = ripper.parseItem({ title: 'Summer Camp', detailsHtml: 'Tuition is $695.' }, NOW);

            expect(results).toHaveLength(1);
            expect('type' in results[0] && results[0].type).toBe('ParseError');
        });

        it('flags an unresolvable end time as an uncertain duration', () => {
            const results = ripper.parseItem({
                title: 'Mystery Event',
                detailsHtml: 'November 7 & 8 | 10 a.m. - evening<br />Seattle Center Exhibition Hall',
            }, NOW);

            expect(results).toHaveLength(2);
            const event = results[0] as RipperCalendarEvent;
            expect(event.date.hour()).toBe(10);
            const uncertainty = results[1] as UncertaintyError;
            expect(uncertainty.type).toBe('Uncertainty');
            expect(uncertainty.unknownFields).toEqual(['duration']);
        });

        it('flags a fully unrecognized time as both startTime and duration uncertain', () => {
            const results = ripper.parseItem({
                title: 'Mystery Event',
                detailsHtml: 'November 7 & 8 | evening<br />Seattle Center Exhibition Hall',
            }, NOW);

            expect(results).toHaveLength(2);
            const event = results[0] as RipperCalendarEvent;
            expect(event.date.hour()).toBe(10);
            const uncertainty = results[1] as UncertaintyError;
            expect(uncertainty.unknownFields).toEqual(['startTime', 'duration']);
        });
    });

    describe('normalizeLocation', () => {
        const ripper = new SeattleHumaneRipper();

        it('leaves a location that already names WA unchanged', () => {
            expect(ripper.normalizeLocation('Hyatt Regency Bellevue, WA')).toBe('Hyatt Regency Bellevue, WA');
        });

        it('appends WA when absent', () => {
            expect(ripper.normalizeLocation('Seattle Center Exhibition Hall')).toBe('Seattle Center Exhibition Hall, WA');
        });
    });
});
