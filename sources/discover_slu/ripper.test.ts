import { describe, expect, test } from 'vitest';
import { parseEventsFromHtml, extractTimeFromMeta } from './ripper.js';
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

function loadSampleAjaxResponse() {
    const jsonPath = path.join(__dirname, 'sample-ajax-response.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return parse(data.events_html);
}

describe('Discover SLU Ripper', () => {
    test('parses events from sample HTML', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);

        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(validEvents.length).toBe(6);
    });

    test('parses event titles correctly', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const titles = validEvents.map(e => e.summary);
        expect(titles).toContain('Seattle REI Run Club - Party Pace');
        expect(titles).toContain('Trivia Nights at King Leroy');
        expect(titles).toContain('Guest Chef Night at FareStart');
        expect(titles).toContain('Seattle JazzED Downbeat');
        expect(titles).toContain('Bloodworks NW Blood Drive');
        expect(titles).toContain('History Café: Seattle Mystic');
    });

    test('uses day heading for event date (not meta text)', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // REI Run Club is under "Sunday March 15, 2026" heading; its meta says "Every Sun, Feb 1 - May 31"
        // The date should come from the heading (March 15), not the series start (Feb 1)
        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun).toBeDefined();
        expect(reiRun!.date.year()).toBe(2026);
        expect(reiRun!.date.monthValue()).toBe(3);
        expect(reiRun!.date.dayOfMonth()).toBe(15);
        expect(reiRun!.date.hour()).toBe(10); // "10 am - 12 pm" → 10
        expect(reiRun!.date.minute()).toBe(0);

        const trivia = validEvents.find(e => e.summary.includes('Trivia'));
        expect(trivia).toBeDefined();
        expect(trivia!.date.dayOfMonth()).toBe(16); // heading: Monday March 16
        expect(trivia!.date.hour()).toBe(18); // "6:30 pm" → 18
        expect(trivia!.date.minute()).toBe(30);

        const guestChef = validEvents.find(e => e.summary.includes('FareStart'));
        expect(guestChef).toBeDefined();
        expect(guestChef!.date.dayOfMonth()).toBe(18);
        expect(guestChef!.date.hour()).toBe(17); // "5 - 7 pm" → 17
    });

    test('parses locations from feature__meta--location', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.location).toBe('REI, South Lake Union, Seattle, WA');

        const mohai = validEvents.find(e => e.summary.includes('History Café'));
        expect(mohai!.location).toBe('MOHAI, South Lake Union, Seattle, WA');
    });

    test('parses event URLs correctly', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.url).toBe('https://www.discoverslu.com/events/rei-run-2026/');

        // Relative URL should be resolved to absolute
        const historyCafe = validEvents.find(e => e.summary.includes('History Café'));
        expect(historyCafe!.url).toBe('https://www.discoverslu.com/events/history-cafe-seattle/');
    });

    test('parses images when present', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const reiRun = validEvents.find(e => e.summary.includes('REI Run'));
        expect(reiRun!.imageUrl).toContain('Run_Thumb');

        // Events without images should have undefined imageUrl
        const historyCafe = validEvents.find(e => e.summary.includes('History Café'));
        expect(historyCafe!.imageUrl).toBeUndefined();
    });

    test('deduplicates events across multiple parseEvents calls', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();

        const events1 = parseEventsFromHtml(html, seenEvents, 2026);
        const events2 = parseEventsFromHtml(html, seenEvents, 2026);

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1.length).toBe(6);
        expect(valid2.length).toBe(0); // All should be deduped
    });

    test('parses AJAX response HTML', () => {
        const html = loadSampleAjaxResponse();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(2);
        const titles = validEvents.map(e => e.summary);
        expect(titles).toContain('Paint Night: Crescent Beach');
        expect(titles).toContain('EASE Pop-Up');
    });

    test('combines initial page and AJAX events without duplicates', () => {
        const seenEvents = new Set<string>();

        const pageHtml = loadSampleHtml();
        const pageEvents = parseEventsFromHtml(pageHtml, seenEvents, 2026);

        const ajaxHtml = loadSampleAjaxResponse();
        const ajaxEvents = parseEventsFromHtml(ajaxHtml, seenEvents, 2026);

        const allValid = [
            ...pageEvents.filter(e => 'summary' in e),
            ...ajaxEvents.filter(e => 'summary' in e),
        ] as RipperCalendarEvent[];

        expect(allValid.length).toBe(8); // 6 from page + 2 from AJAX

        const ids = allValid.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('default duration is 2 hours', () => {
        const html = loadSampleHtml();
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.duration.toHours()).toBe(2);
        }
    });

    test('handles HTML with no events gracefully', () => {
        const html = parse('<div class="site-width"></div>');
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);
        expect(events.length).toBe(0);
    });

    test('emits ParseError for card with no date source', () => {
        const html = parse(`
            <div class="site-width">
                <div class="grid"><div class="grid__item">
                    <div class="feature full">
                        <div class="text"><h3><a href="/events/test/">Test Event</a></h3></div>
                    </div>
                </div></div>
            </div>
        `);
        const seenEvents = new Set<string>();
        const events = parseEventsFromHtml(html, seenEvents, 2026);

        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(1);
        expect(errors[0].type).toBe('ParseError');
    });
});

describe('extractTimeFromMeta', () => {
    test('parses "H am/pm - H am/pm" time range (both endpoints explicit)', () => {
        expect(extractTimeFromMeta('Every Sat, Jun 6 - Nov 21, 10 am - 3 pm')).toMatchObject({ hour: 10, minute: 0, timeGuessed: false });
        expect(extractTimeFromMeta('Every Sun, Jun 28 - Aug 9, 10 am - 12 pm')).toMatchObject({ hour: 10, minute: 0, timeGuessed: false });
        expect(extractTimeFromMeta('Weekly June 4 - October 29, 10 am - 3 pm')).toMatchObject({ hour: 10, minute: 0, timeGuessed: false });
    });

    test('parses "H - H pm" time range (only end has am/pm)', () => {
        expect(extractTimeFromMeta('July 9, 5 - 9 pm')).toMatchObject({ hour: 17, minute: 0, timeGuessed: false });
        expect(extractTimeFromMeta('July 10, 12 - 1 pm')).toMatchObject({ hour: 12, minute: 0, timeGuessed: false }); // noon
        expect(extractTimeFromMeta('March 18, 5 - 7 pm')).toMatchObject({ hour: 17, minute: 0, timeGuessed: false });
    });

    test('parses "H:MM - H am/pm" time range with minutes', () => {
        expect(extractTimeFromMeta('July 11, 9:30 - 11 am')).toMatchObject({ hour: 9, minute: 30, timeGuessed: false });
    });

    test('parses "H:MM am/pm" single time', () => {
        expect(extractTimeFromMeta('Every Mon, Feb 9 - Jul 20, 6:30 pm')).toMatchObject({ hour: 18, minute: 30, timeGuessed: false });
    });

    test('returns default 10 am when no time present', () => {
        expect(extractTimeFromMeta('June 12 - August 14')).toMatchObject({ hour: 10, minute: 0, timeGuessed: true });
        expect(extractTimeFromMeta('July 13-19')).toMatchObject({ hour: 10, minute: 0, timeGuessed: true });
        expect(extractTimeFromMeta('June 1 - August 31')).toMatchObject({ hour: 10, minute: 0, timeGuessed: true });
    });
});
