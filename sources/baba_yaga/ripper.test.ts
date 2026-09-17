import { describe, expect, test } from 'vitest';
import BabaYagaRipper from './ripper.js';
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

const testDate = ZonedDateTime.parse('2026-09-17T00:00:00-07:00[America/Los_Angeles]');

function buildJsonData(events: any[], images: any[] = []): any {
    return { events, linked: { images } };
}

const TIMED_EVENT = {
    id: 2256701,
    name: "National Coffee Day",
    text: "Sit back, relax and enjoy a coffee for National Coffee Day September 29th!",
    event_date: "2026-09-29T00:00:00.000+00:00",
    all_day: false,
    start_time: "11:00",
    duration_minutes: 900,
    links: { images: [] },
};

const EVENT_WITH_IMAGE = {
    id: 2279635,
    name: "National Taco Day",
    text: "Celebrate National Taco Day with us on October 6th!",
    event_date: "2026-10-06T00:00:00.000+00:00",
    all_day: false,
    start_time: "11:00",
    duration_minutes: 900,
    links: { images: [7900001] },
};

const IMAGE_LINKED = { id: 7900001, url: "//static.spotapps.co/spots/38/c8e7bef2424690bfcac97f433b31c3/full" };

const ALL_DAY_EVENT = {
    id: 2343200,
    name: "Halloween",
    text: "Bring your best costume and join us on Halloween!",
    event_date: "2026-10-31T00:00:00.000+00:00",
    all_day: true,
};

const MISSING_START_TIME = {
    id: 3100001,
    name: "Mystery Hours",
    text: "No start time given upstream.",
    event_date: "2026-11-01T00:00:00.000+00:00",
    all_day: false,
};

const ZERO_DURATION = {
    id: 3100002,
    name: "Instant Happy Hour",
    text: "Duration missing upstream.",
    event_date: "2026-11-02T00:00:00.000+00:00",
    all_day: false,
    start_time: "17:00",
    duration_minutes: 0,
};

const MISSING_EVENT_DATE = {
    id: 3100003,
    name: "Undated Promo",
    text: "No event_date at all.",
    all_day: false,
    start_time: "17:00",
};

describe('Baba Yaga Ripper', () => {
    test('parses a timed event with correct date, time, and duration', async () => {
        const ripper = new BabaYagaRipper();
        const jsonData = buildJsonData([TIMED_EVENT]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        const e = events[0];
        expect(e.date.year()).toBe(2026);
        expect(e.date.monthValue()).toBe(9);
        expect(e.date.dayOfMonth()).toBe(29);
        expect(e.date.hour()).toBe(11);
        expect(e.date.minute()).toBe(0);
        expect(e.duration.toMinutes()).toBe(900);
        expect(e.id).toBe('baba-yaga-2256701');
        expect(e.summary).toBe('National Coffee Day');
        expect(e.location).toContain('Baba Yaga');
        expect(e.url).toBe('https://babayagaseattle.com/seattle-baba-yaga-events-days');
        expect(e.imageUrl).toBeUndefined();
    });

    test('resolves an event image through the linked.images join', async () => {
        const ripper = new BabaYagaRipper();
        const jsonData = buildJsonData([EVENT_WITH_IMAGE], [IMAGE_LINKED]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        expect(events[0].imageUrl).toBe('https://static.spotapps.co/spots/38/c8e7bef2424690bfcac97f433b31c3/full');
    });

    test('treats an all_day event as a full-day event starting at midnight', async () => {
        const ripper = new BabaYagaRipper();
        const jsonData = buildJsonData([ALL_DAY_EVENT]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        expect(events[0].date.hour()).toBe(0);
        expect(events[0].date.minute()).toBe(0);
        expect(events[0].duration.toDays()).toBe(1);
    });

    test('emits a placeholder midnight event plus an UncertaintyError when start_time is missing on a non-all_day event', async () => {
        const ripper = new BabaYagaRipper();
        const jsonData = buildJsonData([MISSING_START_TIME]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        const calendarEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertainties = events.filter(e => 'type' in e && (e as any).type === 'Uncertainty') as any[];
        expect(calendarEvents).toHaveLength(1);
        expect(calendarEvents[0].date.hour()).toBe(0);
        expect(calendarEvents[0].date.minute()).toBe(0);
        expect(uncertainties).toHaveLength(1);
        expect(uncertainties[0].unknownFields).toEqual(['startTime']);
        expect(uncertainties[0].source).toBe('baba-yaga');
        expect(uncertainties[0].event.id).toBe(calendarEvents[0].id);
    });

    test('falls back to a 60-minute duration when duration_minutes is missing or zero', async () => {
        const ripper = new BabaYagaRipper();
        const jsonData = buildJsonData([ZERO_DURATION]);
        const events = await ripper.parseEvents(jsonData, testDate, {}) as RipperCalendarEvent[];

        expect(events).toHaveLength(1);
        expect(events[0].duration.toMinutes()).toBe(60);
    });

    test('emits a ParseError (never drops silently) when event_date is missing', async () => {
        const ripper = new BabaYagaRipper();
        const jsonData = buildJsonData([MISSING_EVENT_DATE]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('emits a ParseError for malformed top-level JSON instead of crashing', async () => {
        const ripper = new BabaYagaRipper();
        const events = await ripper.parseEvents({ notEvents: [] }, testDate, {});
        expect(events).toHaveLength(1);
        expect((events[0] as RipperError).type).toBe('ParseError');
    });

    test('does not drop other events when one event in the batch is malformed', async () => {
        const ripper = new BabaYagaRipper();
        const jsonData = buildJsonData([MISSING_EVENT_DATE, TIMED_EVENT]);
        const events = await ripper.parseEvents(jsonData, testDate, {});

        const errors = events.filter(e => 'type' in e) as RipperError[];
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(errors).toHaveLength(1);
        expect(valid).toHaveLength(1);
        expect(valid[0].id).toBe('baba-yaga-2256701');
    });

    test('parses all events from the live sample fixture with no errors', async () => {
        const ripper = new BabaYagaRipper();
        const jsonData = loadSampleData();
        const events = await ripper.parseEvents(jsonData, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(0);
        expect(events.length).toBe(2);
    });
});
