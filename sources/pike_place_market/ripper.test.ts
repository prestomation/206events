import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PikePlaceMarketRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { LocalDate } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

// The sample page's next occurrence is Jul 10 2026.
const BEFORE_EVENT = LocalDate.of(2026, 1, 1);
const AFTER_EVENT = LocalDate.of(2026, 8, 1);
const SAMPLE_URL = 'https://www.pikeplacemarket.org/events-calendar/insiders-breakfast-and-culture-tour-of-pike-place-market/';

describe('PikePlaceMarketRipper', () => {
    describe('parseEventPage', () => {
        it('extracts event from sample HTML', () => {
            const ripper = new PikePlaceMarketRipper();
            const events = ripper.parseEventPage(loadSampleHtml(), SAMPLE_URL, BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect('date' in events[0]).toBe(true);
        });

        it('parses event title correctly, decoding HTML entities', () => {
            const ripper = new PikePlaceMarketRipper();
            const events = ripper.parseEventPage(loadSampleHtml(), SAMPLE_URL, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.summary).toBe("Insider’s Breakfast and Culture Tour of Pike Place Market");
        });

        it('parses event date correctly', () => {
            const ripper = new PikePlaceMarketRipper();
            const events = ripper.parseEventPage(loadSampleHtml(), SAMPLE_URL, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(7);
            expect(event.date.dayOfMonth()).toBe(10);
        });

        it('parses start time and duration from the MEC time element', () => {
            const ripper = new PikePlaceMarketRipper();
            const events = ripper.parseEventPage(loadSampleHtml(), SAMPLE_URL, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            // "8:00 am - 10:30 am"
            expect(event.date.hour()).toBe(8);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toMinutes()).toBe(150);
        });

        it('extracts a priced cost from schema.org offers', () => {
            const ripper = new PikePlaceMarketRipper();
            const events = ripper.parseEventPage(loadSampleHtml(), SAMPLE_URL, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            // Sample page's offers.price is "89"
            expect(event.cost).toEqual({ min: 89 });
        });

        it('sets event URL', () => {
            const ripper = new PikePlaceMarketRipper();
            const events = ripper.parseEventPage(loadSampleHtml(), SAMPLE_URL, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.url).toContain('pikeplacemarket.org');
        });

        it('sets imageUrl from schema.org Event image', () => {
            const ripper = new PikePlaceMarketRipper();
            const events = ripper.parseEventPage(loadSampleHtml(), SAMPLE_URL, BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.imageUrl).toMatch(/^https:\/\/images\.pikeplacemarket\.org\//);
        });

        it('returns empty array for past events', () => {
            const ripper = new PikePlaceMarketRipper();
            const events = ripper.parseEventPage(loadSampleHtml(), SAMPLE_URL, AFTER_EVENT);

            expect(events).toHaveLength(0);
        });

        it('returns ParseError when no JSON-LD Event found', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = '<html><body><p>No events here</p></body></html>';
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/missing/', BEFORE_EVENT);

            expect(events).toHaveLength(1);
            expect('type' in events[0]).toBe(true);
            expect((events[0] as RipperError).type).toBe('ParseError');
        });

        it('returns empty array for cancelled events', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-01",
                    "name": "Cancelled: Zine Workshop",
                    "description": "",
                    "url": "https://www.pikeplacemarket.org/events-calendar/cancelled-zine-workshop/",
                    "location": {"@type": "Place", "name": "", "address": ""}
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/cancelled-zine-workshop/', BEFORE_EVENT);

            expect(events).toHaveLength(0);
        });

        it('uses "Pike Place Market" as default location when none provided', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Market Event",
                    "description": "An event.",
                    "url": "https://www.pikeplacemarket.org/events-calendar/market-event/",
                    "location": {"@type": "Place", "name": "", "address": ""}
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/market-event/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.location).toBe('Pike Place Market');
        });

        it('joins location name and address when both are present', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Folio Talk",
                    "description": "A talk.",
                    "url": "https://www.pikeplacemarket.org/events-calendar/folio-talk/",
                    "location": {"@type": "Place", "name": "Folio", "address": "93 Pike St"}
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/folio-talk/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.location).toBe('Folio, 93 Pike St');
        });

        it('leaves cost undefined (unknown, not free) when offers.price is missing/empty', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Free Tour",
                    "description": "A free tour.",
                    "url": "https://www.pikeplacemarket.org/events-calendar/free-tour/",
                    "offers": {"price": "", "priceCurrency": "$"}
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/free-tour/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            // Absent, not a guessed { min: 0 } — routes into the costGaps queue
            // instead of silently publishing a "free" guess (AGENTS.md).
            expect(event.cost).toBeUndefined();
        });

        it('treats an explicit offers.price of "0" as confirmed free', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Zero Price Event",
                    "description": "Test.",
                    "url": "https://www.pikeplacemarket.org/events-calendar/zero-price/",
                    "offers": {"price": "0", "priceCurrency": "$"}
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/zero-price/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.cost).toEqual({ min: 0 });
        });

        it('leaves cost undefined for a malformed negative offers.price', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Negative Price Event",
                    "description": "Test.",
                    "url": "https://www.pikeplacemarket.org/events-calendar/negative-price/",
                    "offers": {"price": "-5", "priceCurrency": "$"}
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/negative-price/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.cost).toBeUndefined();
        });

        it('decodes HTML-entity-escaped markup embedded in the JSON-LD description', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Zine Workshop",
                    "description": "&lt;h3&gt;Design, create &amp; fold a zine.&lt;/h3&gt;",
                    "url": "https://www.pikeplacemarket.org/events-calendar/zine-workshop/"
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/zine-workshop/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.description).toBe('Design, create & fold a zine.');
        });

        it('falls back to 7pm/2hr when no MEC time element is present', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Untimed Event",
                    "description": "No time given.",
                    "url": "https://www.pikeplacemarket.org/events-calendar/untimed/"
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/untimed/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.date.hour()).toBe(19);
            expect(event.date.minute()).toBe(0);
            expect(event.duration.toMinutes()).toBe(120);
        });

        it('derives a stable id from the URL slug', () => {
            const ripper = new PikePlaceMarketRipper();
            const html = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Slug Test",
                    "description": "Test.",
                    "url": "https://www.pikeplacemarket.org/events-calendar/slug-test/"
                }
                </script>
                </body></html>`;
            const events = ripper.parseEventPage(html, 'https://www.pikeplacemarket.org/events-calendar/slug-test/', BEFORE_EVENT);

            const event = events[0] as RipperCalendarEvent;
            expect(event.id).toBe('ppm-slug-test');
        });
    });

    describe('parseTime', () => {
        it('parses "8:00 am - 10:30 am" correctly', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.parseTime('8:00 am - 10:30 am');
            expect(result.hour).toBe(8);
            expect(result.minute).toBe(0);
            expect(result.durationMinutes).toBe(150);
        });

        it('parses "7:30 pm - 10:30 pm" correctly', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.parseTime('7:30 pm - 10:30 pm');
            expect(result.hour).toBe(19);
            expect(result.minute).toBe(30);
            expect(result.durationMinutes).toBe(180);
        });

        it('parses single time "3:00 pm" with default 2-hour duration', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.parseTime('3:00 pm');
            expect(result.hour).toBe(15);
            expect(result.durationMinutes).toBe(120);
        });

        it('returns default 7pm/2hr for unrecognised text', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.parseTime('');
            expect(result.hour).toBe(19);
            expect(result.durationMinutes).toBe(120);
        });

        it('handles en-dash separator', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.parseTime('10:00am–3:00pm');
            expect(result.hour).toBe(10);
            expect(result.durationMinutes).toBe(300);
        });

        it('handles midnight-spanning events "11:00 pm - 1:00 am"', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.parseTime('11:00 pm - 1:00 am');
            expect(result.hour).toBe(23);
            expect(result.durationMinutes).toBe(120);
        });
    });

    describe('decodeHtmlEntities', () => {
        it('decodes named and numeric entities', () => {
            const ripper = new PikePlaceMarketRipper();
            expect(ripper.decodeHtmlEntities('Valentine&#8217;s &amp; Friends')).toBe("Valentine’s & Friends");
        });
    });

    describe('cleanDescription', () => {
        it('strips tags and normalises whitespace', () => {
            const ripper = new PikePlaceMarketRipper();
            const result = ripper.cleanDescription('<h3>Title</h3>   Some   text.');
            expect(result).toBe('Title Some text.');
        });

        it('returns empty string for empty input', () => {
            const ripper = new PikePlaceMarketRipper();
            expect(ripper.cleanDescription('')).toBe('');
        });
    });

    describe('fetchAllPostLinks pagination', () => {
        it('stops after a single short page (fewer than per_page results)', async () => {
            const ripper = new PikePlaceMarketRipper() as any;

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                return {
                    ok: true,
                    json: async () => [
                        { id: 1, link: 'https://www.pikeplacemarket.org/events-calendar/first/' },
                        { id: 2, link: 'https://www.pikeplacemarket.org/events-calendar/second/' },
                    ],
                };
            });

            const posts = await ripper.fetchAllPostLinks();

            expect(callCount).toBe(1);
            expect(posts).toHaveLength(2);
        });

        it('continues to the next page when a page is full, and stops on a short page', async () => {
            const ripper = new PikePlaceMarketRipper() as any;
            const fullPage = Array.from({ length: 100 }, (_, i) => ({
                id: i + 1,
                link: `https://www.pikeplacemarket.org/events-calendar/event-${i + 1}/`,
            }));

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async (url: string) => {
                callCount++;
                if (url.includes('page=2')) {
                    return { ok: true, json: async () => [{ id: 101, link: 'https://www.pikeplacemarket.org/events-calendar/event-101/' }] };
                }
                return { ok: true, json: async () => fullPage };
            });

            const posts = await ripper.fetchAllPostLinks();

            expect(callCount).toBe(2);
            expect(posts).toHaveLength(101);
        });

        it('stops when a page beyond the last returns HTTP 400', async () => {
            const ripper = new PikePlaceMarketRipper() as any;
            const fullPage = Array.from({ length: 100 }, (_, i) => ({
                id: i + 1,
                link: `https://www.pikeplacemarket.org/events-calendar/event-${i + 1}/`,
            }));

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async (url: string) => {
                callCount++;
                if (url.includes('page=2')) {
                    return { ok: false, status: 400, statusText: 'Bad Request' };
                }
                return { ok: true, json: async () => fullPage };
            });

            const posts = await ripper.fetchAllPostLinks();

            expect(callCount).toBe(2);
            expect(posts).toHaveLength(100);
        });

        it('throws when the first page request fails with a non-transient error', async () => {
            const ripper = new PikePlaceMarketRipper() as any;
            ripper.fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

            await expect(ripper.fetchAllPostLinks()).rejects.toThrow('WP REST API error');
        });

        it('retries a transient error on a later page instead of silently truncating', async () => {
            vi.useFakeTimers();
            try {
                const ripper = new PikePlaceMarketRipper() as any;
                const fullPage = Array.from({ length: 100 }, (_, i) => ({
                    id: i + 1,
                    link: `https://www.pikeplacemarket.org/events-calendar/event-${i + 1}/`,
                }));

                let page2Calls = 0;
                ripper.fetchFn = vi.fn().mockImplementation(async (url: string) => {
                    if (url.includes('page=2')) {
                        page2Calls++;
                        if (page2Calls === 1) {
                            return { ok: false, status: 503, statusText: 'Service Unavailable' };
                        }
                        return { ok: true, json: async () => [{ id: 101, link: 'https://www.pikeplacemarket.org/events-calendar/event-101/' }] };
                    }
                    return { ok: true, json: async () => fullPage };
                });

                const promise = ripper.fetchAllPostLinks();
                await vi.runAllTimersAsync();
                const posts = await promise;

                expect(page2Calls).toBe(2);
                expect(posts).toHaveLength(101);
            } finally {
                vi.useRealTimers();
            }
        });

        it('throws (rather than silently truncating) when a later page exhausts retries', async () => {
            vi.useFakeTimers();
            try {
                const ripper = new PikePlaceMarketRipper() as any;
                const fullPage = Array.from({ length: 100 }, (_, i) => ({
                    id: i + 1,
                    link: `https://www.pikeplacemarket.org/events-calendar/event-${i + 1}/`,
                }));

                ripper.fetchFn = vi.fn().mockImplementation(async (url: string) => {
                    if (url.includes('page=2')) {
                        return { ok: false, status: 503, statusText: 'Service Unavailable' };
                    }
                    return { ok: true, json: async () => fullPage };
                });

                const promise = ripper.fetchAllPostLinks();
                // Attach the rejection assertion before advancing fake timers so
                // the rejection (which fires during runAllTimersAsync) is never
                // briefly unhandled.
                const assertion = expect(promise).rejects.toThrow('WP REST API error');
                await vi.runAllTimersAsync();
                await assertion;
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('fetchAndParseEvent retry logic', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('retries on HTTP 429 and succeeds on subsequent attempt', async () => {
            const ripper = new PikePlaceMarketRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            const successHtml = `<html><body>
                <script type="application/ld+json">
                {
                    "@context": "http://schema.org",
                    "@type": "Event",
                    "startDate": "2026-06-15",
                    "name": "Retry Success Event",
                    "description": "Test",
                    "url": "https://www.pikeplacemarket.org/events-calendar/retry-test/"
                }
                </script>
                </body></html>`;

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    return { ok: false, status: 429, statusText: 'Too Many Requests' };
                }
                return { ok: true, text: async () => successHtml };
            });

            const promise = ripper.fetchAndParseEvent('https://www.pikeplacemarket.org/events-calendar/retry-test/', today);
            await vi.runAllTimersAsync();
            const events = await promise;

            expect(callCount).toBe(2);
            // No MEC time element in the fixture → event + a startTime UncertaintyError.
            expect(events).toHaveLength(2);
            expect((events[0] as RipperCalendarEvent).summary).toBe('Retry Success Event');
            expect((events[1] as RipperError).type).toBe('Uncertainty');
        });

        it('records ParseError after all retries exhausted', async () => {
            const ripper = new PikePlaceMarketRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                return { ok: false, status: 503, statusText: 'Service Unavailable' };
            });

            const promise = ripper.fetchAndParseEvent('https://www.pikeplacemarket.org/events-calendar/exhaust-test/', today);
            await vi.runAllTimersAsync();
            const events = await promise;

            expect(callCount).toBe(4); // 1 initial + 3 retries
            expect((events[0] as RipperError).type).toBe('ParseError');
            expect((events[0] as RipperError).reason).toContain('after 3 retries');
        });

        it('does NOT retry on HTTP 404', async () => {
            const ripper = new PikePlaceMarketRipper() as any;
            const today = LocalDate.of(2026, 1, 1);

            let callCount = 0;
            ripper.fetchFn = vi.fn().mockImplementation(async () => {
                callCount++;
                return { ok: false, status: 404, statusText: 'Not Found' };
            });

            const promise = ripper.fetchAndParseEvent('https://www.pikeplacemarket.org/events-calendar/missing/', today);
            await vi.runAllTimersAsync();
            const events = await promise;

            expect(callCount).toBe(1);
            expect((events[0] as RipperError).reason).toContain('HTTP 404');
        });
    });
});
