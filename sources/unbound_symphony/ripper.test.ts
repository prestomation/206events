import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { parseSummerPopupPage, parseSummerFestivalPage } from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

function isEvent(e: RipperCalendarEvent | RipperError): e is RipperCalendarEvent {
    return 'date' in e;
}

describe('parseSummerPopupPage', () => {
    const url = 'https://www.unboundsymphony.org/summer-popup';

    it('extracts one event per listed date', () => {
        const html = parse(loadSample('sample-summer-popup.html'));
        const results = parseSummerPopupPage(html, url);
        const events = results.filter(isEvent);

        expect(events.length).toBe(3);
    });

    it('parses the shared location for every event', () => {
        const html = parse(loadSample('sample-summer-popup.html'));
        const events = parseSummerPopupPage(html, url).filter(isEvent);

        for (const event of events) {
            expect(event.location).toContain('1200 5th Avenue');
            expect(event.location).toContain('Seattle, WA 98101');
        }
    });

    it('parses the shared time range into a 60 minute duration at noon', () => {
        const html = parse(loadSample('sample-summer-popup.html'));
        const events = parseSummerPopupPage(html, url).filter(isEvent);

        for (const event of events) {
            expect(event.date.hour()).toBe(12);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toMinutes()).toBe(60);
        }
    });

    it('does not emit a time UncertaintyError when the time block parses cleanly', () => {
        const html = parse(loadSample('sample-summer-popup.html'));
        const results = parseSummerPopupPage(html, url);
        const uncertainties = results.filter(e => 'type' in e && e.type === 'Uncertainty');

        expect(uncertainties.length).toBe(0);
    });

    it('attaches the per-date program note as the description', () => {
        const html = parse(loadSample('sample-summer-popup.html'));
        const events = parseSummerPopupPage(html, url).filter(isEvent);

        const julyTwentyNinth = events.find(e => e.date.monthValue() === 7 && e.date.dayOfMonth() === 29);
        expect(julyTwentyNinth?.description).toContain('Dr. Rachel Reyes');
    });

    it('marks the event free', () => {
        const html = parse(loadSample('sample-summer-popup.html'));
        const events = parseSummerPopupPage(html, url).filter(isEvent);

        for (const event of events) {
            expect(event.cost).toEqual({ min: 0 });
        }
    });

    it('produces stable ids derived from the date', () => {
        const html = parse(loadSample('sample-summer-popup.html'));
        const events = parseSummerPopupPage(html, url).filter(isEvent);

        for (const event of events) {
            expect(event.id).toMatch(/^unbound-symphony-met-tract-plaza-\d{4}-\d{2}-\d{2}$/);
        }
    });

    it('returns a ParseError when the Location/Dates blocks are missing', () => {
        const html = parse('<html><body><div class="sqs-html-content"><p class="sqsrte-large">Nothing here</p></div></body></html>');
        const results = parseSummerPopupPage(html, url);

        expect(results.length).toBe(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });

    it('returns a ParseError when the location paragraph has no address line', () => {
        const html = parse(`<html><body><div class="sqs-html-content">
            <p class="sqsrte-large">Location<br>Somewhere vague</p>
            <p class="sqsrte-large">Dates<br>July 29</p>
        </div></body></html>`);
        const results = parseSummerPopupPage(html, url);

        expect(results.length).toBe(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });

    it('flags an unparseable time range as uncertain instead of guessing a negative duration', () => {
        const html = parse(`<html><body><div class="sqs-html-content">
            <p class="sqsrte-large">Location<br>1200 Fifth, Upper Plaza<br>Address: 1200 5th Avenue, Seattle 98101</p>
            <p class="sqsrte-large">Dates<br>July 29</p>
            <p class="sqsrte-large">Time<br>2:00-1:00 PM</p>
        </div></body></html>`);
        const results = parseSummerPopupPage(html, url);
        const events = results.filter(isEvent);
        const uncertainty = results.find(e => 'type' in e && e.type === 'Uncertainty');

        expect(events.length).toBe(1);
        expect(events[0].duration.toMinutes()).toBeGreaterThan(0);
        expect(uncertainty).toBeDefined();
        if (uncertainty && 'unknownFields' in uncertainty) {
            expect(uncertainty.unknownFields).toContain('startTime');
        }
    });
});

describe('parseSummerFestivalPage', () => {
    const url = 'https://www.unboundsymphony.org/summer-festival';

    it('extracts a single multi-day event', () => {
        const html = parse(loadSample('sample-summer-festival.html'));
        const results = parseSummerFestivalPage(html, url);
        const events = results.filter(isEvent);

        expect(events.length).toBe(1);
        expect(events[0].date.year()).toBe(2027);
        expect(events[0].date.monthValue()).toBe(7);
        expect(events[0].date.dayOfMonth()).toBe(7);
        expect(events[0].duration.toDays()).toBe(4);
    });

    it('parses the venue from a second heading when one is present, and does not flag location as uncertain', () => {
        const html = parse(`<html><body><main><div class="sqs-html-content">
            <h2>2nd Unbound Symphony Summer Festival is scheduled for<br>July 7-10, 2027</h2>
            <h2>Highline Performing Arts Center<br>Burien, WA</h2>
        </div></main></body></html>`);
        const results = parseSummerFestivalPage(html, url);
        const events = results.filter(isEvent);
        const uncertainty = results.find(e => 'type' in e && e.type === 'Uncertainty');

        expect(events[0].location).toBe('Highline Performing Arts Center, Burien, WA');
        expect(uncertainty).toBeDefined();
        if (uncertainty && 'unknownFields' in uncertainty) {
            expect(uncertainty.unknownFields).toEqual(['startTime']);
        }
    });

    it('flags the daily start time as uncertain', () => {
        const html = parse(loadSample('sample-summer-festival.html'));
        const results = parseSummerFestivalPage(html, url);
        const uncertainty = results.find(e => 'type' in e && e.type === 'Uncertainty');

        expect(uncertainty).toBeDefined();
        if (uncertainty && 'unknownFields' in uncertainty) {
            expect(uncertainty.unknownFields).toContain('startTime');
        }
    });

    it('leaves location unset and flags it uncertain when no venue heading is published yet', () => {
        const html = parse(loadSample('sample-summer-festival.html'));
        const results = parseSummerFestivalPage(html, url);
        const events = results.filter(isEvent);
        const uncertainty = results.find(e => 'type' in e && e.type === 'Uncertainty');

        expect(events.length).toBe(1);
        expect(events[0].location).toBeUndefined();
        expect(uncertainty).toBeDefined();
        if (uncertainty && 'unknownFields' in uncertainty) {
            expect(uncertainty.unknownFields).toContain('location');
            expect(uncertainty.unknownFields).toContain('startTime');
        }
    });

    it('returns a ParseError when the schedule heading block is missing', () => {
        const html = parse('<html><body><div class="sqs-html-content"></div></body></html>');
        const results = parseSummerFestivalPage(html, url);

        expect(results.length).toBe(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });

    it('returns a ParseError for a malformed date range where the end day precedes the start day', () => {
        const html = parse(`<html><body><div class="sqs-html-content">
            <h2>3rd Unbound Symphony Summer Festival is scheduled for<br>July 10-5, 2028</h2>
            <h2>Highline Performing Arts Center<br>Burien, WA</h2>
        </div></body></html>`);
        const results = parseSummerFestivalPage(html, url);

        expect(results.length).toBe(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });
});
