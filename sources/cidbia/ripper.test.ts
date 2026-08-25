import { describe, expect, test } from 'vitest';
import CIDBIARipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('CIDBIARipper - parseMonthYear', () => {
    const ripper = new CIDBIARipper();

    test('extracts year from eventMonth div', () => {
        const html = `<div class="eventMonth"><p>May 2026</p></div>`;
        expect(ripper.parseMonthYear(html)).toBe(2026);
    });

    test('extracts year from eventMonth with class suffix', () => {
        const html = `<div class="eventMonth last"><p>June 2026</p></div>`;
        expect(ripper.parseMonthYear(html)).toBe(2026);
    });

    test('returns null when not found', () => {
        expect(ripper.parseMonthYear('<div></div>')).toBeNull();
    });
});

describe('CIDBIARipper - parseMonthDay', () => {
    const ripper = new CIDBIARipper();

    test('parses ordinal dates', () => {
        expect(ripper.parseMonthDay('May 15th')).toEqual({ month: 5, day: 15 });
        expect(ripper.parseMonthDay('June 13th')).toEqual({ month: 6, day: 13 });
        expect(ripper.parseMonthDay('July 4th')).toEqual({ month: 7, day: 4 });
        expect(ripper.parseMonthDay('March 1st')).toEqual({ month: 3, day: 1 });
        expect(ripper.parseMonthDay('February 2nd')).toEqual({ month: 2, day: 2 });
        expect(ripper.parseMonthDay('August 23rd')).toEqual({ month: 8, day: 23 });
    });

    test('parses dates without ordinal suffix', () => {
        expect(ripper.parseMonthDay('May 15')).toEqual({ month: 5, day: 15 });
    });

    test('returns null for invalid input', () => {
        expect(ripper.parseMonthDay('not a date')).toBeNull();
        expect(ripper.parseMonthDay('')).toBeNull();
    });
});

describe('CIDBIARipper - parseHeaderDay', () => {
    const ripper = new CIDBIARipper();

    test('parses weekday + abbreviated month + ordinal day', () => {
        expect(ripper.parseHeaderDay('Friday Aug. 21st')).toEqual({ month: 8, day: 21 });
        expect(ripper.parseHeaderDay('Saturday Aug. 22nd')).toEqual({ month: 8, day: 22 });
        expect(ripper.parseHeaderDay('Friday May. 15th')).toEqual({ month: 5, day: 15 });
    });

    test('returns null for invalid input', () => {
        expect(ripper.parseHeaderDay('not a header')).toBeNull();
        expect(ripper.parseHeaderDay('')).toBeNull();
    });
});

describe('CIDBIARipper - parseTimeRange', () => {
    const ripper = new CIDBIARipper();

    test('parses pm-pm range', () => {
        const result = ripper.parseTimeRange('6:30pm - 9:30pm');
        expect(result?.start).toEqual({ hour: 18, minute: 30 });
        expect(result?.end).toEqual({ hour: 21, minute: 30 });
    });

    test('parses am-pm range', () => {
        const result = ripper.parseTimeRange('11:00am - 5:00pm');
        expect(result?.start).toEqual({ hour: 11, minute: 0 });
        expect(result?.end).toEqual({ hour: 17, minute: 0 });
    });

    test('parses pm-pm range without minutes', () => {
        const result = ripper.parseTimeRange('3pm - 7pm');
        expect(result?.start).toEqual({ hour: 15, minute: 0 });
        expect(result?.end).toEqual({ hour: 19, minute: 0 });
    });

    test('parses single time', () => {
        const result = ripper.parseTimeRange('7:00pm');
        expect(result?.start).toEqual({ hour: 19, minute: 0 });
        expect(result?.end).toBeUndefined();
    });

    test('handles noon correctly', () => {
        const result = ripper.parseTimeRange('12:00pm - 3:00pm');
        expect(result?.start).toEqual({ hour: 12, minute: 0 });
        expect(result?.end).toEqual({ hour: 15, minute: 0 });
    });

    test('handles midnight correctly', () => {
        const result = ripper.parseTimeRange('12:00am - 2:00am');
        expect(result?.start).toEqual({ hour: 0, minute: 0 });
        expect(result?.end).toEqual({ hour: 2, minute: 0 });
    });

    test('returns null for unparseable text', () => {
        expect(ripper.parseTimeRange('no time here')).toBeNull();
    });
});

describe('CIDBIARipper - parseEvents from sample HTML', () => {
    const ripper = new CIDBIARipper();
    const html = loadSampleHtml();

    test('parses events from sample HTML', () => {
        const results = ripper.parseEvents(html, 'https://www.seattlechinatownid.com/local-events');
        const events = results.filter(r => 'date' in r);
        expect(events.length).toBeGreaterThan(0);
    });

    test('event has required fields', () => {
        const results = ripper.parseEvents(html, 'https://www.seattlechinatownid.com/local-events');
        const events = results.filter(r => 'date' in r) as any[];
        expect(events.length).toBeGreaterThan(0);
        const first = events[0];
        expect(first.summary).toBeTruthy();
        expect(first.date).toBeTruthy();
        expect(first.duration).toBeTruthy();
        expect(first.url).toBeTruthy();
    });

    test('Heritage Open Mic event is parsed correctly', () => {
        const results = ripper.parseEvents(html, 'https://www.seattlechinatownid.com/local-events');
        const events = results.filter(r => 'date' in r) as any[];
        const openMic = events.find((e: any) => e.summary === 'Heritage Open Mic');
        expect(openMic).toBeDefined();
        expect(openMic!.date.monthValue()).toBe(5);
        expect(openMic!.date.dayOfMonth()).toBe(15);
        expect(openMic!.date.hour()).toBe(18);
        expect(openMic!.date.minute()).toBe(30);
        expect(openMic!.url).toContain('/local-events/events/');
    });

    test('event location is populated', () => {
        const results = ripper.parseEvents(html, 'https://www.seattlechinatownid.com/local-events');
        const events = results.filter(r => 'date' in r) as any[];
        const openMic = events.find((e: any) => e.summary === 'Heritage Open Mic');
        expect(openMic?.location).toContain('Seattle');
    });
});

describe('CIDBIARipper - multi-day events with a "(multi-day event)" title tag', () => {
    const ripper = new CIDBIARipper();

    function multiDayHtml(): string {
        const collaItem = `
        <div class="collaItem">
            <div class="name">
                <div class="title">
                    <p>Director's Cut and Rumpus during Freehold Benefit Nights <span>(multi-day event)</span></p>
                </div>
            </div>
            <div class="description">
                <div class="time bottomMargin">
                    <p class="title">When</p>
                    <p>August 21st - August 22nd</p>
                    <p>8:00pm - 10:00pm</p>
                </div>
                <div class="address bottomMargin">
                    <p class="title">Where</p>
                    <p> 517 Maynard Ave S , Seattle WA 98104</p>
                </div>
                <a href="https://www.seattlechinatownid.com/local-events/events/844" title="Add To Calendar">Add To Calendar</a>
            </div>
        </div>`;
        return `
        <div class="eventMonth"><p>August 2026</p></div>
        <h2>Friday Aug. 21st</h2>
        ${collaItem}
        <h2>Saturday Aug. 22nd</h2>
        ${collaItem}`;
    }

    test('extracts the title despite the nested span', () => {
        const results = ripper.parseEvents(multiDayHtml(), 'https://www.seattlechinatownid.com/local-events');
        const events = results.filter(r => 'date' in r) as any[];
        expect(results.filter(r => 'type' in r)).toHaveLength(0);
        expect(events.every(e => e.summary === "Director's Cut and Rumpus during Freehold Benefit Nights")).toBe(true);
    });

    test('produces one occurrence per day header with distinct, stable ids', () => {
        const results = ripper.parseEvents(multiDayHtml(), 'https://www.seattlechinatownid.com/local-events');
        const events = results.filter(r => 'date' in r) as any[];
        expect(events).toHaveLength(2);

        const day21 = events.find(e => e.date.dayOfMonth() === 21);
        const day22 = events.find(e => e.date.dayOfMonth() === 22);
        expect(day21).toBeDefined();
        expect(day22).toBeDefined();
        expect(day21!.date.hour()).toBe(20);
        expect(day22!.date.hour()).toBe(20);
        expect(day21!.id).not.toBe(day22!.id);
        expect(day21!.id).toBe('cidbia-844-2026-08-21');
        expect(day22!.id).toBe('cidbia-844-2026-08-22');
    });
});
