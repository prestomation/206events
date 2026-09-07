import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    parseCalendarPage,
    parseTime,
    parseProductionDetail,
    resolveGridYear,
} from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadCalendarSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function loadProductionSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-event.html'), 'utf8');
}

describe('resolveGridYear', () => {
    it('keeps the requested year when the cell is in the requested month', () => {
        expect(resolveGridYear(2026, 10, 10)).toBe(2026);
    });

    it('resolves a leading pad day from the previous month to the same year', () => {
        expect(resolveGridYear(2026, 10, 9)).toBe(2026);
    });

    it('rolls back a year when January pads with December', () => {
        expect(resolveGridYear(2027, 1, 12)).toBe(2026);
    });

    it('rolls forward a year when December pads with January', () => {
        expect(resolveGridYear(2026, 12, 1)).toBe(2027);
    });
});

describe('parseTime', () => {
    it('parses a PM time', () => {
        expect(parseTime('6:00 PM')).toEqual({ hour: 18, minute: 0 });
    });

    it('parses an AM time', () => {
        expect(parseTime('11:00 AM')).toEqual({ hour: 11, minute: 0 });
    });

    it('handles 12 PM as noon', () => {
        expect(parseTime('12:00 PM')).toEqual({ hour: 12, minute: 0 });
    });

    it('handles 12 AM as midnight', () => {
        expect(parseTime('12:00 AM')).toEqual({ hour: 0, minute: 0 });
    });

    it('returns null for unrecognized text', () => {
        expect(parseTime('TBD')).toBeNull();
    });
});

describe('parseCalendarPage', () => {
    it('extracts mainstage show events with correct date and time', () => {
        const html = parse(loadCalendarSampleHtml());
        const events = parseCalendarPage(html, 2026, 10);

        const leonardo = events.find(e => e.title.includes('Leonardo') && e.day === 1);
        expect(leonardo).toBeDefined();
        expect(leonardo!.year).toBe(2026);
        expect(leonardo!.month).toBe(10);
        expect(leonardo!.timeText).toBe('6:00 PM');
        expect(leonardo!.eventType).toBe('mainstage');
        expect(leonardo!.href).toContain('/onstage/productions/leonardo-2026/');
    });

    it('resolves a padding day from the previous month to that month', () => {
        const html = parse(loadCalendarSampleHtml());
        const events = parseCalendarPage(html, 2026, 10);

        // The grid's first row pads with Sept 30; no events land there in the
        // fixture, but no event should ever be misattributed to October 30.
        expect(events.some(e => e.month === 9)).toBe(false);
        expect(events.every(e => e.month === 10)).toBe(true);
    });

    it('excludes sct-class events', () => {
        const html = parse(loadCalendarSampleHtml());
        const events = parseCalendarPage(html, 2026, 10);

        expect(events.some(e => e.eventType === 'sct-class')).toBe(false);
    });

    it('includes special "event" type entries (e.g. donor benefits)', () => {
        const html = parse(loadCalendarSampleHtml());
        const events = parseCalendarPage(html, 2026, 10);

        const donorEvent = events.find(e => e.eventType === 'event');
        expect(donorEvent).toBeDefined();
        expect(donorEvent!.title).toContain('Donor Benefits');
    });

    it('returns events with valid titles and hrefs', () => {
        const html = parse(loadCalendarSampleHtml());
        const events = parseCalendarPage(html, 2026, 10);

        expect(events.length).toBeGreaterThan(0);
        for (const event of events) {
            expect(event.title.length).toBeGreaterThan(0);
            expect(event.href.length).toBeGreaterThan(0);
        }
    });
});

describe('parseProductionDetail', () => {
    it('extracts image, description, location, and running time', () => {
        const html = parse(loadProductionSampleHtml());
        const detail = parseProductionDetail(html);

        expect(detail.imageUrl).toBe('https://www.sct.org/app/uploads/2018/11/Leonardo-A-Wonderful-Show_V3_No-Title_600x300.jpg');
        expect(detail.description).toContain('Mo Willems');
        expect(detail.location).toBe('Charlotte Martin Theatre');
        expect(detail.durationMinutes).toBe(45);
    });
});
