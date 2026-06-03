import { describe, expect, test } from 'vitest';
import HuskyLinkRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    const jsonPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

const testDate = ZonedDateTime.parse('2026-05-23T00:00:00-07:00[America/Los_Angeles]');

describe('HuskyLinkRipper', () => {
    test('parses events from sample data', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(8);
    });

    test('returns ParseError when payload is not the discovery envelope', async () => {
        const ripper = new HuskyLinkRipper();

        const events = await ripper.parseEvents({ error: "not found" }, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toMatch(/value/i);
    });

    test('returns ParseError when value is not an array', async () => {
        const ripper = new HuskyLinkRipper();

        const events = await ripper.parseEvents({ value: "oops" }, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    test('builds summary as "<event name> — <organization>"', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tcd = valid.find(e => e.id === '12469457')!;
        expect(tcd).toBeDefined();
        expect(tcd.summary).toBe('TCD 4TH ANNUAL SPRING SHOWCASE — Traditional Chinese Dance');
    });

    test('falls back to event name alone when organizationName is missing', async () => {
        const ripper = new HuskyLinkRipper();

        const events = await ripper.parseEvents({
            value: [{
                id: 999,
                name: "Bare Event",
                startsOn: "2026-06-10T00:00:00+00:00",
                endsOn: "2026-06-10T02:00:00+00:00",
                location: "Somewhere"
            }]
        }, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid).toHaveLength(1);
        expect(valid[0].summary).toBe('Bare Event');
    });

    test('parses startsOn UTC into the calendar timezone', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // TCD showcase starts 2026-05-23T23:00 UTC == 2026-05-23T16:00 PDT
        const tcd = valid.find(e => e.id === '12469457')!;
        expect(tcd.date.year()).toBe(2026);
        expect(tcd.date.monthValue()).toBe(5);
        expect(tcd.date.dayOfMonth()).toBe(23);
        expect(tcd.date.hour()).toBe(16);
        expect(tcd.date.minute()).toBe(0);
        expect(tcd.date.zone().id()).toBe('America/Los_Angeles');
    });

    test('computes duration from startsOn/endsOn', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tcd = valid.find(e => e.id === '12469457')!;
        expect(tcd.duration.toMinutes()).toBe(150); // 23:00 -> 01:30 = 2.5h
    });

    test('defaults duration to 60 minutes when endsOn is absent or invalid', async () => {
        const ripper = new HuskyLinkRipper();

        const events = await ripper.parseEvents({
            value: [{
                id: 777,
                name: "No End",
                startsOn: "2026-06-10T00:00:00+00:00",
                organizationName: "Test Org"
            }]
        }, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid[0].duration.toMinutes()).toBe(60);
    });

    test('sets event URL to the HuskyLink event page', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tcd = valid.find(e => e.id === '12469457')!;
        expect(tcd.url).toBe('https://huskylink.washington.edu/event/12469457');
    });

    test('resolves image path against the CampusLabs CDN', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tcd = valid.find(e => e.id === '12469457')!;
        expect(tcd.imageUrl).toMatch(/^https:\/\/se-images\.campuslabs\.com\/clink\/images\//);
    });

    test('omits image when imagePath is null', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // YDSA general meeting has imagePath: null in the sample
        const ydsa = valid.find(e => e.id === '12475521')!;
        expect(ydsa.imageUrl).toBeUndefined();
    });

    test('copies lat/lng from event payload when present', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const tcd = valid.find(e => e.id === '12469457')!;
        expect(tcd.lat).toBeCloseTo(47.65662, 4);
        expect(tcd.lng).toBeCloseTo(-122.30915, 4);
    });

    test('leaves lat/lng undefined when payload omits coords', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Bird Buddies has latitude: null, longitude: null
        const bird = valid.find(e => e.id === '12444029')!;
        expect(bird.lat).toBeUndefined();
        expect(bird.lng).toBeUndefined();
    });

    test('strips HTML and includes categories + benefits in description', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events = await ripper.parseEvents(data, testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Bartering Club has Free Food benefit and 2 categoryNames
        const bartering = valid.find(e => e.id === '12454688')!;
        expect(bartering.description).not.toContain('<p>');
        expect(bartering.description).not.toContain('</p>');
        expect(bartering.description).toContain('Categories: Presentation/Workshop, Networking');
        expect(bartering.description).toContain('Perks: Free Food');
    });

    test('deduplicates events across multiple calls', async () => {
        const ripper = new HuskyLinkRipper();
        const data = loadSampleData();

        const events1 = await ripper.parseEvents(data, testDate, {});
        const events2 = await ripper.parseEvents(data, testDate, {});

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1).toHaveLength(8);
        expect(valid2).toHaveLength(0);
    });

    test('returns ParseError for events with invalid startsOn', async () => {
        const ripper = new HuskyLinkRipper();

        const events = await ripper.parseEvents({
            value: [{
                id: 1,
                name: "Bad Date",
                startsOn: "not-a-date"
            }]
        }, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('startsOn');
    });

    test('returns ParseError when required fields are missing', async () => {
        const ripper = new HuskyLinkRipper();

        const events = await ripper.parseEvents({
            value: [
                { name: "No ID", startsOn: "2026-06-10T00:00:00+00:00" },
                { id: 1, startsOn: "2026-06-10T00:00:00+00:00" },
                { id: 2, name: "No Date" }
            ]
        }, testDate, {});

        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(valid).toHaveLength(0);
        expect(errors).toHaveLength(3);
    });
});
