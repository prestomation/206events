import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { ZonedDateTime, ZoneId, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import WestSeattleJunctionFCRipper from './ripper.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const sampleHtml = readFileSync(resolve(__dirname, 'sample-data.html'), 'utf-8');

const TIMEZONE = ZoneId.of('America/Los_Angeles');
// Fixed "now" before the season to get all upcoming games
const now = ZonedDateTime.of(LocalDateTime.of(2026, 5, 31, 0, 0), TIMEZONE);

describe('WestSeattleJunctionFCRipper', () => {
    const ripper = new WestSeattleJunctionFCRipper();

    describe('parseSchedule', () => {
        it('returns only upcoming home games (skips FULLTIME completed games)', () => {
            const results = ripper.parseSchedule(sampleHtml, now);
            // May 10 is FULLTIME (completed) — should be skipped
            const summaries = results.filter(r => 'date' in r).map(r => (r as any).summary);
            expect(summaries).not.toContain(expect.stringMatching(/May 10/));
            expect(summaries.length).toBeGreaterThanOrEqual(5);
        });

        it('finds all upcoming home games', () => {
            const results = ripper.parseSchedule(sampleHtml, now);
            const events = results.filter(r => 'date' in r);
            const summaries = events.map(r => (r as any).summary);
            expect(summaries).toContain('West Seattle Junction FC vs Midlakes United');
            expect(summaries).toContain('West Seattle Junction FC vs Ballard FC');
            expect(summaries).toContain('West Seattle Junction FC vs Bigfoot FC');
            expect(summaries).toContain('West Seattle Junction FC vs FC Olympia');
            expect(summaries).toContain('West Seattle Junction FC vs Snohomish United');
        });

        it('parses game times correctly', () => {
            const results = ripper.parseSchedule(sampleHtml, now);
            const events = results.filter(r => 'date' in r);
            const june7 = events.find(r => (r as any).summary.includes('Midlakes')) as any;
            expect(june7).toBeDefined();
            expect(june7.date.hour()).toBe(14); // 2:00 PM
            expect(june7.date.monthValue()).toBe(6);
            expect(june7.date.dayOfMonth()).toBe(7);
        });

        it('parses 7:00 PM kickoff correctly', () => {
            const results = ripper.parseSchedule(sampleHtml, now);
            const events = results.filter(r => 'date' in r);
            const july1 = events.find(r => (r as any).summary.includes('Bigfoot')) as any;
            expect(july1).toBeDefined();
            expect(july1.date.hour()).toBe(19); // 7:00 PM
            expect(july1.date.monthValue()).toBe(7);
            expect(july1.date.dayOfMonth()).toBe(1);
        });

        it('assigns stable ids based on date', () => {
            const results = ripper.parseSchedule(sampleHtml, now);
            const events = results.filter(r => 'date' in r) as any[];
            const ids = events.map(e => e.id);
            expect(ids).toContain('west-seattle-junction-fc-2026-06-07');
            expect(ids).toContain('west-seattle-junction-fc-2026-06-21');
        });

        it('produces no errors from the sample data', () => {
            const results = ripper.parseSchedule(sampleHtml, now);
            const errors = results.filter(r => 'type' in r);
            expect(errors).toHaveLength(0);
        });
    });

    describe('parseGameDate', () => {
        it('parses "Sunday, June 7"', () => {
            expect(ripper.parseGameDate('Sunday, June 7')).toEqual({ month: 6, day: 7 });
        });

        it('parses "Wednesday, July 1"', () => {
            expect(ripper.parseGameDate('Wednesday, July 1')).toEqual({ month: 7, day: 1 });
        });

        it('returns null for invalid format', () => {
            expect(ripper.parseGameDate('Not a date')).toBeNull();
        });
    });

    describe('parseGameTime', () => {
        it('parses "2:00 PM"', () => {
            expect(ripper.parseGameTime('2:00 PM')).toEqual({ hour: 14, minute: 0 });
        });

        it('parses "7:00 PM"', () => {
            expect(ripper.parseGameTime('7:00 PM')).toEqual({ hour: 19, minute: 0 });
        });

        it('parses "5:15 PM"', () => {
            expect(ripper.parseGameTime('5:15 PM')).toEqual({ hour: 17, minute: 15 });
        });

        it('returns null for FULLTIME', () => {
            expect(ripper.parseGameTime('FULLTIME')).toBeNull();
        });
    });
});
