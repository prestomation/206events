import { describe, it, expect } from 'vitest';
import CenterForWoodenBoatsRipper from './ripper.js';
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

const DETAILS_OPTS = {
    idPrefix: 'test-event',
    summary: 'Test Event',
    description: 'A test event.',
    url: 'https://www.cwb.org/test',
    defaultLocation: 'Fallback Location',
    context: 'test',
};

describe('CenterForWoodenBoatsRipper', () => {
    describe('parsePublicSail', () => {
        it('extracts one event per pipe-separated date entry', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const results = ripper.parsePublicSail(loadSample('sample-public-sail.html'));
            const events = results.filter(isEvent);

            // Fixture lists: April 12 | May 10 (Mother's Day) | June 14 (...) | July 26 | August 30 | September 27
            expect(events).toHaveLength(6);
            expect(results.filter(e => !isEvent(e))).toHaveLength(0);
        });

        it('parses each date at 1:00 PM Pacific with a stable id', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const events = ripper.parsePublicSail(loadSample('sample-public-sail.html')).filter(isEvent);

            const july = events.find(e => e.id === 'sunday-public-sail-2026-07-26');
            expect(july).toBeDefined();
            expect(july!.date.toLocalDate().toString()).toBe('2026-07-26');
            expect(july!.date.hour()).toBe(13);
            expect(july!.date.minute()).toBe(0);
            expect(july!.summary).toBe('Sunday Public Sail');
            expect(july!.location).toContain('Center for Wooden Boats');
        });

        it('produces stable, unique ids across all entries', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const events = ripper.parsePublicSail(loadSample('sample-public-sail.html')).filter(isEvent);
            const ids = events.map(e => e.id);
            expect(new Set(ids).size).toBe(ids.length);
        });

        it('returns a ParseError when the date list cannot be found', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const results = ripper.parsePublicSail('<html><body><p>no events here</p></body></html>');
            expect(results).toHaveLength(1);
            expect(results[0]).toHaveProperty('type', 'ParseError');
        });
    });

    describe('parseDetailsPageEvent', () => {
        it('extracts date, time range, location, and cost from the 50th Anniversary page', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const result = ripper.parseDetailsPageEvent(loadSample('sample-50th.html'), {
                ...DETAILS_OPTS,
                idPrefix: '50th-anniversary-reunion',
            });
            expect(isEvent(result)).toBe(true);
            const event = result as RipperCalendarEvent;

            expect(event.id).toBe('50th-anniversary-reunion-2026-08-22');
            expect(event.date.toLocalDate().toString()).toBe('2026-08-22');
            expect(event.date.hour()).toBe(17);
            expect(event.duration.toHours()).toBe(3);
            expect(event.location).toContain('Lake Union Park');
            expect(event.cost).toEqual({ min: 15 });
        });

        it('extracts date and a shared-meridiem time range from the Dinner on the Docks page', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const result = ripper.parseDetailsPageEvent(loadSample('sample-dinner-on-the-docks.html'), {
                ...DETAILS_OPTS,
                idPrefix: 'dinner-on-the-docks-sugartime-trio',
            });
            expect(isEvent(result)).toBe(true);
            const event = result as RipperCalendarEvent;

            // Page text is "Thursday, July 23, 2026" / "6:00–9:00 PM" (single trailing meridiem).
            expect(event.id).toBe('dinner-on-the-docks-sugartime-trio-2026-07-23');
            expect(event.date.toLocalDate().toString()).toBe('2026-07-23');
            expect(event.date.hour()).toBe(18);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toHours()).toBe(3);
        });

        it('returns a ParseError when no dated details block is present', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const result = ripper.parseDetailsPageEvent('<html><body><h3>Something Else</h3></body></html>', DETAILS_OPTS);
            expect(isEvent(result)).toBe(false);
            expect((result as RipperError).type).toBe('ParseError');
        });

        it('falls back to the default location when no third strong line is present', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const html = '<p><strong>Saturday, August 22, 2026</strong><strong>5:00 PM – 8:00 PM</strong></p>';
            const result = ripper.parseDetailsPageEvent(html, DETAILS_OPTS);
            expect(isEvent(result)).toBe(true);
            expect((result as RipperCalendarEvent).location).toBe('Fallback Location');
        });
    });

    describe('parseWoodRegatta', () => {
        it('extracts the regatta date from the page heading', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const result = ripper.parseWoodRegatta(loadSample('sample-wood-regatta.html'));
            expect(isEvent(result)).toBe(true);
            const event = result as RipperCalendarEvent;

            expect(event.id).toBe('norm-blanchard-wood-regatta-2026-09-19');
            expect(event.date.toLocalDate().toString()).toBe('2026-09-19');
            expect(event.summary).toBe('Norm Blanchard W.O.O.D. Regatta');
        });

        it('derives the start time from the published race-day schedule list', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const event = ripper.parseWoodRegatta(loadSample('sample-wood-regatta.html')) as RipperCalendarEvent;

            // Fixture schedule's first timed entry is "9:30 AM – 10:30: Registration".
            expect(event.date.hour()).toBe(9);
            expect(event.date.minute()).toBe(30);
        });

        it('falls back to 9:30 AM when no schedule list is published yet', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const html = '<h2>Norm Blanchard W.O.O.D. Regatta: September 19th, 2026</h2>';
            const event = ripper.parseWoodRegatta(html) as RipperCalendarEvent;

            expect(event.date.hour()).toBe(9);
            expect(event.date.minute()).toBe(30);
        });

        it('returns a ParseError when the heading cannot be found', () => {
            const ripper = new CenterForWoodenBoatsRipper();
            const result = ripper.parseWoodRegatta('<html><body><h2>Some Other Event</h2></body></html>');
            expect(isEvent(result)).toBe(false);
            expect((result as RipperError).type).toBe('ParseError');
        });
    });
});
