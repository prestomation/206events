import { describe, expect, test } from 'vitest';
import PhoenixComicsAndGamesRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent, RipperError, UncertaintyError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

// Matches the fixture's "today": the live sample was captured mid-September 2026.
const testDate = ZonedDateTime.parse('2026-09-20T00:00:00-07:00[America/Los_Angeles]');

function buildJsonData(products: any[]): any {
    return { products };
}

const TUESDAY_DRAFT = {
    id: 1,
    title: "Tuesday Night Draft - Chaos Draft | September 22 Ticket",
    handle: "tuesday-night-draft-chaos-draft-september-22-ticket",
    product_type: "Special Event",
    body_html: "<p>Join us every Tuesday as we draft a piece of Magic's history!</p>",
    variants: [{ price: "30.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/tuesday-draft.jpg" }],
};

const FRIDAY_NIGHT_MAGIC = {
    id: 2,
    title: "Friday Night Magic Draft - The Hobbit | September 18 ticket",
    handle: "friday-night-magic-draft-the-hobbit-september-18-ticket",
    product_type: "Special Event",
    body_html: "<p>Weekly Friday Night Magic draft.</p>",
    variants: [{ price: "25.00", available: false }],
    images: [{ src: "https://cdn.shopify.com/fnm.jpg" }],
};

const PRERELEASE_NO_DATE = {
    id: 3,
    title: "Magic the Gathering: Reality Fracture Prerelease Flight 1",
    handle: "magic-the-gathering-reality-fracture-prerelease-flight-1",
    product_type: "Special Event",
    body_html: "<p>Join us for a sneak peek. For more details, check out our prerelease guide over on the store blog.</p>",
    variants: [{ price: "36.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/prerelease.jpg" }],
};

const RETAIL_PRODUCT = {
    id: 4,
    title: "Magic the Gathering Booster Pack",
    handle: "mtg-booster-pack",
    product_type: "Magic Sealed Product",
    body_html: "<p>A booster pack.</p>",
    variants: [{ price: "5.00", available: true }],
    images: [{ src: "https://cdn.shopify.com/booster.jpg" }],
};

const NON_NUMERIC_PRICE = {
    id: 5,
    title: "Community Game Night | September 22 Ticket",
    handle: "community-game-night-september-22-ticket",
    product_type: "Special Event",
    body_html: "<p>Price left blank upstream.</p>",
    variants: [{ price: "", available: true }],
    images: [],
};

const INVALID_CALENDAR_DATE = {
    id: 6,
    title: "Impossible Event | February 30 Ticket",
    handle: "impossible-event-february-30-ticket",
    product_type: "Special Event",
    body_html: "<p>February only has 28/29 days.</p>",
    variants: [{ price: "10.00", available: true }],
    images: [],
};

describe('Phoenix Comics and Games Ripper', () => {
    test('skips non-event products', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const jsonData = buildJsonData([RETAIL_PRODUCT]);
        const events = await ripper.parseEvents(jsonData, testDate, {});
        expect(events).toHaveLength(0);
    });

    test('parses a weekly draft event and pairs it with an Uncertainty error for the missing start time', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const jsonData = buildJsonData([TUESDAY_DRAFT]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertainties = events.filter(e => 'type' in e && e.type === 'Uncertainty') as UncertaintyError[];
        expect(calendarEvents).toHaveLength(1);
        expect(uncertainties).toHaveLength(1);

        const e = calendarEvents[0];
        expect(e.id).toBe('tuesday-night-draft-chaos-draft-september-22-ticket');
        expect(e.date.year()).toBe(2026);
        expect(e.date.monthValue()).toBe(9);
        expect(e.date.dayOfMonth()).toBe(22);
        expect(e.cost).toEqual({ min: 30 });
        expect(e.url).toBe('https://shop.phoenixseattle.com/products/tuesday-night-draft-chaos-draft-september-22-ticket');
        expect(e.imageUrl).toBe('https://cdn.shopify.com/tuesday-draft.jpg');
        expect(e.location).toBe('Phoenix Comics and Games, 113 Broadway E, Seattle, WA 98102');

        expect(uncertainties[0].unknownFields).toEqual(['startTime', 'duration']);
        expect(uncertainties[0].event.id).toBe(e.id);
        expect(uncertainties[0].partialFingerprint).toBeTruthy();
    });

    test('marks a sold-out event with cost.soldOut instead of a price', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const jsonData = buildJsonData([FRIDAY_NIGHT_MAGIC]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];
        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(calendarEvents).toHaveLength(1);
        expect(calendarEvents[0].cost).toEqual({ soldOut: true });
        // September 18 is 2 days before "today" (Sept 20) - within the grace
        // window, so it stays this year rather than rolling to 2027.
        expect(calendarEvents[0].date.year()).toBe(2026);
    });

    test('rolls a date more than the grace window in the past to next year', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        // "today" is Sept 20, 2026 - Jan 15 is well past the 3-day grace
        // window, so it must resolve to Jan 15, 2027, not 2026.
        const staleWinterEvent = {
            id: 7,
            title: "Winter Sealed Event | January 15 Ticket",
            handle: "winter-sealed-event-january-15-ticket",
            product_type: "Special Event",
            body_html: "<p>A sealed event.</p>",
            variants: [{ price: "40.00", available: true }],
            images: [],
        };
        const jsonData = buildJsonData([staleWinterEvent]);
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(calendarEvents).toHaveLength(1);
        expect(calendarEvents[0].date.year()).toBe(2027);
        expect(calendarEvents[0].date.monthValue()).toBe(1);
        expect(calendarEvents[0].date.dayOfMonth()).toBe(15);
    });

    test('silently skips an irregular one-off product with no date anywhere (not a known recurring series)', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const jsonData = buildJsonData([PRERELEASE_NO_DATE]);
        const events = await ripper.parseEvents(jsonData, testDate, {});
        expect(events).toHaveLength(0);
    });

    test('emits a ParseError when a known recurring series is missing its date (a real regression, not an out-of-scope one-off)', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const brokenFnm = {
            id: 8,
            title: "Friday Night Magic Draft - The Hobbit",
            handle: "friday-night-magic-draft-the-hobbit-broken",
            product_type: "Special Event",
            body_html: "<p>Weekly Friday Night Magic draft.</p>",
            variants: [{ price: "25.00", available: true }],
            images: [],
        };
        const jsonData = buildJsonData([brokenFnm]);
        const events = await ripper.parseEvents(jsonData, testDate, {});
        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('omits cost rather than publishing NaN when price is non-numeric', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const jsonData = buildJsonData([NON_NUMERIC_PRICE]);
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(calendarEvents).toHaveLength(1);
        expect(calendarEvents[0].cost).toBeUndefined();
    });

    test('emits a ParseError instead of crashing on an impossible calendar date, without dropping other products', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const jsonData = buildJsonData([INVALID_CALENDAR_DATE, TUESDAY_DRAFT]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        const errors = events.filter(e => 'type' in e && e.type === 'ParseError') as RipperError[];
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(errors).toHaveLength(1);
        expect(valid).toHaveLength(1);
        expect(valid[0].id).toBe('tuesday-night-draft-chaos-draft-september-22-ticket');
    });

    test('emits a ParseError for malformed top-level JSON', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const events = await ripper.parseEvents({ notProducts: [] }, testDate, {});
        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('deduplicates repeated products across multiple parseEvents calls', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const jsonData = buildJsonData([TUESDAY_DRAFT]);
        const first = await ripper.parseEvents(jsonData, testDate, {});
        const second = await ripper.parseEvents(jsonData, testDate, {});
        expect(first.length).toBeGreaterThan(0);
        expect(second).toHaveLength(0);
    });

    test('parses the live sample fixture with no errors (dateless prerelease listings are skipped, not errored)', async () => {
        const ripper = new PhoenixComicsAndGamesRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const errors = events.filter(e => 'type' in e && e.type === 'ParseError') as RipperError[];
        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(errors).toHaveLength(0);
        expect(calendarEvents.length).toBeGreaterThan(0);
    });
});
