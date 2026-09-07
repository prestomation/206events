import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { ZonedDateTime, Duration } from '@js-joda/core';
import ChihulyGardenAndGlassRipper from './ripper.js';
import { RipperCalendarEvent, RipperError, UncertaintyError } from '../../lib/config/schema.js';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

describe('ChihulyGardenAndGlassRipper', () => {
    describe('parseEventCards', () => {
        it('extracts all event cards from the listing page', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const html = parse(loadSample('sample-data.html'));
            const cards = ripper.parseEventCards(html);

            expect(cards).toHaveLength(7);
            for (const card of cards) {
                expect(card.href).toMatch(/^https:\/\/www\.chihulygardenandglass\.com\/events\//);
                expect(card.title.length).toBeGreaterThan(0);
            }
        });

        it('extracts the Dancing in the Glasshouse card', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const html = parse(loadSample('sample-data.html'));
            const cards = ripper.parseEventCards(html);

            const card = cards.find(c => c.title === 'Dancing in the Glasshouse');
            expect(card).toBeDefined();
            expect(card?.dateText).toBe('August - November 2026');
            expect(card?.href).toBe('https://www.chihulygardenandglass.com/events/dancing-in-the-glasshouse-5-2');
        });
    });

    describe('parseEventDetail - recurring series with a shared time', () => {
        const card = { href: 'https://www.chihulygardenandglass.com/events/dancing-in-the-glasshouse-5-2', title: 'Dancing in the Glasshouse', dateText: 'August - November 2026' };

        it('emits one event per future (non-struck-through) date', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const html = parse(loadSample('sample-dance.html'));
            const events = ripper.parseEventDetail(card, html, card.href).filter(e => 'date' in e) as RipperCalendarEvent[];

            // August dates are struck through (already past) in the fixture; only
            // September/October/November occurrences should be emitted.
            expect(events).toHaveLength(4);
            const days = events.map(e => `${e.date.monthValue()}-${e.date.dayOfMonth()}`).sort();
            expect(days).toEqual(['10-9', '11-22', '9-11', '9-4']);
        });

        it('applies the shared "Doors open... class starts at" time to every occurrence', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const html = parse(loadSample('sample-dance.html'));
            const events = ripper.parseEventDetail(card, html, card.href).filter(e => 'date' in e) as RipperCalendarEvent[];

            for (const event of events) {
                expect(event.date.hour()).toBe(18);
                expect(event.date.minute()).toBe(0);
            }
        });

        it('flags duration as uncertain when the page never states one', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const html = parse(loadSample('sample-dance.html'));
            const results = ripper.parseEventDetail(card, html, card.href);
            const uncertainties = results.filter(e => 'type' in e && (e as RipperError).type === 'Uncertainty') as UncertaintyError[];

            expect(uncertainties.length).toBeGreaterThan(0);
            for (const u of uncertainties) {
                expect(u.unknownFields).toContain('duration');
                expect(u.unknownFields).not.toContain('startTime');
            }
        });

        it('gives every occurrence a distinct, stable id', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const html = parse(loadSample('sample-dance.html'));
            const events = ripper.parseEventDetail(card, html, card.href).filter(e => 'date' in e) as RipperCalendarEvent[];

            const ids = events.map(e => e.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids).toContain('chihuly-dancing-in-the-glasshouse-5-2-20260904');
        });
    });

    describe('parseEventDetail - explicit duration and per-date override', () => {
        it('uses the stated Pilates class duration with no uncertainty', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const card = { href: 'https://www.chihulygardenandglass.com/events/pilates-in-the-glasshouse-3', title: 'Pilates in the Glasshouse', dateText: 'September-December 2026' };
            const html = parse(loadSample('sample-pilates.html'));
            const results = ripper.parseEventDetail(card, html, card.href);
            const events = results.filter(e => 'date' in e) as RipperCalendarEvent[];
            const uncertainties = results.filter(e => 'type' in e) as RipperError[];

            expect(events).toHaveLength(3);
            for (const event of events) {
                expect(event.duration.toMinutes()).toBe(50);
                expect(event.date.hour()).toBe(18);
                expect(event.date.minute()).toBe(0);
            }
            expect(uncertainties).toHaveLength(0);
        });

        it('applies a per-date inline time override without disturbing the other occurrences', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const card = { href: 'https://www.chihulygardenandglass.com/events/yoga-in-the-glasshouse-12', title: 'Yoga in the Glasshouse', dateText: 'September- November 2026' };
            const html = parse(loadSample('sample-yoga.html'));
            const events = ripper.parseEventDetail(card, html, card.href).filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(events).toHaveLength(4);
            const sept6 = events.find(e => e.date.monthValue() === 9 && e.date.dayOfMonth() === 6);
            expect(sept6?.date.hour()).toBe(8);

            const others = events.filter(e => e !== sept6);
            for (const event of others) {
                expect(event.date.hour()).toBe(9);
            }
        });

        it('uses the stated 45-minute Yoga and Sound Bath duration with no uncertainty', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const card = { href: 'https://www.chihulygardenandglass.com/events/evening-yoga-in-the-glasshouse-10', title: 'Yoga and Sound Bath in the Glasshouse', dateText: 'October- November 2026' };
            const html = parse(loadSample('sample-yoga-sound-bath.html'));
            const results = ripper.parseEventDetail(card, html, card.href);
            const events = results.filter(e => 'date' in e) as RipperCalendarEvent[];
            const uncertainties = results.filter(e => 'type' in e) as RipperError[];

            expect(events).toHaveLength(2);
            for (const event of events) {
                expect(event.duration.toMinutes()).toBe(45);
                expect(event.date.hour()).toBe(18);
            }
            expect(uncertainties).toHaveLength(0);
        });

        it('recognizes a "two-hour" duration mention', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const card = { href: 'https://www.chihulygardenandglass.com/events/canvas-cocktails', title: 'Canvas & Cocktails', dateText: 'August - September 2026' };
            const html = parse(loadSample('sample-canvas.html'));
            const events = ripper.parseEventDetail(card, html, card.href).filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(events).toHaveLength(2);
            for (const event of events) {
                expect(event.duration.toMinutes()).toBe(120);
            }
        });
    });

    describe('parseEventDetail - single date with no "Dates:" list', () => {
        it('falls back to the header date when the body has no date list', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const card = { href: 'https://www.chihulygardenandglass.com/events/meditation-and-sound-bath-in-the-glasshouse', title: 'Meditation and Sound Bath in the Glasshouse', dateText: 'September 9 2026' };
            const html = parse(loadSample('sample-meditation.html'));
            const events = ripper.parseEventDetail(card, html, card.href).filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(events).toHaveLength(1);
            expect(events[0].date.monthValue()).toBe(9);
            expect(events[0].date.dayOfMonth()).toBe(9);
            expect(events[0].date.year()).toBe(2026);
            expect(events[0].date.hour()).toBe(19);
        });
    });

    describe('parseEventDetail - single explicitly-timed event (.event-listing__time)', () => {
        it('parses the header date + time range directly, no uncertainty', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const card = { href: 'https://www.chihulygardenandglass.com/events/gather-kick-off-party-for-refract', title: 'GATHER: The official opening night party for REFRACT', dateText: 'October 15, 2026' };
            const html = parse(loadSample('sample-gather.html'));
            const results = ripper.parseEventDetail(card, html, card.href);
            const events = results.filter(e => 'date' in e) as RipperCalendarEvent[];
            const uncertainties = results.filter(e => 'type' in e) as RipperError[];

            expect(events).toHaveLength(1);
            const event = events[0];
            expect(event.date.monthValue()).toBe(10);
            expect(event.date.dayOfMonth()).toBe(15);
            expect(event.date.year()).toBe(2026);
            expect(event.date.hour()).toBe(19);
            expect(event.duration.toMinutes()).toBe(180);
            expect(uncertainties).toHaveLength(0);
        });
    });

    describe('common fields', () => {
        it('sets a fixed venue address and canonical URL on every event', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const card = { href: 'https://www.chihulygardenandglass.com/events/gather-kick-off-party-for-refract', title: 'GATHER', dateText: 'October 15, 2026' };
            const html = parse(loadSample('sample-gather.html'));
            const events = ripper.parseEventDetail(card, html, 'https://www.chihulygardenandglass.com/events/gather-kick-off-party-for-refract').filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(events[0].location).toBe('Chihuly Garden and Glass, 305 Harrison St, Seattle, WA 98109');
            expect(events[0].url).toBe('https://www.chihulygardenandglass.com/events/gather-kick-off-party-for-refract');
        });

        it('extracts an absolute hero image URL', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const card = { href: 'https://www.chihulygardenandglass.com/events/gather-kick-off-party-for-refract', title: 'GATHER', dateText: 'October 15, 2026' };
            const html = parse(loadSample('sample-gather.html'));
            const events = ripper.parseEventDetail(card, html, card.href).filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(events[0].imageUrl).toMatch(/^https:\/\/www\.chihulygardenandglass\.com\/img\//);
        });
    });

    describe('filterFutureEvents', () => {
        it('drops a past event and its paired UncertaintyError together', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const now = ZonedDateTime.parse('2026-09-01T00:00-07:00[America/Los_Angeles]');
            const pastEvent: RipperCalendarEvent = {
                id: 'chihuly-past-20260801',
                ripped: new Date(),
                date: now.minusDays(1),
                duration: Duration.ofMinutes(60),
                summary: 'Past Event',
            };
            const pastUncertainty: UncertaintyError = {
                type: 'Uncertainty',
                reason: 'test',
                source: 'chihuly_garden_and_glass',
                unknownFields: ['duration'],
                event: pastEvent,
            };
            const futureEvent: RipperCalendarEvent = {
                id: 'chihuly-future-20261001',
                ripped: new Date(),
                date: now.plusDays(1),
                duration: Duration.ofMinutes(60),
                summary: 'Future Event',
            };

            const result = ripper.filterFutureEvents([pastEvent, pastUncertainty, futureEvent], now);

            expect(result).toEqual([futureEvent]);
        });

        it('keeps a ParseError regardless of any date', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const now = ZonedDateTime.now();
            const parseError: RipperError = { type: 'ParseError', reason: 'boom', context: 'test' };

            expect(ripper.filterFutureEvents([parseError], now)).toEqual([parseError]);
        });
    });

    describe('extractOccurrences', () => {
        it('does not emit the same date twice from a body that mentions it more than once', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const result = ripper.extractOccurrences('September 4, 2026 ... reminder: September 4, 2026 is coming up', 2026);
            expect(result).toHaveLength(1);
        });

        it('ignores instructor names or other unrelated month-shaped text', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const result = ripper.extractOccurrences('No dates mentioned here at all.', 2026);
            expect(result).toHaveLength(0);
        });

        it('uses the default year when a date has none of its own', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const result = ripper.extractOccurrences('Friday September 4: Salsa night', 2026);
            expect(result).toEqual([{ year: 2026, month: 9, day: 4, override: null }]);
        });
    });

    describe('extractGeneralTime', () => {
        it('anchors to the "Doors open" sentence, not an earlier per-date override', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            const text = 'Sundays September 6, 2026 (Class starts at 8AM) October 4, 2026. Doors open at 8:30AM, yoga begins at 9AM.';
            expect(ripper.extractGeneralTime(text)).toEqual({ hour: 9, minute: 0 });
        });

        it('returns null when no time sentence is present', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            expect(ripper.extractGeneralTime('No time information here.')).toBeNull();
        });
    });

    describe('extractExplicitDuration', () => {
        it('extracts an explicit N-minute class duration', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            expect(ripper.extractExplicitDuration('a 50-minute Pilates class')).toBe(50);
        });

        it('does not mistake an unrelated minute mention for the duration', () => {
            const ripper = new ChihulyGardenAndGlassRipper();
            expect(ripper.extractExplicitDuration('basic dance instruction for the first 30 minutes')).toBeNull();
        });
    });
});
