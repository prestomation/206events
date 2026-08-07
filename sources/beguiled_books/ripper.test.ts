import { describe, it, expect } from 'vitest';
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
    });
});
