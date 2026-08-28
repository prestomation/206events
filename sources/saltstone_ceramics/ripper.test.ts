import { describe, expect, test } from 'vitest';
import SaltstoneCeramicsRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

// Matches the fixture's "today": most sample titles are dated relative to
// early August 2026.
const testDate = ZonedDateTime.parse('2026-08-11T00:00:00-07:00[America/Los_Angeles]');

function buildJsonData(products: any[]): any {
    return { products };
}

const CLAY_CURIOUS_SINGLE = {
    id: 1,
    title: "Clay Curious: Sunday September 20th, 6:30pm - 8:30pm",
    handle: "clay-curious-sunday-september-20th",
    product_type: "retail-class",
    body_html: "<p>Come throw on the wheel!</p>",
    variants: [{ price: "100.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/example.jpg" }],
};

const FALL_WHEEL_WEEKLY = {
    id: 2,
    title: "Fall Advanced Wheel: Thursday Evenings, 6:30pm - 9:30pm, September 10th - October 29th",
    handle: "fall-advanced-wheel-thursday",
    product_type: "retail-class",
    body_html: "<p>An 8-week wheel series.</p>",
    variants: [{ price: "425.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/wheel.jpg" }],
};

const CAMP_SAME_MONTH = {
    id: 3,
    title: "Kid's Clay Camp, Aug 17th - 21st, 9am - 12pm",
    handle: "kids-clay-camp-aug-17",
    product_type: "retail-class",
    body_html: "<p>A week of clay for kids.</p>",
    variants: [{ price: "300.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/camp.jpg" }],
};

const WORKSHOP_CROSS_MONTH_SHORT = {
    id: 4,
    title: "Making Monsters with Eva Funderburgh, Three Day Workshop Jan 29th - 31st, 1pm - 5pm",
    handle: "making-monsters-jan-29",
    product_type: "retail-class",
    body_html: "<p>Sculpt imaginary creatures.</p>",
    variants: [{ price: "250.00", available: false }],
    images: [{ src: "https://cdn.shopify.com/monsters.jpg" }],
};

const INTENSIVE_CROSS_MONTH_LONG = {
    id: 5,
    title: "Throwing Large Dinnerware Sets: 2 Week Intensive. August 17th - August 27th from 6:30 PM - 9:30 PM",
    handle: "dinnerware-intensive-aug-17",
    product_type: "retail-class",
    body_html: "<p>Deep dive into dinnerware.</p>",
    variants: [{ price: "500.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/dinnerware.jpg" }],
};

const MERCHANDISE = {
    id: 6,
    title: "Handmade Mug",
    handle: "handmade-mug",
    product_type: "Ceramics",
    body_html: "<p>A lovely mug.</p>",
    variants: [{ price: "35.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/mug.jpg" }],
};

const UNPARSEABLE_CLASS = {
    id: 7,
    title: "Members Only Studio Access",
    handle: "members-only-studio-access",
    product_type: "retail-class",
    body_html: "<p>No date info here.</p>",
    variants: [{ price: "50.00", available: true }],
    images: [],
};

const INVALID_CALENDAR_DATE = {
    id: 8,
    title: "Impossible Class: Sunday November 31st, 6:30pm - 8:30pm",
    handle: "impossible-class-nov-31",
    product_type: "retail-class",
    body_html: "<p>November only has 30 days.</p>",
    variants: [{ price: "50.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/impossible.jpg" }],
};

const BACKWARDS_TIME_RANGE = {
    id: 9,
    title: "Backwards Class: Sunday September 20th, 8:30pm - 6:30pm",
    handle: "backwards-class-sept-20",
    product_type: "retail-class",
    body_html: "<p>End time stated before start time.</p>",
    variants: [{ price: "50.00", available: true }],
    images: [],
};

const NOON_MIDNIGHT_BOUNDARY = {
    id: 10,
    title: "Midnight Oil: Sunday September 20th, 12am - 12pm",
    handle: "midnight-oil-sept-20",
    product_type: "retail-class",
    body_html: "<p>Runs from just after midnight to noon.</p>",
    variants: [{ price: "75.00", available: true }],
    images: [],
};

const NON_NUMERIC_PRICE = {
    id: 11,
    title: "Free Community Night: Sunday September 20th, 6:30pm - 8:30pm",
    handle: "free-community-night-sept-20",
    product_type: "retail-class",
    body_html: "<p>Price left blank upstream.</p>",
    variants: [{ price: "", available: true }],
    images: [],
};

const SHORTHAND_TIME_RANGE = {
    id: 15,
    title: "BIPOC Wheel Night Sunday, October 4th, 6:30-8:30pm",
    handle: "bipoc-wheel-night-sunday-october-4th-6-30-8-30pm",
    product_type: "retail-class",
    body_html: "<p>Only the end time states am/pm.</p>",
    variants: [{ price: "45.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/bipoc.jpg" }],
};

const NO_VARIANTS_OR_IMAGES = {
    id: 12,
    title: "Bare Bones Class: Sunday September 20th, 6:30pm - 8:30pm",
    handle: "bare-bones-class-sept-20",
    product_type: "retail-class",
    body_html: "<p>No variants or images provided.</p>",
    variants: [],
    images: [],
};

describe('Saltstone Ceramics Ripper', () => {
    test('skips plain merchandise (non retail-class products)', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([MERCHANDISE]);
        const events = await ripper.parseEvents(jsonData, testDate, {});
        expect(events).toHaveLength(0);
    });

    test('emits a ParseError (never drops silently) when no schedule can be parsed', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([UNPARSEABLE_CLASS]);
        const events = await ripper.parseEvents(jsonData, testDate, {});
        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('parses a single-session class as one event with correct date/time', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([CLAY_CURIOUS_SINGLE]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        const e = events[0];
        expect(e.date.year()).toBe(2026);
        expect(e.date.monthValue()).toBe(9);
        expect(e.date.dayOfMonth()).toBe(20);
        expect(e.date.hour()).toBe(18);
        expect(e.date.minute()).toBe(30);
        expect(e.duration.toHours()).toBe(2);
        expect(e.id).toBe('clay-curious-sunday-september-20th');
        expect(e.cost).toEqual({ min: 100 });
        expect(e.imageUrl).toBe('https://cdn.shopify.com/example.jpg');
        expect(e.url).toBe('https://saltstoneceramics.com/products/clay-curious-sunday-september-20th');
    });

    test('expands a weekly multi-week series into one event per matching weekday, within range', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([FALL_WHEEL_WEEKLY]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        // Every Thursday from Sept 10 to Oct 29 inclusive = 8 occurrences.
        expect(events).toHaveLength(8);
        events.forEach(e => {
            expect(e.date.dayOfWeek().value()).toBe(4); // Thursday
            expect(e.date.hour()).toBe(18);
            expect(e.date.minute()).toBe(30);
            expect(e.duration.toHours()).toBe(3);
        });
        const dates = events.map(e => e.date.toLocalDate().toString()).sort();
        expect(dates[0]).toBe('2026-09-10');
        expect(dates[dates.length - 1]).toBe('2026-10-29');
        // Ids stay distinct per occurrence but share the product handle prefix.
        const ids = new Set(events.map(e => e.id));
        expect(ids.size).toBe(8);
        events.forEach(e => expect(e.id).toMatch(/^fall-advanced-wheel-thursday-/));
    });

    test('expands a same-month day-range camp (no stated weekday) into one event per weekday', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([CAMP_SAME_MONTH]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        // Aug 17-21, 2026 is Mon-Fri - a short span, so every day in range.
        expect(events).toHaveLength(5);
        const dates = events.map(e => e.date.toLocalDate().toString()).sort();
        expect(dates).toEqual(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']);
        events.forEach(e => {
            expect(e.date.hour()).toBe(9);
            expect(e.duration.toHours()).toBe(3);
        });
    });

    test('expands a short cross-month workshop into one event per calendar day, rolling to next year when past', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([WORKSHOP_CROSS_MONTH_SHORT]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        // Jan 29-31 is >3 days before the Aug 11, 2026 "today" - rolls to 2027.
        expect(events).toHaveLength(3);
        const dates = events.map(e => e.date.toLocalDate().toString()).sort();
        expect(dates).toEqual(['2027-01-29', '2027-01-30', '2027-01-31']);
        events.forEach(e => {
            expect(e.date.hour()).toBe(13);
            expect(e.duration.toHours()).toBe(4);
            expect(e.cost).toEqual({ soldOut: true });
        });
    });

    test('expands a long cross-month intensive (no stated weekday) into weekday-only occurrences', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([INTENSIVE_CROSS_MONTH_LONG]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        // Aug 17-27, 2026 spans 2 full weekends; weekday-only = 9 occurrences.
        expect(events).toHaveLength(9);
        events.forEach(e => {
            const dow = e.date.dayOfWeek().value();
            expect(dow).toBeGreaterThanOrEqual(1);
            expect(dow).toBeLessThanOrEqual(5);
        });
        const dates = events.map(e => e.date.toLocalDate().toString()).sort();
        expect(dates).toEqual([
            '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
            '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
        ]);
    });

    test('does not roll a still-in-progress date range to next year', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const inProgressCamp = {
            ...CAMP_SAME_MONTH,
            id: 8,
            title: "Summer Teen Wheel Camp: August 10th - 14th, 9am - 12pm",
            handle: "summer-teen-camp-aug-10",
        };
        const jsonData = buildJsonData([inProgressCamp]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        // Today is Aug 11 - the range starts before today but ends after it,
        // so it must stay in 2026, not roll to 2027.
        const dates = events.map(e => e.date.toLocalDate().toString()).sort();
        expect(dates).toEqual(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']);
    });

    test('deduplicates repeated products across multiple parseEvents calls', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([CLAY_CURIOUS_SINGLE]);
        const first = await ripper.parseEvents(jsonData, testDate, {});
        const second = await ripper.parseEvents(jsonData, testDate, {});
        expect(first).toHaveLength(1);
        expect(second).toHaveLength(0);
    });

    test('marks a sold-out class with cost.soldOut instead of a price', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([WORKSHOP_CROSS_MONTH_SHORT]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];
        events.forEach(e => expect(e.cost).toEqual({ soldOut: true }));
    });

    test('emits a ParseError for malformed top-level JSON', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const events = await ripper.parseEvents({ notProducts: [] }, testDate, {});
        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('emits a ParseError instead of crashing on an impossible calendar date, without dropping other products', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([INVALID_CALENDAR_DATE, CLAY_CURIOUS_SINGLE]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        const errors = events.filter(e => 'type' in e) as RipperError[];
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        // The good product in the same batch still parses.
        expect(valid).toHaveLength(1);
        expect(valid[0].id).toBe('clay-curious-sunday-september-20th');
    });

    test('emits a ParseError when the parsed end time is not after the start time', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([BACKWARDS_TIME_RANGE]);
        const events = await ripper.parseEvents(jsonData, testDate, {});
        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('handles the 12am/12pm midnight-noon boundary correctly', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([NOON_MIDNIGHT_BOUNDARY]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];
        expect(events).toHaveLength(1);
        expect(events[0].date.hour()).toBe(0);
        expect(events[0].date.minute()).toBe(0);
        expect(events[0].duration.toHours()).toBe(12);
    });

    test('omits cost rather than publishing NaN when price is non-numeric', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([NON_NUMERIC_PRICE]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];
        expect(events).toHaveLength(1);
        expect(events[0].cost).toBeUndefined();
    });

    test('parses successfully with no variants or images present', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([NO_VARIANTS_OR_IMAGES]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];
        expect(events).toHaveLength(1);
        expect(events[0].cost).toBeUndefined();
        expect(events[0].imageUrl).toBeUndefined();
    });

    test('stays in the current year exactly at the PAST_TOLERANCE_DAYS boundary, rolls just beyond it', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        // testDate is Aug 11, 2026. Aug 8 is exactly 3 days before (grace
        // boundary - stays this year); Aug 7 is 4 days before (rolls to 2027).
        const atBoundary = {
            ...CLAY_CURIOUS_SINGLE,
            id: 13,
            title: "Clay Curious: Friday August 8th, 6:30pm - 8:30pm",
            handle: "clay-curious-aug-8-boundary",
        };
        const justPastBoundary = {
            ...CLAY_CURIOUS_SINGLE,
            id: 14,
            title: "Clay Curious: Friday August 7th, 6:30pm - 8:30pm",
            handle: "clay-curious-aug-7-past-boundary",
        };
        const events = await ripper.parseEvents(buildJsonData([atBoundary, justPastBoundary]), testDate, {}) as RipperCalendarEvent[];

        const atBoundaryEvent = events.find(e => e.id === 'clay-curious-aug-8-boundary')!;
        const justPastBoundaryEvent = events.find(e => e.id === 'clay-curious-aug-7-past-boundary')!;
        expect(atBoundaryEvent.date.year()).toBe(2026);
        expect(justPastBoundaryEvent.date.year()).toBe(2027);
    });

    test('infers the start-time meridiem from the end time in a shorthand range ("6:30-8:30pm")', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = buildJsonData([SHORTHAND_TIME_RANGE]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        expect(events[0].date.hour()).toBe(18);
        expect(events[0].date.minute()).toBe(30);
        expect(events[0].duration.toHours()).toBe(2);
    });

    test('parses all retail-class events from the live sample fixture with no errors', async () => {
        const ripper = new SaltstoneCeramicsRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(0);
        expect(events.length).toBeGreaterThan(0);
    });
});
