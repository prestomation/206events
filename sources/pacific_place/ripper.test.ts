import { describe, expect, test } from 'vitest';
import PacificPlaceRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

const testDate = ZonedDateTime.parse('2026-05-21T00:00:00-07:00[America/Los_Angeles]');

describe('Pacific Place Ripper', () => {
    test('skips events with no end date (recurring forever)', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents(loadSampleData(), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // 5 events in sample data, but 3 have end_date=null OR no_end_date=true
        // (Snail Mail Sunday + two Daily Happy Hours) — only 2 dated events remain.
        expect(valid).toHaveLength(2);
        expect(valid.map(e => e.summary.trim()).sort()).toEqual([
            'Celebrating Success',
            'May Art Market'
        ]);
    });

    test('parses May Art Market with correct start time and multi-day duration', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents(loadSampleData(), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const market = valid.find(e => e.summary.trim() === 'May Art Market');
        expect(market).toBeDefined();
        // start_date "2026-05-22T23:00:00.000Z" → May 22 4:00 PM PDT
        expect(market!.date.year()).toBe(2026);
        expect(market!.date.monthValue()).toBe(5);
        expect(market!.date.dayOfMonth()).toBe(22);
        expect(market!.date.hour()).toBe(16);
        expect(market!.date.minute()).toBe(0);
        // 2026-05-22T23:00:00Z → 2026-05-24T23:00:59Z is 48h + 59s
        expect(market!.duration.toHours()).toBe(48);
    });

    test('uses MallMaverick event id as stable id', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents(loadSampleData(), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const market = valid.find(e => e.summary.trim() === 'May Art Market');
        expect(market!.id).toBe('51500');

        const gallery = valid.find(e => e.summary.trim() === 'Celebrating Success');
        expect(gallery!.id).toBe('51888');
    });

    test('annotates store-hosted events with store name in location and description', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents(loadSampleData(), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const gallery = valid.find(e => e.summary.trim() === 'Celebrating Success');
        expect(gallery!.location).toContain('Gallery Onyx');
        expect(gallery!.location).toContain('Pacific Place');
        expect(gallery!.description).toContain('Gallery Onyx');
    });

    test('property-level event uses bare Pacific Place location', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents(loadSampleData(), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const market = valid.find(e => e.summary.trim() === 'May Art Market');
        expect(market!.location).toBe('Pacific Place, 600 Pine St, Seattle, WA 98101');
    });

    test('preserves event image url', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents(loadSampleData(), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const market = valid.find(e => e.summary.trim() === 'May Art Market');
        expect(market!.imageUrl).toMatch(/^https:\/\/.+\.(jpg|jpeg|png)$/i);
    });

    test('cleans double-slash in url', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents(loadSampleData(), testDate, {});
        const valid = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const e of valid) {
            expect(e.url).not.toMatch(/[^:]\/\//);
        }
    });

    test('deduplicates repeated events across parseEvents calls', async () => {
        const ripper = new PacificPlaceRipper();
        const data = loadSampleData();
        const first = await ripper.parseEvents(data, testDate, {});
        const second = await ripper.parseEvents(data, testDate, {});

        const firstValid = first.filter(e => 'summary' in e);
        const secondValid = second.filter(e => 'summary' in e);
        expect(firstValid.length).toBe(2);
        expect(secondValid.length).toBe(0);
    });

    test('returns ParseError when payload is not an array', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents({ events: [] }, testDate, {});
        expect(events).toHaveLength(1);
        const err = events[0] as RipperError;
        expect(err.type).toBe('ParseError');
        expect(err.reason).toContain('array');
    });

    test('returns ParseError on missing start_date', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents([
            { id: 998, status: 'active', name: 'No start', end_date: '2026-06-01T00:00:00.000Z', eventable: { type: 'Property' } }
        ], testDate, {});
        expect(events.filter(e => 'summary' in e)).toHaveLength(0);
        const err = events[0] as RipperError;
        expect(err.type).toBe('ParseError');
        expect(err.reason).toContain('missing start_date');
    });

    test('returns ParseError on malformed start_date', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents([
            { id: 999, status: 'active', name: 'Bad', start_date: 'not-a-date', end_date: '2026-06-01T00:00:00.000Z', eventable: { type: 'Property' } }
        ], testDate, {});
        expect(events.filter(e => 'summary' in e)).toHaveLength(0);
        const err = events[0] as RipperError;
        expect(err.type).toBe('ParseError');
    });

    test('skips inactive events', async () => {
        const ripper = new PacificPlaceRipper();
        const events = await ripper.parseEvents([
            { id: 999, status: 'inactive', name: 'Hidden', start_date: '2026-06-01T00:00:00.000Z', end_date: '2026-06-02T00:00:00.000Z', eventable: { type: 'Property' } }
        ], testDate, {});
        expect(events).toHaveLength(0);
    });
});
