import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parseAddeventatcDate, parseEventsFromHtml } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

// Fixed "now": May 1, 2026 noon Pacific — before both sample events
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 1, 12, 0), PACIFIC);

describe('parseAddeventatcDate', () => {
    it('parses AM time correctly', () => {
        const result = parseAddeventatcDate('05/30/2026 11:00 am');
        expect(result).not.toBeNull();
        expect(result!.year()).toBe(2026);
        expect(result!.monthValue()).toBe(5);
        expect(result!.dayOfMonth()).toBe(30);
        expect(result!.hour()).toBe(11);
        expect(result!.minute()).toBe(0);
    });

    it('parses PM time correctly', () => {
        const result = parseAddeventatcDate('05/30/2026 5:00 pm');
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(17);
    });

    it('handles 12:00 pm as noon', () => {
        const result = parseAddeventatcDate('10/10/2026 12:00 pm');
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(12);
    });

    it('handles 12:00 am as midnight', () => {
        const result = parseAddeventatcDate('11/20/2026 12:00 am');
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(0);
    });

    it('parses evening PM time', () => {
        const result = parseAddeventatcDate('11/20/2026 5:00 pm');
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(17);
    });

    it('returns null for malformed input', () => {
        expect(parseAddeventatcDate('')).toBeNull();
        expect(parseAddeventatcDate('not a date')).toBeNull();
        expect(parseAddeventatcDate('05/30')).toBeNull();
    });
});

describe('parseEventsFromHtml', () => {
    it('extracts two events from the Seattle Spring sample page', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html, 'https://www.renegadecraft.com/event/seattle-spring/');

        const events = results.filter(r => 'date' in r);
        const errors = results.filter(r => 'type' in r);

        expect(errors).toHaveLength(0);
        expect(events).toHaveLength(2);
    });

    it('parses May 30 event correctly', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html, 'https://www.renegadecraft.com/event/seattle-spring/');
        const events = results.filter(r => 'date' in r) as any[];

        const may30 = events.find(e => e.date.dayOfMonth() === 30);
        expect(may30).toBeDefined();
        expect(may30.summary).toBe('Renegade Craft Fair Seattle');
        expect(may30.date.monthValue()).toBe(5);
        expect(may30.date.hour()).toBe(11);
        expect(may30.duration.toMinutes()).toBe(360); // 11am-5pm = 6 hours
        expect(may30.location).toContain('Hangar 30');
        expect(may30.location).toContain('Seattle');
        expect(may30.id).toBe('renegade-craft-fair-seattle-2026-05-30');
        expect(may30.url).toBe('https://www.renegadecraft.com/event/seattle-spring/');
    });

    it('parses May 31 event correctly', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html, 'https://www.renegadecraft.com/event/seattle-spring/');
        const events = results.filter(r => 'date' in r) as any[];

        const may31 = events.find(e => e.date.dayOfMonth() === 31);
        expect(may31).toBeDefined();
        expect(may31.date.monthValue()).toBe(5);
        expect(may31.id).toBe('renegade-craft-fair-seattle-2026-05-31');
    });

    it('produces stable IDs based on date', () => {
        const html = loadSampleHtml();
        const results1 = parseEventsFromHtml(html, 'https://www.renegadecraft.com/event/seattle-spring/');
        const results2 = parseEventsFromHtml(html, 'https://www.renegadecraft.com/event/seattle-spring/');

        const ids1 = results1.filter(r => 'date' in r).map((r: any) => r.id);
        const ids2 = results2.filter(r => 'date' in r).map((r: any) => r.id);

        expect(ids1).toEqual(ids2);
    });

    it('returns empty array for HTML with no addeventatc blocks', () => {
        const html = '<html><body><p>No events here</p></body></html>';
        const results = parseEventsFromHtml(html, 'https://example.com/event/empty/');
        expect(results).toHaveLength(0);
    });

    it('extracts thumbnail image from JSON-LD', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html, 'https://www.renegadecraft.com/event/seattle-spring/');
        const events = results.filter(r => 'date' in r) as any[];
        expect(events[0].imageUrl).toBeDefined();
        expect(events[0].imageUrl).toContain('https://');
    });
});
