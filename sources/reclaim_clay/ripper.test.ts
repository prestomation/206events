import { describe, it, expect } from 'vitest';
import { LocalDate } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    parseItems,
    parseItem,
    parseDateText,
    parseTimeRange,
    inferYear,
    extractExcerptDateText,
} from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The fixture was fetched live on 2026-09-16; freeze "now" to that date so
// year-inference (and therefore every asserted date below) is deterministic
// regardless of when the test suite actually runs.
const NOW = LocalDate.of(2026, 9, 16);

interface SampleItem {
    urlId: string;
    title: string;
    excerpt?: string | null;
    fullUrl: string;
    structuredContent?: {
        _type?: string;
        productType?: number;
        variants?: { attributes?: Record<string, string>; price?: number }[];
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

describe('ReclaimClayRipper', () => {
    const items = loadItems();

    describe('parseItems', () => {
        it('excludes the gift card item entirely (no event, no error)', () => {
            const giftCard = findItem(items, 'recc-gift-card');
            const results = parseItems([giftCard as any], NOW);
            expect(results).toHaveLength(0);
        });

        it('produces no null entries — every result is an event or a RipperError', () => {
            const results = parseItems(items as any, NOW);
            for (const r of results) {
                expect(r).not.toBeNull();
                expect(typeof r === 'object').toBe(true);
                expect('date' in r || 'type' in r).toBe(true);
            }
        });
    });

    describe('Case B: bare per-slot time variants (Sculpt and Carve pumpkin)', () => {
        it('produces 5 events on the same date at distinct times, $30 each', () => {
            const item = findItem(items, 'pumpkincarving');
            const results = parseItem(item as any, NOW);
            const events = results.filter(isEvent).sort((a, b) => a.date.compareTo(b.date));

            expect(results.filter(e => 'type' in e)).toHaveLength(0);
            expect(events).toHaveLength(5);

            const dateStrings = new Set(events.map(e => e.date.toLocalDate().toString()));
            expect(dateStrings.size).toBe(1);
            expect([...dateStrings][0]).toBe('2026-10-10');

            const hours = events.map(e => e.date.hour());
            expect(hours).toEqual([15, 16, 17, 18, 19]); // 3pm .. 7pm

            for (const e of events) {
                expect(e.cost).toEqual({ min: 30 });
                expect(e.duration.toHours()).toBe(1);
            }

            // ids must be unique
            expect(new Set(events.map(e => e.id)).size).toBe(5);
        });
    });

    describe('Case C weekly expansion (Say it with Clay)', () => {
        it('produces one event per Saturday from Nov 14 through Dec 19, 10:30am-1:30pm Pacific', () => {
            const item = findItem(items, 'say-it-with-clay');
            const results = parseItem(item as any, NOW);
            const events = results.filter(isEvent).sort((a, b) => a.date.compareTo(b.date));

            expect(events).toHaveLength(6);
            expect(events[0].date.toLocalDate().toString()).toBe('2026-11-14');
            expect(events[events.length - 1].date.toLocalDate().toString()).toBe('2026-12-19');

            for (const e of events) {
                expect(e.date.hour()).toBe(10);
                expect(e.date.minute()).toBe(30);
                expect(e.duration.toMinutes()).toBe(180);
                expect(e.date.zone().id()).toBe('America/Los_Angeles');
            }

            // Weekly steps are exactly 7 days apart
            for (let i = 1; i < events.length; i++) {
                const days = events[i].date.toLocalDate().toEpochDay() - events[i - 1].date.toLocalDate().toEpochDay();
                expect(days).toBe(7);
            }
        });
    });

    describe('Case C single date (A New Perspective)', () => {
        it('produces 1 event on Oct 17, 2-4pm', () => {
            const item = findItem(items, 'a-new-perspective-drawing-immersive-spaces');
            const events = parseItem(item as any, NOW).filter(isEvent);

            expect(events).toHaveLength(1);
            expect(events[0].date.toLocalDate().toString()).toBe('2026-10-17');
            expect(events[0].date.hour()).toBe(14);
            expect(events[0].date.minute()).toBe(0);
            expect(events[0].duration.toHours()).toBe(2);
        });
    });

    describe('Case A variant-driven dates (Clay Play: Handbuilt Picture Frames)', () => {
        it('produces 2 events, one per variant date, $95 each', () => {
            const item = findItem(items, 'clay-play-handbuilt-picture-frames');
            const events = parseItem(item as any, NOW).filter(isEvent).sort((a, b) => a.date.compareTo(b.date));

            expect(events).toHaveLength(2);

            expect(events[0].date.toLocalDate().toString()).toBe('2026-08-28');
            expect(events[0].date.hour()).toBe(18);
            expect(events[0].duration.toHours()).toBe(2);
            expect(events[0].cost).toEqual({ min: 95 });

            expect(events[1].date.toLocalDate().toString()).toBe('2026-09-26');
            expect(events[1].date.hour()).toBe(15);
            expect(events[1].duration.toHours()).toBe(2);
            expect(events[1].cost).toEqual({ min: 95 });

            expect(events[0].id).not.toBe(events[1].id);
        });
    });

    describe('Case: multi-day range (Handmade Altar: 2 Day Workshop)', () => {
        it('produces 1 event spanning Oct 3 noon through Oct 4 2pm', () => {
            const item = findItem(items, 'handmade-altar-2-day-workshop');
            const events = parseItem(item as any, NOW).filter(isEvent);

            expect(events).toHaveLength(1);
            expect(events[0].date.toLocalDate().toString()).toBe('2026-10-03');
            expect(events[0].date.hour()).toBe(12);
            expect(events[0].duration.toHours()).toBe(26); // noon Sat -> 2pm Sun
            expect(events[0].cost).toEqual({ min: 125 });
        });
    });

    describe('Case A weekly expansion via variant date string (Intro To Wheel: 6 Week)', () => {
        it('produces one event per Wednesday from Sep 23 through Oct 28, $395', () => {
            const item = findItem(items, 'intro-to-wheel-6-week');
            const events = parseItem(item as any, NOW).filter(isEvent);

            // Isolate Wednesday events in the Sep23-Oct28 window (the item
            // has several overlapping weekly series across different
            // weekdays/instructors — a second Wednesday series starts
            // Oct 28 too, so that boundary date carries two independent
            // events, one per series).
            const inRange = events.filter(e =>
                e.date.toLocalDate().toString() >= '2026-09-23' &&
                e.date.toLocalDate().toString() <= '2026-10-28' &&
                e.date.dayOfWeek().toString() === 'WEDNESDAY'
            ).sort((a, b) => a.date.compareTo(b.date));

            const distinctDates = [...new Set(inRange.map(e => e.date.toLocalDate().toString()))];
            expect(distinctDates).toEqual([
                '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28',
            ]);
            expect(inRange).toHaveLength(7); // 6 from this series + 1 from the overlapping series' Oct 28 start

            for (const e of inRange) {
                expect(e.date.hour()).toBe(18);
                expect(e.date.minute()).toBe(0);
                expect(e.duration.toHours()).toBe(3);
                expect(e.cost).toEqual({ min: 395 });
            }

            // ids across the whole item (multiple overlapping weekly series)
            // must still be unique, including the Oct 28 boundary shared by
            // two different series.
            expect(new Set(events.map(e => e.id)).size).toBe(events.length);
        });
    });

    describe('year inference', () => {
        it('assumes the current year when the date is not more than ~2 months in the past', () => {
            const parsed = parseDateText('Saturday, Oct 17, 2:00 PM - 4:00 PM', NOW);
            expect(parsed).not.toBeNull();
            expect(parsed!.kind).toBe('single');
            if (parsed!.kind === 'single') {
                expect(parsed!.date.year()).toBe(2026);
            }
        });

        it('rolls forward to next year when the date is more than ~2 months in the past', () => {
            // NOW = 2026-09-16; Feb 14 2026 is well over 2 months in the past.
            const parsed = parseDateText('Saturday, Feb 14, 2:00 PM - 4:00 PM', NOW);
            expect(parsed).not.toBeNull();
            expect(parsed!.kind).toBe('single');
            if (parsed!.kind === 'single') {
                expect(parsed!.date.year()).toBe(2027);
            }
        });

        it('inferYear rolls forward only once the candidate is >2 months stale', () => {
            // NOW = 2026-09-16, so the cutoff (now.minusMonths(2)) is 2026-07-16.
            expect(inferYear(9, 1, NOW)).toBe(2026); // Sep 1, within window
            expect(inferYear(7, 16, NOW)).toBe(2026); // exactly at the cutoff (not "before" it)
            expect(inferYear(7, 15, NOW)).toBe(2027); // one day past the cutoff
        });
    });

    describe('parseTimeRange', () => {
        it('parses "10:30 AM - 1:30 PM"', () => {
            const t = parseTimeRange('10:30 AM - 1:30 PM');
            expect(t).toEqual({ startHour: 10, startMinute: 30, endHour: 13, endMinute: 30 });
        });

        it('parses "6 - 9 PM" (shared trailing meridiem)', () => {
            const t = parseTimeRange('6 - 9 PM');
            expect(t).toEqual({ startHour: 18, startMinute: 0, endHour: 21, endMinute: 0 });
        });

        it('parses "12 - 2PM" (no space before meridiem)', () => {
            const t = parseTimeRange('12 - 2PM');
            expect(t).toEqual({ startHour: 12, startMinute: 0, endHour: 14, endMinute: 0 });
        });

        it('parses bare slot times like "3-4pm" and "7-8pm"', () => {
            expect(parseTimeRange('3-4pm')).toEqual({ startHour: 15, startMinute: 0, endHour: 16, endMinute: 0 });
            expect(parseTimeRange('7-8pm')).toEqual({ startHour: 19, startMinute: 0, endHour: 20, endMinute: 0 });
        });

        it('returns null when there is no time in the text', () => {
            expect(parseTimeRange('Saturday, October 10')).toBeNull();
        });
    });

    describe('extractExcerptDateText', () => {
        it('returns empty text when the leading strong tags are pricing, not a date', () => {
            const item = findItem(items, 'intro-to-wheel-6-week');
            const text = extractExcerptDateText(item.excerpt ?? '');
            expect(parseDateText(text, NOW)).toBeNull();
        });

        it('extracts a date from the first strong tag', () => {
            const item = findItem(items, 'a-new-perspective-drawing-immersive-spaces');
            const text = extractExcerptDateText(item.excerpt ?? '');
            expect(text).toContain('Oct 17');
        });
    });

    describe('parse methods never return null', () => {
        it('parseItem always returns an array of events/errors, never a bare null/undefined entry', () => {
            for (const item of items) {
                if (item.structuredContent?.productType !== 3) continue;
                const results = parseItem(item as any, NOW);
                expect(Array.isArray(results)).toBe(true);
                for (const r of results) {
                    expect(r == null).toBe(false);
                }
            }
        });
    });

    describe('date/time parsing robustness (leading non-date "word digit" text)', () => {
        it('parseDateText skips a leading non-month "word digit" phrase (e.g. an age range) to find the real single date', () => {
            const parsed = parseDateText('Ages 8+, Saturday, Nov 21, 2:00 PM - 4:00 PM', NOW);
            expect(parsed).toEqual({
                kind: 'single',
                date: LocalDate.of(2026, 11, 21),
                time: { startHour: 14, startMinute: 0, endHour: 16, endMinute: 0 },
            });
        });

        it('parseDateText skips a leading non-month "word digit" phrase to find a real date range', () => {
            const parsed = parseDateText('Ages 8 - 12, Saturday & Sunday, Oct 3 - Oct 4, 12 - 2PM', NOW);
            expect(parsed).toEqual({
                kind: 'range',
                start: LocalDate.of(2026, 10, 3),
                end: LocalDate.of(2026, 10, 4),
                time: { startHour: 12, startMinute: 0, endHour: 14, endMinute: 0 },
            });
        });

        it('parseTimeRange skips a leading numeric-only range with no AM/PM (e.g. an age range) to find the real time', () => {
            expect(parseTimeRange('Ages 8 - 12, Saturday & Sunday, Oct 3 - Oct 4, 12 - 2PM')).toEqual({
                startHour: 12,
                startMinute: 0,
                endHour: 14,
                endMinute: 0,
            });
        });
    });

    describe('multi-day range with only a start time', () => {
        it('falls back to the bounded default duration instead of a mechanical ~24-hour span', () => {
            const parsed = parseDateText('Saturday & Sunday, Nov 7 - Nov 8, 9am', NOW);
            expect(parsed?.kind).toBe('range');
            const item = findItem(items, 'handmade-altar-2-day-workshop');
            const results = parseItem({ ...item, excerpt: '<strong>Saturday &amp; Sunday, Nov 7 - Nov 8, 9am</strong>' } as any, NOW);
            const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
            expect(events).toHaveLength(1);
            expect(events[0].duration.toHours()).toBe(2);
            // Start time is known (9am), so this should not be flagged uncertain.
            const errors = results.filter((r): r is RipperError => 'type' in r);
            expect(errors).toHaveLength(0);
        });
    });
});
