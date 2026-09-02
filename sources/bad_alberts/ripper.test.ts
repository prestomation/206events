import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperError, UncertaintyError } from '../../lib/config/schema.js';
import BadAlbertsRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDate = ZonedDateTime.parse('2026-08-01T00:00:00-07:00[America/Los_Angeles]');

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

describe('BadAlbertsRipper', () => {
    it('parses events from sample HTML', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents.length).toBe(3);
        expect(calEvents.map(e => e.summary)).toEqual(expect.arrayContaining([
            'Labor Day',
            'National Sandwich Day',
        ]));
    });

    it('sets a stable id derived from the section id', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const laborDay = calEvents.find(e => e.summary === 'Labor Day');
        expect(laborDay?.id).toBe('bad-alberts-2177299');
    });

    it('parses start date/time and duration from atc_date_start/atc_date_end', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const laborDay = calEvents.find(e => e.summary === 'Labor Day')!;
        expect(laborDay.date.year()).toBe(2026);
        expect(laborDay.date.monthValue()).toBe(9);
        expect(laborDay.date.dayOfMonth()).toBe(7);
        expect(laborDay.date.hour()).toBe(11);
        // 11:00 AM - 10:00 PM = 11 hours
        expect(laborDay.duration.toHours()).toBe(11);
    });

    it('rolls duration to the next day when atc_date_end is earlier than atc_date_start', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const karaoke = calEvents.find(e => e.summary.includes('Karaoke'))!;
        expect(karaoke).toBeDefined();
        // 08:00 PM - 12:00 AM crosses midnight = 4 hours
        expect(karaoke.duration.toHours()).toBe(4);
    });

    it('extracts the venue address and a free cost default', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of calEvents) {
            expect(event.location).toContain("Bad Albert's Tap & Grill");
            expect(event.cost).toEqual({ min: 0 });
        }
    });

    it('extracts an event image when present', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const karaoke = calEvents.find(e => e.summary.includes('Karaoke'))!;
        expect(karaoke.imageUrl).toMatch(/^https:\/\/static\.spotapps\.co\//);
    });

    it('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events1 = await ripper.parseEvents(html, testDate, {});
        const events2 = await ripper.parseEvents(html, testDate, {});

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1.length).toBe(3);
        expect(valid2.length).toBe(0);
    });

    it('emits a ParseError for a section missing the atc_event block', async () => {
        const ripper = new BadAlbertsRipper();
        const html = parse(`<html><div class="events-holder"><section id="999"><div class="row event-content"><div class="event-text-holder"><h2>No ATC Block</h2></div></div></section></div></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('skips a section with no id', async () => {
        const ripper = new BadAlbertsRipper();
        const html = parse(`<html><div class="events-holder"><section><div class="row event-content"></div></section></div></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events).toHaveLength(0);
    });

    it('emits no Uncertainty errors for the sample data (every event has a valid atc_date_end)', async () => {
        const ripper = new BadAlbertsRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const uncertainties = events.filter(e => 'type' in e && e.type === 'Uncertainty');

        expect(uncertainties).toHaveLength(0);
    });

    function atcSection(id: string, extra: string): string {
        return `<html><div class="events-holder"><section id="${id}"><div class="row event-content"><div class="event-text-holder"><span class="addtocalendar"><var class="atc_event"><var class="atc_date_start">2026-09-07 11:00:00</var>${extra}<var class="atc_title">Test Event</var></var></span></div></div></section></div></html>`;
    }

    it('falls back to the default duration and flags Uncertainty when atc_date_end is missing', async () => {
        const ripper = new BadAlbertsRipper();
        const html = parse(atcSection('1001', ''));

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertainties = events.filter(e => 'type' in e && e.type === 'Uncertainty') as UncertaintyError[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].duration.toMinutes()).toBe(120);
        expect(uncertainties).toHaveLength(1);
        expect(uncertainties[0].unknownFields).toEqual(['duration']);
        expect(uncertainties[0].event.id).toBe(calEvents[0].id);
    });

    it('falls back to the default duration and flags Uncertainty when atc_date_end equals atc_date_start', async () => {
        const ripper = new BadAlbertsRipper();
        const html = parse(atcSection('1002', '<var class="atc_date_end">2026-09-07 11:00:00</var>'));

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertainties = events.filter(e => 'type' in e && e.type === 'Uncertainty');

        expect(calEvents).toHaveLength(1);
        // Must NOT silently become a 24-hour event.
        expect(calEvents[0].duration.toMinutes()).toBe(120);
        expect(uncertainties).toHaveLength(1);
    });

    it('does not flag Uncertainty when atc_date_end is a valid, later timestamp', async () => {
        const ripper = new BadAlbertsRipper();
        const html = parse(atcSection('1003', '<var class="atc_date_end">2026-09-07 13:00:00</var>'));

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const uncertainties = events.filter(e => 'type' in e && e.type === 'Uncertainty');

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].duration.toMinutes()).toBe(120);
        expect(uncertainties).toHaveLength(0);
    });
});
