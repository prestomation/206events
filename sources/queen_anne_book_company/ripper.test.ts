import { describe, it, expect, vi } from 'vitest';
import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QueenAnneBookCompanyRipper from './ripper.js';
import { RipperCalendarEvent, UncertaintyError } from '../../lib/config/schema.js';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: 'queen-anne-book-company',
            url: new URL('https://qabookco.com/events'),
            tags: ['Books', 'QueenAnne'],
            geo: null,
            disabled: false,
            proxy: false,
            calendars: [{
                name: 'all-events',
                friendlyname: 'Queen Anne Book Company',
                timezone: TIMEZONE,
            }],
            ...overrides,
        },
    } as any;
}

// A minimal card matching the markup parseEventCards() expects, with a
// malformed href so parseCard() always yields a single ParseError — lets
// pagination/merge/dedup tests avoid depending on the real wall-clock date.
function cardHtml(hrefSlug: string, title: string): string {
    return `
        <article class="event-list">
            <h3 class="event-list__title"><a href="${hrefSlug}">${title}</a></h3>
            <div class="event-list__details--item"><span class="event-list__details--label">Date: </span>1/1/2099</div>
            <div class="event-list__details--item"><span class="event-list__details--label">Time: </span>6:00pm</div>
        </article>`;
}

describe('QueenAnneBookCompanyRipper', () => {
    describe('rip()', () => {
        it('paginates across months and merges cards, skipping a failed later month', async () => {
            const ripper = new QueenAnneBookCompanyRipper();
            const now = ZonedDateTime.now(TIMEZONE);
            const month1 = now.toLocalDate().plusMonths(1);
            const month2 = now.toLocalDate().plusMonths(2);
            const expectedUrls = [
                'https://qabookco.com/events',
                `https://qabookco.com/events/${month1.year()}/${String(month1.monthValue()).padStart(2, '0')}`,
                `https://qabookco.com/events/${month2.year()}/${String(month2.monthValue()).padStart(2, '0')}`,
            ];

            const calledUrls: string[] = [];
            const mockFetch = vi.fn().mockImplementation((url: string) => {
                calledUrls.push(url);
                if (url === expectedUrls[0]) {
                    return Promise.resolve({ ok: true, text: () => Promise.resolve(cardHtml('/events/bad-format-1', 'Month 0 Event')) });
                }
                if (url === expectedUrls[1]) {
                    return Promise.resolve({ ok: true, text: () => Promise.resolve(cardHtml('/events/bad-format-2', 'Month 1 Event')) });
                }
                // Month 2 fails — should be skipped, not thrown.
                return Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' });
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await ripper.rip(makeRipper());

            expect(calledUrls).toEqual(expectedUrls);
            expect(result).toHaveLength(1);
            // Both malformed-href cards surface as ParseErrors — proof both
            // months' cards were parsed and merged, and the month-2 failure
            // didn't abort the whole rip.
            expect(result[0].errors).toHaveLength(2);
            expect(result[0].errors.map(e => (e as any).context)).toEqual(
                expect.arrayContaining(['Month 0 Event', 'Month 1 Event'])
            );

            vi.unstubAllGlobals();
        });

        it('dedupes a card that appears on more than one month page by href', async () => {
            const ripper = new QueenAnneBookCompanyRipper();
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(cardHtml('/events/bad-format-dup', 'Duplicate Event')),
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await ripper.rip(makeRipper());

            // Same href on every month page — only counted once.
            expect(result[0].errors).toHaveLength(1);

            vi.unstubAllGlobals();
        });

        it('throws when the current-month page itself fails', async () => {
            const ripper = new QueenAnneBookCompanyRipper();
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }));

            await expect(ripper.rip(makeRipper())).rejects.toThrow('HTTP 403');

            vi.unstubAllGlobals();
        });
    });


    describe('parseEventCards', () => {
        it('extracts all four sample events', () => {
            const ripper = new QueenAnneBookCompanyRipper();
            const html = parse(loadSampleHtml());
            const cards = ripper.parseEventCards(html);

            expect(cards).toHaveLength(4);
        });

        it('extracts title, href, date, and time for an in-store event', () => {
            const ripper = new QueenAnneBookCompanyRipper();
            const html = parse(loadSampleHtml());
            const cards = ripper.parseEventCards(html);
            const murderland = cards.find(c => c.href.includes('murderland'));

            expect(murderland).toBeDefined();
            expect(murderland?.title).toBe('QABC READS: "Murderland" by Caroline Fraser');
            expect(murderland?.dateText).toContain('7/7/2026');
            expect(murderland?.timeText).toBe('6:00pm');
            expect(murderland?.locationText).toContain('Queen Anne Book Company');
            expect(murderland?.locationText).toContain('Seattle, WA');
            expect(murderland?.imageUrl).toMatch(/^https:\/\/qabookco\.com\//);
        });

        it('extracts a time range for an off-site event', () => {
            const ripper = new QueenAnneBookCompanyRipper();
            const html = parse(loadSampleHtml());
            const cards = ripper.parseEventCards(html);
            const launch = cards.find(c => c.href.includes('launch-party'));

            expect(launch?.timeText).toBe('2:00pm - 4:00pm');
            expect(launch?.locationText).toBe('Pure Art Co., 1622 Queen Anne Ave N, United States');
        });

        it('extracts off-site locations without a printed city', () => {
            const ripper = new QueenAnneBookCompanyRipper();
            const html = parse(loadSampleHtml());
            const cards = ripper.parseEventCards(html);
            const brewery = cards.find(c => c.href.includes('helpline-run-home'));

            expect(brewery?.locationText).toBe('Old Stove Brewery Ship Canal, United States');
        });
    });

    describe('parseCard', () => {
        const ripper = new QueenAnneBookCompanyRipper();

        it('parses a single in-store time with a confident start but a guessed duration', () => {
            const results = ripper.parseCard({
                href: '/event/2026-07-07/qabc-reads-murderland-caroline-fraser',
                title: 'QABC READS: "Murderland" by Caroline Fraser',
                dateText: 'Tue, 7/7/2026',
                timeText: '6:00pm',
                locationText: 'Queen Anne Book Company, 1811 Queen Anne Ave N, Seattle, WA 98109-2850',
            });

            expect(results).toHaveLength(2);
            const event = results[0] as RipperCalendarEvent;
            expect(event.id).toBe('queen-anne-book-company-2026-07-07-qabc-reads-murderland-caroline-fraser');
            expect(event.date.hour()).toBe(18);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toMinutes()).toBe(60);
            expect(event.location).toBe('Queen Anne Book Company, 1811 Queen Anne Ave N, Seattle, WA 98109-2850');

            const uncertainty = results[1] as UncertaintyError;
            expect(uncertainty.type).toBe('Uncertainty');
            expect(uncertainty.unknownFields).toEqual(['duration']);
        });

        it('parses a time range into a confident event with an accurate duration and no uncertainty', () => {
            const results = ripper.parseCard({
                href: '/event/2026-07-18/launch-party-jessixa-bagleys-jazzy-witch-friend-fiasco-pure-art-co',
                title: "Launch Party for Jessixa Bagley's \"Jazzy The Witch in Friend Fiasco\" at Pure Art Co!",
                dateText: 'Sat, 7/18/2026',
                timeText: '2:00pm - 4:00pm',
                locationText: 'Pure Art Co., 1622 Queen Anne Ave N',
            });

            expect(results).toHaveLength(1);
            const event = results[0] as RipperCalendarEvent;
            expect(event.date.hour()).toBe(14);
            expect(event.duration.toMinutes()).toBe(120);
            expect(event.location).toBe('Pure Art Co., 1622 Queen Anne Ave N, Seattle, WA');
        });

        it('returns a ParseError for an unrecognized event URL', () => {
            const results = ripper.parseCard({
                href: '/events/some-other-format',
                title: 'Mystery Event',
                dateText: 'Sat, 7/18/2026',
                timeText: '2:00pm',
                locationText: '',
            });

            expect(results).toHaveLength(1);
            expect('type' in results[0] && results[0].type).toBe('ParseError');
        });

        it('returns a ParseError for an unparseable date', () => {
            const results = ripper.parseCard({
                href: '/event/2026-07-18/some-event',
                title: 'Some Event',
                dateText: 'sometime in July',
                timeText: '2:00pm',
                locationText: '',
            });

            expect(results).toHaveLength(1);
            expect('type' in results[0] && results[0].type).toBe('ParseError');
        });

        it('flags an unrecognized time as both startTime and duration uncertain', () => {
            const results = ripper.parseCard({
                href: '/event/2026-07-18/some-event',
                title: 'Some Event',
                dateText: 'Sat, 7/18/2026',
                timeText: 'evening',
                locationText: '',
            });

            expect(results).toHaveLength(2);
            const uncertainty = results[1] as UncertaintyError;
            expect(uncertainty.unknownFields).toEqual(['startTime', 'duration']);
        });

        it('omits location when none was parsed', () => {
            const results = ripper.parseCard({
                href: '/event/2026-07-18/some-event',
                title: 'Some Event',
                dateText: 'Sat, 7/18/2026',
                timeText: '2:00pm',
                locationText: '',
            });

            const event = results[0] as RipperCalendarEvent;
            expect(event.location).toBeUndefined();
        });
    });

    describe('normalizeLocation', () => {
        const ripper = new QueenAnneBookCompanyRipper();

        it('leaves a Seattle address unchanged', () => {
            expect(ripper.normalizeLocation('Queen Anne Book Company, 1811 Queen Anne Ave N, Seattle, WA 98109-2850'))
                .toBe('Queen Anne Book Company, 1811 Queen Anne Ave N, Seattle, WA 98109-2850');
        });

        it('appends Seattle, WA when no city is present', () => {
            expect(ripper.normalizeLocation('Old Stove Brewery Ship Canal')).toBe('Old Stove Brewery Ship Canal, Seattle, WA');
        });

        it('strips a trailing "United States" without a city and appends Seattle, WA', () => {
            expect(ripper.normalizeLocation('Pure Art Co., 1622 Queen Anne Ave N, United States'))
                .toBe('Pure Art Co., 1622 Queen Anne Ave N, Seattle, WA');
        });
    });

    describe('parseTime', () => {
        const ripper = new QueenAnneBookCompanyRipper();

        it('parses a single pm time with a guessed duration', () => {
            const result = ripper.parseTime('6:00pm');
            expect(result).toEqual({ hour: 18, minute: 0, durationMinutes: 60, startTimeGuessed: false, durationGuessed: true });
        });

        it('parses a single am time', () => {
            const result = ripper.parseTime('10:00am');
            expect(result).toEqual({ hour: 10, minute: 0, durationMinutes: 60, startTimeGuessed: false, durationGuessed: true });
        });

        it('parses a pm-pm range with a confident duration', () => {
            const result = ripper.parseTime('2:00pm - 4:00pm');
            expect(result).toEqual({ hour: 14, minute: 0, durationMinutes: 120, startTimeGuessed: false, durationGuessed: false });
        });

        it('falls back to a placeholder for unrecognized text', () => {
            const result = ripper.parseTime('sometime in the afternoon');
            expect(result.startTimeGuessed).toBe(true);
            expect(result.durationGuessed).toBe(true);
        });

        it('falls back to a guessed duration when the range end is before the start (e.g. crosses midnight)', () => {
            const result = ripper.parseTime('11:00pm - 12:30am');
            expect(result.hour).toBe(23);
            expect(result.minute).toBe(0);
            expect(result.startTimeGuessed).toBe(false);
            expect(result.durationGuessed).toBe(true);
            expect(result.durationMinutes).toBe(60);
        });
    });
});
