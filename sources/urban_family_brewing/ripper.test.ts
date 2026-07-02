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
});
