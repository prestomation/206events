import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parse } from 'node-html-parser';
import UrbanFamilyBrewingRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');

const TZ = ZoneId.of('America/Los_Angeles');

// Sample was captured in late June 2026 showing the July 2026 month view.
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 7, 1, 0, 0, 0), TZ);

describe('UrbanFamilyBrewingRipper', () => {
    const ripper = new UrbanFamilyBrewingRipper();

    it('parses events from sample HTML', () => {
        const events = ripper.parseEvents(sampleHtml, NOW);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBeGreaterThan(10);
    });

    it('produces no parse errors on the sample page', () => {
        const events = ripper.parseEvents(sampleHtml, NOW);
        const errors = events.filter(e => 'type' in e);
        expect(errors).toEqual([]);
    });

    it('prefixes food truck rotation events with "Food Truck:"', () => {
        const events = ripper.parseEvents(sampleHtml, NOW) as any[];
        const calEvents = events.filter(e => 'date' in e);
        const foodTruck = calEvents.find(e => e.summary.includes('Food Truck:'));
        expect(foodTruck).toBeDefined();
    });

    it('leaves house events (trivia, yoga) untouched', () => {
        const events = ripper.parseEvents(sampleHtml, NOW) as any[];
        const calEvents = events.filter(e => 'date' in e);
        const yoga = calEvents.find(e => e.summary === 'Yoga in the Brewery');
        expect(yoga).toBeDefined();
    });

    it('sets the correct location on all events', () => {
        const events = ripper.parseEvents(sampleHtml, NOW) as any[];
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBeGreaterThan(0);
        for (const e of calEvents) {
            expect(e.location).toContain('1103 NW 52nd St');
        }
    });

    it('filters out past events', () => {
        const farFuture = ZonedDateTime.of(LocalDateTime.of(2026, 12, 1, 0, 0, 0), TZ);
        const events = ripper.parseEvents(sampleHtml, farFuture);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBe(0);
    });

    it('keeps an event that is still in progress (started before now, ends after)', () => {
        // "Yoga in the Brewery" on 2026-06-28 runs 11:00am-12:00pm; check mid-event.
        const midEvent = ZonedDateTime.of(LocalDateTime.of(2026, 6, 28, 11, 30, 0), TZ);
        const events = ripper.parseEvents(sampleHtml, midEvent) as any[];
        const calEvents = events.filter(e => 'date' in e);
        const yoga = calEvents.find(e => e.summary === 'Yoga in the Brewery');
        expect(yoga).toBeDefined();
    });

    it('deduplicates events with the same event id', () => {
        const doubled = sampleHtml + sampleHtml;
        const single = ripper.parseEvents(sampleHtml, NOW);
        const deduped = ripper.parseEvents(doubled, NOW);
        expect(deduped.filter(e => 'date' in e).length).toBe(single.filter(e => 'date' in e).length);
    });

    it('computes duration from the start/end time attributes', () => {
        const events = ripper.parseEvents(sampleHtml, NOW) as any[];
        const yoga = events.filter(e => 'date' in e).find(e => e.summary === 'Yoga in the Brewery');
        expect(yoga).toBeDefined();
        expect(yoga.duration.toMinutes()).toBe(60);
    });

    it('parseEventCell returns a ParseError, never throws or returns null, for a malformed cell', () => {
        const badCell = parse('<div data-eventurl="https://x.test/e" data-eventid="1">no title or times</div>')
            .querySelector('[data-eventurl]')!;
        const result = ripper.parseEventCell(badCell);
        expect('type' in result).toBe(true);
    });

    // Sugar Calendar renders all-day events without <time datetime> elements —
    // the day-only start lives in `data-daydate`, flagged by `data-daydiv`.
    const ALL_DAY_CELL_HTML = `
        <div
            data-eventurl="https://urbanfamilybrewing.com/events/bricks-and-minifigs/"
            data-eventid="585"
            data-calendarsinfo="{&quot;calendars&quot;:[{&quot;name&quot;:&quot;Urban Family Brewing Ballard&quot;}]}"
            data-daydate="{&quot;start_date&quot;:{&quot;datetime&quot;:&quot;2026-07-23T00:00:00&quot;,&quot;value&quot;:&quot;July 23, 2026&quot;}}"
            data-daydiv="[&quot;all_day&quot;]"
        >
            <div class="sugar-calendar-block__event-cell__time">All-day</div>
            <div class="sugar-calendar-block__event-cell__title">Bricks and Minifigs</div>
        </div>
    `;

    it('parses an all-day event cell (no <time> elements) as a 24h event', () => {
        const cell = parse(ALL_DAY_CELL_HTML).querySelector('[data-eventurl]')!;
        const result = ripper.parseEventCell(cell) as any;
        expect('date' in result).toBe(true);
        expect(result.summary).toBe('Bricks and Minifigs');
        expect(result.date.toString()).toContain('2026-07-23T00:00');
        expect(result.duration.toMinutes()).toBe(24 * 60);
    });

    it('returns a ParseError for a cell with neither <time> elements nor all-day markers', () => {
        const cell = parse(
            '<div data-eventurl="https://x.test/e" data-eventid="1"><div class="sugar-calendar-block__event-cell__title">No Time</div></div>'
        ).querySelector('[data-eventurl]')!;
        const result = ripper.parseEventCell(cell);
        expect('type' in result).toBe(true);
        if ('type' in result) {
            expect(result.reason).toContain('Missing start/end datetime');
        }
    });
});
