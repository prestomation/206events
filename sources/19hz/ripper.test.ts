import { describe, expect, test, vi, afterEach } from 'vitest';
import Hz19Ripper, { parseTimeCell, parsePriceCell, extractInstagramPostUrl, fetchInstagramOgImage } from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

const testDate = ZonedDateTime.parse('2026-02-19T00:00:00-08:00[America/Los_Angeles]');

describe('parseTimeCell', () => {
    test('parses simple pm time with no end', () => {
        const result = parseTimeCell('Thu: Feb 19 (8pm)');
        expect(result.hour).toBe(20);
        expect(result.minute).toBe(0);
        expect(result.durationMinutes).toBe(180);
    });

    test('parses range with no minutes', () => {
        const result = parseTimeCell('Thu: Feb 19 (6pm-10pm)');
        expect(result.hour).toBe(18);
        expect(result.minute).toBe(0);
        expect(result.durationMinutes).toBe(240);
    });

    test('parses range with minutes', () => {
        const result = parseTimeCell('Thu: Feb 19 (6:30pm-9:30pm)');
        expect(result.hour).toBe(18);
        expect(result.minute).toBe(30);
        expect(result.durationMinutes).toBe(180);
    });

    test('parses range crossing midnight', () => {
        const result = parseTimeCell('Fri: Feb 20 (10pm-2am)');
        expect(result.hour).toBe(22);
        expect(result.minute).toBe(0);
        expect(result.durationMinutes).toBe(240);
    });

    test('parses am start time', () => {
        const result = parseTimeCell('Sat: Feb 21 (10am-2pm)');
        expect(result.hour).toBe(10);
        expect(result.minute).toBe(0);
        expect(result.durationMinutes).toBe(240);
    });
});

describe('parsePriceCell', () => {
    test('free', () => expect(parsePriceCell('free')).toEqual({ min: 0 }));
    test('free | 21+', () => expect(parsePriceCell('free | 21+')).toEqual({ min: 0 }));
    test('FREE EVENT', () => expect(parsePriceCell('FREE EVENT')).toEqual({ min: 0 }));
    test('$42 | 21+', () => expect(parsePriceCell('$42 | 21+')).toEqual({ min: 42 }));
    test('$26+ | 21+', () => expect(parsePriceCell('$26+ | 21+')).toEqual({ min: 26 }));
    test('$15-25 | 21+', () => expect(parsePriceCell('$15-25 | 21+')).toEqual({ min: 15, max: 25 }));
    test('$10 before 10', () => expect(parsePriceCell('$10 before 10')).toEqual({ min: 10 }));
    test('$10 for members', () => expect(parsePriceCell('$10 for members')).toEqual({ paid: true }));
    test('21+', () => expect(parsePriceCell('21+')).toBeUndefined());
    test('empty string', () => expect(parsePriceCell('')).toBeUndefined());
});

describe('extractInstagramPostUrl', () => {
    test('extracts instagram post from links column', () => {
        const cell = parse(`<td><a href='https://www.instagram.com/p/ABC123/'>Instagram Page</a></td>`).querySelector('td')!;
        expect(extractInstagramPostUrl(cell, undefined)).toBe('https://www.instagram.com/p/ABC123/');
    });

    test('extracts instagram reel from links column', () => {
        const cell = parse(`<td><a href='https://www.instagram.com/reel/XYZ789/'>Instagram Reel</a></td>`).querySelector('td')!;
        expect(extractInstagramPostUrl(cell, undefined)).toBe('https://www.instagram.com/reel/XYZ789/');
    });

    test('ignores instagram profile links', () => {
        const cell = parse(`<td><a href='https://www.instagram.com/someuser/'>Instagram</a></td>`).querySelector('td')!;
        expect(extractInstagramPostUrl(cell, undefined)).toBeNull();
    });

    test('falls back to event URL when it is an instagram post', () => {
        expect(extractInstagramPostUrl(null, 'https://www.instagram.com/p/ABC123/')).toBe('https://www.instagram.com/p/ABC123/');
    });

    test('returns null when no instagram links', () => {
        const cell = parse(`<td><a href='https://facebook.com/events/123/'>Facebook Page</a></td>`).querySelector('td')!;
        expect(extractInstagramPostUrl(cell, 'https://eventbrite.com/e/123')).toBeNull();
    });

    test('prefers links-column instagram over event URL', () => {
        const cell = parse(`<td><a href='https://www.instagram.com/p/FROM_LINKS/'>Instagram Page</a></td>`).querySelector('td')!;
        const result = extractInstagramPostUrl(cell, 'https://www.instagram.com/p/FROM_EVENT_URL/');
        expect(result).toBe('https://www.instagram.com/p/FROM_LINKS/');
    });

    test('returns null when cell is null and event URL is not instagram', () => {
        expect(extractInstagramPostUrl(null, 'https://eventbrite.com/e/123')).toBeNull();
    });

    test('returns null when cell is null and event URL is undefined', () => {
        expect(extractInstagramPostUrl(null, undefined)).toBeNull();
    });
});

describe('fetchInstagramOgImage', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('extracts og:image from embed HTML (property first)', async () => {
        const embedHtml = `<html><head><meta property="og:image" content="https://cdninstagram.com/image.jpg"/></head></html>`;
        const mockFetch = vi.fn().mockResolvedValue(new Response(embedHtml, { status: 200 }));
        const imageUrl = await fetchInstagramOgImage(mockFetch, 'https://www.instagram.com/p/ABC123/');
        expect(imageUrl).toBe('https://cdninstagram.com/image.jpg');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://www.instagram.com/p/ABC123/embed/',
            expect.objectContaining({ headers: expect.any(Object) }),
        );
    });

    test('extracts og:image with content attribute first', async () => {
        const embedHtml = `<html><head><meta content="https://cdninstagram.com/other.jpg" property="og:image"/></head></html>`;
        const mockFetch = vi.fn().mockResolvedValue(new Response(embedHtml, { status: 200 }));
        const imageUrl = await fetchInstagramOgImage(mockFetch, 'https://www.instagram.com/p/ABC123/');
        expect(imageUrl).toBe('https://cdninstagram.com/other.jpg');
    });

    test('decodes HTML entities in image URL', async () => {
        const embedHtml = `<html><head><meta property="og:image" content="https://cdninstagram.com/img.jpg?a=1&amp;b=2"/></head></html>`;
        const mockFetch = vi.fn().mockResolvedValue(new Response(embedHtml, { status: 200 }));
        const imageUrl = await fetchInstagramOgImage(mockFetch, 'https://www.instagram.com/p/ABC123/');
        expect(imageUrl).toBe('https://cdninstagram.com/img.jpg?a=1&b=2');
    });

    test('strips trailing slash before appending /embed/', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
        await fetchInstagramOgImage(mockFetch, 'https://www.instagram.com/p/ABC123/');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://www.instagram.com/p/ABC123/embed/',
            expect.any(Object),
        );
    });

    test('returns null on HTTP error', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
        expect(await fetchInstagramOgImage(mockFetch, 'https://www.instagram.com/p/ABC123/')).toBeNull();
    });

    test('returns null when no og:image in HTML', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response('<html><head><title>Login</title></head></html>', { status: 200 }));
        expect(await fetchInstagramOgImage(mockFetch, 'https://www.instagram.com/p/ABC123/')).toBeNull();
    });

    test('returns null on network error', async () => {
        const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
        expect(await fetchInstagramOgImage(mockFetch, 'https://www.instagram.com/p/ABC123/')).toBeNull();
    });
});

describe('19hz Ripper', () => {
    test('parses events from sample HTML', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(validEvents.length).toBe(8);
    });

    test('parses event title and URL', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const sempa = validEvents.find(e => e.summary.includes('SEMPA'));
        expect(sempa).toBeDefined();
        expect(sempa!.summary).toBe('SEMPA: Clayton the Chemist');
        expect(sempa!.url).toContain('facebook.com');
    });

    test('parses date correctly', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const sempa = validEvents.find(e => e.summary.includes('SEMPA'));
        expect(sempa!.date.year()).toBe(2026);
        expect(sempa!.date.monthValue()).toBe(2);
        expect(sempa!.date.dayOfMonth()).toBe(19);
    });

    test('parses time range without minutes correctly', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Otoconia: (6pm-10pm)
        const otoconia = validEvents.find(e => e.summary.includes('Otoconia'));
        expect(otoconia).toBeDefined();
        expect(otoconia!.date.hour()).toBe(18);
        expect(otoconia!.date.minute()).toBe(0);
        expect(otoconia!.duration.toMinutes()).toBe(240);
    });

    test('parses time range with minutes correctly', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // SEMPA: (6:30pm-9:30pm) = 3 hours
        const sempa = validEvents.find(e => e.summary.includes('SEMPA'));
        expect(sempa!.date.hour()).toBe(18);
        expect(sempa!.date.minute()).toBe(30);
        expect(sempa!.duration.toMinutes()).toBe(180);
    });

    test('parses event with no end time using default 3h duration', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // Magic City Hippies: (8pm) — no end time, default 3h
        const magicCity = validEvents.find(e => e.summary.includes('Magic City Hippies'));
        expect(magicCity).toBeDefined();
        expect(magicCity!.date.hour()).toBe(20);
        expect(magicCity!.duration.toMinutes()).toBe(180);
    });

    test('extracts venue from event cell', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const heatwav = validEvents.find(e => e.summary === 'HEAT.WAV');
        expect(heatwav).toBeDefined();
        expect(heatwav!.location).toBe('Substation');
    });

    test('returns events across multiple dates', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        const feb19 = validEvents.filter(e => e.date.dayOfMonth() === 19);
        const feb20 = validEvents.filter(e => e.date.dayOfMonth() === 20);
        const feb21 = validEvents.filter(e => e.date.dayOfMonth() === 21);
        const feb22 = validEvents.filter(e => e.date.dayOfMonth() === 22);

        expect(feb19.length).toBe(4);
        expect(feb20.length).toBe(2);
        expect(feb21.length).toBe(1);
        expect(feb22.length).toBe(1);
    });

    test('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const firstCall = await ripper.parseEvents(html, testDate, {});
        const secondCall = await ripper.parseEvents(html, testDate, {});

        const firstEvents = firstCall.filter(e => 'summary' in e);
        const secondEvents = secondCall.filter(e => 'summary' in e);

        expect(firstEvents.length).toBe(8);
        expect(secondEvents.length).toBe(0);
    });

    test('all events have required fields', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        for (const event of validEvents) {
            expect(event.ripped).toBeInstanceOf(Date);
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.summary).toBeTruthy();
            expect(event.id).toMatch(/^19hz-\d{4}\/\d{2}\/\d{2}-.+/);
        }
    });

    test('emits cost when price is present in sample data', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // "free" cell → cost: { min: 0 }
        const otoconia = validEvents.find(e => e.summary.includes('Otoconia'));
        expect(otoconia!.cost).toEqual({ min: 0 });

        // "$26+ | 21+" → cost: { min: 26 }
        const heatwav = validEvents.find(e => e.summary === 'HEAT.WAV');
        expect(heatwav!.cost).toEqual({ min: 26 });

        // "$42 | 21+" → cost: { min: 42 }
        const moontricks = validEvents.find(e => e.summary.includes('Moontricks'));
        expect(moontricks!.cost).toEqual({ min: 42 });

        // "21+" (no price) → no cost field
        const magicCity = validEvents.find(e => e.summary.includes('Magic City Hippies'));
        expect(magicCity!.cost).toBeUndefined();
    });

    test('event with Instagram event URL has no imageUrl before rip()', async () => {
        const ripper = new Hz19Ripper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const validEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        // The "IG Only Event" uses an Instagram URL as its main event link.
        // parseEvents itself doesn't fetch images; imageUrl is set in rip().
        const igEvent = validEvents.find(e => e.summary === 'IG Only Event');
        expect(igEvent).toBeDefined();
        expect(igEvent!.imageUrl).toBeUndefined();
        expect(igEvent!.url).toContain('instagram.com/p/');
    });

    test('handles empty HTML gracefully', async () => {
        const ripper = new Hz19Ripper();
        const html = parse('<html><body><table></table></body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });

    test('skips rows without machine-readable date', async () => {
        const ripper = new Hz19Ripper();
        const html = parse(`<html><body><table>
            <tr><th>Date</th><th>Event</th><th>Genre</th><th>Price</th><th>Promoter</th><th>Links</th><th>Sort</th></tr>
        </table></body></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events.length).toBe(0);
    });
});
