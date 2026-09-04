import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseHtml } from 'node-html-parser';
import { ZoneId } from '@js-joda/core';
import { extractEventLinks, parseEventDetailPage } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE = ZoneId.of('America/Los_Angeles');

function loadFixture(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

describe('extractEventLinks', () => {
    it('extracts every event card from the listing page', () => {
        const html = parseHtml(loadFixture('sample-events-list.html'));
        const links = extractEventLinks(html);
        expect(links.length).toBe(10);
    });

    it('decodes &#038; entities in hrefs and dedupes by post id', () => {
        const html = parseHtml(loadFixture('sample-events-list.html'));
        const links = extractEventLinks(html);
        expect(links.every(l => !l.url.includes('&#038;'))).toBe(true);
        const ids = links.map(l => l.postId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('returns an empty list when there are no event cards', () => {
        const links = extractEventLinks(parseHtml('<div class="events"></div>'));
        expect(links).toEqual([]);
    });
});

describe('parseEventDetailPage', () => {
    it('parses title, date, first-whistle time, and venue from a bout page', () => {
        const html = parseHtml(loadFixture('sample-event-detail.html'));
        const result = parseEventDetailPage(html, 'https://ratcityrollerderby.com/events/season-21-debut-brawl-october-24-2026/', '10972', ZONE);

        expect('date' in result).toBe(true);
        if (!('date' in result)) throw new Error('expected an event');

        expect(result.summary).toBe('Season 21 Debut Brawl | October 24, 2026');
        expect(result.id).toBe('rat-city-roller-derby-10972');
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(10);
        expect(result.date.dayOfMonth()).toBe(24);
        // First whistle (4:45 PM), not doors open (4:00 PM)
        expect(result.date.hour()).toBe(16);
        expect(result.date.minute()).toBe(45);
        expect(result.location).toBe('Southgate Roller Rink, 9646 17th Ave SW, Seattle, WA 98106');
    });

    it('maps an unrecognized venue name through unchanged', () => {
        const html = parseHtml(`
            <h1 class="entry-title">Some Bout</h1>
            <div class="entry-meta">
                <p class="event-date">01/02/2027</p>
                <p class="event-time"><strong>6:00 PM</strong> doors open<br /><strong>6:30 PM</strong> first whistle</p>
                <p class="event-location h5">Some Other Venue</p>
            </div>
        `);
        const result = parseEventDetailPage(html, 'https://ratcityrollerderby.com/events/some-bout/', '1', ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.location).toBe('Some Other Venue');
    });

    it('falls back to noon when no time is present', () => {
        const html = parseHtml(`
            <h1 class="entry-title">Untimed Event</h1>
            <div class="entry-meta">
                <p class="event-date">03/04/2027</p>
                <p class="event-location h5">Southgate Roller Rink</p>
            </div>
        `);
        const result = parseEventDetailPage(html, 'https://ratcityrollerderby.com/events/untimed/', '2', ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.hour()).toBe(12);
        expect(result.date.minute()).toBe(0);
    });

    it('returns a ParseError when the title is missing', () => {
        const html = parseHtml('<div class="entry-meta"><p class="event-date">01/02/2027</p></div>');
        const result = parseEventDetailPage(html, 'https://ratcityrollerderby.com/events/no-title/', '3', ZONE);
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });

    it('returns a ParseError when the date is unparseable', () => {
        const html = parseHtml('<h1 class="entry-title">Bad Date</h1><p class="event-date">not-a-date</p>');
        const result = parseEventDetailPage(html, 'https://ratcityrollerderby.com/events/bad-date/', '4', ZONE);
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });
});
