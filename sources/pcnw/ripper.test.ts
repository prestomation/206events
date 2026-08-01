import { describe, expect, test, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZonedDateTime, ZoneId, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import PCNWRipper, { stripHtml, parseEventDate, parseCost, parseEventPost, extractCandidateDates } from './ripper.js';
import { RipperCalendarEvent, UncertaintyError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

// Fixed reference point well before any date in the fixtures, so tests that
// exercise real captured fixture posts aren't sensitive to the real wall clock.
const FAR_PAST_NOW = ZonedDateTime.of(LocalDateTime.of(2000, 1, 1, 0, 0), TIMEZONE);

function loadSampleData(): any[] {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

function loadSampleDataPage2(): any[] {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data-page2.json'), 'utf8'));
}

function findPost(id: number) {
    const post = loadSampleData().find((p: any) => p.id === id);
    if (!post) throw new Error(`fixture post ${id} not found`);
    return post;
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: 'pcnw',
            url: new URL('https://pcnw.org/wp-json/wp/v2/ajde_events'),
            tags: ['Arts', 'First Hill'],
            geo: null,
            disabled: false,
            proxy: false,
            calendars: [{
                name: 'pcnw',
                friendlyname: 'Photographic Center Northwest',
                timezone: TIMEZONE,
            }],
            ...overrides,
        },
    } as any;
}

describe('stripHtml', () => {
    test('strips tags and decodes entities', () => {
        expect(stripHtml('<p>Photo &amp; Wine <strong>Pairing</strong></p>')).toBe('Photo & Wine Pairing');
    });

    test('collapses whitespace', () => {
        expect(stripHtml('<p>Line one</p>\n\n<p>Line   two</p>')).toBe('Line one Line two');
    });

    test('cleans up a malformed closing tag missing its "<" (real source data)', () => {
        expect(stripHtml('<strong>$116/strong></strong>')).toBe('$116');
    });
});

describe('parseEventDate', () => {
    test('parses a single date with a single time (no range)', () => {
        const result = parseEventDate('Curated Photography & Wine Pairing October 2, 2026 | Friday 6pm $100', FAR_PAST_NOW);
        expect(result).toEqual({
            month: 10, day: 2, year: 2026,
            hour: 18, minute: 0,
            endHour: undefined, endMinute: undefined,
            timeConfident: true, durationConfident: false,
        });
    });

    test('parses "on <date> at <time>" phrasing', () => {
        const result = parseEventDate('Sunday, September 19, 2026 at 3pm Free w/ RSVP', FAR_PAST_NOW);
        expect(result?.month).toBe(9);
        expect(result?.day).toBe(19);
        expect(result?.year).toBe(2026);
        expect(result?.hour).toBe(15);
        expect(result?.timeConfident).toBe(true);
        expect(result?.durationConfident).toBe(false);
    });

    test('parses a same-month time range with an implicit start meridiem', () => {
        const result = parseEventDate('October 10 – 11, 2026 | Saturday & Sunday 12:30-5:30pm $425', FAR_PAST_NOW);
        expect(result?.month).toBe(10);
        expect(result?.day).toBe(10);
        expect(result?.hour).toBe(12);
        expect(result?.minute).toBe(30);
        expect(result?.endHour).toBe(17);
        expect(result?.endMinute).toBe(30);
        expect(result?.durationConfident).toBe(true);
    });

    test('parses a cross-month comma-and-ampersand date list, taking the first date when it is still upcoming', () => {
        const result = parseEventDate('September 27, October 4 & 11, 2026 | Sunday 12:30-4:30pm $355', FAR_PAST_NOW);
        expect(result?.month).toBe(9);
        expect(result?.day).toBe(27);
        expect(result?.year).toBe(2026);
        expect(result?.hour).toBe(12);
        expect(result?.minute).toBe(30);
        expect(result?.endHour).toBe(16);
        expect(result?.endMinute).toBe(30);
    });

    test('infers PM for a start hour before a PM end with no explicit meridiem', () => {
        const result = parseEventDate('September 28, October 5 & 12, 2026 | Monday 5-9pm (9/28) & 6-9pm (10/5 & 12) $330', FAR_PAST_NOW);
        expect(result?.hour).toBe(17);
        expect(result?.endHour).toBe(21);
        expect(result?.durationConfident).toBe(true);
    });

    test('returns date with placeholder time when no time is found nearby', () => {
        const result = parseEventDate('Fall Classes and Workshops kick-off on September 23, 2026 — register today! Fall Photography Classes Fall Photography Workshops', FAR_PAST_NOW);
        expect(result?.month).toBe(9);
        expect(result?.day).toBe(23);
        expect(result?.timeConfident).toBe(false);
        expect(result?.durationConfident).toBe(false);
    });

    test('defaults to the current year when no year appears near the date', () => {
        const now = ZonedDateTime.of(LocalDateTime.of(2026, 1, 1, 0, 0), TIMEZONE);
        const result = parseEventDate('The event kicks off with a 48-hour photo weekend on June 13-14th, where people around the globe make photographs on the same weekend.', now);
        expect(result?.month).toBe(6);
        expect(result?.day).toBe(13);
        expect(result?.year).toBe(2026);
    });

    test('does not pick up an unrelated year mentioned elsewhere in the body when none is near the date', () => {
        // Real-world case: "Friday, January 16th" with no year nearby, but the
        // body later references an unrelated "1990 Crossings exhibition" —
        // that must not be mistaken for the event's year.
        const now = ZonedDateTime.of(LocalDateTime.of(2026, 1, 1, 0, 0), TIMEZONE);
        const result = parseEventDate('Artist Talk: Susan Meiselas Friday, January 16th; talk will begin at 6pm. She discusses her 1990 Crossings exhibition.', now);
        expect(result?.year).toBe(2026);
    });

    test('returns null when no date at all is present', () => {
        expect(parseEventDate('Join us for an evening of community and creativity.', FAR_PAST_NOW)).toBeNull();
    });

    test('skips to the next upcoming session once earlier listed dates have passed', () => {
        // "now" is between the Nov 2 and Nov 9 sessions — the first two are
        // already past, so the Nov 9 session should be chosen instead of the
        // whole event silently disappearing.
        const now = ZonedDateTime.of(LocalDateTime.of(2026, 11, 5, 0, 0), TIMEZONE);
        const result = parseEventDate('Memory & Healing: Photographic Archives & Community Documentation November 2, 9, 16 & 30, 2026 | Monday 6-9pm $365', now);
        expect(result?.month).toBe(11);
        expect(result?.day).toBe(9);
    });

    test('falls back to the last session when every listed date has already passed', () => {
        const now = ZonedDateTime.of(LocalDateTime.of(2027, 1, 1, 0, 0), TIMEZONE);
        const result = parseEventDate('Memory & Healing: Photographic Archives & Community Documentation November 2, 9, 16 & 30, 2026 | Monday 6-9pm $365', now);
        expect(result?.month).toBe(11);
        expect(result?.day).toBe(30);
    });

    test('picks the second day of a weekend range once the first day has passed', () => {
        const now = ZonedDateTime.of(LocalDateTime.of(2026, 10, 11, 0, 0), TIMEZONE);
        const result = parseEventDate('October 10 – 11, 2026 | Saturday & Sunday 12:30-5:30pm $425', now);
        expect(result?.month).toBe(10);
        expect(result?.day).toBe(11);
    });

    test('picks the real next weekly session mid-series, not the last one', () => {
        // Regression test: a four-week Wednesday workshop "October 7 – 28,
        // 2026" with "now" between the 1st and 2nd sessions must publish the
        // 2nd session (Oct 14), not jump straight to the 4th (Oct 28).
        const now = ZonedDateTime.of(LocalDateTime.of(2026, 10, 15, 0, 0), TIMEZONE);
        const result = parseEventDate('October 7 – 28, 2026 | Wednesday 6-9pm $365', now);
        expect(result?.month).toBe(10);
        expect(result?.day).toBe(21);
    });
});

describe('extractCandidateDates', () => {
    test('carries the month forward onto bare day numbers in a comma list', () => {
        expect(extractCandidateDates('November 2, 9, 16 & 30', 2026)).toEqual([
            { month: 11, day: 2 }, { month: 11, day: 9 }, { month: 11, day: 16 }, { month: 11, day: 30 },
        ]);
    });

    test('switches month when a new month name appears mid-list', () => {
        expect(extractCandidateDates('September 27, October 4 & 11', 2026)).toEqual([
            { month: 9, day: 27 }, { month: 10, day: 4 }, { month: 10, day: 11 },
        ]);
    });

    test('handles a single date with no list', () => {
        expect(extractCandidateDates('October 2', 2026)).toEqual([{ month: 10, day: 2 }]);
    });

    test('matches a day number immediately followed by an ordinal suffix', () => {
        // "24th" has no word boundary between the digit and the letter — a
        // regression test for the crash this caused when the day number was
        // followed directly by an ordinal suffix with no separating space.
        expect(extractCandidateDates('January 24th ,', 2026)).toEqual([{ month: 1, day: 24 }]);
    });

    test('treats a short same-month range as a single continuous multi-day event', () => {
        expect(extractCandidateDates('October 10 – 11', 2026)).toEqual([
            { month: 10, day: 10 }, { month: 10, day: 11 },
        ]);
    });

    test('treats a short cross-month range as a single continuous multi-day event', () => {
        expect(extractCandidateDates('October 31 – November 1', 2026)).toEqual([
            { month: 10, day: 31 }, { month: 11, day: 1 },
        ]);
    });

    test('expands a long same-month range into weekly candidates', () => {
        // Real fixture case: "October 7 – 28, 2026 | Wednesday 6-9pm" — an
        // explicit four-week workshop. Every listed Wednesday must be a
        // candidate, not just the two endpoints, so a partway-through-series
        // "now" picks the real next session instead of jumping to the last one.
        expect(extractCandidateDates('October 7 – 28', 2026)).toEqual([
            { month: 10, day: 7 }, { month: 10, day: 14 }, { month: 10, day: 21 }, { month: 10, day: 28 },
        ]);
    });

    test('expands a long cross-month range into weekly candidates with correct month rollover', () => {
        // Real fixture case: "July 7 – August 4, 2026 | Tuesdays 6-9pm" — a
        // six-week workshop crossing a month boundary.
        expect(extractCandidateDates('July 7 – August 4', 2026)).toEqual([
            { month: 7, day: 7 }, { month: 7, day: 14 }, { month: 7, day: 21 }, { month: 7, day: 28 }, { month: 8, day: 4 },
        ]);
    });

    test('always includes the literal end date even when it does not land on a 7-day boundary', () => {
        // Real fixture case: "May 16 – 27, 2026 | Saturday ... & Sunday ..." —
        // a twice-weekly series where day 27 isn't reached by stepping 7 days
        // from day 16 (16, 23, 30 overshoots). The explicitly stated end date
        // must still be a selectable candidate.
        const candidates = extractCandidateDates('May 16 – 27', 2026);
        expect(candidates).toContainEqual({ month: 5, day: 16 });
        expect(candidates).toContainEqual({ month: 5, day: 23 });
        expect(candidates).toContainEqual({ month: 5, day: 27 });
    });
});

describe('parseCost', () => {
    test('extracts a dollar amount', () => {
        expect(parseCost('Curated Photography & Wine Pairing October 2, 2026 | Friday 6pm $100')).toEqual({ min: 100 });
    });

    test('extracts a decimal dollar amount', () => {
        expect(parseCost('Tickets are $12.50 at the door')).toEqual({ min: 12.5 });
    });

    test('extracts a thousands-separated dollar amount', () => {
        expect(parseCost('Tables start at $1,200 for the benefit auction')).toEqual({ min: 1200 });
    });

    test('treats "free" as a zero-cost event', () => {
        expect(parseCost('Sunday, September 19, 2026 at 3pm Free w/ RSVP')).toEqual({ min: 0 });
    });

    test('returns undefined when neither a price nor "free" is mentioned', () => {
        expect(parseCost('Friday, October 16, 2026 VENUE: Block 41')).toBeUndefined();
    });
});

describe('parseEventPost', () => {
    const eventOf = (results: any[]) => results.find((r): r is RipperCalendarEvent => 'date' in r);
    const uncertaintyOf = (results: any[]) => results.find((r): r is UncertaintyError => 'type' in r && r.type === 'Uncertainty');

    test('parses a single-time workshop with a guessed duration', () => {
        const post = findPost(95357); // Curated Photography & Wine Pairing
        const results = parseEventPost(post, FAR_PAST_NOW);

        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event!.id).toBe('pcnw-95357');
        expect(event!.summary).toBe('Curated Photography & Wine Pairing');
        expect(event!.date.monthValue()).toBe(10);
        expect(event!.date.dayOfMonth()).toBe(2);
        expect(event!.date.year()).toBe(2026);
        expect(event!.date.hour()).toBe(18);
        expect(event!.duration.toMinutes()).toBe(120);
        expect(event!.location).toBe('Photographic Center Northwest, 900 12th Ave, Seattle, WA 98122');
        expect(event!.cost).toEqual({ min: 100 });

        const uncertainty = uncertaintyOf(results);
        expect(uncertainty).toBeDefined();
        expect(uncertainty!.unknownFields).toEqual(['duration']);
    });

    test('parses a time-range workshop with a confident duration and no uncertainty', () => {
        const post = findPost(95076); // Working with Wet Plate Collodion in the Studio
        const results = parseEventPost(post, FAR_PAST_NOW);

        const event = eventOf(results);
        expect(event!.date.monthValue()).toBe(10);
        expect(event!.date.dayOfMonth()).toBe(10);
        expect(event!.date.hour()).toBe(12);
        expect(event!.date.minute()).toBe(30);
        expect(event!.duration.toMinutes()).toBe(300);
        expect(uncertaintyOf(results)).toBeUndefined();
    });

    test('flags a date with no nearby time as both startTime and duration uncertain', () => {
        const post = findPost(95096); // Fall Session Starts
        const results = parseEventPost(post, FAR_PAST_NOW);

        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event!.date.hour()).toBe(18); // DEFAULT_START_HOUR placeholder
        const uncertainty = uncertaintyOf(results);
        expect(uncertainty!.unknownFields).toEqual(['startTime', 'duration']);
    });

    test('drops a real post with no year nearby once its current-year-assumed date is in the past', () => {
        // Chase The Light Photo Weekend — no year anywhere near "June 13-14th".
        // Real production behavior: with "now" around when this ripper
        // actually runs, the current-year default lands the event in the
        // past, and it's dropped like any other past event rather than
        // becoming a ParseError.
        const post = findPost(81672);
        const now = ZonedDateTime.of(LocalDateTime.of(2026, 8, 1, 0, 0), TIMEZONE);
        const results = parseEventPost(post, now);

        expect(results).toHaveLength(0);
    });

    test('returns a ParseError when no month/day date pattern is found at all', () => {
        const post = {
            id: 999999,
            link: 'https://pcnw.org/events/mystery-event/',
            title: { rendered: 'Mystery Event' },
            content: { rendered: '<p>Join us for an evening of community and creativity.</p>' },
        };
        const results = parseEventPost(post, FAR_PAST_NOW);

        expect(results).toHaveLength(1);
        expect('type' in results[0] && results[0].type).toBe('ParseError');
    });

    test('marks a Free w/ RSVP event as zero-cost', () => {
        const post = findPost(95351); // ARTIST RECEPTION: Filter
        const results = parseEventPost(post, FAR_PAST_NOW);

        const event = eventOf(results);
        expect(event!.cost).toEqual({ min: 0 });
    });

    test('drops an event whose date has already passed relative to "now"', () => {
        const post = findPost(84928); // Fall City Photo Walk — June 14, 2026
        const now = ZonedDateTime.of(LocalDateTime.of(2026, 8, 1, 0, 0), TIMEZONE);

        const results = parseEventPost(post, now);
        expect(results).toHaveLength(0);
    });

    test('parses a date whose day is immediately followed by an ordinal suffix ("24th")', () => {
        const post = findPost(78874); // PCNW Member's Portfolio Walk — "January 24th , 2026"
        const results = parseEventPost(post, FAR_PAST_NOW);

        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event!.date.monthValue()).toBe(1);
        expect(event!.date.dayOfMonth()).toBe(24);
        expect(event!.date.year()).toBe(2026);
    });

    test('picks the real next weekly session for a real multi-week workshop fixture, not the last one', () => {
        const post = findPost(95070); // Studio Fashion Photography & Retouching — "October 7 – 28, 2026 | Wednesday"
        const now = ZonedDateTime.of(LocalDateTime.of(2026, 10, 15, 0, 0), TIMEZONE);
        const results = parseEventPost(post, now);

        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event!.date.monthValue()).toBe(10);
        expect(event!.date.dayOfMonth()).toBe(21);
    });

    test('extracts the featured media URL as imageUrl when present', () => {
        const post = findPost(95357);
        const results = parseEventPost(post, FAR_PAST_NOW);
        const event = eventOf(results);
        if (post._embedded?.['wp:featuredmedia']?.[0]?.source_url) {
            expect(event!.imageUrl).toBe(post._embedded['wp:featuredmedia'][0].source_url);
        }
    });
});

describe('PCNWRipper.rip', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('paginates, dedupes, and skips CLOSED notices', async () => {
        const page1 = loadSampleData();
        const page2 = loadSampleDataPage2();
        const calledUrls: string[] = [];

        const mockFetch = vi.fn().mockImplementation((url: string) => {
            calledUrls.push(url);
            if (url.includes('&page=1&')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(page1) });
            }
            if (url.includes('&page=2&')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(page2) });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        });
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new PCNWRipper();
        const result = await ripper.rip(makeRipper());

        expect(calledUrls).toHaveLength(2);
        expect(calledUrls[0]).toContain('page=1');
        expect(calledUrls[1]).toContain('page=2');
        expect(result).toHaveLength(1);

        // CLOSED: notices never produce an event or an error.
        const summaries = result[0].events.map(e => e.summary);
        expect(summaries).not.toContain(expect.stringMatching(/^CLOSED:/));

        // Every returned event landed in the future relative to real "now" —
        // some 2026 fixture dates will be in the past by the time this runs,
        // which is exactly what the isBefore(now) filter is for.
        const now = ZonedDateTime.now(TIMEZONE);
        for (const event of result[0].events) {
            expect(event.date.isBefore(now)).toBe(false);
        }
    });

    test('stops paginating and records an error when a page fetch fails', async () => {
        const page1 = loadSampleData();
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('&page=1&')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(page1) });
            }
            return Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' });
        });
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new PCNWRipper();
        const result = await ripper.rip(makeRipper());

        expect(result[0].errors.some(e => 'reason' in e && /page 2/.test(String((e as any).reason)))).toBe(true);
    });

    test('stops paginating and records an error when a page returns invalid JSON', async () => {
        const page1 = loadSampleData();
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('&page=1&')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(page1) });
            }
            return Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token')) });
        });
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new PCNWRipper();
        const result = await ripper.rip(makeRipper());

        expect(result[0].errors.some(e => 'reason' in e && /page 2 returned invalid JSON/.test(String((e as any).reason)))).toBe(true);
    });

    test('dedupes a post id that appears on more than one page', async () => {
        const page1 = loadSampleData().slice(0, 5);
        const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(page1) });
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new PCNWRipper();
        const result = await ripper.rip(makeRipper());

        const ids = result[0].events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
