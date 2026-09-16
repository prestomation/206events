import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseHtml } from 'node-html-parser';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import { extractListingEntries, parseListingEntry, ListingEntry } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE = ZoneId.of('America/Los_Angeles');

function loadFixture(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function nowAt(isoLocalDateTime: string): ZonedDateTime {
    return ZonedDateTime.of(LocalDateTime.parse(isoLocalDateTime), ZONE);
}

describe('extractListingEntries', () => {
    it('extracts every work party from the listing page', () => {
        const html = parseHtml(loadFixture());
        const entries = extractListingEntries(html);
        expect(entries.length).toBeGreaterThan(30);
    });

    it('parses title, id, date/time/location line, and description', () => {
        const html = parseHtml(loadFixture());
        const entries = extractListingEntries(html);
        const trail = entries.find(e => e.eventId === '44870');
        expect(trail).toBeDefined();
        expect(trail!.title).toBe('More Fun on the Trail');
        expect(trail!.detailUrl).toBe('https://seattle.greencitypartnerships.org/event/44870');
        expect(trail!.monthDayTimeLocation).toBe('September 16, 9am-12:30pm @ Burke-Gilman Trail');
        expect(trail!.description).toContain('beating back the Ivy and Blackberries');
        expect(trail!.description).not.toContain('more');
    });

    it('handles an entry with no description text beyond the "more" link', () => {
        const html = parseHtml(loadFixture());
        const entries = extractListingEntries(html);
        const pocketForest = entries.find(e => e.eventId === '44505');
        expect(pocketForest).toBeDefined();
        expect(pocketForest!.description).toBe('');
    });

    it('returns an empty list when there are no event divs', () => {
        expect(extractListingEntries(parseHtml('<div class="header"><h4>September 15, 2026</h4></div>'))).toEqual([]);
    });
});

describe('parseListingEntry', () => {
    const baseEntry: ListingEntry = {
        eventId: '44870',
        detailUrl: 'https://seattle.greencitypartnerships.org/event/44870',
        title: 'More Fun on the Trail',
        monthDayTimeLocation: 'September 16, 9am-12:30pm @ Burke-Gilman Trail',
        description: "We're still working south on the Trail.",
    };

    it('parses a well-formed entry into an event', () => {
        const result = parseListingEntry(baseEntry, ZONE, nowAt('2026-09-01T00:00:00'));
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.id).toBe('green-seattle-partnership-44870');
        expect(result.summary).toBe('More Fun on the Trail');
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(9);
        expect(result.date.dayOfMonth()).toBe(16);
        expect(result.date.hour()).toBe(9);
        expect(result.date.minute()).toBe(0);
        expect(result.duration.toHours()).toBe(3);
        expect(result.duration.toMinutes()).toBe(210);
        expect(result.location).toBe('Burke-Gilman Trail, Seattle, WA');
        expect(result.cost).toEqual({ min: 0 });
    });

    it('rolls the year forward when the listed month has already passed', () => {
        const result = parseListingEntry(
            { ...baseEntry, monthDayTimeLocation: 'January 10, 9am-12pm @ Discovery Park' },
            ZONE,
            nowAt('2026-09-01T00:00:00'),
        );
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.year()).toBe(2027);
    });

    it('keeps the current year when the listed month is still ahead', () => {
        const result = parseListingEntry(
            { ...baseEntry, monthDayTimeLocation: 'December 10, 9am-12pm @ Discovery Park' },
            ZONE,
            nowAt('2026-09-01T00:00:00'),
        );
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.year()).toBe(2026);
    });

    it('returns a ParseError for an unrecognized line format', () => {
        const result = parseListingEntry({ ...baseEntry, monthDayTimeLocation: 'TBD' }, ZONE, nowAt('2026-09-01T00:00:00'));
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });

    it('returns a ParseError when the end time is not after the start time', () => {
        const result = parseListingEntry(
            { ...baseEntry, monthDayTimeLocation: 'September 16, 1pm-9am @ Discovery Park' },
            ZONE,
            nowAt('2026-09-01T00:00:00'),
        );
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });

    it('handles a time range with no minutes on either side', () => {
        const result = parseListingEntry(
            { ...baseEntry, monthDayTimeLocation: 'September 22, 10am-1pm @ Camp Long' },
            ZONE,
            nowAt('2026-09-01T00:00:00'),
        );
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.hour()).toBe(10);
        expect(result.duration.toHours()).toBe(3);
    });

    it('omits description when the entry has none', () => {
        const result = parseListingEntry({ ...baseEntry, description: '' }, ZONE, nowAt('2026-09-01T00:00:00'));
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.description).toBeUndefined();
    });
});
