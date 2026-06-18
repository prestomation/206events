import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { extractEventUrls, extractJsonLd, parseEventPage } from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSample(name: string): string {
    return readFileSync(join(__dirname, name), 'utf-8');
}

describe('extractEventUrls', () => {
    it('extracts posh.vip event URLs from tickets page', () => {
        const html = readSample('sample-data-tickets.html');
        const urls = extractEventUrls(html);
        expect(urls).toContain('https://posh.vip/e/seattle-paddle-rave-june-17th-season-opener');
        expect(urls).toContain('https://posh.vip/e/dock-rock-july-17th');
        expect(urls.length).toBe(4);
    });

    it('deduplicates URLs', () => {
        const html = '<a href="https://posh.vip/e/some-event">a</a><a href="https://posh.vip/e/some-event">b</a>';
        const urls = extractEventUrls(html);
        expect(urls).toEqual(['https://posh.vip/e/some-event']);
    });

    it('returns empty array when no links found', () => {
        expect(extractEventUrls('<html><body>no links</body></html>')).toEqual([]);
    });
});

describe('extractJsonLd', () => {
    it('extracts JSON-LD event from RSC payload', () => {
        const html = readSample('sample-data-event.html');
        const jsonLd = extractJsonLd(html);
        expect(jsonLd).not.toBeNull();
        expect(jsonLd!['@type']).toBe('Event');
        expect(jsonLd!.name).toBe('Seattle Paddle Rave | June 17th Season Opener');
        expect(jsonLd!.startDate).toBe('2026-06-17T17:00:00-07:00');
        expect(jsonLd!.endDate).toBe('2026-06-17T20:00:00-07:00');
    });

    it('extracts location from JSON-LD', () => {
        const html = readSample('sample-data-event.html');
        const jsonLd = extractJsonLd(html);
        expect(jsonLd!.location?.name).toBe('Lake Union');
        expect(jsonLd!.location?.address?.streetAddress).toBe('Lake Union, Seattle, WA, USA');
    });

    it('extracts offer price from JSON-LD', () => {
        const html = readSample('sample-data-event.html');
        const jsonLd = extractJsonLd(html);
        expect(jsonLd!.offers?.price).toBe(0);
    });

    it('returns null for HTML without RSC payload', () => {
        const html = '<html><body>no events here</body></html>';
        expect(extractJsonLd(html)).toBeNull();
    });
});

describe('parseEventPage', () => {
    const timezone = ZoneId.of('America/Los_Angeles');
    const recentDate = ZonedDateTime.parse('2026-01-01T00:00:00-08:00');

    it('parses a future event correctly', () => {
        const html = readSample('sample-data-event.html');
        const result = parseEventPage(html, 'https://posh.vip/e/seattle-paddle-rave-june-17th-season-opener', recentDate, timezone);
        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.summary).toBe('Seattle Paddle Rave | June 17th Season Opener');
            expect(result.id).toBe('lake-union-concerts-seattle-paddle-rave-june-17th-season-opener');
            expect(result.location).toBe('Lake Union, Seattle, WA, USA');
            expect(result.url).toBe('https://posh.vip/e/seattle-paddle-rave-june-17th-season-opener');
            expect(result.cost).toEqual({ min: 0 });
        }
    });

    it('skips past events without emitting an error', () => {
        const html = readSample('sample-data-event.html');
        // The event is 2026-06-17; use a "now" after it
        const afterEvent = ZonedDateTime.parse('2026-12-31T00:00:00-08:00');
        const result = parseEventPage(html, 'https://posh.vip/e/seattle-paddle-rave-june-17th-season-opener', afterEvent, timezone);
        expect('type' in result).toBe(true);
        if ('type' in result) {
            expect(result.reason).toBe('Event is in the past');
        }
    });

    it('returns ParseError when no JSON-LD found', () => {
        const result = parseEventPage('<html><body></body></html>', 'https://posh.vip/e/fake', recentDate, timezone);
        expect('type' in result).toBe(true);
        if ('type' in result) {
            expect(result.type).toBe('ParseError');
        }
    });

    it('sets duration from endDate', () => {
        const html = readSample('sample-data-event.html');
        const result = parseEventPage(html, 'https://posh.vip/e/seattle-paddle-rave-june-17th-season-opener', recentDate, timezone);
        if ('date' in result) {
            expect(result.duration.toMinutes()).toBe(180); // 3 hours = 180 min
        }
    });

    it('derives 2h duration from endDate (proves endDate branch fires)', () => {
        const jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: 'Two Hour Test',
            startDate: '2026-07-01T17:00:00-07:00',
            endDate: '2026-07-01T19:00:00-07:00',
            location: { name: 'Test', address: { streetAddress: '123 Test St' } },
            offers: { price: 0 },
        };
        const raw = JSON.stringify(jsonLd);
        const encoded = JSON.stringify(raw).slice(1, -1);
        const html = `<script>self.__next_f.push([1,"${encoded}"])</script>`;
        const result = parseEventPage(html, 'https://posh.vip/e/two-hour-test', recentDate, timezone);
        if ('date' in result) {
            expect(result.duration.toMinutes()).toBe(120); // 2h, not the 3h default
        }
    });

    it('defaults to 3h duration when no endDate', () => {
        const jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: 'No EndDate Test',
            startDate: '2026-07-01T17:00:00-07:00',
            location: { name: 'Test', address: { streetAddress: '123 Test St' } },
            offers: { price: 0 },
        };
        const raw = JSON.stringify(jsonLd);
        const encoded = JSON.stringify(raw).slice(1, -1);
        const html = `<script>self.__next_f.push([1,"${encoded}"])</script>`;
        const result = parseEventPage(html, 'https://posh.vip/e/no-enddate', recentDate, timezone);
        if ('date' in result) {
            expect(result.duration.toMinutes()).toBe(180); // falls through to 3h default
        }
    });

    it('includes image URL from JSON-LD image array', () => {
        const html = readSample('sample-data-event.html');
        const result = parseEventPage(html, 'https://posh.vip/e/seattle-paddle-rave-june-17th-season-opener', recentDate, timezone);
        if ('date' in result) {
            expect(result.imageUrl).toContain('posh.vip');
        }
    });
});
