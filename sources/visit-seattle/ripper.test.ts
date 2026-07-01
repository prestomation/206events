import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseRSSItems, parseEventPage } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleFeed(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-feed.xml'), 'utf8');
}

function loadSampleEventPage(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-event-page.html'), 'utf8');
}

describe('parseRSSItems', () => {
    it('extracts items from feed', () => {
        const items = parseRSSItems(loadSampleFeed());
        expect(items).toHaveLength(3);
    });

    it('extracts title and link', () => {
        const items = parseRSSItems(loadSampleFeed());
        expect(items[0].title).toBe('Bite of Seattle');
        expect(items[0].link).toBe('https://visitseattle.org/events/bite-of-seattle/');
    });

    it('decodes HTML entities in titles', () => {
        const items = parseRSSItems(loadSampleFeed());
        const festal = items.find(i => i.title.includes('Festál'));
        expect(festal).toBeDefined();
        expect(festal!.title).toBe('Festál : A Day in Punjab');
        expect(festal!.title).not.toContain('&#');
    });

    it('returns empty array for empty XML', () => {
        expect(parseRSSItems('')).toEqual([]);
    });

    it('skips items missing title or link', () => {
        const xml = `<rss><channel>
            <item><title>No Link Event</title></item>
            <item><link>https://example.com/</link></item>
        </channel></rss>`;
        expect(parseRSSItems(xml)).toEqual([]);
    });
});

describe('parseEventPage', () => {
    it('parses multi-day event date and location (word-based same-month range)', () => {
        const result = parseEventPage(loadSampleEventPage());
        expect('type' in result).toBe(false);
        if ('type' in result) return;
        expect(result.startDate.year()).toBe(2026);
        expect(result.startDate.monthValue()).toBe(7);
        expect(result.startDate.dayOfMonth()).toBe(24);
        expect(result.endDate.year()).toBe(2026);
        expect(result.endDate.monthValue()).toBe(7);
        expect(result.endDate.dayOfMonth()).toBe(26);
        expect(result.location).toBe('Seattle Center');
    });

    it('parses cross-month range (word-based)', () => {
        const html = `<html><body>
            <h4><span>October 31-November 1, 2026</span> | <span> Seattle Center</span></h4>
        </body></html>`;
        const result = parseEventPage(html);
        expect('type' in result).toBe(false);
        if ('type' in result) return;
        expect(result.startDate.monthValue()).toBe(10);
        expect(result.startDate.dayOfMonth()).toBe(31);
        expect(result.endDate.monthValue()).toBe(11);
        expect(result.endDate.dayOfMonth()).toBe(1);
        expect(result.location).toBe('Seattle Center');
    });

    it('parses single-day event (word-based)', () => {
        const html = `<html><body>
            <h4><span>August 1, 2026</span> | <span> Seattle Center Armory</span></h4>
        </body></html>`;
        const result = parseEventPage(html);
        expect('type' in result).toBe(false);
        if ('type' in result) return;
        expect(result.startDate.monthValue()).toBe(8);
        expect(result.startDate.dayOfMonth()).toBe(1);
        expect(result.endDate.equals(result.startDate)).toBe(true);
        expect(result.location).toBe('Seattle Center Armory');
    });

    it('parses single-day event (legacy numeric)', () => {
        const html = `<html><body>
            <h4><span>8/1/2026</span> | <span> Seattle Center Armory</span></h4>
        </body></html>`;
        const result = parseEventPage(html);
        expect('type' in result).toBe(false);
        if ('type' in result) return;
        expect(result.startDate.monthValue()).toBe(8);
        expect(result.startDate.dayOfMonth()).toBe(1);
        expect(result.endDate.equals(result.startDate)).toBe(true);
    });

    it('returns ParseError when no h4 date found', () => {
        const result = parseEventPage('<html><body><p>No dates here</p></body></html>');
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    it('decodes HTML entities in location', () => {
        const html = `<html><body>
            <h4><span>September 13, 2026</span> | <span> Seattle Center &amp; Armory</span></h4>
        </body></html>`;
        const result = parseEventPage(html);
        expect('type' in result).toBe(false);
        if ('type' in result) return;
        expect(result.location).toBe('Seattle Center & Armory');
    });
});
