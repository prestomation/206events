import { describe, expect, test } from 'vitest';
import TravelingGoatRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('TravelingGoatRipper - parseDate', () => {
    const ripper = new TravelingGoatRipper();

    test('parses "Mon D, YYYY" format', () => {
        const d = ripper.parseDate('Sep 14, 2026');
        expect(d).not.toBeNull();
        expect(d!.year()).toBe(2026);
        expect(d!.monthValue()).toBe(9);
        expect(d!.dayOfMonth()).toBe(14);
    });

    test('parses a full month name', () => {
        const d = ripper.parseDate('October 1, 2026');
        expect(d).not.toBeNull();
        expect(d!.monthValue()).toBe(10);
        expect(d!.dayOfMonth()).toBe(1);
    });

    test('returns null for unparseable text', () => {
        expect(ripper.parseDate('Sept 21-27')).toBeNull();
        expect(ripper.parseDate('')).toBeNull();
        expect(ripper.parseDate('It’s Negroni Week!')).toBeNull();
    });
});

describe('TravelingGoatRipper - parseTimeFromTitle', () => {
    const ripper = new TravelingGoatRipper();

    test('parses "@ 7p" as 19:00', () => {
        const t = ripper.parseTimeFromTitle('Guess What? Trivia! @ 7p');
        expect(t).toEqual({ hour: 19, minute: 0 });
    });

    test('parses "@7p" (no space) as 19:00', () => {
        const t = ripper.parseTimeFromTitle('Guess What? Trivia! @7p');
        expect(t).toEqual({ hour: 19, minute: 0 });
    });

    test('parses "@ 730p" as 19:30', () => {
        const t = ripper.parseTimeFromTitle('Cass & Tay @ 730p');
        expect(t).toEqual({ hour: 19, minute: 30 });
    });

    test('parses a 12am/pm boundary correctly', () => {
        expect(ripper.parseTimeFromTitle('Midnight Show @ 12a')).toEqual({ hour: 0, minute: 0 });
        expect(ripper.parseTimeFromTitle('Noon Show @ 12p')).toEqual({ hour: 12, minute: 0 });
    });

    test('parses a trailing time with no "@" marker', () => {
        const t = ripper.parseTimeFromTitle('Guess What? Trivia! 7p');
        expect(t).toEqual({ hour: 19, minute: 0 });
    });

    test('returns null when the title has no time marker', () => {
        expect(ripper.parseTimeFromTitle('It’s Negroni Week! Sept 21-27')).toBeNull();
    });
});

describe('TravelingGoatRipper - parseEventsFromHtml', () => {
    const ripper = new TravelingGoatRipper();
    const html = loadSampleHtml();
    const url = 'https://www.travelinggoatseattle.com/events';
    const results = ripper.parseEventsFromHtml(html, url);
    const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);
    const errors = results.filter((e): e is RipperError => 'type' in e);

    test('parses multiple real events from the live sample page', () => {
        expect(events.length).toBeGreaterThan(5);
    });

    test('produces no ParseErrors on the real sample page', () => {
        const parseErrors = errors.filter(e => e.type === 'ParseError');
        expect(parseErrors).toEqual([]);
    });

    test('every event has a stable id, location, and future-shaped date', () => {
        for (const e of events) {
            expect(e.id).toBeTruthy();
            expect(e.location).toBe('The Traveling Goat, 621 1/2 Queen Anne Ave N, Seattle, WA 98109');
            expect(e.summary.length).toBeGreaterThan(0);
        }
    });

    test('parses a trivia night with an explicit time', () => {
        const trivia = events.find(e => e.summary.includes('Trivia') && e.date.toLocalDate().toString() === '2026-09-14');
        expect(trivia).toBeDefined();
        expect(trivia!.date.hour()).toBe(19);
        expect(trivia!.date.minute()).toBe(0);
    });

    test('emits an Uncertainty error for the Negroni Week promo (no explicit time)', () => {
        const negroniEvent = events.find(e => e.summary.includes('Negroni Week'));
        expect(negroniEvent).toBeDefined();

        const uncertainty = results.find(
            e => 'type' in e && e.type === 'Uncertainty' && e.event.id === negroniEvent!.id,
        );
        expect(uncertainty).toBeDefined();
        if (uncertainty && 'type' in uncertainty && uncertainty.type === 'Uncertainty') {
            expect(uncertainty.unknownFields).toContain('startTime');
        }
    });

    test('ids are stable across repeated parses of the same page', () => {
        const again = ripper.parseEventsFromHtml(html, url)
            .filter((e): e is RipperCalendarEvent => 'date' in e);
        expect(again.map(e => e.id)).toEqual(events.map(e => e.id));
    });

    test('weekly trivia nights on different dates get distinct ids', () => {
        const triviaIds = events.filter(e => e.summary.includes('Trivia')).map(e => e.id);
        expect(new Set(triviaIds).size).toBe(triviaIds.length);
    });
});

describe('TravelingGoatRipper - parseEventsFromHtml edge cases', () => {
    const ripper = new TravelingGoatRipper();

    test('returns an empty array for a page with no events', () => {
        const html = '<html><body><h2 class="font_2">Some heading</h2></body></html>';
        expect(ripper.parseEventsFromHtml(html, 'https://example.com')).toEqual([]);
    });

    test('emits a ParseError for a date it cannot parse', () => {
        const html = `
            <p class="font_8">Not A Real Date, 2026</p>
            <h2 class="font_2">Broken Event</h2>
            <p class="font_8">Description here.</p>
        `;
        // This won't match DATE_RE at all, so it's simply skipped (not a date block).
        const results = ripper.parseEventsFromHtml(html, 'https://example.com');
        expect(results).toEqual([]);
    });

    test('emits a ParseError when the date line matches the shape but has an invalid month', () => {
        const html = `
            <p class="font_8">Zzz 14, 2026</p>
            <h2 class="font_2">Broken Event</h2>
            <p class="font_8">Description here.</p>
        `;
        const results = ripper.parseEventsFromHtml(html, 'https://example.com');
        expect(results.length).toBe(1);
        expect(results[0]).toMatchObject({ type: 'ParseError' });
    });
});
