import { describe, it, expect, vi } from 'vitest';
import BeguiledBooksRipper from './ripper.js';
import { RipperCalendarEvent, RipperError, UncertaintyError } from '../../lib/config/schema.js';
import { LocalDate } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

// The sample listing/event pages are dated August 2026.
const BEFORE_EVENT = LocalDate.of(2026, 1, 1);
const AFTER_EVENT = LocalDate.of(2026, 9, 1);

describe('BeguiledBooksRipper', () => {
    describe('extractEventLinks', () => {
        it('extracts beguiledbooks.com detail links from the listing page', () => {
            const ripper = new BeguiledBooksRipper();
            const html = loadSample('sample-data.html');
            const links = ripper.extractEventLinks(html);

            expect(links).toEqual([
                'https://www.beguiledbooks.com/event-details/author-popup-orin-steele',
                'https://www.beguiledbooks.com/event-details/bookstore-romance-day',
            ]);
        });

        it('skips events that link straight out to Eventbrite', () => {
            const ripper = new BeguiledBooksRipper();
            const html = loadSample('sample-data.html');
            const links = ripper.extractEventLinks(html);

            expect(links.some(l => l.includes('eventbrite.com'))).toBe(false);
        });

        it('dedupes repeated links', () => {
            const ripper = new BeguiledBooksRipper();
            const html = `<ul data-hook="events-cards">
                <li data-hook="events-card"><a data-hook="title" href="https://www.beguiledbooks.com/event-details/dup">Dup</a></li>
                <li data-hook="events-card"><a data-hook="title" href="https://www.beguiledbooks.com/event-details/dup">Dup</a></li>
            </ul>`;
            expect(ripper.extractEventLinks(html)).toEqual(['https://www.beguiledbooks.com/event-details/dup']);
        });

        it('returns an empty array when there are no event cards', () => {
            const ripper = new BeguiledBooksRipper();
            expect(ripper.extractEventLinks('<html><body>No events</body></html>')).toEqual([]);
        });
    });

    describe('parseEventPage', () => {
        it('extracts the event from a sample detail page', () => {
            const ripper = new BeguiledBooksRipper();
            const html = loadSample('sample-event.html');
            const url = 'https://www.beguiledbooks.com/event-details/bookstore-romance-day';
            const events = ripper.parseEventPage(html, url, BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect('date' in events[0]).toBe(true);

            const event = events[0] as RipperCalendarEvent;
            expect(event.summary).toBe('Bookstore Romance Day!');
            expect(event.id).toBe('bookstore-romance-day');
            expect(event.location).toBe('Beguiled Books, 109 1st Ave S, Seattle, WA 98104');
            expect(event.url).toBe(url);
        });

        it('parses start date/time and duration from JSON-LD startDate/endDate', () => {
            const ripper = new BeguiledBooksRipper();
            const html = loadSample('sample-event.html');
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/bookstore-romance-day', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(8);
            expect(event.date.dayOfMonth()).toBe(15);
            expect(event.date.hour()).toBe(10);
            expect(event.date.minute()).toBe(30);
            // 20:00 - 10:30 = 9.5 hours = 570 minutes
            expect(event.duration.toMinutes()).toBe(570);
        });

        it('returns empty array for events before today', () => {
            const ripper = new BeguiledBooksRipper();
            const html = loadSample('sample-event.html');
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/bookstore-romance-day', AFTER_EVENT);

            expect(events).toHaveLength(0);
        });

        it('picks up an event description when present', () => {
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","name":"Author Talk","description":"An evening with the author &amp; friends","startDate":"2026-08-13T18:00:00-07:00","endDate":"2026-08-13T20:00:00-07:00"}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/author-talk', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.description).toBe('An evening with the author & friends');
        });

        it('parses JSON-LD whose description embeds numeric HTML entities as literal newlines', () => {
            // Wix embeds multi-paragraph descriptions with `&#010;` (decimal
            // entity for \n). node-html-parser's `textContent` HTML-decodes
            // this into a raw control character, which breaks JSON.parse
            // (control characters are illegal inside a JSON string). The
            // parser must read the script tag's rawText instead, so the
            // JSON itself parses; decode() still resolves the entity in the
            // extracted description afterward.
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","name":"Entity Newline Event","description":"First paragraph.&#010;&#010;Second paragraph.","startDate":"2026-08-13T18:00:00-07:00","endDate":"2026-08-13T20:00:00-07:00"}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/entity-newline-event', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect('date' in events[0]).toBe(true);
            const event = events[0] as RipperCalendarEvent;
            expect(event.summary).toBe('Entity Newline Event');
            expect(event.description).toBe('First paragraph.\n\nSecond paragraph.');
        });

        it('leaves cost unset (fed to the costGaps queue instead of guessed)', () => {
            const ripper = new BeguiledBooksRipper();
            const html = loadSample('sample-event.html');
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/bookstore-romance-day', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.cost).toBeUndefined();
        });

        it('emits an Uncertainty error when endDate is missing', () => {
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","name":"No End Date Event","startDate":"2026-08-20T18:00:00-07:00"}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/no-end-date-event', BEFORE_EVENT);

            expect(events).toHaveLength(2);
            expect('date' in events[0]).toBe(true);
            const event = events[0] as RipperCalendarEvent;
            // Falls back to a 2-hour default duration when uncertain.
            expect(event.duration.toMinutes()).toBe(120);

            const uncertainty = events[1] as UncertaintyError;
            expect(uncertainty.type).toBe('Uncertainty');
            expect(uncertainty.source).toBe('beguiled_books');
            expect(uncertainty.unknownFields).toEqual(['duration']);
        });

        it('returns a ParseError when no Event JSON-LD is present', () => {
            const ripper = new BeguiledBooksRipper();
            const html = '<html><body><p>Not an event page</p></body></html>';
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/missing', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect('type' in events[0]).toBe(true);
            expect((events[0] as RipperError).type).toBe('ParseError');
        });

        it('returns a ParseError when JSON-LD Event is missing a name', () => {
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","startDate":"2026-08-20T18:00:00-07:00","endDate":"2026-08-20T20:00:00-07:00"}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/no-name', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect((events[0] as RipperError).type).toBe('ParseError');
            expect((events[0] as RipperError).reason).toContain('name');
        });

        it('returns a ParseError when startDate cannot be parsed', () => {
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","name":"Bad Date Event","startDate":"not-a-date","endDate":"2026-08-20T20:00:00-07:00"}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/bad-date', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect((events[0] as RipperError).type).toBe('ParseError');
        });

        it('uses the store address when JSON-LD location matches the venue street', () => {
            const ripper = new BeguiledBooksRipper();
            const html = loadSample('sample-event.html');
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/bookstore-romance-day', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.location).toBe('Beguiled Books, 109 1st Ave S, Seattle, WA 98104');
        });

        it('trusts a JSON-LD address that diverges from the store (off-site event)', () => {
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","name":"Off-site Reading","startDate":"2026-08-20T18:00:00-07:00","endDate":"2026-08-20T20:00:00-07:00","location":{"@type":"Place","name":"Town Hall Seattle","address":"1119 8th Ave, Seattle, WA 98101, USA"}}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/off-site-reading', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.location).toBe('1119 8th Ave, Seattle, WA 98101, USA');
        });

        it('decodes HTML entities in an off-site JSON-LD address', () => {
            // rawText (used for JSON.parse, see the entity-newline test above)
            // leaves the whole payload undecoded, so location.address needs
            // its own decode() just like title/description.
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","name":"Off-site Reading","startDate":"2026-08-20T18:00:00-07:00","endDate":"2026-08-20T20:00:00-07:00","location":{"@type":"Place","name":"Town Hall Seattle","address":"1119 8th Ave &amp; Pine, Seattle, WA 98101, USA"}}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/off-site-entity-address', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.location).toBe('1119 8th Ave & Pine, Seattle, WA 98101, USA');
        });

        it('extracts imageUrl from a schema.org Event image string', () => {
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","name":"Image Event","startDate":"2026-08-20T18:00:00-07:00","endDate":"2026-08-20T20:00:00-07:00","image":"https://static.wixstatic.com/media/example.jpg"}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/image-event', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.imageUrl).toBe('https://static.wixstatic.com/media/example.jpg');
        });

        it('decodes HTML entities in an imageUrl query string', () => {
            // Same rawText rationale as the address test above: image URLs
            // need their own decode() now that the payload isn't pre-decoded.
            const ripper = new BeguiledBooksRipper();
            const html = `<html><head><script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Event","name":"Image Query Event","startDate":"2026-08-20T18:00:00-07:00","endDate":"2026-08-20T20:00:00-07:00","image":"https://static.wixstatic.com/media/example.jpg?w=800&amp;h=600"}
                </script></head></html>`;
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/image-query-event', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.imageUrl).toBe('https://static.wixstatic.com/media/example.jpg?w=800&h=600');
        });

        it('leaves imageUrl undefined when JSON-LD has no image', () => {
            const ripper = new BeguiledBooksRipper();
            const html = loadSample('sample-event.html');
            const events = ripper.parseEventPage(html, 'https://www.beguiledbooks.com/event-details/bookstore-romance-day', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.imageUrl).toBeUndefined();
        });
    });

    describe('fetchAndParseEvent', () => {
        it('returns a ParseError for a non-ok HTTP response', async () => {
            const ripper = new BeguiledBooksRipper() as any;
            ripper.fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

            const events = await ripper.fetchAndParseEvent('https://www.beguiledbooks.com/event-details/missing', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect((events[0] as RipperError).type).toBe('ParseError');
            expect((events[0] as RipperError).reason).toContain('404');
        });

        it('returns a ParseError when the fetch throws', async () => {
            const ripper = new BeguiledBooksRipper() as any;
            ripper.fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

            const events = await ripper.fetchAndParseEvent('https://www.beguiledbooks.com/event-details/network-error', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect((events[0] as RipperError).type).toBe('ParseError');
            expect((events[0] as RipperError).reason).toContain('fetch failed');
        });

        it('parses successfully on a valid response', async () => {
            const ripper = new BeguiledBooksRipper() as any;
            const html = loadSample('sample-event.html');
            ripper.fetchFn = vi.fn().mockResolvedValue({ ok: true, text: async () => html });

            const events = await ripper.fetchAndParseEvent('https://www.beguiledbooks.com/event-details/bookstore-romance-day', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect('date' in events[0]).toBe(true);
            expect((events[0] as RipperCalendarEvent).summary).toBe('Bookstore Romance Day!');
        });
    });
});
