import { describe, expect, test } from 'vitest';
import SeattleArtistLeagueRipper from './ripper.js';
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

// Matches the fixture: real titles are dated relative to early September 2026.
const testDate = ZonedDateTime.parse('2026-09-02T00:00:00-07:00[America/Los_Angeles]');

const CLASS_WITH_TIME_BULLET = {
    id: 1,
    name: "Beginning Drawing WEDNESDAY EVENING begins 10.28",
    slug: "beginning-drawing-wednesday-evening-begins-10-28",
    permalink: "https://www.seattleartistleague.com/art-classes/beginning-drawing-wednesday-evening-begins-10-28/",
    short_description: "<ul><li>Teacher: Anne Marie</li><li>Course Length: 8 classes</li><li>Class Days: Wednesday, beginning October 28</li><li>Time: 6:00 &#8211; 8:30 pm</li></ul>",
    categories: [{ name: "Drawing" }, { name: "In-Person Classes" }],
    images: [{ src: "https://sal-bucket-1.s3.amazonaws.com/example.jpg" }],
    prices: { price: "38000", currency_minor_unit: 2 },
    is_in_stock: true,
};

const FREE_EVENT_WITH_WHERE = {
    id: 2,
    name: "FREE Reflections: Drawing at the Duwamish FRIDAY AFTERNOON 9.25",
    slug: "free-reflections-drawing-at-the-duwamish-friday-afternoon-9-25",
    permalink: "https://www.seattleartistleague.com/art-classes/free-reflections-drawing-at-the-duwamish-friday-afternoon-9-25/",
    short_description: "<ul><li>Date: Friday, September 25, 2026</li><li>Time: 12PM &#8211; 3PM</li><li>Instructor: Kyler</li><li>Where: 8700 Dallas Ave S, Seattle, WA 98108 (Duwamish River People&#8217;s Park and Shoreline Habit)</li><li>FREE</li></ul>",
    categories: [{ name: "Drawing" }, { name: "In-Person Classes" }],
    images: [],
    prices: { price: "0", currency_minor_unit: 2 },
    is_in_stock: true,
};

const NO_TIME_BULLET = {
    id: 3,
    name: "FREE Sculpting the Head Demo. w/ Ruthie V. SATURDAY EVENING 9.12",
    slug: "free-sculpting-the-head-demo-ruthie-v-saturday-evening-9-12",
    permalink: "https://www.seattleartistleague.com/art-classes/free-sculpting-the-head-demo-ruthie-v-saturday-evening-9-12/",
    short_description: "<p>Watch a live sculpting demonstration. Open to all levels, no sign-up required.</p>",
    categories: [{ name: "Sculpture" }, { name: "In-Person Classes" }],
    images: [],
    prices: { price: "0", currency_minor_unit: 2 },
    is_in_stock: true,
};

const ONLINE_CLASS = {
    id: 4,
    name: "Beginning Drawing ONLINE MONDAY EVENING begins 9.14",
    slug: "beginning-drawing-online-monday-evening-begins-9-14",
    permalink: "https://www.seattleartistleague.com/art-classes/beginning-drawing-online-monday-evening-begins-9-14/",
    short_description: "<ul><li>Time: 6:00 &#8211; 8:30 pm</li></ul>",
    categories: [{ name: "Drawing" }, { name: "Online Classes" }],
    images: [],
    prices: { price: "38000", currency_minor_unit: 2 },
    is_in_stock: true,
};

const MEMBERSHIP_PRODUCT = {
    id: 5,
    name: "Annual Membership",
    slug: "annual-membership",
    permalink: "https://www.seattleartistleague.com/product/annual-membership/",
    short_description: "<p>Studio membership.</p>",
    categories: [{ name: "Membership" }],
    images: [],
    prices: { price: "10000", currency_minor_unit: 2 },
    is_in_stock: true,
};

const NO_DATE_IN_TITLE = {
    id: 6,
    name: "Gift Certificates",
    slug: "gift-certificates",
    permalink: "https://www.seattleartistleague.com/product/gift-certificates/",
    short_description: "<p>Give the gift of art.</p>",
    categories: [{ name: "In-Person Classes" }],
    images: [],
    prices: { price: "5000", currency_minor_unit: 2 },
    is_in_stock: true,
};

const IMPOSSIBLE_CALENDAR_DATE = {
    id: 7,
    name: "Impossible Class SATURDAY MORNING begins 2.30",
    slug: "impossible-class-saturday-morning-begins-2-30",
    permalink: "https://www.seattleartistleague.com/art-classes/impossible-class-saturday-morning-begins-2-30/",
    short_description: "<ul><li>Time: 10:00 &#8211; 1:00 pm</li></ul>",
    categories: [{ name: "Painting" }, { name: "In-Person Classes" }],
    images: [],
    prices: { price: "10000", currency_minor_unit: 2 },
    is_in_stock: true,
};

const SOLD_OUT_CLASS = {
    id: 8,
    name: "Beginning Wheel 1 SATURDAY MORNING w Ken begins 10.31",
    slug: "beginning-wheel-1-saturday-morning-w-ken-begins-10-31",
    permalink: "https://www.seattleartistleague.com/art-classes/beginning-wheel-1-saturday-morning-w-ken-begins-10-31/",
    short_description: "<ul><li>Time: 10:00 &#8211; 1:00 pm</li></ul>",
    categories: [{ name: "Pottery" }, { name: "In-Person Classes" }],
    images: [],
    prices: { price: "42500", currency_minor_unit: 2 },
    is_in_stock: false,
};

function buildJsonData(products: any[]): any[] {
    return products;
}

describe('SeattleArtistLeagueRipper', () => {
    test('parses a class with an explicit Time: bullet into a dated event', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const events = await ripper.parseEvents(buildJsonData([CLASS_WITH_TIME_BULLET]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        expect(valid).toHaveLength(1);
        expect(valid[0].id).toBe('beginning-drawing-wednesday-evening-begins-10-28');
        expect(valid[0].date.monthValue()).toBe(10);
        expect(valid[0].date.dayOfMonth()).toBe(28);
        expect(valid[0].date.year()).toBe(2026);
        expect(valid[0].date.hour()).toBe(18);
        expect(valid[0].date.minute()).toBe(0);
        expect(valid[0].duration.toMinutes()).toBe(150);
        expect(valid[0].location).toBe('Seattle Artist League, 5516 4th Ave S, Seattle, WA 98108');
        expect(valid[0].cost).toEqual({ min: 380 });
    });

    test('parses a "Where:" bullet into an off-site location, overriding the default venue address', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const events = await ripper.parseEvents(buildJsonData([FREE_EVENT_WITH_WHERE]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(1);
        expect(valid[0].location).toBe("8700 Dallas Ave S, Seattle, WA 98108 (Duwamish River People’s Park and Shoreline Habit)");
        expect(valid[0].date.hour()).toBe(12);
        expect(valid[0].duration.toHours()).toBe(3);
        expect(valid[0].cost).toEqual({ min: 0 });
    });

    test('publishes a placeholder-time event with an Uncertainty error when no Time: bullet is present', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const events = await ripper.parseEvents(buildJsonData([NO_TIME_BULLET]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertain = events.filter(e => 'type' in e && (e as any).type === 'Uncertainty') as UncertaintyError[];

        expect(valid).toHaveLength(1);
        expect(valid[0].date.hour()).toBe(12);
        expect(uncertain).toHaveLength(1);
        expect(uncertain[0].unknownFields).toEqual(['startTime', 'duration']);
        expect(uncertain[0].event.id).toBe(valid[0].id);
    });

    test('flags location uncertain (default studio address as placeholder) for an "@ The Brick" title with no Where: bullet', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const offSiteClass = {
            ...CLASS_WITH_TIME_BULLET,
            id: 14,
            name: "Rapid Drawing @ The Brick SUNDAY AFTERNOON w/ Natasha 9.27",
            slug: "rapid-drawing-the-brick-sunday-afternoon-w-natasha-9-27",
            short_description: "<ul><li>Time: 1:00 &#8211; 4:00 pm</li></ul>",
        };
        const events = await ripper.parseEvents(buildJsonData([offSiteClass]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertain = events.filter(e => 'type' in e && (e as any).type === 'Uncertainty') as UncertaintyError[];

        expect(valid).toHaveLength(1);
        expect(valid[0].location).toBe('Seattle Artist League, 5516 4th Ave S, Seattle, WA 98108');
        expect(uncertain).toHaveLength(1);
        expect(uncertain[0].unknownFields).toEqual(['location']);
    });

    test('resolves a morning-to-afternoon shorthand range ("10:00 – 1:00 pm") to 10am, not 10pm', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const morningClass = {
            ...CLASS_WITH_TIME_BULLET,
            id: 11,
            name: "Beginning Wheel 2 SUNDAY MORNING begins 10.4",
            slug: "beginning-wheel-2-sunday-morning-begins-10-4",
            short_description: "<ul><li>Time: 10:00 &#8211; 1:00 pm</li></ul>",
        };
        const events = await ripper.parseEvents(buildJsonData([morningClass]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertain = events.filter(e => 'type' in e && (e as any).type === 'Uncertainty');

        expect(valid).toHaveLength(1);
        expect(uncertain).toHaveLength(0);
        expect(valid[0].date.hour()).toBe(10);
        expect(valid[0].date.minute()).toBe(0);
        expect(valid[0].duration.toHours()).toBe(3);
    });

    test('ignores a session-length decimal ("3.5 hour workshop") regardless of whether it precedes or trails the real start date', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        // Real fixture title: the decimal happens to precede the date, which
        // the old last-match-wins logic already got right by coincidence.
        const decimalFirst = {
            ...CLASS_WITH_TIME_BULLET,
            id: 12,
            name: "FREE No Tears Critique SATURDAY MORNING 3.5 hour workshop 9.5",
            slug: "free-no-tears-critique-saturday-morning-3-5-hour-workshop-9-5",
            short_description: "<ul><li>Time: 9:30 &#8211; 1:00 pm</li></ul>",
        };
        // The regression this fix actually targets: a decimal *after* the
        // real date used to win under plain last-match selection.
        const decimalTrailing = {
            ...CLASS_WITH_TIME_BULLET,
            id: 13,
            name: "FREE No Tears Critique SATURDAY MORNING begins 9.5, 3.5 hour workshop",
            slug: "free-no-tears-critique-saturday-morning-begins-9-5-3-5-hour-workshop",
            short_description: "<ul><li>Time: 9:30 &#8211; 1:00 pm</li></ul>",
        };
        const events = await ripper.parseEvents(buildJsonData([decimalFirst, decimalTrailing]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(2);
        for (const event of valid) {
            expect(event.date.monthValue()).toBe(9);
            expect(event.date.dayOfMonth()).toBe(5);
        }
    });

    test('falls back to the default venue address when the entire "Where:" value is the bare "FREE" bullet', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const freeNoAddress = {
            ...CLASS_WITH_TIME_BULLET,
            id: 13,
            name: "FREE Community Night TUESDAY EVENING begins 9.15",
            slug: "free-community-night-tuesday-evening-begins-9-15",
            short_description: "<ul><li>Time: 6:00 &#8211; 8:00 pm</li><li>Where: FREE</li></ul>",
        };
        const events = await ripper.parseEvents(buildJsonData([freeNoAddress]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(1);
        expect(valid[0].location).toBe('Seattle Artist League, 5516 4th Ave S, Seattle, WA 98108');
    });

    test('skips ONLINE classes (not a physical Seattle event) without emitting an error', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const events = await ripper.parseEvents(buildJsonData([ONLINE_CLASS]), testDate, {});
        expect(events).toHaveLength(0);
    });

    test('skips Membership-category products without emitting an error', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const events = await ripper.parseEvents(buildJsonData([MEMBERSHIP_PRODUCT]), testDate, {});
        expect(events).toHaveLength(0);
    });

    test('emits a ParseError when the title has no start date', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const events = await ripper.parseEvents(buildJsonData([NO_DATE_IN_TITLE]), testDate, {});
        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('emits a ParseError instead of crashing on an impossible calendar date, without dropping other products', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const events = await ripper.parseEvents(buildJsonData([IMPOSSIBLE_CALENDAR_DATE, CLASS_WITH_TIME_BULLET]), testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect((errors[0] as RipperError & { reason: string }).reason).toMatch(/not a valid calendar date/);
        expect(valid).toHaveLength(1);
        expect(valid[0].id).toBe('beginning-drawing-wednesday-evening-begins-10-28');
    });

    test('does not misread a version-like "10.28.5" trailing digit group as a different date', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const versionLike = {
            ...CLASS_WITH_TIME_BULLET,
            id: 15,
            name: "Beginning Drawing WEDNESDAY EVENING begins 10.28.5",
            slug: "beginning-drawing-wednesday-evening-begins-10-28-5",
        };
        const events = await ripper.parseEvents(buildJsonData([versionLike]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // TITLE_DATE_PATTERN's (?!\d) lookahead only rejects a match
        // immediately followed by another digit, not a whole "X.Y.Z" chain,
        // but the regex's own matching order still isolates "10.28" here:
        // matchAll continues scanning from the end of that match (right
        // after "28", at ".5"), and a lone trailing "5" with no further
        // "N.N" shape never produces a second candidate to prefer instead.
        expect(valid).toHaveLength(1);
        expect(valid[0].date.monthValue()).toBe(10);
        expect(valid[0].date.dayOfMonth()).toBe(28);
    });

    test('marks a sold-out class instead of publishing a price', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const events = await ripper.parseEvents(buildJsonData([SOLD_OUT_CLASS]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(valid).toHaveLength(1);
        expect(valid[0].cost).toEqual({ soldOut: true });
    });

    test('deduplicates repeated slugs across calendar days', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const first = await ripper.parseEvents(buildJsonData([CLASS_WITH_TIME_BULLET]), testDate, {});
        const second = await ripper.parseEvents(buildJsonData([CLASS_WITH_TIME_BULLET]), testDate, {});
        expect(first).toHaveLength(1);
        expect(second).toHaveLength(0);
    });

    test('stays in the current year exactly at the PAST_TOLERANCE_DAYS boundary, rolls just beyond it', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        // testDate is Sept 2, 2026. Aug 30 is exactly 3 days before (grace
        // boundary - stays this year); Aug 29 is 4 days before (rolls to 2027).
        const atBoundary = {
            ...CLASS_WITH_TIME_BULLET,
            id: 9,
            name: "Beginning Drawing WEDNESDAY EVENING begins 8.30",
            slug: "beginning-drawing-wednesday-evening-begins-8-30",
        };
        const justPastBoundary = {
            ...CLASS_WITH_TIME_BULLET,
            id: 10,
            name: "Beginning Drawing WEDNESDAY EVENING begins 8.29",
            slug: "beginning-drawing-wednesday-evening-begins-8-29",
        };
        const events = await ripper.parseEvents(buildJsonData([atBoundary, justPastBoundary]), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const atBoundaryEvent = valid.find(e => e.id === 'beginning-drawing-wednesday-evening-begins-8-30')!;
        const justPastBoundaryEvent = valid.find(e => e.id === 'beginning-drawing-wednesday-evening-begins-8-29')!;
        expect(atBoundaryEvent.date.year()).toBe(2026);
        expect(justPastBoundaryEvent.date.year()).toBe(2027);
    });

    test('parses the live sample fixture, surfacing only the expected non-event products as ParseErrors', async () => {
        const ripper = new SeattleArtistLeagueRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const errors = events.filter(e => 'type' in e && (e as any).type !== 'Uncertainty') as RipperError[];
        const uncertain = events.filter(e => 'type' in e && (e as any).type === 'Uncertainty');
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // A handful of real catalog entries (gift certificates, the
        // certificate program, drop-in sessions, kits, independent study)
        // are genuinely undated products, not classes - they're expected to
        // surface as ParseErrors rather than being silently dropped.
        expect(valid.length).toBeGreaterThan(50);
        // Only listings with no "Time:" bullet at all should end up
        // uncertain - a regression that mis-parses a *present* bullet (e.g.
        // misreading "10:00 – 1:00 pm" as 10pm instead of 10am) would
        // silently inflate this count instead of failing loudly.
        expect(uncertain.length).toBeLessThanOrEqual(6);
        for (const error of errors) {
            expect(error.type).toBe('ParseError');
        }
    });
});
