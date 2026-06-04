import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import SkylarkCafeRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('SkylarkCafeRipper', () => {
    const ripper = new SkylarkCafeRipper();
    const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');
    const html = parse(sampleHtml);

    describe('parseCalendar', () => {
        it('parses all events from sample HTML', () => {
            const events = ripper.parseCalendar(html);
            expect(events).toHaveLength(3);
        });

        it('returns only RipperCalendarEvents (no ParseErrors)', () => {
            const events = ripper.parseCalendar(html);
            for (const e of events) {
                expect('date' in e).toBe(true);
            }
        });
    });

    describe('parseItem', () => {
        it('parses event without ticket link (w-condition-invisible)', () => {
            const items = html.querySelectorAll('.collection-item-3.w-dyn-item');
            const result = ripper.parseItem(items[0]);

            expect('date' in result).toBe(true);
            if (!('date' in result)) return;

            expect(result.summary).toBe('The Shvkes, Pink Moss, Boydream');
            expect(result.date.year()).toBe(2026);
            expect(result.date.monthValue()).toBe(5);
            expect(result.date.dayOfMonth()).toBe(28);
            expect(result.date.hour()).toBe(20); // 8 PM
            expect(result.date.minute()).toBe(0);
            expect(result.url).toBe('https://www.skylarkcafe.com/global-events/the-shvkes-pink-moss-boydream');
            expect(result.id).toBe('skylark-the-shvkes-pink-moss-boydream');
            expect(result.location).toBe('Skylark Café & Club, 3803 Delridge Way SW, Seattle, WA 98106');
            expect(result.imageUrl).toBe('https://cdn.prod.website-files.com/img1.jpeg');
        });

        it('extracts the per-event artist background-image as imageUrl', () => {
            const items = html.querySelectorAll('.collection-item-3.w-dyn-item');
            const result = ripper.parseItem(items[2]);
            expect('date' in result).toBe(true);
            if (!('date' in result)) return;
            expect(result.imageUrl).toBe('https://cdn.prod.website-files.com/img3.jpeg');
        });

        it('leaves imageUrl undefined when background-image is none', () => {
            const badHtml = parse('<div class="collection-item-3 w-dyn-item"><div class="text-block-12">No Image</div><div class="date">June 1, 2026 8:00 PM</div><div class="artist-image" style="background-image:none"></div><a href="/global-events/no-image" class="link-block-4"></a></div>');
            const item = badHtml.querySelector('.collection-item-3.w-dyn-item')!;
            const result = ripper.parseItem(item);
            expect('date' in result).toBe(true);
            if (!('date' in result)) return;
            expect(result.imageUrl).toBeUndefined();
        });

        it('parses event with external ticket link', () => {
            const items = html.querySelectorAll('.collection-item-3.w-dyn-item');
            const result = ripper.parseItem(items[1]);

            expect('date' in result).toBe(true);
            if (!('date' in result)) return;

            expect(result.summary).toBe('Festival of Friends Presents: Bandmixers Discography');
            expect(result.date.monthValue()).toBe(5);
            expect(result.date.dayOfMonth()).toBe(29);
            expect(result.date.hour()).toBe(19); // 7 PM
            expect(result.url).toBe('https://www.festivaloffriendsevents.com/may-29-2026-seattle-bandmixers-discography-encore-night.html');
        });

        it('parses event with Eventbrite ticket link', () => {
            const items = html.querySelectorAll('.collection-item-3.w-dyn-item');
            const result = ripper.parseItem(items[2]);

            expect('date' in result).toBe(true);
            if (!('date' in result)) return;

            expect(result.summary).toBe("Hey Baby! West Seattle's Newest Drag show for New Performers!");
            expect(result.url).toContain('eventbrite.com');
        });

        it('returns ParseError for item missing title', () => {
            const badHtml = parse('<div class="collection-item-3 w-dyn-item"><div class="date">June 1, 2026 8:00 PM</div></div>');
            const item = badHtml.querySelector('.collection-item-3.w-dyn-item')!;
            const result = ripper.parseItem(item);
            expect('type' in result).toBe(true);
            if (!('type' in result)) return;
            expect(result.type).toBe('ParseError');
        });

        it('returns ParseError for item with unparseable date', () => {
            const badHtml = parse('<div class="collection-item-3 w-dyn-item"><div class="text-block-12">Test Event</div><div class="date">not-a-date</div><a href="/global-events/test" class="link-block-4"></a></div>');
            const item = badHtml.querySelector('.collection-item-3.w-dyn-item')!;
            const result = ripper.parseItem(item);
            expect('type' in result).toBe(true);
            if (!('type' in result)) return;
            expect(result.type).toBe('ParseError');
        });
    });

    describe('parseDateString', () => {
        it('parses PM time correctly', () => {
            const result = ripper.parseDateString('May 28, 2026 8:00 PM');
            expect(result).not.toBeNull();
            expect(result!.hour()).toBe(20);
            expect(result!.minute()).toBe(0);
        });

        it('parses 12 PM as noon', () => {
            const result = ripper.parseDateString('June 1, 2026 12:00 PM');
            expect(result).not.toBeNull();
            expect(result!.hour()).toBe(12);
        });

        it('parses 12 AM as midnight', () => {
            const result = ripper.parseDateString('June 1, 2026 12:00 AM');
            expect(result).not.toBeNull();
            expect(result!.hour()).toBe(0);
        });

        it('returns null for invalid format', () => {
            const result = ripper.parseDateString('invalid date string');
            expect(result).toBeNull();
        });

        it('uses America/Los_Angeles timezone', () => {
            const result = ripper.parseDateString('July 4, 2026 7:00 PM');
            expect(result).not.toBeNull();
            expect(result!.zone().id()).toBe('America/Los_Angeles');
        });
    });
});
