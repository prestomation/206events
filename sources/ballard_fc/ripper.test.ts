import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import BallardFCRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function nowAt(year: number, month: number, day: number): ZonedDateTime {
    return ZonedDateTime.of(LocalDateTime.of(year, month, day, 12, 0), TIMEZONE);
}

describe('BallardFCRipper', () => {
    const ripper = new BallardFCRipper();

    describe('parseGameDate', () => {
        it('parses "Friday, May 29"', () => {
            expect(ripper.parseGameDate('Friday, May 29')).toEqual({ month: 5, day: 29 });
        });

        it('parses "Saturday, June 6"', () => {
            expect(ripper.parseGameDate('Saturday, June 6')).toEqual({ month: 6, day: 6 });
        });

        it('parses "Sunday, July 12"', () => {
            expect(ripper.parseGameDate('Sunday, July 12')).toEqual({ month: 7, day: 12 });
        });

        it('parses "Wednesday, June 24"', () => {
            expect(ripper.parseGameDate('Wednesday, June 24')).toEqual({ month: 6, day: 24 });
        });

        it('returns null for invalid input', () => {
            expect(ripper.parseGameDate('Score Here')).toBeNull();
            expect(ripper.parseGameDate('')).toBeNull();
        });
    });

    describe('parseGameTime', () => {
        it('parses "7:00 PM"', () => {
            expect(ripper.parseGameTime('7:00 PM')).toEqual({ hour: 19, minute: 0 });
        });

        it('parses "2:00 PM"', () => {
            expect(ripper.parseGameTime('2:00 PM')).toEqual({ hour: 14, minute: 0 });
        });

        it('parses "7:30 PM"', () => {
            expect(ripper.parseGameTime('7:30 PM')).toEqual({ hour: 19, minute: 30 });
        });

        it('parses "5:15 PM"', () => {
            expect(ripper.parseGameTime('5:15 PM')).toEqual({ hour: 17, minute: 15 });
        });

        it('parses "12:00 PM" (noon)', () => {
            expect(ripper.parseGameTime('12:00 PM')).toEqual({ hour: 12, minute: 0 });
        });

        it('parses "10:00 AM"', () => {
            expect(ripper.parseGameTime('10:00 AM')).toEqual({ hour: 10, minute: 0 });
        });

        it('returns null for invalid input', () => {
            expect(ripper.parseGameTime('Score Here')).toBeNull();
            expect(ripper.parseGameTime('')).toBeNull();
        });
    });

    describe('parseSchedule with sample data', () => {
        const html = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');

        it('returns only home game events (no away games)', () => {
            const now = nowAt(2026, 5, 19);
            const results = ripper.parseSchedule(html, now);
            const events = results.filter(r => 'date' in r);
            const errors = results.filter(r => 'type' in r);
            // Sample has 7 home games, 1 away game (excluded)
            expect(events.length).toBe(7);
            expect(errors.length).toBe(0);
        });

        it('sets correct summaries with opponent names', () => {
            const now = nowAt(2026, 5, 19);
            const results = ripper.parseSchedule(html, now);
            const events = results.filter((r): r is import('../../lib/config/schema.js').RipperCalendarEvent => 'date' in r);
            const summaries = events.map(e => e.summary);
            expect(summaries).toContain('Ballard FC vs Midlakes United');
            expect(summaries).toContain('Ballard FC vs Portland Bangers FC');
            expect(summaries).toContain('Ballard FC vs West Seattle Junction FC');
        });

        it('sets location to Interbay Stadium', () => {
            const now = nowAt(2026, 5, 19);
            const results = ripper.parseSchedule(html, now);
            const events = results.filter((r): r is import('../../lib/config/schema.js').RipperCalendarEvent => 'date' in r);
            for (const event of events) {
                expect(event.location).toBe('Interbay Stadium, Seattle, WA');
            }
        });

        it('assigns stable IDs based on date', () => {
            const now = nowAt(2026, 5, 19);
            const results = ripper.parseSchedule(html, now);
            const events = results.filter((r): r is import('../../lib/config/schema.js').RipperCalendarEvent => 'date' in r);
            const ids = events.map(e => e.id);
            expect(ids).toContain('ballard-fc-2026-05-29');
            expect(ids).toContain('ballard-fc-2026-06-06');
            expect(ids).toContain('ballard-fc-2026-07-12');
        });

        it('advances past dates to next year', () => {
            // May 15 game is in the past when now is May 19; should advance to 2027
            const now = nowAt(2026, 5, 19);
            const results = ripper.parseSchedule(html, now);
            const events = results.filter((r): r is import('../../lib/config/schema.js').RipperCalendarEvent => 'date' in r);
            const may15 = events.find(e => e.id === 'ballard-fc-2027-05-15');
            expect(may15).toBeDefined();
            expect(may15!.summary).toBe('Ballard FC vs FC Olympia');
        });

        it('keeps upcoming dates in current year', () => {
            const now = nowAt(2026, 5, 19);
            const results = ripper.parseSchedule(html, now);
            const events = results.filter((r): r is import('../../lib/config/schema.js').RipperCalendarEvent => 'date' in r);
            const may29 = events.find(e => e.id === 'ballard-fc-2026-05-29');
            expect(may29).toBeDefined();
            expect(may29!.date.year()).toBe(2026);
        });
    });
});
