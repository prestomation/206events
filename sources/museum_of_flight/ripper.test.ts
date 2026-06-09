import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { LocalDate } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTimeString, parseEventElement, parsePage, extractImageUrl } from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

const RIPPER_NAME = 'museum_of_flight';

describe('MuseumOfFlightRipper', () => {
    describe('parseTimeString', () => {
        it('parses a single AM/PM time as unknown duration', () => {
            const r = parseTimeString('7:00 PM');
            expect(r.slots).toHaveLength(1);
            expect(r.slots[0]).toEqual({ hour: 19, minute: 0 });
            expect(r.unknownDuration).toBe(true);
            expect(r.endMinuteOfDay).toBeUndefined();
        });

        it('parses "H:MM AM to H:MM PM" range with known duration', () => {
            const r = parseTimeString('11:00 AM to 12:00 PM');
            expect(r.slots).toHaveLength(1);
            expect(r.slots[0]).toEqual({ hour: 11, minute: 0 });
            expect(r.unknownDuration).toBe(false);
            expect(r.endMinuteOfDay).toBe(12 * 60);
        });

        it('parses "H:MM - H:MM AM" range (same period) with known duration', () => {
            const r = parseTimeString('8:00 - 10:00 AM');
            expect(r.slots).toHaveLength(1);
            expect(r.slots[0]).toEqual({ hour: 8, minute: 0 });
            expect(r.unknownDuration).toBe(false);
            expect(r.endMinuteOfDay).toBe(10 * 60);
        });

        it('parses "H:MM PM - H:MM PM" range with known duration', () => {
            const r = parseTimeString('3:00 PM - 4:00 PM');
            expect(r.slots).toHaveLength(1);
            expect(r.slots[0]).toEqual({ hour: 15, minute: 0 });
            expect(r.unknownDuration).toBe(false);
            expect(r.endMinuteOfDay).toBe(16 * 60);
        });

        it('parses "H:MM AM; H:MM PM" as two slots with unknown duration', () => {
            const r = parseTimeString('11:00 AM; 1:00 PM');
            expect(r.slots).toHaveLength(2);
            expect(r.slots[0]).toEqual({ hour: 11, minute: 0 });
            expect(r.slots[1]).toEqual({ hour: 13, minute: 0 });
            expect(r.unknownDuration).toBe(true);
        });

        it('parses "H:MM AM & H:MM PM" as two slots with unknown duration', () => {
            const r = parseTimeString('10:30 AM & 1:00 PM');
            expect(r.slots).toHaveLength(2);
            expect(r.slots[0]).toEqual({ hour: 10, minute: 30 });
            expect(r.slots[1]).toEqual({ hour: 13, minute: 0 });
            expect(r.unknownDuration).toBe(true);
        });

        it('defaults unparseable text to noon with unknown duration', () => {
            const r = parseTimeString('Dads FREE all day');
            expect(r.slots).toHaveLength(1);
            expect(r.slots[0]).toEqual({ hour: 12, minute: 0 });
            expect(r.unknownDuration).toBe(true);
        });
    });

    describe('parsePage (sample-data.html)', () => {
        it('parses events from page 1 with correct count of unique events', () => {
            const html = parse(loadSampleHtml());
            const { events, hasMore } = parsePage(html, RIPPER_NAME);

            const calendarEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);
            // Page 1 has: Sally Film (1), Coffee w/ Curator (1),
            // Wish Upon a Star (2 slots), Planes 8-Tracks (1), Sensory Days (1), STEM Starters (2 slots)
            // = 8 event entries (6 unique titles, 2 expanded to 2 each)
            expect(calendarEvents.length).toBeGreaterThanOrEqual(6);
            expect(calendarEvents.length).toBeLessThanOrEqual(10);
        });

        it('indicates more pages via hasMore=true on page 1', () => {
            const html = parse(loadSampleHtml());
            const { hasMore } = parsePage(html, RIPPER_NAME);
            expect(hasMore).toBe(true);
        });

        it('multi-slot events produce distinct IDs with time suffix', () => {
            const html = parse(loadSampleHtml());
            const { events } = parsePage(html, RIPPER_NAME);
            const calEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);

            // "Wish Upon a Star" has 11:00 AM and 1:00 PM slots
            const wishEvents = calEvents.filter(e => e.summary.includes('Wish Upon'));
            expect(wishEvents).toHaveLength(2);
            expect(wishEvents[0].id).not.toBe(wishEvents[1].id);
            // IDs should contain time suffix
            expect(wishEvents[0].id).toMatch(/-\d{4}$/);
            expect(wishEvents[1].id).toMatch(/-\d{4}$/);
        });

        it('multi-slot events produce UncertaintyErrors for unknown duration', () => {
            const html = parse(loadSampleHtml());
            const { events } = parsePage(html, RIPPER_NAME);
            const errors = events.filter((e): e is RipperError => 'type' in e && e.type === 'Uncertainty');

            // Multi-slot events (Wish Upon a Star, STEM Starters) and single unknown-duration events
            // should all have UncertaintyErrors
            expect(errors.length).toBeGreaterThan(0);
        });

        it('range events ("to"/"hyphen") do NOT produce UncertaintyErrors', () => {
            const html = parse(loadSampleHtml());
            const { events } = parsePage(html, RIPPER_NAME);
            const errors = events.filter((e): e is RipperError => 'type' in e && e.type === 'Uncertainty');
            const calEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);

            // "Coffee with the Curator" is 11:00 AM to 12:00 PM — known duration, no uncertainty
            const coffeeEvents = calEvents.filter(e => e.summary.includes('Coffee with the Curator'));
            expect(coffeeEvents).toHaveLength(1);

            // Verify duration is 60 minutes (11am to 12pm)
            expect(coffeeEvents[0].duration.toMinutes()).toBe(60);

            // No UncertaintyError with the same event id
            const coffeeId = coffeeEvents[0].id!;
            const coffeeErrors = errors.filter(e => (e as any).event?.id === coffeeId);
            expect(coffeeErrors).toHaveLength(0);
        });

        it('strips sr-only span content from title', () => {
            const html = parse(loadSampleHtml());
            const { events } = parsePage(html, RIPPER_NAME);
            const calEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);

            for (const ev of calEvents) {
                // Title must not contain date strings from the sr-only span like "6/11/2026"
                expect(ev.summary).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
            }
        });

        it('events have valid dates in 2026', () => {
            const html = parse(loadSampleHtml());
            const { events } = parsePage(html, RIPPER_NAME);
            const calEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);

            for (const ev of calEvents) {
                expect(ev.date.year()).toBeGreaterThanOrEqual(2026);
                expect(ev.date.year()).toBeLessThanOrEqual(2027);
            }
        });

        it('events have image URLs from the imagehandler', () => {
            const html = parse(loadSampleHtml());
            const { events } = parsePage(html, RIPPER_NAME);
            const calEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);

            const withImages = calEvents.filter(e => e.imageUrl);
            expect(withImages.length).toBeGreaterThan(0);
            for (const ev of withImages) {
                expect(ev.imageUrl).toMatch(/^https?:\/\//);
            }
        });

        it('events with "to" range have correct duration', () => {
            const html = parse(loadSampleHtml());
            const { events } = parsePage(html, RIPPER_NAME);
            const calEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);

            // "Planes, 8-Tracks, and Automobiles" is 2:00 PM to 3:30 PM = 90 minutes
            const planes = calEvents.find(e => e.summary.includes('Planes'));
            expect(planes).toBeDefined();
            expect(planes!.duration.toMinutes()).toBe(90);
        });

        it('Sensory Days hyphen range has correct duration', () => {
            const html = parse(loadSampleHtml());
            const { events } = parsePage(html, RIPPER_NAME);
            const calEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);

            // "Sensory Days" is 8:00 - 10:00 AM = 120 minutes
            const sensory = calEvents.find(e => e.summary === 'Sensory Days');
            expect(sensory).toBeDefined();
            expect(sensory!.duration.toMinutes()).toBe(120);
        });
    });

    describe('extractImageUrl', () => {
        it('extracts absolute URL from background-image style', () => {
            const html = parse(`
                <div class="row event">
                    <div class="imagehandler" style="background-image: url('/user_area/content_media/raw/test.png?w=960');"></div>
                </div>
            `);
            const eventEl = html.querySelector('.row.event')!;
            const url = extractImageUrl(eventEl);
            expect(url).toBe('https://www.museumofflight.org/user_area/content_media/raw/test.png?w=960');
        });

        it('returns undefined when no imagehandler div', () => {
            const html = parse(`<div class="row event"><div class="content"></div></div>`);
            const eventEl = html.querySelector('.row.event')!;
            expect(extractImageUrl(eventEl)).toBeUndefined();
        });
    });
});
