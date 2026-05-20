import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime, Duration } from '@js-joda/core';
import '@js-joda/timezone';
import FlyingLionBrewingRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');

const TZ = ZoneId.of('America/Los_Angeles');
// Set "now" to just before May 2026 so all sample events are in the future
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 1, 0, 0, 0), TZ);

describe('FlyingLionBrewingRipper', () => {
    const ripper = new FlyingLionBrewingRipper();

    it('parses events from sample HTML', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBeGreaterThan(0);
    });

    it('parses exactly 3 events from sample data', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBe(3);
    });

    it('sets the correct location on all events', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        for (const e of calEvents) {
            expect(e.location).toContain('5041 Rainier Ave S');
        }
    });

    it('parses event titles correctly', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        const titles = calEvents.map((e: any) => e.summary);
        expect(titles).toContain('Monday Run Club');
        expect(titles).toContain('Wednesday Trivia');
        expect(titles).toContain('Sunday Chess Club');
    });

    it('parses dates correctly', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        const monday = calEvents.find((e: any) => e.summary === 'Monday Run Club');
        expect(monday).toBeDefined();
        expect(monday!.date.year()).toBe(2026);
        expect(monday!.date.monthValue()).toBe(5);
        expect(monday!.date.dayOfMonth()).toBe(18);
        expect(monday!.date.hour()).toBe(18); // 6 PM
    });

    it('parses trivia event with correct duration', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        const trivia = calEvents.find((e: any) => e.summary === 'Wednesday Trivia');
        expect(trivia).toBeDefined();
        // 7:30 PM - 9:00 PM = 90 minutes
        expect(trivia!.duration.toMinutes()).toBe(90);
    });

    it('parses chess club with correct duration', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        const chess = calEvents.find((e: any) => e.summary === 'Sunday Chess Club');
        expect(chess).toBeDefined();
        // 6:00 PM - 9:00 PM = 180 minutes = 3 hours
        expect(chess!.duration.toMinutes()).toBe(180);
    });

    it('filters out past events', () => {
        const future = ZonedDateTime.of(LocalDateTime.of(2026, 6, 1, 0, 0, 0), TZ);
        const events = ripper.parseEvents(sampleHtml, future, TZ);
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBe(0);
    });

    it('generates stable event IDs', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        for (const e of calEvents) {
            expect(e.id).toBeDefined();
            expect(e.id).toMatch(/^flying-lion-/);
        }
        // IDs should be unique
        const ids = calEvents.map((e: any) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('sets event URL to the events page', () => {
        const events = ripper.parseEvents(sampleHtml, NOW, TZ);
        const calEvents = events.filter(e => 'date' in e) as any[];
        for (const e of calEvents) {
            expect(e.url).toBe('https://flyinglionbrewing.com/events.html');
        }
    });
});
