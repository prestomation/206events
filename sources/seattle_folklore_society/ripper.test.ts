import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseDateTimeStr } from './ripper.js';
import { parse } from 'node-html-parser';
import { ZoneId, ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');

describe('parseDateTimeStr', () => {
    it('parses a standard evening event', () => {
        const result = parseDateTimeStr('Jul 29, 2026 (Wed), 7:30 pm - 10:00 pm');
        expect(result).not.toBeNull();
        expect(result!.start.monthValue()).toBe(7);
        expect(result!.start.dayOfMonth()).toBe(29);
        expect(result!.start.year()).toBe(2026);
        expect(result!.start.hour()).toBe(19);
        expect(result!.start.minute()).toBe(30);
        expect(result!.duration.toMinutes()).toBe(150);
    });

    it('parses a Saturday evening event', () => {
        const result = parseDateTimeStr('Sep 19, 2026 (Sat), 7:30 pm - 10:00 pm');
        expect(result).not.toBeNull();
        expect(result!.start.monthValue()).toBe(9);
        expect(result!.start.dayOfMonth()).toBe(19);
        expect(result!.duration.toMinutes()).toBe(150);
    });

    it('parses a November event', () => {
        const result = parseDateTimeStr('Nov 07, 2026 (Sat), 7:30 pm - 10:00 pm');
        expect(result).not.toBeNull();
        expect(result!.start.monthValue()).toBe(11);
        expect(result!.start.dayOfMonth()).toBe(7);
    });

    it('returns null for unrecognized format', () => {
        expect(parseDateTimeStr('TBD')).toBeNull();
        expect(parseDateTimeStr('')).toBeNull();
    });
});

describe('sample HTML parsing', () => {
    it('finds the events list container', () => {
        const root = parse(sampleHtml);
        const list = root.querySelector('.em-events-list');
        expect(list).not.toBeNull();
    });

    it('extracts event titles from sample data', () => {
        const root = parse(sampleHtml);
        const eventsList = root.querySelector('.em-events-list')!;
        const blocks = eventsList.querySelectorAll('div > div');
        const titles: string[] = [];
        for (const block of blocks) {
            const a = block.querySelector('span[style*="font-weight: bold"] a, span[style*="font-weight:bold"] a');
            if (a) titles.push(a.text.trim());
        }
        expect(titles.length).toBeGreaterThanOrEqual(4);
        expect(titles.some(t => t.includes('Iona Fyfe'))).toBe(true);
        expect(titles.some(t => t.includes('Scottish Fish'))).toBe(true);
        expect(titles.some(t => t.includes('Katie McNally'))).toBe(true);
    });

    it('extracts date strings from sample data', () => {
        const root = parse(sampleHtml);
        const eventsList = root.querySelector('.em-events-list')!;
        const blocks = eventsList.querySelectorAll('div > div');
        const dates: string[] = [];
        for (const block of blocks) {
            const span = block.querySelector('span[style*="font-style: italic"], span[style*="font-style:italic"]');
            if (span) dates.push(span.text.trim());
        }
        expect(dates.length).toBeGreaterThanOrEqual(4);
        expect(dates[0]).toMatch(/Jul 29, 2026/);
    });

    it('extracts venue when present', () => {
        const root = parse(sampleHtml);
        const eventsList = root.querySelector('.em-events-list')!;
        const blocks = eventsList.querySelectorAll('div > div');
        const venues: string[] = [];
        for (const block of blocks) {
            for (const span of block.querySelectorAll('span')) {
                if (span.text.trim().startsWith('Venue:')) {
                    venues.push(span.text.trim().replace(/^Venue:\s*/, ''));
                    break;
                }
            }
        }
        // Hayden Stern and Katie McNally events have explicit venue
        expect(venues.some(v => v.includes('Phinney Center Concert Hall'))).toBe(true);
    });
});
