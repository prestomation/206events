import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import DancingTilDuskRipper, { parseMonthDay, parseTimeRange } from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');
}

describe('parseMonthDay', () => {
    it('parses "July 7"', () => {
        expect(parseMonthDay('July 7')).toEqual({ month: 7, day: 7 });
    });

    it('parses "Aug 4, Tues"', () => {
        expect(parseMonthDay('Aug 4, Tues')).toEqual({ month: 8, day: 4 });
    });

    it('parses "Sunday, Aug 30"', () => {
        expect(parseMonthDay('Sunday, Aug 30')).toEqual({ month: 8, day: 30 });
    });

    it('parses "July 23"', () => {
        expect(parseMonthDay('July 23')).toEqual({ month: 7, day: 23 });
    });

    it('returns null for invalid input', () => {
        expect(parseMonthDay('no date here')).toBeNull();
    });
});

describe('parseTimeRange', () => {
    it('parses "6-9:30pm"', () => {
        const result = parseTimeRange('6-9:30pm');
        expect(result).toEqual({ startHour: 18, startMinute: 0, durationMinutes: 210 });
    });

    it('parses "6-9pm"', () => {
        const result = parseTimeRange('6-9pm');
        expect(result).toEqual({ startHour: 18, startMinute: 0, durationMinutes: 180 });
    });

    it('parses "6–9:30pm" (en-dash)', () => {
        const result = parseTimeRange('6–9:30pm');
        expect(result).toEqual({ startHour: 18, startMinute: 0, durationMinutes: 210 });
    });

    it('parses "Thursday, 6–9:30pm"', () => {
        const result = parseTimeRange('Thursday, 6–9:30pm');
        expect(result).toEqual({ startHour: 18, startMinute: 0, durationMinutes: 210 });
    });

    it('returns null for no time', () => {
        expect(parseTimeRange('Westlake Park')).toBeNull();
    });
});

describe('DancingTilDuskRipper.parsePageHtml', () => {
    const ripper = new DancingTilDuskRipper();

    it('parses all 17 events from sample HTML', () => {
        const html = loadSampleHtml();
        const events = ripper.parsePageHtml(html);
        const successEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        const errors = events.filter(e => 'type' in e);
        expect(errors).toHaveLength(0);
        expect(successEvents).toHaveLength(17);
    });

    it('assigns correct dates', () => {
        const html = loadSampleHtml();
        const events = ripper.parsePageHtml(html).filter(e => 'date' in e) as RipperCalendarEvent[];

        const july7 = events.find(e => e.date.monthValue() === 7 && e.date.dayOfMonth() === 7);
        expect(july7).toBeDefined();
        // Year is current year if July hasn't passed, next year otherwise
        const now = new Date();
        const expectedYear = 7 < (now.getMonth() + 1) ? now.getFullYear() + 1 : now.getFullYear();
        expect(july7!.date.year()).toBe(expectedYear);
        expect(july7!.date.hour()).toBe(18);
        expect(july7!.date.minute()).toBe(0);

        const aug30 = events.find(e => e.date.monthValue() === 8 && e.date.dayOfMonth() === 30);
        expect(aug30).toBeDefined();
        expect(aug30!.summary).toContain('DJ Battle');
        expect(aug30!.location).toContain('Golden Gardens');
    });

    it('assigns correct duration for 6-9:30pm events', () => {
        const html = loadSampleHtml();
        const events = ripper.parsePageHtml(html).filter(e => 'date' in e) as RipperCalendarEvent[];

        // Westlake Park (6-9:30pm) = 210 minutes
        const westlake = events.find(e => (e.location ?? '').includes('Westlake'));
        expect(westlake).toBeDefined();
        expect(westlake!.duration.toMinutes()).toBe(210);

        // Hing Hay Park (6-9pm) = 180 minutes
        const hingHay = events.find(e => (e.location ?? '').includes('Hing Hay'));
        expect(hingHay).toBeDefined();
        expect(hingHay!.duration.toMinutes()).toBe(180);
    });

    it('generates stable IDs based on band name and date', () => {
        const html = loadSampleHtml();
        const events = ripper.parsePageHtml(html).filter(e => 'date' in e) as RipperCalendarEvent[];

        const july7 = events.find(e => e.date.monthValue() === 7 && e.date.dayOfMonth() === 7);
        const now = new Date();
        const idYear = 7 < (now.getMonth() + 1) ? now.getFullYear() + 1 : now.getFullYear();
        expect(july7!.id).toBe(`dancing-til-dusk-swingin-in-the-rain-with-dina-blade-${idYear}-07-07`);
    });

    it('assigns Seattle park addresses', () => {
        const html = loadSampleHtml();
        const events = ripper.parsePageHtml(html).filter(e => 'date' in e) as RipperCalendarEvent[];

        const ballard = events.find(e => e.summary.includes('JerKels'));
        expect(ballard!.location ?? '').toContain('Ballard Commons Park');

        const volunteer = events.find(e => e.summary.includes('Whitney'));
        expect(volunteer!.location ?? '').toContain('Volunteer Park');
    });

    it('includes band name in summary', () => {
        const html = loadSampleHtml();
        const events = ripper.parsePageHtml(html).filter(e => 'date' in e) as RipperCalendarEvent[];
        for (const event of events) {
            expect(event.summary.startsWith('Dancing Til Dusk:')).toBe(true);
        }
    });

    it('sets URL to base URL', () => {
        const html = loadSampleHtml();
        const events = ripper.parsePageHtml(html).filter(e => 'date' in e) as RipperCalendarEvent[];
        for (const event of events) {
            expect(event.url).toBe('https://danceforjoy.biz/dancingtildusk/');
        }
    });
});
