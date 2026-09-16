import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    parseItems,
    parseItem,
    parseTitleTimeRange,
    extractHeadingDateRange,
} from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SampleItem {
    urlId: string;
    title: string;
    excerpt?: string | null;
    fullUrl: string;
    structuredContent?: {
        _type?: string;
        productType?: number;
        variants?: { price?: number }[];
    };
}

function loadItems(): SampleItem[] {
    const raw = fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8');
    return JSON.parse(raw).items;
}

function findItem(items: SampleItem[], urlId: string): SampleItem {
    const item = items.find(i => i.urlId === urlId);
    if (!item) throw new Error(`Fixture missing item ${urlId}`);
    return item;
}

function isEvent(e: RipperCalendarEvent | RipperError): e is RipperCalendarEvent {
    return 'date' in e;
}

describe('VortexPotteryRipper', () => {
    const items = loadItems();

    describe('parseTitleTimeRange', () => {
        it('parses a bare leading hour with a shared trailing meridiem ("6 to 9 pm")', () => {
            expect(parseTitleTimeRange('Beginners Wheel - Mondays - 6 to 9 pm - 6 Classes')).toEqual({
                startHour: 18, startMinute: 0, endHour: 21, endMinute: 0,
            });
        });

        it('parses a meridiem on both sides ("6 pm to 9 pm")', () => {
            expect(parseTitleTimeRange('Continuing Wheel - Wednesdays - 6 pm to 9 pm - 6 Classes')).toEqual({
                startHour: 18, startMinute: 0, endHour: 21, endMinute: 0,
            });
        });

        it('is case-insensitive on "To"', () => {
            expect(parseTitleTimeRange('Hand Sculpture - Wednesdays - 6 To 9 pm - 6 Classes')).toEqual({
                startHour: 18, startMinute: 0, endHour: 21, endMinute: 0,
            });
        });

        it('returns null when there is no time range in the text', () => {
            expect(parseTitleTimeRange('Beginners Wheel - Mondays - 6 Classes')).toBeNull();
        });

        it('infers AM (not the trailing PM) for a cross-noon range with no explicit leading meridiem ("10 to 1 pm")', () => {
            // Naively inheriting the trailing "pm" would give 10pm-1pm
            // (start after end); the only sensible same-day reading is
            // 10am-1pm.
            expect(parseTitleTimeRange('Some Class - Saturdays - 10 to 1 pm - 6 Classes')).toEqual({
                startHour: 10, startMinute: 0, endHour: 13, endMinute: 0,
            });
        });

        it('still inherits the trailing PM when it produces a forward range ("6 to 9 pm")', () => {
            expect(parseTitleTimeRange('Some Class - Saturdays - 6 to 9 pm - 6 Classes')).toEqual({
                startHour: 18, startMinute: 0, endHour: 21, endMinute: 0,
            });
        });
    });

    describe('extractHeadingDateRange', () => {
        it('parses a single-<strong> heading ("Mondays - November 2 to December 7, 2026")', () => {
            const item = findItem(items, 'mondays');
            const range = extractHeadingDateRange(item.excerpt ?? '');
            expect(range).not.toBeNull();
            expect(range!.start.toString()).toBe('2026-11-02');
            expect(range!.end.toString()).toBe('2026-12-07');
        });

        it('parses a heading split across two <strong> tags ("Wednesdays" / "November 4 to December 9, 2026")', () => {
            const item = findItem(items, 'wednesday-handbuilt-ceramics');
            const range = extractHeadingDateRange(item.excerpt ?? '');
            expect(range).not.toBeNull();
            expect(range!.start.toString()).toBe('2026-11-04');
            expect(range!.end.toString()).toBe('2026-12-09');
        });

        it('returns null for empty or unrecognized excerpt text', () => {
            expect(extractHeadingDateRange('')).toBeNull();
            expect(extractHeadingDateRange('<h3>Just some other text</h3>')).toBeNull();
        });

        it('rolls the start date back a year when the range crosses a year boundary', () => {
            // The stated year (2027) trails "January 19"; "December 15"
            // must be 2026, not 2027.
            const range = extractHeadingDateRange('<h3>Mondays - December 15 to January 19, 2027</h3>');
            expect(range).not.toBeNull();
            expect(range!.start.toString()).toBe('2026-12-15');
            expect(range!.end.toString()).toBe('2027-01-19');
        });

        it('keeps both dates in the stated year when the range does not cross a year boundary', () => {
            const range = extractHeadingDateRange('<h3>Mondays - November 2 to December 7, 2026</h3>');
            expect(range).not.toBeNull();
            expect(range!.start.toString()).toBe('2026-11-02');
            expect(range!.end.toString()).toBe('2026-12-07');
        });
    });

    describe('parseItem', () => {
        it('expands the Monday Beginners Wheel session into 6 weekly events at $500 each', () => {
            const item = findItem(items, 'mondays');
            const results = parseItem(item as any);
            const events = results.filter(isEvent).sort((a, b) => a.date.compareTo(b.date));

            expect(results.filter(e => 'type' in e)).toHaveLength(0);
            expect(events).toHaveLength(6);
            expect(events[0].date.toLocalDate().toString()).toBe('2026-11-02');
            expect(events[events.length - 1].date.toLocalDate().toString()).toBe('2026-12-07');

            for (const e of events) {
                expect(e.date.hour()).toBe(18);
                expect(e.date.minute()).toBe(0);
                expect(e.duration.toHours()).toBe(3);
                expect(e.cost).toEqual({ min: 500 });
                expect(e.location).toBe('Vortex Pottery, 517 Aloha St, Seattle, WA 98109');
                expect(e.summary).toBe(item.title);
            }

            // Weekly steps are exactly 7 days apart
            for (let i = 1; i < events.length; i++) {
                const days = events[i].date.toLocalDate().toEpochDay() - events[i - 1].date.toLocalDate().toEpochDay();
                expect(days).toBe(7);
            }

            // ids are unique
            expect(new Set(events.map(e => e.id)).size).toBe(6);
        });

        it('builds an absolute event URL from the item\'s fullUrl', () => {
            const item = findItem(items, 'tuesdays');
            const events = parseItem(item as any).filter(isEvent);
            expect(events[0].url).toBe('https://vortexpottery.com/pottery-classes-seattle-washington/p/tuesdays');
        });

        it('returns a ParseError (not a crash or a dropped item) when the excerpt has no parseable date', () => {
            const item = findItem(items, 'mondays');
            const results = parseItem({ ...item, excerpt: '<h3>no date here</h3>' } as any);
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({ type: 'ParseError' });
        });

        it('returns a ParseError when the title has no time range', () => {
            const item = findItem(items, 'mondays');
            const results = parseItem({ ...item, title: 'Beginners Wheel - Mondays - 6 Classes' } as any);
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({ type: 'ParseError' });
        });

        it('expands a session crossing a year boundary with the correct year on each side', () => {
            const item = findItem(items, 'mondays');
            const results = parseItem({
                ...item,
                excerpt: '<h3>Mondays - December 14 to January 18, 2027</h3>',
            } as any);
            const events = results.filter(isEvent).sort((a, b) => a.date.compareTo(b.date));

            expect(results.filter(e => 'type' in e)).toHaveLength(0);
            expect(events).toHaveLength(6);
            expect(events[0].date.toLocalDate().toString()).toBe('2026-12-14');
            expect(events[events.length - 1].date.toLocalDate().toString()).toBe('2027-01-18');
        });
    });

    describe('parseItems', () => {
        it('produces 24 events across the 4 current class listings (6 weeks each)', () => {
            const results = parseItems(items as any);
            const events = results.filter(isEvent);
            const errors = results.filter((r): r is RipperError => 'type' in r);
            expect(errors).toHaveLength(0);
            expect(events).toHaveLength(24);
        });

        it('produces no null entries — every result is an event or a RipperError', () => {
            const results = parseItems(items as any);
            for (const r of results) {
                expect(r == null).toBe(false);
                expect('date' in r || 'type' in r).toBe(true);
            }
        });

        it('skips non-class product types entirely (no event, no error)', () => {
            const nonClass = { ...findItem(items, 'mondays'), structuredContent: { _type: 'StoreItem', productType: 4, variants: [] } };
            const results = parseItems([nonClass] as any);
            expect(results).toHaveLength(0);
        });
    });
});
