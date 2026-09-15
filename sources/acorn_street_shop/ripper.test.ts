import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseHtml } from 'node-html-parser';
import { Duration, ZoneId, ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import AcornStreetShopRipper, {
    extractCalendarEntries,
    parseCalendarEntry,
    isPrivateBooking,
    buildMonthUrl,
    extractEventDataBlob,
    normalizeDetailTime,
    extractOgImage,
    AcornCalendarEntry,
} from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE = ZoneId.of('America/Los_Angeles');

function loadFixture() {
    return parseHtml(fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8'));
}

function makeRipperConfig(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: 'acorn-street-shop',
            url: new URL('https://www.acornstreet.com/module/events.htm?pageComponentId=1870456'),
            tags: ['Workshops', 'Ravenna'],
            geo: { lat: 47.6686154, lng: -122.2963357 },
            disabled: false,
            proxy: false,
            calendars: [{
                name: 'all-events',
                friendlyname: 'Acorn Street Shop',
                timezone: ZONE,
            }],
            ...overrides,
        },
    } as any;
}

// Builds a single-day month-grid page with one public and one private
// .calEvent, using the real onclick markup shape the parser depends on.
function monthGridHtml(year: number, month: number, day: number): string {
    const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1];
    const base = `https://www.acornstreet.com/module/events.htm?pageComponentId=1870456&year=${year}&month=${monthAbbr}&day=${day}`;
    return `
        <div class="calCell calRowTop">
          <div class="calDayNum"><a class="calDayNumLink" href="${base}"><span>${day}</span></a></div>
          <div class="calEvent" onclick="location='${base}&eventId=9000001';">
            <b>6:00 pm to 8:00 pm</b><br>
            Knit Night!
          </div>
          <div class="calEvent" onclick="location='${base}&eventId=9000002';">
            <b>3:00 pm</b><br>
            Private Class with Whoever
          </div>
        </div>`;
}

describe('extractCalendarEntries', () => {
    it('extracts every .calEvent block on the page', () => {
        const entries = extractCalendarEntries(loadFixture());
        expect(entries.length).toBe(36);
    });

    it('parses eventId, date fields, time, and title from a plain class listing', () => {
        const entries = extractCalendarEntries(loadFixture());
        const entry = entries.find(e => e.eventId === '4510034');
        expect(entry).toBeDefined();
        expect(entry).toMatchObject({
            eventId: '4510034',
            year: 2026,
            month: 9,
            day: 2,
            timeRaw: '6:00 pm',
            title: 'Intermediate Knitting Project Class with Sue',
        });
        expect(entry!.detailUrl).toContain('eventId=4510034');
    });

    it('strips a trailing decorative <img>/<div class="clearfix"> from the title', () => {
        const entries = extractCalendarEntries(loadFixture());
        const knitNight = entries.find(e => e.eventId === '4371681' && e.day === 3);
        expect(knitNight?.title).toBe('Knit Night!');
        expect(knitNight?.timeRaw).toBe('6:00 pm to 8:00 pm');
    });

    it('trims trailing whitespace left by a decorative tag before a title-only image', () => {
        const entries = extractCalendarEntries(loadFixture());
        const popup = entries.find(e => e.eventId === '4573837' && e.day === 18);
        expect(popup?.title).toBe('AIO Knits Pop-Up');
        expect(popup?.timeRaw).toBe('10:00 am to 6:00 pm');
    });

    it('preserves a literal "&" in a title without corrupting it', () => {
        const entries = extractCalendarEntries(loadFixture());
        const reserved = entries.find(e => e.eventId === '4542015');
        expect(reserved?.title).toBe('Classroom reserved for Mary & Tyler');
    });

    it('captures every occurrence of a recurring eventId on its own distinct day', () => {
        const entries = extractCalendarEntries(loadFixture());
        const knitNightDays = entries.filter(e => e.eventId === '4410256').map(e => e.day).sort((a, b) => a - b);
        expect(knitNightDays.length).toBeGreaterThan(1);
        expect(new Set(knitNightDays).size).toBe(knitNightDays.length); // no duplicate days for this id
    });

    it('returns an empty list when there are no .calEvent blocks', () => {
        const entries = extractCalendarEntries(parseHtml('<div class="calCell"></div>'));
        expect(entries).toEqual([]);
    });
});

describe('isPrivateBooking', () => {
    it('flags a title starting with "Private"', () => {
        expect(isPrivateBooking('Private Class with Gregory')).toBe(true);
    });

    it('flags a "reserved for" classroom booking regardless of case', () => {
        expect(isPrivateBooking('Classroom RESERVED for Mary & Tyler')).toBe(true);
    });

    it('flags a bare "Class room reserved" with no "for <name>" suffix (live-verified variant)', () => {
        expect(isPrivateBooking('Class room reserved')).toBe(true);
    });

    it('does not flag a normal public class title', () => {
        expect(isPrivateBooking('Intermediate Knitting Project Class with Sue')).toBe(false);
        expect(isPrivateBooking('Knit Night!')).toBe(false);
        expect(isPrivateBooking('Beginning Knitting 101')).toBe(false);
    });

    it('does not false-positive on "Private" appearing mid-title', () => {
        expect(isPrivateBooking('A totally Private-sounding but not really class')).toBe(false);
    });
});

describe('extractCalendarEntries + isPrivateBooking on the live fixture', () => {
    it('identifies exactly the private/reserved bookings and excludes them from a would-be publish set', () => {
        const entries = extractCalendarEntries(loadFixture());
        const privateOnes = entries.filter(e => isPrivateBooking(e.title));
        const publicOnes = entries.filter(e => !isPrivateBooking(e.title));

        expect(privateOnes.length).toBe(3);
        expect(privateOnes.map(e => e.title).sort()).toEqual([
            'Classroom reserved for Mary & Tyler',
            'Private Class with Angela',
            'Private Class with Gregory',
        ]);
        expect(publicOnes.length).toBe(33);
        expect(publicOnes.some(e => e.title.startsWith('Private'))).toBe(false);
        expect(publicOnes.some(e => /reserved for/i.test(e.title))).toBe(false);
    });
});

describe('parseCalendarEntry', () => {
    const rangeEntry: AcornCalendarEntry = {
        eventId: '4371681',
        year: 2026,
        month: 9,
        day: 3,
        timeRaw: '6:00 pm to 8:00 pm',
        title: 'Knit Night!',
        detailUrl: 'https://www.acornstreet.com/module/events.htm?pageComponentId=1870456&year=2026&month=Sep&day=3&eventId=4371681',
    };

    const singleTimeEntry: AcornCalendarEntry = {
        eventId: '4510034',
        year: 2026,
        month: 9,
        day: 2,
        timeRaw: '6:00 pm',
        title: 'Intermediate Knitting Project Class with Sue',
        detailUrl: 'https://www.acornstreet.com/module/events.htm?pageComponentId=1870456&year=2026&month=Sep&day=2&eventId=4510034',
    };

    it('computes duration from an explicit time range', () => {
        const result = parseCalendarEntry(rangeEntry, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.hour()).toBe(18);
        expect(result.date.minute()).toBe(0);
        expect(result.duration.equals(Duration.ofHours(2))).toBe(true);
    });

    it('defaults to a 1-hour duration when only a start time is given', () => {
        const result = parseCalendarEntry(singleTimeEntry, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.hour()).toBe(18);
        expect(result.duration.equals(Duration.ofHours(1))).toBe(true);
    });

    it('builds a stable id from eventId + the specific occurrence date', () => {
        const result = parseCalendarEntry(singleTimeEntry, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.id).toBe('acorn-street-4510034-2026-09-02');
    });

    it('gives the same recurring eventId on two different days distinct, stable ids', () => {
        const day1 = parseCalendarEntry({ ...rangeEntry, day: 1 }, ZONE);
        const day8 = parseCalendarEntry({ ...rangeEntry, day: 8 }, ZONE);
        if (!('date' in day1) || !('date' in day8)) throw new Error('expected events');
        expect(day1.id).toBe('acorn-street-4371681-2026-09-01');
        expect(day8.id).toBe('acorn-street-4371681-2026-09-08');
        expect(day1.id).not.toBe(day8.id);
    });

    it('parses a morning time correctly (am boundary)', () => {
        const morning: AcornCalendarEntry = { ...singleTimeEntry, timeRaw: '10:30 am' };
        const result = parseCalendarEntry(morning, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.hour()).toBe(10);
        expect(result.date.minute()).toBe(30);
    });

    it('parses 12:00 pm (noon) and 12:00 am (midnight) correctly', () => {
        const noon = parseCalendarEntry({ ...singleTimeEntry, timeRaw: '12:00 pm' }, ZONE);
        const midnight = parseCalendarEntry({ ...singleTimeEntry, timeRaw: '12:00 am' }, ZONE);
        if (!('date' in noon) || !('date' in midnight)) throw new Error('expected events');
        expect(noon.date.hour()).toBe(12);
        expect(midnight.date.hour()).toBe(0);
    });

    it('leaves cost and imageUrl unset so the gap queues pick them up', () => {
        const result = parseCalendarEntry(singleTimeEntry, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.cost).toBeUndefined();
        expect(result.imageUrl).toBeUndefined();
    });

    it('sets the fixed venue address as the event location', () => {
        const result = parseCalendarEntry(singleTimeEntry, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.location).toBe('Acorn Street Shop, 2818 NE 55th St, Seattle, WA 98105');
    });

    it('returns a ParseError — never null/undefined — for unparseable time text', () => {
        const bad: AcornCalendarEntry = { ...singleTimeEntry, timeRaw: 'TBD' };
        const result = parseCalendarEntry(bad, ZONE);
        expect(result).toBeDefined();
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });

    it('returns a ParseError for an impossible date rather than throwing', () => {
        const bad: AcornCalendarEntry = { ...singleTimeEntry, month: 2, day: 30 };
        const result = parseCalendarEntry(bad, ZONE);
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });

    it('falls back to the default duration when a stated end time is not after the start', () => {
        const backwards: AcornCalendarEntry = { ...singleTimeEntry, timeRaw: '6:00 pm to 5:00 pm' };
        const result = parseCalendarEntry(backwards, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.duration.equals(Duration.ofHours(1))).toBe(true);
    });
});

describe('parseCalendarEntry — must never return null (every fixture entry)', () => {
    it('returns a RipperCalendarEvent or a RipperError for every entry on the live fixture', () => {
        const entries = extractCalendarEntries(loadFixture());
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            const result = parseCalendarEntry(entry, ZONE);
            expect(result).toBeDefined();
            expect(result).not.toBeNull();
            const isEvent = 'date' in result;
            const isError = 'type' in result;
            expect(isEvent || isError).toBe(true);
        }
    });
});

describe('AcornStreetShopRipper.rip()', () => {
    it('never publishes a private booking in events or errors, only the public one', async () => {
        // Serve the mixed public/private day two months out (i=2 of
        // MONTHS_AHEAD=3) — guaranteed to land in the future regardless of
        // what day-of-month the suite happens to run on, so the "past event"
        // skip in rip() can't make this test flaky. The nearer two months
        // deliberately return an empty grid.
        const now = ZonedDateTime.now(ZONE);
        const targetMonth = now.toLocalDate().plusMonths(2);
        const dayHtml = monthGridHtml(targetMonth.year(), targetMonth.monthValue(), 15);

        const mockFetch = vi.fn().mockImplementation((url: string) => {
            const params = new URL(url).searchParams;
            const isTargetMonth = params.get('year') === String(targetMonth.year())
                && params.get('month') === String(targetMonth.monthValue());
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve(isTargetMonth ? dayHtml : '<div class="calCell"></div>'),
            });
        });
        vi.stubGlobal('fetch', mockFetch);

        const ripper = new AcornStreetShopRipper();
        const result = await ripper.rip(makeRipperConfig());

        expect(result).toHaveLength(1);
        const { events, errors } = result[0];

        expect(events.some(e => e.summary === 'Knit Night!')).toBe(true);
        expect(events.some(e => e.summary.includes('Private'))).toBe(false);

        // The private title must not leak through any error/uncertainty
        // payload either — not as a ParseError context, and not embedded in
        // an UncertaintyError's carried event.
        const errorText = JSON.stringify(errors);
        expect(errorText).not.toContain('Private Class with Whoever');

        vi.unstubAllGlobals();
    });
});

describe('extractEventDataBlob', () => {
    const classPageHtml = `<html><body>
        <script attr="nomove">
        var event_data = JSON.stringify({"#60":{"class_id_str":"#60","title":"Beginning Knitting 101","price":"80","sections":[{"event_id":"4523431","date":"September 15, 2026","time":"2:30pm - 4:30pm"}]}});
        </script>
        </body></html>`;

    it('parses the class-product page event_data blob', () => {
        const blob = extractEventDataBlob(classPageHtml);
        expect(blob).not.toBeNull();
        expect(blob!['#60'].price).toBe('80');
        expect(blob!['#60'].sections).toEqual([
            { event_id: '4523431', date: 'September 15, 2026', time: '2:30pm - 4:30pm' },
        ]);
    });

    it('returns null when the marker is absent (the free "Event Details" template)', () => {
        const freeTemplateHtml = `<html><body><div class="component-header">Event Details</div><h1>Knit Night!</h1></body></html>`;
        expect(extractEventDataBlob(freeTemplateHtml)).toBeNull();
    });

    it('returns null rather than throwing on malformed JSON after the marker', () => {
        const broken = `var event_data = JSON.stringify({"#60": this is not json});`;
        expect(extractEventDataBlob(broken)).toBeNull();
    });

    it('returns null on an unbalanced/truncated blob rather than slicing garbage', () => {
        const truncated = `var event_data = JSON.stringify({"#60":{"price":"80"`;
        expect(extractEventDataBlob(truncated)).toBeNull();
    });

    it('handles multiple class-variant groups sharing one page (verified live shape)', () => {
        const multiGroup = `var event_data = JSON.stringify({"#60":{"price":"80","sections":[{"event_id":"1","time":"2:30pm - 4:30pm"}]},"#61":{"price":"80","sections":[{"event_id":"2","time":"12:30pm - 3:30pm"}]}});`;
        const blob = extractEventDataBlob(multiGroup);
        expect(Object.keys(blob!)).toEqual(['#60', '#61']);
    });
});

describe('extractOgImage', () => {
    it('extracts the og:image content URL', () => {
        const html = `<html><head><meta property="og:image" content="https://media.rainpos.com/6563/IMG_4966.jpg"></head></html>`;
        expect(extractOgImage(html)).toBe('https://media.rainpos.com/6563/IMG_4966.jpg');
    });

    it('returns undefined when no og:image tag is present (the free "Event Details" template)', () => {
        const html = `<html><head><div class="component-header">Event Details</div></head></html>`;
        expect(extractOgImage(html)).toBeUndefined();
    });
});

describe('normalizeDetailTime', () => {
    it('converts "H:MMam - H:MMpm" into the " to "-separated form TIME_PATTERN expects', () => {
        expect(normalizeDetailTime('2:30pm - 4:30pm')).toBe('2:30pm to 4:30pm');
    });

    it('handles a dash with no surrounding spaces', () => {
        expect(normalizeDetailTime('2:30pm-4:30pm')).toBe('2:30pm to 4:30pm');
    });

    it('trims incidental whitespace', () => {
        expect(normalizeDetailTime('  10:30am - 12:30pm  ')).toBe('10:30am to 12:30pm');
    });
});

describe('AcornStreetShopRipper.rip() — detail-page cost/duration enrichment', () => {
    const now = ZonedDateTime.now(ZONE);
    const targetMonth = now.toLocalDate().plusMonths(2); // Always-future month, as the existing rip() test does.
    const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][targetMonth.monthValue() - 1];

    function gridHtml(): string {
        const base = `https://www.acornstreet.com/module/events.htm?pageComponentId=1870456&year=${targetMonth.year()}&month=${monthAbbr}&day=15`;
        return `
            <div class="calCell calRowTop">
              <div class="calEvent" onclick="location='${base}&eventId=5000001';">
                <b>2:30 pm</b><br>
                Beginning Knitting 101
              </div>
              <div class="calEvent" onclick="location='${base}&eventId=5000002';">
                <b>6:00 pm to 8:00 pm</b><br>
                Knit Night!
              </div>
              <div class="calEvent" onclick="location='${base}&eventId=5000003';">
                <b>1:00 pm</b><br>
                Advanced Beginner Workshop
              </div>
            </div>`;
    }

    // "Beginning Knitting 101" (5000001) resolves via a class-product page
    // carrying a matching event_data blob (price + exact end time).
    // "Knit Night!" (5000002) is already duration-complete from the grid and
    // its detail page has no event_data blob at all (the free template).
    // "Advanced Beginner Workshop" (5000003) has a detail fetch that fails
    // (HTTP 500), so it must fall back to the pre-existing default-duration
    // + cost-gap behavior, now with cost also flagged in the same entry.
    function detailHtmlFor(eventId: string): { ok: boolean; body?: string } {
        if (eventId === '5000001') {
            return {
                ok: true,
                body: `<meta property="og:image" content="https://media.rainpos.com/6563/IMG_4966.jpg">`
                    + `<script>var event_data = JSON.stringify({"#1":{"price":"80","sections":[{"event_id":"5000001","time":"2:30pm - 4:30pm"}]}});</script>`,
            };
        }
        if (eventId === '5000002') {
            return { ok: true, body: `<div class="component-header">Event Details</div><h1>Knit Night!</h1>` };
        }
        return { ok: false };
    }

    function makeMockFetch() {
        return vi.fn().mockImplementation((url: string) => {
            const params = new URL(url).searchParams;
            const eventId = params.get('eventId');
            // The month-grid endpoint is requested without an eventId (see buildMonthUrl).
            if (!eventId) {
                const isTargetMonth = params.get('year') === String(targetMonth.year()) && params.get('month') === String(targetMonth.monthValue());
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(isTargetMonth ? gridHtml() : '<div class="calCell"></div>'),
                });
            }
            // A detail-page fetch (carries eventId).
            const detail = detailHtmlFor(eventId!);
            return Promise.resolve({
                ok: detail.ok,
                status: detail.ok ? 200 : 500,
                statusText: detail.ok ? 'OK' : 'Internal Server Error',
                text: () => Promise.resolve(detail.body ?? ''),
            });
        });
    }

    it('resolves exact duration and price from a class-product page event_data blob', async () => {
        vi.stubGlobal('fetch', makeMockFetch());
        const result = await new AcornStreetShopRipper().rip(makeRipperConfig());
        const { events, errors } = result[0];

        const knitting = events.find(e => e.summary === 'Beginning Knitting 101');
        expect(knitting).toBeDefined();
        expect(knitting!.date.hour()).toBe(14);
        expect(knitting!.date.minute()).toBe(30);
        expect(knitting!.duration.equals(Duration.ofHours(2))).toBe(true);
        expect(knitting!.cost).toEqual({ min: 80 });
        expect(knitting!.imageUrl).toBe('https://media.rainpos.com/6563/IMG_4966.jpg');

        // Fully resolved — no uncertainty entry should remain for this event.
        const knittingUncertainty = errors.find(e => 'event' in e && (e as any).event.summary === 'Beginning Knitting 101');
        expect(knittingUncertainty).toBeUndefined();

        vi.unstubAllGlobals();
    });

    it('treats a matched detail page with no event_data blob as free (the non-commerce template)', async () => {
        vi.stubGlobal('fetch', makeMockFetch());
        const result = await new AcornStreetShopRipper().rip(makeRipperConfig());
        const { events } = result[0];

        const knitNight = events.find(e => e.summary === 'Knit Night!');
        expect(knitNight).toBeDefined();
        expect(knitNight!.cost).toEqual({ min: 0 });
        // The free template never carries an og:image — no guessed photo.
        expect(knitNight!.imageUrl).toBeUndefined();

        vi.unstubAllGlobals();
    });

    it('falls back to default duration and flags both duration+cost when the detail fetch fails', async () => {
        vi.stubGlobal('fetch', makeMockFetch());
        const result = await new AcornStreetShopRipper().rip(makeRipperConfig());
        const { events, errors } = result[0];

        const workshop = events.find(e => e.summary === 'Advanced Beginner Workshop');
        expect(workshop).toBeDefined();
        expect(workshop!.duration.equals(Duration.ofHours(1))).toBe(true);
        expect(workshop!.cost).toBeUndefined();

        const uncertainty = errors.find(e => 'event' in e && (e as any).event.summary === 'Advanced Beginner Workshop') as any;
        expect(uncertainty).toBeDefined();
        expect(uncertainty.unknownFields.sort()).toEqual(['cost', 'duration']);

        vi.unstubAllGlobals();
    });
});

describe('buildMonthUrl', () => {
    it('sets a NUMERIC month query param (the month-view endpoint ignores 3-letter abbreviations)', () => {
        const url = buildMonthUrl('https://www.acornstreet.com/module/events.htm?pageComponentId=1870456', 2026, 10);
        const parsed = new URL(url);
        expect(parsed.searchParams.get('month')).toBe('10');
        expect(parsed.searchParams.get('year')).toBe('2026');
        expect(parsed.searchParams.get('pageComponentId')).toBe('1870456');
    });

    it('does not zero-pad the month', () => {
        const url = buildMonthUrl('https://www.acornstreet.com/module/events.htm?pageComponentId=1870456', 2026, 9);
        expect(new URL(url).searchParams.get('month')).toBe('9');
    });
});
