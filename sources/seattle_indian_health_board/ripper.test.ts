import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import SIHBRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');

const TZ = ZoneId.of('America/Los_Angeles');
// Set "now" to before the June 13, 2026 event so it is treated as upcoming
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 1, 0, 0, 0), TZ);

describe('SIHBRipper', () => {
    const ripper = new SIHBRipper();

    it('parses events from sample HTML', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBeGreaterThan(0);
    });

    it('returns exactly 1 upcoming event from sample data', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBe(1);
    });

    it('parses the Indigenous People Festival event title', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        expect(calEvents[0].summary).toBe('Indigenous People Festival 2026');
    });

    it('parses the correct date for the event', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        const ev = calEvents[0];
        expect(ev.date.year()).toBe(2026);
        expect(ev.date.monthValue()).toBe(6);
        expect(ev.date.dayOfMonth()).toBe(13);
        expect(ev.date.hour()).toBe(10); // 10:00 am
    });

    it('parses the correct duration (10am–7pm = 9 hours)', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        expect(calEvents[0].duration.toMinutes()).toBe(540); // 9 * 60
    });

    it('sets the event URL to the individual event page', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        expect(calEvents[0].url).toContain('sihb.org/events/indigenous-people-festival-2026');
    });

    it('parses the location', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        expect(calEvents[0].location).toBeTruthy();
        expect(calEvents[0].location).toContain('Seattle Center');
    });

    it('sets the per-event featured image as an absolute URL', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        expect(calEvents[0].imageUrl).toBe(
            'https://www.sihb.org/wp-content/uploads/Website-Thumbnail_050626-772x513.png'
        );
    });

    it('generates stable event IDs', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        for (const e of calEvents) {
            expect(e.id).toBeDefined();
            expect(e.id).toMatch(/^sihb-/);
        }
        const ids = calEvents.map((e: any) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('filters out past events', () => {
        const future = ZonedDateTime.of(LocalDateTime.of(2026, 7, 1, 0, 0, 0), TZ);
        const events = ripper.parseEvents(sampleHtml, future, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBe(0);
    });

    it('returns no errors for valid sample data', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const errors = events.filter(e => 'type' in e);
        expect(errors.length).toBe(0);
    });
});
