import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parseSeasonPage, parseCalendarPage } from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('MeanyCenterRipper', () => {
    let seasonHtml: string;
    let calendarHtml: string;
    const timezone = ZoneId.of('America/Los_Angeles');

    beforeAll(() => {
        seasonHtml = readFileSync(join(__dirname, 'sample-season.html'), 'utf-8');
        calendarHtml = readFileSync(join(__dirname, 'sample-calendar-oct.html'), 'utf-8');
    });

    describe('parseSeasonPage', () => {
        it('extracts season events with title, url, imageUrl, and description', () => {
            const events = parseSeasonPage(seasonHtml);
            expect(events.length).toBeGreaterThan(10);

            const rickyKej = events.find(e => e.slug === 'ricky-kej');
            expect(rickyKej).toBeDefined();
            expect(rickyKej?.title).toBe('Ricky Kej');
            expect(rickyKej?.url).toBe('https://meanycenter.org/tickets/2026-10/production/ricky-kej');
            expect(rickyKej?.imageUrl).toContain('fy27-ricky-kej-hero.jpg');
        });

        it('extracts description text from event listings', () => {
            const events = parseSeasonPage(seasonHtml);
            const withDesc = events.filter(e => e.description);
            expect(withDesc.length).toBeGreaterThan(0);
            expect(withDesc[0].description!.length).toBeLessThanOrEqual(500);
        });

        it('returns unique slugs for all events', () => {
            const events = parseSeasonPage(seasonHtml);
            const slugs = events.map(e => e.slug);
            const unique = new Set(slugs);
            expect(unique.size).toBe(slugs.length);
        });
    });

    describe('parseCalendarPage', () => {
        it('parses October 2026 events from calendar view', () => {
            const seasonEvents = parseSeasonPage(seasonHtml);
            const seasonMap = new Map(seasonEvents.map(e => [e.slug, e]));
            // Set "now" to well before October 2026
            const now = ZonedDateTime.parse('2026-01-01T00:00:00-08:00').withZoneSameInstant(timezone);
            const { events, errors } = parseCalendarPage(calendarHtml, seasonMap, now, timezone);

            expect(errors).toHaveLength(0);
            expect(events.length).toBe(4);
        });

        it('assigns stable ids with date suffix', () => {
            const seasonMap = new Map<string, import('./ripper.js').SeasonEvent>();
            const now = ZonedDateTime.parse('2026-01-01T00:00:00-08:00').withZoneSameInstant(timezone);
            const { events } = parseCalendarPage(calendarHtml, seasonMap, now, timezone);

            for (const event of events) {
                expect(event.id).toMatch(/^meany-center-.+-\d{8}$/);
            }
        });

        it('uses season metadata for title and imageUrl when available', () => {
            const seasonEvents = parseSeasonPage(seasonHtml);
            const seasonMap = new Map(seasonEvents.map(e => [e.slug, e]));
            const now = ZonedDateTime.parse('2026-01-01T00:00:00-08:00').withZoneSameInstant(timezone);
            const { events } = parseCalendarPage(calendarHtml, seasonMap, now, timezone);

            const rickyKej = events.find(e => e.id?.includes('ricky-kej'));
            expect(rickyKej).toBeDefined();
            expect(rickyKej?.summary).toBe('Ricky Kej');
            expect(rickyKej?.imageUrl).toContain('fy27-ricky-kej-hero.jpg');
        });

        it('filters out past events', () => {
            const seasonMap = new Map<string, import('./ripper.js').SeasonEvent>();
            // Set "now" to after all Oct 2026 events
            const now = ZonedDateTime.parse('2026-11-01T00:00:00-08:00').withZoneSameInstant(timezone);
            const { events } = parseCalendarPage(calendarHtml, seasonMap, now, timezone);

            expect(events).toHaveLength(0);
        });

        it('sets paid cost', () => {
            const seasonMap = new Map<string, import('./ripper.js').SeasonEvent>();
            const now = ZonedDateTime.parse('2026-01-01T00:00:00-08:00').withZoneSameInstant(timezone);
            const { events } = parseCalendarPage(calendarHtml, seasonMap, now, timezone);

            for (const event of events) {
                expect(event.cost).toEqual({ paid: true });
            }
        });

        it('sets correct location for all events', () => {
            const seasonMap = new Map<string, import('./ripper.js').SeasonEvent>();
            const now = ZonedDateTime.parse('2026-01-01T00:00:00-08:00').withZoneSameInstant(timezone);
            const { events } = parseCalendarPage(calendarHtml, seasonMap, now, timezone);

            for (const event of events) {
                expect(event.location).toBe('Meany Hall, University of Washington, Seattle, WA 98195');
            }
        });
    });
});
