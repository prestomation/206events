import { describe, expect, test } from 'vitest';
import BadAlbertsRipper from './ripper.js';
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

const testDate = ZonedDateTime.parse('2026-09-02T00:00:00-07:00[America/Los_Angeles]');

describe('Bad Alberts Ripper', () => {
    test('parses all events from the sample page', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors).toEqual([]);

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(3);

        const titles = validEvents.map(e => e.summary);
        expect(titles).toContain('Labor Day');
        expect(titles).toContain('National Sandwich Day');
        expect(titles).toContain("ST Paddy Day Karaoke @ Bad Albert's Tap & Grill Hosted by Olus");
    });

    test('parses start time, timezone, and description from the atc_* vars', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const laborDay = validEvents.find(e => e.summary === 'Labor Day')!;

        expect(laborDay.date.year()).toBe(2026);
        expect(laborDay.date.monthValue()).toBe(9);
        expect(laborDay.date.dayOfMonth()).toBe(7);
        expect(laborDay.date.hour()).toBe(11);
        expect(laborDay.date.zone().id()).toBe('America/Los_Angeles');
        expect(laborDay.duration.toHours()).toBe(11);
        expect(laborDay.description).toBe('Come celebrate the long Labor Day weekend with us!');
    });

    test('rolls an overnight end time (encoded as 00:00 same day) to the next day', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const karaoke = validEvents.find(e => e.summary.includes('Karaoke'))!;

        expect(karaoke.date.hour()).toBe(20);
        expect(karaoke.duration.toHours()).toBe(4);
    });

    test('prefers the event-info-text paragraphs over the glued-together atc_description', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const karaoke = validEvents.find(e => e.summary.includes('Karaoke'))!;

        expect(karaoke.description).toContain('Annually on March 17th');
        expect(karaoke.description).toContain('Shamrocks & Showstoppers');
        // Paragraphs stay newline-separated rather than run together.
        expect(karaoke.description).not.toContain('OlusBad');
    });

    test('extracts a per-event photo when the section has one, protocol-relative URLs made absolute', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const karaoke = validEvents.find(e => e.summary.includes('Karaoke'))!;
        const laborDay = validEvents.find(e => e.summary === 'Labor Day')!;

        expect(karaoke.imageUrl).toBe('https://static.spotapps.co/spots/d4/785a24067040acbcd99244a8ac0ad0/w926');
        // Not every event has a per-event photo uploaded.
        expect(laborDay.imageUrl).toBeUndefined();
    });

    test('all events have required fields and stable, source-derived ids', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.ripped).toBeInstanceOf(Date);
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.summary).toBeTruthy();
            expect(event.id).toMatch(/^bad-alberts-\d+$/);
            expect(event.url).toBe('https://badalberts.com/-events');
            expect(event.location).toBe("Bad Albert's Tap & Grill, 5100 Ballard Avenue NW, Seattle, WA 98107");
        }
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const firstCall = await ripper.parseEvents(html, testDate, {});
        const secondCall = await ripper.parseEvents(html, testDate, {});

        expect(firstCall.filter(e => 'summary' in e).length).toBe(3);
        expect(secondCall.filter(e => 'summary' in e).length).toBe(0);
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new BadAlbertsRipper();
        const html = parse('<html><body></body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });

    test('reports a ParseError for a section missing atc_date_start/atc_title', async () => {
        const ripper = new BadAlbertsRipper();
        const html = parse('<section id="123"><div class="atc_description">No title or date</div></section>');

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(1);
        expect(errors[0].type).toBe('ParseError');
    });
});
