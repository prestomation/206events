import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import TimeWarpBarRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');

const TZ = ZoneId.of('America/Los_Angeles');

// Sample data is for September 2026; set "now" to just before the month
// starts so all September events are future.
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 9, 1, 0, 0, 0), TZ);

describe('TimeWarpBarRipper', () => {
    const ripper = new TimeWarpBarRipper();

    it('parses events from sample HTML', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBeGreaterThan(10);
    });

    it('sets the correct location on all events', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        for (const e of calEvents) {
            expect(e.location).toContain('1420 10th Ave');
        }
    });

    it('filters out past events', () => {
        // Set now to end of September -- all events should be gone
        const endOfSeptember = ZonedDateTime.of(LocalDateTime.of(2026, 10, 1, 0, 0, 0), TZ);
        const events = ripper.parseEvents(sampleHtml, endOfSeptember, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBe(0);
    });

    it('deduplicates events with the same timestamp and name', () => {
        const doubled = sampleHtml + sampleHtml;
        const single = ripper.parseEvents(sampleHtml, NOW, TZ);
        const deduped = ripper.parseEvents(doubled, NOW, TZ);
        const singleCount = single.filter(e => 'date' in e).length;
        const dedupedCount = deduped.filter(e => 'date' in e).length;
        expect(dedupedCount).toBe(singleCount);
    });

    it('all events fall in September 2026', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ) as any[];
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBeGreaterThan(0);
        for (const e of calEvents) {
            expect(e.date.year()).toBe(2026);
            expect(e.date.monthValue()).toBe(9);
        }
    });

    it('computes duration from the start/end timestamps', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ) as any[];
        const calEvents = events.filter(e => 'date' in e);
        const happyHour = calEvents.find(e => e.summary === 'Happy Hour');
        expect(happyHour).toBeDefined();
        // Happy Hour runs 3:00pm - 7:00pm -- 4 hours
        expect(happyHour.duration.toHours()).toBe(4);
    });

    it('captures the event description when present', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ) as any[];
        const calEvents = events.filter(e => 'date' in e);
        const karaoke = calEvents.find(e => e.summary === 'Karaoke Press Start with KJ Rex');
        expect(karaoke).toBeDefined();
        expect(karaoke.description).toContain('Karaoke night');
    });

    it('finds distinct event titles across the month', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ) as any[];
        const calEvents = events.filter(e => 'date' in e);
        const titles = new Set(calEvents.map(e => e.summary));
        expect(titles.size).toBeGreaterThan(3);
    });
});
