import { afterEach, describe, expect, test, vi } from 'vitest';
import { Period } from '@js-joda/core';
import DiscoverSLURipper, { parseEventsFromHtml, extractTimeFromMeta, extractWeekdayFromEventPage, findAmbiguousWeeklyCandidates } from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { Ripper, RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

function loadSampleAjaxResponse() {
    const jsonPath = path.join(__dirname, 'sample-ajax-response.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return parse(data.events_html);
}

describe('Discover SLU Ripper', () => {
    test('parses events from sample HTML', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(6);
    });

    test('parses event titles correctly', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const titles = validEvents.map(e => e.summary);
        expect(titles).toContain('Seattle REI Run Club - Party Pace');
        expect(titles).toContain('Trivia Nights at King Leroy');
        expect(titles).toContain('Guest Chef Night at FareStart');
        expect(titles).toContain('Seattle JazzED Downbeat');
        expect(titles).toContain('Bloodworks NW Blood Drive');
        expect(titles).toContain('History Café: Seattle Mystic');
    });

    test('uses day heading for event date (not meta text)', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // REI Run Club is under "Sunday March 15, 2026" heading; its meta says "Every Sun, Feb 1 - May 31"
        // The date should come from the heading (March 15), not the series start (Feb 1)
        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun).toBeDefined();
        expect(reiRun!.date.year()).toBe(2026);
        expect(reiRun!.date.monthValue()).toBe(3);
        expect(reiRun!.date.dayOfMonth()).toBe(15);
        expect(reiRun!.date.hour()).toBe(10); // "10 am - 12 pm" → 10
        expect(reiRun!.date.minute()).toBe(0);

        const trivia = validEvents.find(e => e.summary.includes('Trivia'));
        expect(trivia).toBeDefined();
        expect(trivia!.date.dayOfMonth()).toBe(16); // heading: Monday March 16
        expect(trivia!.date.hour()).toBe(18); // "6:30 pm" → 18
        expect(trivia!.date.minute()).toBe(30);

        const guestChef = validEvents.find(e => e.summary.includes('FareStart'));
        expect(guestChef).toBeDefined();
        expect(guestChef!.date.dayOfMonth()).toBe(18);
        expect(guestChef!.date.hour()).toBe(17); // "5 - 7 pm" → 17
    });

    test('parses locations from feature__meta--location', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.location).toBe('REI, South Lake Union, Seattle, WA');

        const mohai = validEvents.find(e => e.summary.includes('History Café'));
        expect(mohai!.location).toBe('MOHAI, South Lake Union, Seattle, WA');
    });

    test('parses event URLs correctly', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.url).toBe('https://www.discoverslu.com/events/rei-run-2026/');

        // Relative URL should be resolved to absolute
        const historyCafe = validEvents.find(e => e.summary.includes('History Café'));
        expect(historyCafe!.url).toBe('https://www.discoverslu.com/events/history-cafe-seattle/');
    });

    test('parses images when present', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.imageUrl).toContain('Run_Thumb');

        // Events without images should have undefined imageUrl
        const historyCafe = validEvents.find(e => e.summary.includes('History Café'));
        expect(historyCafe!.imageUrl).toBeUndefined();
    });

    test('deduplicates events across multiple parseEvents calls', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();

        const events1 = parseEventsFromHtml(html, seenEvents, 2026);
        const events2 = parseEventsFromHtml(html, seenEvents, 2026);

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1.length).toBe(6);
        expect(valid2.length).toBe(0); // All should be deduped
    });

    test('parses AJAX response HTML', () => {
        const html = loadSampleAjaxResponse();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(2);
        const titles = validEvents.map(e => e.summary);
        expect(titles).toContain('Paint Night: Crescent Beach');
        expect(titles).toContain('EASE Pop-Up');
    });

    test('combines initial page and AJAX events without duplicates', () => {
        const seenEvents = new Set<string>();

        const pageHtml = loadSampleHtml();
        const pageEvents = parseEventsFromHtml(pageHtml, seenEvents, 2026);

        const ajaxHtml = loadSampleAjaxResponse();
        const ajaxEvents = parseEventsFromHtml(ajaxHtml, seenEvents, 2026);

        const allValid = [
            ...pageEvents.filter(e => 'summary' in e),
            ...ajaxEvents.filter(e => 'summary' in e),
        ] as RipperCalendarEvent[];

        expect(allValid.length).toBe(8); // 6 from page + 2 from AJAX

        const ids = allValid.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('default duration is 2 hours', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.duration.toHours()).toBe(2);
        }
    });

    test('handles HTML with no events gracefully', () => {
        const html = parse('<div class="site-width"></div>');
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        expect(events.length).toBe(0);
    });

    test('skips a weekly recurring listing bucketed under the wrong weekday heading, using the correct one instead', () => {
        // Reproduces a real upstream bug: discoverslu.com's AJAX response bucketed
        // "2026 South Lake Union Farmers Market" ("Every Sat, ...") under a
        // "Sunday" day-heading at the start of the window, then again — correctly —
        // under "Saturday" later in the same document. Naive first-seen dedup would
        // lock in the wrong (Sunday) date; the fix must skip the mismatch and keep
        // the Saturday occurrence.
        const html = parse(`
            <div class="site-width"><h2 class="event-day">Sunday September 13, 2026</h2></div>
            <div class="site-width"><div class="grid"><div class="grid__item">
                <div class="feature full">
                    <div class="text"><h3><a href="/events/2026-slu-farmers-market-3/">2026 South Lake Union Farmers Market</a></h3>
                    <div class="feature__meta-container">
                        <div class="feature__meta feature__meta--date">Every Sat, Jun 6 - Nov 21, 2026 10 am - 3 pm</div>
                        <div class="feature__meta feature__meta--location">The Spheres</div>
                    </div></div>
                </div>
            </div></div></div>
            <div class="site-width"><h2 class="event-day">Saturday September 19, 2026</h2></div>
            <div class="site-width"><div class="grid"><div class="grid__item">
                <div class="feature full">
                    <div class="text"><h3><a href="/events/2026-slu-farmers-market-3/">2026 South Lake Union Farmers Market</a></h3>
                    <div class="feature__meta-container">
                        <div class="feature__meta feature__meta--date">Every Sat, Jun 6 - Nov 21, 2026 10 am - 3 pm</div>
                        <div class="feature__meta feature__meta--location">The Spheres</div>
                    </div></div>
                </div>
            </div></div></div>
        `);
        const seenEvents = new Set<string>();
        const weekdayMismatches = new Map<string, { title: string; url: string }>();
        const events = parseEventsFromHtml(html, seenEvents, 2026, weekdayMismatches);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
        expect(validEvents[0].date.dayOfMonth()).toBe(19);
        expect(validEvents[0].date.dayOfWeek().toString()).toBe('SATURDAY');
        // The correct occurrence resolved it, so nothing should be left pending.
        expect(weekdayMismatches.size).toBe(0);
    });

    test('records a weekday mismatch instead of publishing a wrong date, when no correct occurrence is found', () => {
        // Only the mis-bucketed "Sunday" occurrence exists in this document —
        // no matching "Saturday" heading anywhere. The event must not be
        // emitted with the wrong date; it should be tracked as an unresolved
        // mismatch so a caller (rip()) can report it instead of losing it.
        const html = parse(`
            <div class="site-width"><h2 class="event-day">Sunday September 13, 2026</h2></div>
            <div class="site-width"><div class="grid"><div class="grid__item">
                <div class="feature full">
                    <div class="text"><h3><a href="/events/2026-slu-farmers-market-3/">2026 South Lake Union Farmers Market</a></h3>
                    <div class="feature__meta-container">
                        <div class="feature__meta feature__meta--date">Every Sat, Jun 6 - Nov 21, 2026 10 am - 3 pm</div>
                        <div class="feature__meta feature__meta--location">The Spheres</div>
                    </div></div>
                </div>
            </div></div></div>
        `);
        const seenEvents = new Set<string>();
        const weekdayMismatches = new Map<string, { title: string; url: string }>();
        const events = parseEventsFromHtml(html, seenEvents, 2026, weekdayMismatches);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(0);
        expect(weekdayMismatches.size).toBe(1);
        const [[eventId, info]] = weekdayMismatches;
        expect(eventId).toBe('discover-slu-2026-slu-farmers-market-3');
        expect(info.title).toBe('2026 South Lake Union Farmers Market');
    });

    test('skips a "Weekly" listing (no named weekday) bucketed under a heading that mismatches its resolved weekday', () => {
        // Reproduces GitHub issue #1548: "2026 Pike Place Market: SLU Express
        // Farmers Market" gives meta text "Weekly June 4 - October 29, ..."
        // with no weekday name, so extractExpectedWeekday can't validate it.
        // The site buckets it under every day heading in the fetch window;
        // here it lands under Sunday even though a detail-page lookup
        // (simulated via weeklyPatternWeekdays) says it's really Thursday.
        const html = parse(`
            <div class="site-width"><h2 class="event-day">Sunday September 20, 2026</h2></div>
            <div class="site-width"><div class="grid"><div class="grid__item">
                <div class="feature full">
                    <div class="text"><h3><a href="/events/pike-place-express-2026-2-3/">2026 Pike Place Market: SLU Express Farmers Market</a></h3>
                    <div class="feature__meta-container">
                        <div class="feature__meta feature__meta--date">Weekly June 4 - October 29, 10 am - 3 pm</div>
                        <div class="feature__meta feature__meta--location">Path to Yes Plaza</div>
                    </div></div>
                </div>
            </div></div></div>
        `);
        const seenEvents = new Set<string>();
        const weekdayMismatches = new Map<string, { title: string; url: string }>();
        const weeklyPatternWeekdays = new Map<string, number>([["discover-slu-pike-place-express-2026-2-3", 4]]); // Thursday
        const events = parseEventsFromHtml(html, seenEvents, 2026, weekdayMismatches, weeklyPatternWeekdays);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(0);
        expect(weekdayMismatches.size).toBe(1);
    });

    test('accepts a "Weekly" listing bucketed under a heading matching its resolved weekday', () => {
        const html = parse(`
            <div class="site-width"><h2 class="event-day">Thursday September 24, 2026</h2></div>
            <div class="site-width"><div class="grid"><div class="grid__item">
                <div class="feature full">
                    <div class="text"><h3><a href="/events/pike-place-express-2026-2-3/">2026 Pike Place Market: SLU Express Farmers Market</a></h3>
                    <div class="feature__meta-container">
                        <div class="feature__meta feature__meta--date">Weekly June 4 - October 29, 10 am - 3 pm</div>
                        <div class="feature__meta feature__meta--location">Path to Yes Plaza</div>
                    </div></div>
                </div>
            </div></div></div>
        `);
        const seenEvents = new Set<string>();
        const weekdayMismatches = new Map<string, { title: string; url: string }>();
        const weeklyPatternWeekdays = new Map<string, number>([["discover-slu-pike-place-express-2026-2-3", 4]]); // Thursday
        const events = parseEventsFromHtml(html, seenEvents, 2026, weekdayMismatches, weeklyPatternWeekdays);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
        expect(validEvents[0].date.dayOfMonth()).toBe(24);
        expect(validEvents[0].date.dayOfWeek().toString()).toBe('THURSDAY');
        expect(weekdayMismatches.size).toBe(0);
    });

    test('falls back to trusting the heading for a "Weekly" listing when no resolved weekday is available', () => {
        // Without a resolved weekday (e.g. the detail-page lookup failed or
        // hasn't run), behavior must not regress to dropping the event.
        const html = parse(`
            <div class="site-width"><h2 class="event-day">Sunday September 20, 2026</h2></div>
            <div class="site-width"><div class="grid"><div class="grid__item">
                <div class="feature full">
                    <div class="text"><h3><a href="/events/pike-place-express-2026-2-3/">2026 Pike Place Market: SLU Express Farmers Market</a></h3>
                    <div class="feature__meta-container">
                        <div class="feature__meta feature__meta--date">Weekly June 4 - October 29, 10 am - 3 pm</div>
                        <div class="feature__meta feature__meta--location">Path to Yes Plaza</div>
                    </div></div>
                </div>
            </div></div></div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(1);
    });

    test('emits ParseError for card with no date source', () => {
        const html = parse(`
            <div class="site-width">
                <div class="grid"><div class="grid__item">
                    <div class="feature full">
                        <div class="text"><h3><a href="/events/test/">Test Event</a></h3></div>
                    </div>
                </div></div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);

        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(1);
        expect(errors[0].type).toBe('ParseError');
    });
});

describe('extractTimeFromMeta', () => {
    test('parses "H am/pm - H am/pm" time range (both endpoints explicit)', () => {
        expect(extractTimeFromMeta('Every Sat, Jun 6 - Nov 21, 10 am - 3 pm')).toMatchObject({ hour: 10, minute: 0, timeGuessed: false });
        expect(extractTimeFromMeta('Every Sun, Jun 28 - Aug 9, 10 am - 12 pm')).toMatchObject({ hour: 10, minute: 0, timeGuessed: false });
        expect(extractTimeFromMeta('Weekly June 4 - October 29, 10 am - 3 pm')).toMatchObject({ hour: 10, minute: 0, timeGuessed: false });
    });

    test('parses "H - H pm" time range (only end has am/pm)', () => {
        expect(extractTimeFromMeta('July 9, 5 - 9 pm')).toMatchObject({ hour: 17, minute: 0, timeGuessed: false });
        expect(extractTimeFromMeta('July 10, 12 - 1 pm')).toMatchObject({ hour: 12, minute: 0, timeGuessed: false }); // noon
        expect(extractTimeFromMeta('March 18, 5 - 7 pm')).toMatchObject({ hour: 17, minute: 0, timeGuessed: false });
    });

    test('parses "H:MM - H am/pm" time range with minutes', () => {
        expect(extractTimeFromMeta('July 11, 9:30 - 11 am')).toMatchObject({ hour: 9, minute: 30, timeGuessed: false });
    });

    test('parses "H:MM am/pm" single time', () => {
        expect(extractTimeFromMeta('Every Mon, Feb 9 - Jul 20, 6:30 pm')).toMatchObject({ hour: 18, minute: 30, timeGuessed: false });
    });

    test('returns default 10 am when no time present', () => {
        expect(extractTimeFromMeta('June 12 - August 14')).toMatchObject({ hour: 10, minute: 0, timeGuessed: true });
        expect(extractTimeFromMeta('July 13-19')).toMatchObject({ hour: 10, minute: 0, timeGuessed: true });
        expect(extractTimeFromMeta('June 1 - August 31')).toMatchObject({ hour: 10, minute: 0, timeGuessed: true });
    });
});

describe('extractWeekdayFromEventPage', () => {
    test('extracts the weekday from an "every <day>" description phrase', () => {
        expect(extractWeekdayFromEventPage('<p>Join us every Thursday from June 4 through October 29 for a market.</p>')).toBe(4);
        expect(extractWeekdayFromEventPage('<p>Farm-fresh shopping every Saturday in South Lake Union.</p>')).toBe(6);
    });

    test('returns null when no weekday phrase is present', () => {
        expect(extractWeekdayFromEventPage('<p>Join the group for a fun run!</p>')).toBeNull();
    });
});

describe('findAmbiguousWeeklyCandidates', () => {
    test('finds only cards whose meta date is a "Weekly ..." lead-in with no weekday name', () => {
        const html = parse(`
            <div class="feature full">
                <h3><a href="/events/pike-place-express-2026-2-3/">2026 Pike Place Market: SLU Express Farmers Market</a></h3>
                <div class="feature__meta feature__meta--date">Weekly June 4 - October 29, 10 am - 3 pm</div>
            </div>
            <div class="feature full">
                <h3><a href="/events/2026-slu-farmers-market-3/">2026 South Lake Union Farmers Market</a></h3>
                <div class="feature__meta feature__meta--date">Every Sat, Jun 6 - Nov 21, 2026 10 am - 3 pm</div>
            </div>
        `);
        const candidates = findAmbiguousWeeklyCandidates(html);
        expect(candidates).toEqual([
            { eventId: 'discover-slu-pike-place-express-2026-2-3', url: 'https://www.discoverslu.com/events/pike-place-express-2026-2-3/' },
        ]);
    });
});

function farmersMarketWeekHtml(headingText: string): string {
    return `
        <div class="site-width"><h2 class="event-day">${headingText}</h2></div>
        <div class="site-width"><div class="grid"><div class="grid__item">
            <div class="feature full">
                <div class="text"><h3><a href="/events/2026-slu-farmers-market-3/">2026 South Lake Union Farmers Market</a></h3>
                <div class="feature__meta-container">
                    <div class="feature__meta feature__meta--date">Every Sat, Jun 6 - Nov 21, 2026 10 am - 3 pm</div>
                    <div class="feature__meta feature__meta--location">The Spheres</div>
                </div></div>
            </div>
        </div></div></div>
    `;
}

function pikeExpressWeekHtml(headingText: string): string {
    return `
        <div class="site-width"><h2 class="event-day">${headingText}</h2></div>
        <div class="site-width"><div class="grid"><div class="grid__item">
            <div class="feature full">
                <div class="text"><h3><a href="/events/pike-place-express-2026-2-3/">2026 Pike Place Market: SLU Express Farmers Market</a></h3>
                <div class="feature__meta-container">
                    <div class="feature__meta feature__meta--date">Weekly June 4 - October 29, 10 am - 3 pm</div>
                    <div class="feature__meta feature__meta--location">Path to Yes Plaza</div>
                </div></div>
            </div>
        </div></div></div>
    `;
}

function makeRipper(lookaheadDays: number): Ripper {
    return {
        config: {
            name: 'discover-slu',
            url: 'https://www.discoverslu.com/calendar/',
            proxy: false,
            lookahead: Period.ofDays(lookaheadDays),
            calendars: [
                { name: 'discover-slu', friendlyname: 'Discover South Lake Union Events', timezone: 'America/Los_Angeles' },
            ],
        } as any,
    } as Ripper;
}

describe('rip()', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test('resolves a weekday mismatch that self-corrects on a later week\'s fetch', async () => {
        // Week 1: only the mis-bucketed "Sunday" occurrence. Week 2: the
        // correctly-bucketed "Saturday" occurrence. rip() must carry the
        // pending mismatch across the week boundary and emit the event once,
        // dated from the correct (week 2) heading.
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    status: 'pass',
                    start_date: '2026-09-13',
                    events_html: farmersMarketWeekHtml('Sunday September 13, 2026'),
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    status: 'pass',
                    start_date: '2026-09-20',
                    events_html: farmersMarketWeekHtml('Saturday September 19, 2026'),
                }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const calendars = await new DiscoverSLURipper().rip(makeRipper(14));
        const cal = calendars[0];

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(cal.events.length).toBe(1);
        expect(cal.events[0].summary).toBe('2026 South Lake Union Farmers Market');
        expect(cal.events[0].date.dayOfMonth()).toBe(19);
        expect(cal.events[0].date.dayOfWeek().toString()).toBe('SATURDAY');
        expect(cal.errors.some(e => e.type === 'ParseError' && 'reason' in e && e.reason.includes('weekday'))).toBe(false);
    });

    test('reports an unresolved weekday mismatch instead of losing the event', async () => {
        // Only ever bucketed under "Sunday" across the whole lookahead window
        // — no correcting occurrence ever appears. Must surface as a
        // ParseError in build-errors.json rather than vanishing silently.
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                status: 'pass',
                start_date: '2026-09-13',
                events_html: farmersMarketWeekHtml('Sunday September 13, 2026'),
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const calendars = await new DiscoverSLURipper().rip(makeRipper(7));
        const cal = calendars[0];

        expect(cal.events.some(e => e.summary === '2026 South Lake Union Farmers Market')).toBe(false);
        const mismatchError = cal.errors.find(e => e.type === 'ParseError' && 'reason' in e && e.reason.includes('2026 South Lake Union Farmers Market'));
        expect(mismatchError).toBeDefined();
    });

    test('resolves a "Weekly" listing with no named weekday via its detail page (GitHub issue #1548)', async () => {
        // "2026 Pike Place Market: SLU Express Farmers Market" gives meta text
        // "Weekly June 4 - October 29, ..." with no weekday name, so
        // extractExpectedWeekday alone can't validate it — and unlike an
        // "Every <day>, ..." listing, discoverslu.com buckets this card under
        // every day heading in the window rather than just the correct one,
        // so there's no self-correcting occurrence to fall back on. rip()
        // must fetch the event's own detail page ("...every Thursday...") to
        // learn the true weekday, skip the wrong (Sunday) occurrence, and
        // publish only the correct (Thursday) one.
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ // week 1 AJAX — wrong (Sunday) occurrence
                ok: true,
                json: () => Promise.resolve({
                    status: 'pass',
                    start_date: '2026-09-20',
                    events_html: pikeExpressWeekHtml('Sunday September 20, 2026'),
                }),
            })
            .mockResolvedValueOnce({ // detail-page lookup for the ambiguous card
                ok: true,
                text: () => Promise.resolve(
                    '<p>Join us every Thursday from June 4 through October 29 for a Pike Place Market farmers market experience in the heart of South Lake Union.</p>',
                ),
            })
            .mockResolvedValueOnce({ // week 2 AJAX — correct (Thursday) occurrence
                ok: true,
                json: () => Promise.resolve({
                    status: 'pass',
                    start_date: '2026-09-27',
                    events_html: pikeExpressWeekHtml('Thursday September 24, 2026'),
                }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const calendars = await new DiscoverSLURipper().rip(makeRipper(14));
        const cal = calendars[0];

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(cal.events.length).toBe(1);
        expect(cal.events[0].summary).toBe('2026 Pike Place Market: SLU Express Farmers Market');
        expect(cal.events[0].date.dayOfMonth()).toBe(24);
        expect(cal.events[0].date.dayOfWeek().toString()).toBe('THURSDAY');
    });

    test('only looks up a "Weekly" listing\'s detail page once, even when it recurs across every week fetched', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    status: 'pass',
                    start_date: '2026-09-20',
                    events_html: pikeExpressWeekHtml('Sunday September 20, 2026'),
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<p>Join us every Thursday from June 4 through October 29.</p>'),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    status: 'pass',
                    start_date: '2026-09-27',
                    events_html: pikeExpressWeekHtml('Sunday September 27, 2026'),
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    status: 'pass',
                    start_date: '2026-10-04',
                    events_html: pikeExpressWeekHtml('Thursday October 1, 2026'),
                }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const calendars = await new DiscoverSLURipper().rip(makeRipper(21));
        const cal = calendars[0];

        // 3 AJAX week fetches + exactly 1 detail-page lookup, not one per week.
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(cal.events.length).toBe(1);
        expect(cal.events[0].date.dayOfWeek().toString()).toBe('THURSDAY');
    });
});
