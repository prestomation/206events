import { describe, expect, test } from 'vitest';
import AngryBeaverSeattleRipper from './ripper.js';
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

const testDate = ZonedDateTime.parse('2026-09-12T00:00:00-07:00[America/Los_Angeles]');

function buildJsonData(events: any[]): any {
    return { events };
}

const TIMED_EVENT = {
    id: 2221621,
    name: "National Cheeseburger Day",
    text: "Come grab a giant juicy cheeseburger for National Cheeseburger Day Sept 18th!",
    event_date: "2026-09-18T00:00:00.000+00:00",
    all_day: false,
    start_time: "11:00",
    duration_minutes: 780,
    links: { images: [] },
};

const EVENT_WITH_IMAGE = {
    id: 2246888,
    name: "National Drink Beer Day",
    text: "Join us for National Drink Beer Day and try one of our many craft brews!",
    event_date: "2026-09-28T00:00:00.000+00:00",
    all_day: false,
    start_time: "11:00",
    duration_minutes: 660,
    links: { images: [{ url: "https://spothopperapp.com/images/beer-day.jpg" }] },
};

const ALL_DAY_EVENT = {
    id: 2342627,
    name: "Halloween",
    text: "Bring your best costume and join us on Halloween!",
    event_date: "2026-10-31T00:00:00.000+00:00",
    all_day: true,
};

const MISSING_START_TIME = {
    id: 3000001,
    name: "Mystery Hours",
    text: "No start time given upstream.",
    event_date: "2026-11-01T00:00:00.000+00:00",
    all_day: false,
};

const ZERO_DURATION = {
    id: 3000002,
    name: "Instant Happy Hour",
    text: "Duration missing upstream.",
    event_date: "2026-11-02T00:00:00.000+00:00",
    all_day: false,
    start_time: "17:00",
    duration_minutes: 0,
};

const MISSING_EVENT_DATE = {
    id: 3000003,
    name: "Undated Promo",
    text: "No event_date at all.",
    all_day: false,
    start_time: "17:00",
};

describe('Angry Beaver Seattle Ripper', () => {
    test('parses a timed event with correct date, time, and duration', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const jsonData = buildJsonData([TIMED_EVENT]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        const e = events[0];
        expect(e.date.year()).toBe(2026);
        expect(e.date.monthValue()).toBe(9);
        expect(e.date.dayOfMonth()).toBe(18);
        expect(e.date.hour()).toBe(11);
        expect(e.date.minute()).toBe(0);
        expect(e.duration.toMinutes()).toBe(780);
        expect(e.id).toBe('angry-beaver-seattle-2221621');
        expect(e.summary).toBe('National Cheeseburger Day');
        expect(e.location).toContain('The Angry Beaver');
        expect(e.url).toBe('https://theangrybeaverseattle.com/events');
        expect(e.imageUrl).toBeUndefined();
    });

    test('picks up an event image when SpotHopper provides one', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const jsonData = buildJsonData([EVENT_WITH_IMAGE]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        expect(events[0].imageUrl).toBe('https://spothopperapp.com/images/beer-day.jpg');
    });

    test('treats an all_day event as a full-day event starting at midnight', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const jsonData = buildJsonData([ALL_DAY_EVENT]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        expect(events[0].date.hour()).toBe(0);
        expect(events[0].date.minute()).toBe(0);
        expect(events[0].duration.toDays()).toBe(1);
    });

    test('emits a placeholder midnight event plus an UncertaintyError when start_time is missing on a non-all_day event', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const jsonData = buildJsonData([MISSING_START_TIME]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertainties = events.filter(e => 'type' in e && (e as any).type === 'Uncertainty') as any[];
        expect(calendarEvents).toHaveLength(1);
        expect(calendarEvents[0].date.hour()).toBe(0);
        expect(calendarEvents[0].date.minute()).toBe(0);
        expect(uncertainties).toHaveLength(1);
        expect(uncertainties[0].unknownFields).toEqual(['startTime']);
        expect(uncertainties[0].source).toBe('angry-beaver-seattle');
        expect(uncertainties[0].event.id).toBe(calendarEvents[0].id);
    });

    test('falls back to a 60-minute duration when duration_minutes is missing or zero', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const jsonData = buildJsonData([ZERO_DURATION]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        expect(events[0].duration.toMinutes()).toBe(60);
    });

    test('emits a ParseError (never drops silently) when event_date is missing', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const jsonData = buildJsonData([MISSING_EVENT_DATE]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('emits a ParseError for malformed top-level JSON instead of crashing', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const events = await ripper.parseEvents({ notEvents: [] }, testDate, {});
        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('does not drop other events when one event in the batch is malformed', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const jsonData = buildJsonData([MISSING_EVENT_DATE, TIMED_EVENT]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        const errors = events.filter(e => 'type' in e) as RipperError[];
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(errors).toHaveLength(1);
        expect(valid).toHaveLength(1);
        expect(valid[0].id).toBe('angry-beaver-seattle-2221621');
    });

    test('parses all events from the live sample fixture with no errors', async () => {
        const ripper = new AngryBeaverSeattleRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(0);
        expect(events.length).toBe(5);
    });
});
