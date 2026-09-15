import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import NineHatsWinesRipper, { parseCardDatetime, firstSrcsetUrl } from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDate = ZonedDateTime.parse('2026-09-15T00:00:00-07:00[America/Los_Angeles]');

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

function cardHtml({
    title = 'Test Event',
    datetime = '2026-09-16 06:00:00pm',
    href = 'https://ninehatswines.com/events/test-event',
    description = 'Some description text.',
    srcset = 'https://example.com/img.jpg 1x, https://example.com/img@2x.jpg 2x',
}: Partial<{ title: string; datetime: string; href: string; description: string; srcset: string }> = {}) {
    return parse(`<html><body><ul>
        <li data-loop="false">
            <div><img data-srcset="${srcset}" /></div>
            <time datetime="${datetime}">short</time>
            <h3>${title}</h3>
            <time class="mb-2 c-body3 text-slate" datetime="${datetime}">long</time>
            <div class="mb-3 c-caption clamp-3">${description}</div>
            <a class="nh-text-button expanded-card-click" href="${href}">More Information</a>
        </li>
    </ul></body></html>`);
}

describe('parseCardDatetime', () => {
    it('parses a pm datetime string', () => {
        const result = parseCardDatetime('2026-09-16 06:00:00pm');
        expect(result?.hour()).toBe(18);
        expect(result?.toLocalDate().toString()).toBe('2026-09-16');
    });

    it('parses an am datetime string', () => {
        const result = parseCardDatetime('2026-09-27 11:00:00am');
        expect(result?.hour()).toBe(11);
    });

    it('handles 12am/12pm edge cases', () => {
        expect(parseCardDatetime('2026-09-16 12:00:00am')?.hour()).toBe(0);
        expect(parseCardDatetime('2026-09-16 12:00:00pm')?.hour()).toBe(12);
    });

    it('returns undefined for missing or malformed input', () => {
        expect(parseCardDatetime(undefined)).toBeUndefined();
        expect(parseCardDatetime('not-a-date')).toBeUndefined();
        expect(parseCardDatetime('')).toBeUndefined();
    });
});

describe('firstSrcsetUrl', () => {
    it('takes the first candidate from a comma-separated srcset', () => {
        expect(firstSrcsetUrl('https://a.com/x.jpg 1x, https://a.com/x@2x.jpg 2x')).toBe('https://a.com/x.jpg');
    });

    it('returns undefined for missing input', () => {
        expect(firstSrcsetUrl(undefined)).toBeUndefined();
    });
});

describe('NineHatsWinesRipper', () => {
    it('parses real upcoming events from sample data', async () => {
        const ripper = new NineHatsWinesRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(0);
        expect(calEvents.length).toBeGreaterThan(0);
        for (const event of calEvents) {
            expect(event.location).toBe('Nine Hats Wines, 3861 1st Ave S, Seattle, WA 98134');
            expect(event.date.year()).toBeGreaterThanOrEqual(2026);
        }
        expect(calEvents.some(e => e.summary === 'Trivia Night: Back to School')).toBe(true);
    });

    it('builds a stable id from the event slug and date', async () => {
        const ripper = new NineHatsWinesRipper();
        const html = cardHtml({ title: 'Karaoke Night', href: 'https://ninehatswines.com/events/karaoke-night', datetime: '2026-10-01 07:00:00pm' });

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].id).toBe('nine-hats-wines-karaoke-night-2026-10-01');
        expect(calEvents[0].url).toBe('https://ninehatswines.com/events/karaoke-night');
    });

    it('emits a ParseError for a card with no title', async () => {
        const ripper = new NineHatsWinesRipper();
        const html = parse(`<html><body><ul><li data-loop="false">
            <time datetime="2026-09-16 06:00:00pm"></time>
            <div class="mb-3 c-caption clamp-3">desc</div>
        </li></ul></body></html>`);

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('emits a ParseError for a card with an unparseable datetime', async () => {
        const ripper = new NineHatsWinesRipper();
        const html = cardHtml({ datetime: 'not-a-date' });

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(0);
        expect(errors).toHaveLength(1);
    });

    it('deduplicates the same event across multiple parseEvents calls', async () => {
        const ripper = new NineHatsWinesRipper();
        const html = cardHtml();

        const events1 = await ripper.parseEvents(html, testDate, {});
        const events2 = await ripper.parseEvents(html, testDate, {});

        expect(events1.filter(e => 'summary' in e)).toHaveLength(1);
        expect(events2.filter(e => 'summary' in e)).toHaveLength(0);
    });

    it('returns no cards when none are present', async () => {
        const ripper = new NineHatsWinesRipper();
        const html = parse('<html><body>no events here</body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        expect(events).toHaveLength(0);
    });
});
