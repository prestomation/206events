import { describe, it, expect } from 'vitest';
import RainierBeachCommunityClubRipper, { parseTimeText } from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { LocalDate } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

// Fixed "today" for the sample page — chosen so both future dated events
// (Ice Cream Social, Meaningful Movies, Wine Tasting, Plant & Seed Share,
// Harvest Social, Arts and Crafts Market) and already-past ones (Garden
// Stroll, Beach Talks) are represented consistently regardless of when the
// test suite actually runs.
const TODAY = LocalDate.of(2026, 7, 11);

describe('RainierBeachCommunityClubRipper', () => {
    describe('parseEventsPage', () => {
        it('extracts every event with a concrete future date', () => {
            const ripper = new RainierBeachCommunityClubRipper();
            const events = ripper.parseEventsPage(loadSampleHtml(), TODAY);
            const dated = events.filter(e => 'date' in e) as RipperCalendarEvent[];

            const summaries = dated.map(e => e.summary).sort();
            expect(summaries).toEqual([
                'Arts and Crafts Market',
                'Harvest Social',
                'Ice Cream Social and Jazz Jam',
                'Meaningful Movies',
                'Plant & Seed Share',
                'Wine Tasting',
            ].sort());
        });

        it('reports a ParseError for events with no concrete date instead of dropping them silently', () => {
            const ripper = new RainierBeachCommunityClubRipper();
            const events = ripper.parseEventsPage(loadSampleHtml(), TODAY);
            const errors = events.filter(e => 'type' in e && e.type === 'ParseError') as RipperError[];

            // Jazz Jam (general recurring blurb, no specific instance), One Seattle
            // Day of Service, Game Night, Homespun Tales Story Hour, and Neighborhood
            // Garage Sale are all listed with "TBD"/"TBA" placeholders, not real dates.
            expect(errors.length).toBeGreaterThanOrEqual(5);
            expect(errors.some(e => e.reason.includes('Jazz Jam'))).toBe(true);
            expect(errors.some(e => e.reason.includes('Homespun Tales Story Hour'))).toBe(true);
        });

        it('silently drops events whose listed date has already passed', () => {
            const ripper = new RainierBeachCommunityClubRipper();
            const events = ripper.parseEventsPage(loadSampleHtml(), TODAY);
            const summaries = events.filter(e => 'date' in e).map(e => (e as RipperCalendarEvent).summary);

            // Garden Stroll (June 7, 2026) and Beach Talks (July 9, no year — resolves
            // to 2026) are both before TODAY (July 11, 2026).
            expect(summaries).not.toContain('Garden Stroll');
            expect(summaries).not.toContain('Beach Talks');
        });

        it('parses a fully-dated single-line event (Arts and Crafts Market)', () => {
            const ripper = new RainierBeachCommunityClubRipper();
            const events = ripper.parseEventsPage(loadSampleHtml(), TODAY);
            const event = events.find(e => 'date' in e && e.summary === 'Arts and Crafts Market') as RipperCalendarEvent;

            expect(event).toBeDefined();
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(12);
            expect(event.date.dayOfMonth()).toBe(5);
            expect(event.date.hour()).toBe(10);
            expect(event.duration.toHours()).toBe(5);
            expect(event.url).toBe('https://rainierbeachcommunityclub.org/events/arts-and-crafts-market/');
            expect(event.location).toBe('Rainier Beach Community Club, 6038 S Pilgrim St, Seattle, WA 98118');
        });

        it('infers the year when the date omits one (Ice Cream Social and Jazz Jam)', () => {
            const ripper = new RainierBeachCommunityClubRipper();
            const events = ripper.parseEventsPage(loadSampleHtml(), TODAY);
            const event = events.find(e => 'date' in e && e.summary === 'Ice Cream Social and Jazz Jam') as RipperCalendarEvent;

            expect(event).toBeDefined();
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(8);
            expect(event.date.dayOfMonth()).toBe(16);
            expect(event.date.hour()).toBe(15);
            expect(event.duration.toHours()).toBe(3);
        });

        it('produces stable, content-derived ids across repeated parses', () => {
            const ripper = new RainierBeachCommunityClubRipper();
            const first = ripper.parseEventsPage(loadSampleHtml(), TODAY)
                .filter(e => 'date' in e) as RipperCalendarEvent[];
            const second = ripper.parseEventsPage(loadSampleHtml(), TODAY)
                .filter(e => 'date' in e) as RipperCalendarEvent[];

            expect(first.map(e => e.id)).toEqual(second.map(e => e.id));
            expect(new Set(first.map(e => e.id)).size).toBe(first.length);
        });

        it('flags an Uncertainty when no time can be found (Meaningful Movies)', () => {
            const ripper = new RainierBeachCommunityClubRipper();
            const events = ripper.parseEventsPage(loadSampleHtml(), TODAY);
            const uncertainty = events.find(
                e => 'type' in e && e.type === 'Uncertainty' && e.event.summary === 'Meaningful Movies'
            );
            expect(uncertainty).toBeDefined();
        });
    });

    describe('parseTimeText', () => {
        it('parses a simple range without a start period ("3-6 pm")', () => {
            const result = parseTimeText('3-6 pm');
            expect(result).toMatchObject({ hour: 15, minute: 0, durationMinutes: 180, startTimeGuessed: false, durationGuessed: false });
        });

        it('parses "Noon" as 12pm ("10am-Noon")', () => {
            const result = parseTimeText('10am-Noon');
            expect(result).toMatchObject({ hour: 10, minute: 0, durationMinutes: 120, startTimeGuessed: false, durationGuessed: false });
        });

        it('takes the later mention as the start time when there is no range ("Doors open 7pm, tasting 7:30pm")', () => {
            const result = parseTimeText('Doors open 7pm, tasting 7:30pm');
            expect(result).toMatchObject({ hour: 19, minute: 30, durationGuessed: true, startTimeGuessed: false });
        });

        it('parses a single time with a default duration ("6pm")', () => {
            const result = parseTimeText('6pm');
            expect(result).toMatchObject({ hour: 18, minute: 0, durationMinutes: 120, durationGuessed: true });
        });

        it('falls back to a placeholder when no time is present at all', () => {
            const result = parseTimeText('');
            expect(result.startTimeGuessed).toBe(true);
            expect(result.durationGuessed).toBe(true);
        });
    });
});
