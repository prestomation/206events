import { describe, expect, test } from 'vitest';
import WatershedPubRipper, { parseBlurbDate } from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

const testDate = ZonedDateTime.parse('2026-09-01T00:00:00-07:00[America/Los_Angeles]');

describe('parseBlurbDate', () => {
    test('skips empty (perpetually-recurring, no occurrence date)', () => {
        expect(parseBlurbDate('')).toEqual({ kind: 'skip' });
    });

    test('skips a bare date with no time (closure/hours notice)', () => {
        expect(parseBlurbDate('Nov 26, 2026')).toEqual({ kind: 'skip' });
    });

    test('skips a date range with no time (closure/hours notice)', () => {
        expect(parseBlurbDate('Dec 24, 2026 - Jan 01, 2027')).toEqual({ kind: 'skip' });
    });

    test('skips a multi-month timed range (seasonal promo, not a discrete event)', () => {
        const result = parseBlurbDate('Jun 05, 2026 @ 11:00 AM - Sep 25, 2026 @ 11:00 PM');
        expect(result).toEqual({ kind: 'skip' });
    });

    test('parses a single date + start time with a default duration', () => {
        const result = parseBlurbDate('Sep 23, 2026 @ 6:00 PM');
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.date.monthValue()).toBe(9);
        expect(result.date.dayOfMonth()).toBe(23);
        expect(result.date.hour()).toBe(18);
        expect(result.duration.toHours()).toBe(2);
    });

    test('parses a same-day start/end time range', () => {
        const result = parseBlurbDate('Sep 20, 2026 @ 4:00 PM - 8:00 PM');
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.date.hour()).toBe(16);
        expect(result.duration.toHours()).toBe(4);
    });

    test('parses a short multi-day date+time range', () => {
        const result = parseBlurbDate('Sep 04, 2026 @ 11:00 AM - Sep 10, 2026 @ 10:00 PM');
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.date.dayOfMonth()).toBe(4);
        expect(result.date.hour()).toBe(11);
        expect(result.duration.toHours()).toBe(155);
    });

    test('errors on an unrecognized shape', () => {
        const result = parseBlurbDate('Whenever @ some point');
        expect(result.kind).toBe('error');
    });
});

describe('Watershed Pub Ripper', () => {
    test('parses only concretely-dated, timed events from the sample page', async () => {
        const ripper = new WatershedPubRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors).toEqual([]);

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(7);

        const titles = validEvents.map(e => e.summary);
        expect(titles).toContain('Live at the Shed: Daniel Rapport');
        expect(titles).toContain('13th Annual Alpenfire Cider Dinner: Orchard to Island');
        expect(titles).toContain('PickleFest: Ready for Brine Time');

        // Recurring/undated blurbs, closure notices, and the months-long
        // seasonal promo ranges are all intentionally filtered out.
        expect(titles).not.toContain('Every Monday: Music Mondays - I Want My Shed TV @ 8pm');
        expect(titles).not.toContain('Happy Hour');
        expect(titles).not.toContain('Closed for Thanksgiving');
        expect(titles).not.toContain('Holiday Hours');
        expect(titles).not.toContain('Every Friday - Farmers Market Fridays!');
        expect(titles).not.toContain('Fresh Hop Frenzy');
    });

    test('all events have required fields and stable, source-derived ids', async () => {
        const ripper = new WatershedPubRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.ripped).toBeInstanceOf(Date);
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.summary).toBeTruthy();
            expect(event.id).toMatch(/^watershed-pub-/);
            expect(event.url).toContain('https://www.watershedpub.com/events#');
            expect(event.location).toBe('The Watershed Pub & Kitchen, 10104 3rd Ave NE, Seattle, WA 98125');
        }
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new WatershedPubRipper();
        const html = loadSampleHtml();

        const firstCall = await ripper.parseEvents(html, testDate, {});
        const secondCall = await ripper.parseEvents(html, testDate, {});

        expect(firstCall.filter(e => 'summary' in e).length).toBe(7);
        expect(secondCall.filter(e => 'summary' in e).length).toBe(0);
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new WatershedPubRipper();
        const html = parse('<html><body></body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });
});
