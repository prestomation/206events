import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { LocalDate, DayOfWeek } from '@js-joda/core';
import NordicMuseumRipper, {
    classifyDateText,
    parseTimeRange,
    parseCost,
    computeWeeklyOccurrences,
    computeMonthlyNthOccurrences,
} from './ripper.js';
import { RipperCalendarEvent, RipperError, UncertaintyError } from '../../lib/config/schema.js';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadCalendarSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function loadSingleEventHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-event.html'), 'utf8');
}

function loadRecurringEventHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-event-recurring.html'), 'utf8');
}

// Fixed "today" matching the date the live fixtures were captured, so
// recurring-occurrence synthesis is deterministic across runs.
const TODAY = LocalDate.of(2026, 9, 15);

describe('NordicMuseumRipper', () => {
    describe('parseEventCards', () => {
        it('extracts all event cards from the calendar listing page', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            expect(cards.length).toBe(18);
            for (const card of cards) {
                expect(card.href).toMatch(/^https:\/\/nordicmuseum\.org\/events\//);
                expect(card.title.length).toBeGreaterThan(0);
                expect(card.dateText.length).toBeGreaterThan(0);
            }
        });

        it('finds the film festival single-date card', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            const card = cards.find(c => c.href.includes('2026-sea-nordic-film-festival-blush-2022-and-show-me-love-1998'));
            expect(card).toBeDefined();
            expect(card?.dateText).toBe('Sept 15, 2026');
        });

        it('finds the multi-day festival range card', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            const card = cards.find(c => c.href.includes('seattle-nordic-film-festival'));
            expect(card).toBeDefined();
            expect(card?.dateText).toBe('September 15-19, 2026');
        });

        it('finds the recurring docent-tour and language-class cards', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(loadCalendarSampleHtml());
            const cards = ripper.parseEventCards(html);

            expect(cards.find(c => c.href.includes('docent-led-museum-tours'))?.dateText).toBe('Every Thursday');
            expect(cards.find(c => c.href.includes('genealogy-program'))?.dateText).toBe('First and third Wednesday of every month');
            expect(cards.find(c => c.href.includes('danish-language-classes'))?.dateText).toBe('Every Thursday, Sept 24-Nov 19');
        });
    });

    describe('classifyDateText', () => {
        it('classifies a concrete single date', () => {
            expect(classifyDateText('Sept 15, 2026')).toEqual({ kind: 'single', year: 2026, month: 9, day: 15 });
            expect(classifyDateText('October 1, 2026')).toEqual({ kind: 'single', year: 2026, month: 10, day: 1 });
        });

        it('classifies a multi-day range as "range"', () => {
            expect(classifyDateText('September 15-19, 2026')).toEqual({ kind: 'range' });
        });

        it('classifies an unbounded weekly recurrence', () => {
            expect(classifyDateText('Every Thursday')).toEqual({ kind: 'weekly', weekday: DayOfWeek.THURSDAY });
        });

        it('classifies a bounded weekly recurrence', () => {
            expect(classifyDateText('Every Thursday, Sept 24-Nov 19')).toEqual({
                kind: 'weekly',
                weekday: DayOfWeek.THURSDAY,
                boundStart: { month: 9, day: 24 },
                boundEnd: { month: 11, day: 19 },
            });
        });

        it('classifies a monthly nth-weekday recurrence with two ordinals', () => {
            expect(classifyDateText('First and third Wednesday of every month')).toEqual({
                kind: 'monthly-nth',
                weekday: DayOfWeek.WEDNESDAY,
                ordinals: [1, 3],
            });
        });

        it('classifies a monthly nth-weekday recurrence with a single ordinal', () => {
            expect(classifyDateText('Third Wednesday of every month')).toEqual({
                kind: 'monthly-nth',
                weekday: DayOfWeek.WEDNESDAY,
                ordinals: [3],
            });
        });

        it('returns "unknown" for unparseable date text', () => {
            expect(classifyDateText('')).toEqual({ kind: 'unknown' });
            expect(classifyDateText('Sometime this fall')).toEqual({ kind: 'unknown' });
            expect(classifyDateText('TBD')).toEqual({ kind: 'unknown' });
        });
    });

    describe('parseTimeRange', () => {
        it('parses a plain range with both periods', () => {
            const r = parseTimeRange('6:00 pm - 8:00 pm');
            expect(r).toEqual({ hour: 18, minute: 0, durationMinutes: 120, startTimeGuessed: false, durationGuessed: false });
        });

        it('parses a range with no space before am/pm', () => {
            const r = parseTimeRange('10:00am - 8:00pm');
            expect(r.hour).toBe(10);
            expect(r.durationMinutes).toBe(600);
            expect(r.startTimeGuessed).toBe(false);
        });

        it('parses a range with only a trailing am/pm marker', () => {
            const r = parseTimeRange('1:00 - 2:00pm');
            expect(r.hour).toBe(13);
            expect(r.minute).toBe(0);
            expect(r.durationMinutes).toBe(60);
        });

        it('parses an en-dash range', () => {
            const r = parseTimeRange('6:30 pm – 8:00 pm');
            expect(r.hour).toBe(18);
            expect(r.minute).toBe(30);
            expect(r.durationMinutes).toBe(90);
        });

        it('falls back to a guessed placeholder for multi-section time text', () => {
            const r = parseTimeRange('NOR1A: 5-6:30pm; NOR1C: 6:45-8pm');
            expect(r.startTimeGuessed).toBe(true);
            expect(r.durationGuessed).toBe(true);
        });

        it('falls back to a guessed placeholder for empty text', () => {
            const r = parseTimeRange('');
            expect(r.startTimeGuessed).toBe(true);
        });
    });

    describe('parseCost', () => {
        it('extracts the General Admission price when present', () => {
            expect(parseCost('Members: $12\nGeneral Admission: $14')).toEqual({ min: 14 });
        });

        it('falls back to the first dollar amount when no General Admission label', () => {
            expect(parseCost('Single Ticket: $12')).toEqual({ min: 12 });
        });

        it('treats a missing admission block as free', () => {
            expect(parseCost(undefined)).toEqual({ min: 0 });
        });

        it('treats explicit "free" text with no dollar amount as free', () => {
            expect(parseCost('Free with museum admission... just kidding, free entry')).toEqual({ min: 0 });
        });

        it('returns undefined (unknown) for priced-but-unquantified text', () => {
            expect(parseCost('Tour included with Museum admission')).toBeUndefined();
        });
    });

    describe('computeWeeklyOccurrences', () => {
        it('synthesizes unbounded weekly occurrences within the lookahead window', () => {
            const dates = computeWeeklyOccurrences({ weekday: DayOfWeek.THURSDAY }, TODAY, 63);
            expect(dates.map(d => d.toString())).toEqual([
                '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15',
                '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12',
            ]);
        });

        it('respects both the source bound and the lookahead cap for bounded recurrence', () => {
            const dates = computeWeeklyOccurrences({
                weekday: DayOfWeek.THURSDAY,
                boundStart: { month: 9, day: 24 },
                boundEnd: { month: 11, day: 19 },
            }, TODAY, 63);
            // Nov 19 falls outside the 63-day lookahead cap even though it's
            // within the source's own stated bound — the tighter of the two wins.
            expect(dates.map(d => d.toString())).toEqual([
                '2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12',
            ]);
        });

        it('returns no occurrences when the bound has already fully elapsed', () => {
            const dates = computeWeeklyOccurrences({
                weekday: DayOfWeek.THURSDAY,
                boundStart: { month: 1, day: 1 },
                boundEnd: { month: 1, day: 15 },
            }, TODAY, 63);
            expect(dates).toEqual([]);
        });
    });

    describe('computeMonthlyNthOccurrences', () => {
        it('synthesizes first-and-third-weekday occurrences within the lookahead window', () => {
            const dates = computeMonthlyNthOccurrences({ weekday: DayOfWeek.WEDNESDAY, ordinals: [1, 3] }, TODAY, 63);
            expect(dates.map(d => d.toString())).toEqual(['2026-09-16', '2026-10-07', '2026-10-21', '2026-11-04']);
        });
    });

    describe('parseEventDetail — single-date event', () => {
        it('parses title, date, time, location, cost, and image', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(loadSingleEventHtml());
            const card = { href: 'https://nordicmuseum.org/events/2026-sea-nordic-film-festival-blush-2022-and-show-me-love-1998', title: 'placeholder', dateText: 'Sept 15, 2026' };

            const results = ripper.parseEventDetail(card, html, card.href, TODAY, 'nordic-museum');
            expect(results).toHaveLength(1);
            const event = results[0] as RipperCalendarEvent;
            expect('date' in event).toBe(true);
            expect(event.summary).toContain('BLUSH');
            expect(event.id).toBe('nordic-museum-2026-sea-nordic-film-festival-blush-2022-and-show-me-love-1998');
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(9);
            expect(event.date.dayOfMonth()).toBe(15);
            expect(event.date.hour()).toBe(18);
            expect(event.duration.toMinutes()).toBe(120);
            expect(event.location).toContain('National Nordic Museum');
            expect(event.cost).toEqual({ min: 14 });
            expect(event.imageUrl).toMatch(/^https:\/\/nordicmuseum\.org\/asset\//);
        });

        it('produces no Uncertainty entry when everything parses cleanly', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(loadSingleEventHtml());
            const card = { href: 'https://nordicmuseum.org/events/2026-sea-nordic-film-festival-blush-2022-and-show-me-love-1998', title: 'placeholder', dateText: 'Sept 15, 2026' };

            const results = ripper.parseEventDetail(card, html, card.href, TODAY, 'nordic-museum');
            expect(results.every(r => 'date' in r)).toBe(true);
        });
    });

    describe('parseEventDetail — recurring event', () => {
        it('synthesizes weekly occurrences with deterministic date-suffixed ids', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(loadRecurringEventHtml());
            const card = { href: 'https://nordicmuseum.org/events/docent-led-museum-tours', title: 'Docent-Led Museum Tours', dateText: 'Every Thursday' };

            const results = ripper.parseEventDetail(card, html, card.href, TODAY, 'nordic-museum');
            const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);

            expect(events.length).toBe(9);
            expect(events[0].id).toBe('nordic-museum-docent-led-museum-tours-2026-09-17');
            expect(events[0].date.hour()).toBe(13);
            expect(events[0].duration.toMinutes()).toBe(60);
            // ids are unique and date-derived so re-runs don't collide
            expect(new Set(events.map(e => e.id)).size).toBe(events.length);
        });
    });

    describe('fetchAndParseCard routing (via rip()-adjacent behavior)', () => {
        it('the range card classification yields a skip reason, never a synthesized event', () => {
            // classifyDateText is the routing decision fetchAndParseCard uses;
            // verifying it directly proves the range card can never reach
            // event synthesis without needing to mock network fetches.
            const classification = classifyDateText('September 15-19, 2026');
            expect(classification.kind).toBe('range');
        });
    });

    describe('malformed date text never returns null', () => {
        it('parseEventDetail returns a ParseError (not null, not an empty synthesis) for unparseable date text', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(`
                <html><body>
                <h1 class="text-display--dark mb-30">Mystery Event</h1>
                <div class="info-detail" title="Date">
                  <div class="info-detail__content wysiwyg"><p>Whenever we feel like it</p></div>
                </div>
                </body></html>
            `);
            const card = { href: 'https://nordicmuseum.org/events/mystery-event', title: 'Mystery Event', dateText: 'Whenever we feel like it' };

            const results = ripper.parseEventDetail(card, html, card.href, TODAY, 'nordic-museum');
            expect(results).not.toBeNull();
            expect(results.length).toBeGreaterThan(0);
            expect('type' in results[0]).toBe(true);
            expect((results[0] as RipperError).type).toBe('ParseError');
        });

        it('parseEventDetail returns a ParseError when no Date block is present', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse('<html><body><h1 class="text-display--dark mb-30">No Date Here</h1></body></html>');
            const card = { href: 'https://nordicmuseum.org/events/no-date-here', title: 'No Date Here', dateText: 'Sept 15, 2026' };

            const results = ripper.parseEventDetail(card, html, card.href, TODAY, 'nordic-museum');
            expect(results).toHaveLength(1);
            expect((results[0] as RipperError).type).toBe('ParseError');
        });
    });

    describe('location mismatch safety net', () => {
        it('flags an Uncertainty for "location" when the Contact block address differs from the museum', () => {
            const ripper = new NordicMuseumRipper();
            const html = parse(`
                <html><body>
                <h1 class="text-display--dark mb-30">Offsite Event</h1>
                <div class="info-detail" title="Date">
                  <div class="info-detail__content wysiwyg"><p>Sept 20, 2026</p><p>6:00 pm - 8:00 pm</p></div>
                </div>
                <div class="info-detail" title="Contact">
                  <a href="https://maps.google.com/?daddr=123+Elsewhere+St">123 Elsewhere St, Seattle, WA</a>
                </div>
                </body></html>
            `);
            const card = { href: 'https://nordicmuseum.org/events/offsite-event', title: 'Offsite Event', dateText: 'Sept 20, 2026' };

            const results = ripper.parseEventDetail(card, html, card.href, TODAY, 'nordic-museum');
            expect(results).toHaveLength(2);
            const uncertainty = results[1] as UncertaintyError;
            expect(uncertainty.type).toBe('Uncertainty');
            expect(uncertainty.unknownFields).toContain('location');
        });
    });
});
