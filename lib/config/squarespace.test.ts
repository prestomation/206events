import { describe, expect, test, vi } from 'vitest';
import { SquarespaceRipper, SquarespaceEvent, extractCostFromBody } from './squarespace.js';
import { Duration, ZoneId, ZonedDateTime } from '@js-joda/core';
import { RipperCalendar, RipperCalendarEvent, RipperConfig } from './schema.js';
import '@js-joda/timezone';

// Access the protected mapEvent method via a test subclass
class TestSquarespaceRipper extends SquarespaceRipper {
    public testMapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL) {
        return this.mapEvent(sqEvent, timezone, baseUrl);
    }
}

// Override fetchUpcomingEvents to simulate a network failure without real network calls
class NetworkErrorSquarespaceRipper extends SquarespaceRipper {
    protected async fetchUpcomingEvents(_baseUrl: URL): Promise<SquarespaceEvent[]> {
        throw new Error('network unavailable');
    }
}

// Allows setting a mocked fetch response to test fetchUpcomingEvents logic
class MockFetchSquarespaceRipper extends SquarespaceRipper {
    public setMockResponse(response: object) {
        this.fetchFn = async () => new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// Returns HTTP 429 for the first `failCount` calls (with a zero-second
// Retry-After so the test doesn't wait on real backoff delays), then 200.
class FlakyRateLimitedSquarespaceRipper extends SquarespaceRipper {
    public callCount = 0;
    constructor(private failCount: number, private response: object) {
        super();
        this.fetchFn = async () => {
            this.callCount++;
            if (this.callCount <= this.failCount) {
                return new Response('rate limited', {
                    status: 429,
                    headers: { 'Retry-After': '0' },
                });
            }
            return new Response(JSON.stringify(this.response), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    }
}

// Same as above, but without a Retry-After header — exercises the
// exponential-backoff fallback path instead.
class FlakyRateLimitedNoRetryAfterSquarespaceRipper extends SquarespaceRipper {
    public callCount = 0;
    constructor(private failCount: number, private response: object) {
        super();
        this.fetchFn = async () => {
            this.callCount++;
            if (this.callCount <= this.failCount) {
                return new Response('rate limited', { status: 429 });
            }
            return new Response(JSON.stringify(this.response), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    }
}

function makeMinimalRipperConfig(): { config: RipperConfig, ripperImpl: SquarespaceRipper } {
    const config = {
        name: 'test-squarespace',
        description: 'Test Squarespace',
        url: new URL('https://example.com/events'),
        friendlyLink: 'https://example.com/events',
        disabled: false,
        proxy: false,
        calendars: [{
            name: 'test-cal',
            friendlyname: 'Test Calendar',
            timezone: ZoneId.of('America/Los_Angeles'),
            config: {},
            expectEmpty: false,
        }],
    } as unknown as RipperConfig;
    return { config, ripperImpl: new NetworkErrorSquarespaceRipper() };
}

const timezone = ZoneId.of('America/Los_Angeles');
const baseUrl = new URL('https://www.example.org/events');

describe('SquarespaceRipper', () => {
    const ripper = new TestSquarespaceRipper();

    describe('mapEvent', () => {
        test('maps a complete Squarespace event to RipperCalendarEvent', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'abc123',
                title: 'Community Art Opening',
                startDate: 1771106400000, // 2026-02-15T10:00:00 PST (approx)
                endDate: 1771113600000,   // 2026-02-15T12:00:00 PST (approx)
                fullUrl: '/events/community-art-opening',
                excerpt: '<p>Join us for an evening of art and community.</p>',
                location: {
                    addressTitle: 'Example Museum',
                    addressLine1: '123 Main St',
                    addressLine2: 'Seattle, WA 98101',
                },
                assetUrl: 'https://images.squarespace-cdn.com/content/image.jpg',
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl);

            expect(event).not.toBeNull();
            const e = event as RipperCalendarEvent;
            expect(e.id).toBe('abc123');
            expect(e.summary).toBe('Community Art Opening');
            expect(e.location).toBe('Example Museum, 123 Main St, Seattle, WA 98101');
            expect(e.url).toBe('https://www.example.org/events/community-art-opening');
            expect(e.description).toBe('Join us for an evening of art and community.');
            expect(e.imageUrl).toBe('https://images.squarespace-cdn.com/content/image.jpg');
            expect(e.duration.toHours()).toBe(2);
            expect(e.date).toBeInstanceOf(ZonedDateTime);
        });

        test('calculates duration from start and end dates', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'dur1',
                title: 'Three Hour Workshop',
                startDate: 1771106400000,
                endDate: 1771106400000 + (3 * 60 * 60 * 1000), // +3 hours
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.duration.toHours()).toBe(3);
        });

        test('uses 2-hour default duration when endDate is missing', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'noend1',
                title: 'Open-Ended Event',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.duration.toHours()).toBe(2);
        });

        test('uses 2-hour default duration when endDate equals startDate', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'same1',
                title: 'Zero Duration Event',
                startDate: 1771106400000,
                endDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.duration.toHours()).toBe(2);
        });

        test('returns null when title is missing', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'notitle',
                title: '',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl);
            expect(event).toBeNull();
        });

        test('returns null when startDate is missing', () => {
            const sqEvent = {
                id: 'nodate',
                title: 'No Date Event',
                startDate: 0,
            } as SquarespaceEvent;

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl);
            expect(event).toBeNull();
        });

        test('handles missing location gracefully', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'noloc',
                title: 'Virtual Event',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.location).toBeUndefined();
        });

        test('handles partial location (only addressTitle)', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'partloc',
                title: 'Partial Location Event',
                startDate: 1771106400000,
                location: {
                    addressTitle: 'The Venue',
                },
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.location).toBe('The Venue');
        });

        test('decodes HTML entities in location fields', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'entityloc',
                title: 'Intersection Rally',
                startDate: 1771106400000,
                location: {
                    addressTitle: 'C&amp;P Coffee',
                    addressLine1: '35th Ave SW &amp; SW Edmunds St.',
                },
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.location).toBe('C&P Coffee, 35th Ave SW & SW Edmunds St.');
        });

        test('handles empty location object', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'emptyloc',
                title: 'Empty Location Event',
                startDate: 1771106400000,
                location: {},
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.location).toBeUndefined();
        });

        test('strips HTML from excerpt', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'html1',
                title: 'HTML Description Event',
                startDate: 1771106400000,
                excerpt: '<p class="">Come join us for a <strong>great</strong> time!</p>',
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.description).toBe('Come join us for a great time!');
        });

        test('handles missing excerpt', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'noexc',
                title: 'No Excerpt Event',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.description).toBeUndefined();
        });

        test('sets cost to free when tag is "Free + No Cover"', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'free1',
                title: 'Free Community Walk',
                startDate: 1771106400000,
                tags: ['Free + No Cover', 'Outdoor'],
            };
            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.cost).toEqual({ min: 0 });
        });

        test('sets cost to free when tag contains "notalof" (NOTAFLOF)', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'notalof1',
                title: 'Sliding Scale Workshop',
                startDate: 1771106400000,
                tags: ['Sliding Scale +/or NOTALOF', 'All Ages'],
            };
            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.cost).toEqual({ min: 0 });
        });

        test('leaves cost undefined when no cost-related tags present', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'nocost1',
                title: 'Ticketed Show',
                startDate: 1771106400000,
                tags: ['Music', '21+'],
            };
            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.cost).toBeUndefined();
        });

        test('leaves cost undefined when tags array is absent', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'notags1',
                title: 'Untagged Event',
                startDate: 1771106400000,
            };
            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.cost).toBeUndefined();
        });

        test('falls back to a price mentioned in the body when no cost tag is present (live example, inner-alchemy 2026-09-24)', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'qigong1',
                title: 'Qigong for the Body, Mind & Spirit',
                startDate: 1771106400000,
                body: '<p>Qigong for the Body, Mind &amp; Spirit</p><p>Every Tuesday 7-8pm, $25</p><p>Chris with Northern Acupuncture is excited to present an ongoing Qigong class...</p>',
            };
            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.cost).toEqual({ min: 25 });
        });

        test('a cost tag wins over a body-text price', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'tagwins1',
                title: 'Free Community Walk',
                startDate: 1771106400000,
                tags: ['Free + No Cover'],
                body: '<p>Suggested donation of $10 at the door, but truly free + no cover.</p>',
            };
            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.cost).toEqual({ min: 0 });
        });

        test('leaves cost undefined when the body mentions no price at all', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'nobody1',
                title: 'Community Potluck',
                startDate: 1771106400000,
                body: '<p>Bring a dish to share and meet your neighbors!</p>',
            };
            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.cost).toBeUndefined();
        });

        test('builds full event URL from relative fullUrl', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'url1',
                title: 'URL Test Event',
                startDate: 1771106400000,
                fullUrl: '/events/2026/2/15/url-test-event',
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.url).toBe('https://www.example.org/events/2026/2/15/url-test-event');
        });

        test('handles missing fullUrl', () => {
            const sqEvent: SquarespaceEvent = {
                id: 'nourl',
                title: 'No URL Event',
                startDate: 1771106400000,
            };

            const event = ripper.testMapEvent(sqEvent, timezone, baseUrl) as RipperCalendarEvent;
            expect(event.url).toBeUndefined();
        });

        test('converts timestamps to correct timezone', () => {
            // 1771106400000 ms = specific UTC instant
            // In America/Los_Angeles, this should be Pacific time
            const sqEvent: SquarespaceEvent = {
                id: 'tz1',
                title: 'Timezone Test',
                startDate: 1771106400000,
            };

            const eventPST = ripper.testMapEvent(sqEvent, ZoneId.of('America/Los_Angeles'), baseUrl) as RipperCalendarEvent;
            const eventUTC = ripper.testMapEvent(sqEvent, ZoneId.of('UTC'), baseUrl) as RipperCalendarEvent;

            // Same instant, different zone representation
            expect(eventPST.date.toEpochSecond()).toBe(eventUTC.date.toEpochSecond());
            expect(eventPST.date.zone().id()).toBe('America/Los_Angeles');
            expect(eventUTC.date.zone().id()).toBe('UTC');
        });
    });

    describe('fetchUpcomingEvents data.past fallback', () => {
        const futureMs = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days from now
        const pastMs = Date.now() - 30 * 24 * 60 * 60 * 1000;   // 30 days ago

        test('returns future events from data.past when data.upcoming is empty', async () => {
            const mockRipper = new MockFetchSquarespaceRipper();
            mockRipper.setMockResponse({
                upcoming: [],
                past: [
                    { id: 'future1', title: 'Future Concert', startDate: futureMs },
                    { id: 'past1', title: 'Past Concert', startDate: pastMs },
                ],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('future1');
        });

        test('returns future events from data.past when data.upcoming is absent', async () => {
            const mockRipper = new MockFetchSquarespaceRipper();
            mockRipper.setMockResponse({
                past: [
                    { id: 'future2', title: 'Another Future Concert', startDate: futureMs },
                ],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('future2');
        });

        test('data.past fallback is skipped when data.upcoming has events', async () => {
            const mockRipper = new MockFetchSquarespaceRipper();
            mockRipper.setMockResponse({
                upcoming: [
                    { id: 'upcoming1', title: 'Upcoming Event', startDate: futureMs },
                ],
                past: [
                    { id: 'future3', title: 'Also Future But In Past Array', startDate: futureMs },
                ],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('upcoming1');
        });

        test('data.past fallback returns no events when all past items are in the past', async () => {
            const mockRipper = new MockFetchSquarespaceRipper();
            mockRipper.setMockResponse({
                upcoming: [],
                past: [
                    { id: 'past2', title: 'Old Concert', startDate: pastMs },
                ],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(0);
        });
    });

    describe('rip() error handling', () => {
        test('returns error calendar on network failure, does not throw', async () => {
            const { config, ripperImpl } = makeMinimalRipperConfig();
            const calendars: RipperCalendar[] = await ripperImpl.rip({ config, ripperImpl });

            expect(Array.isArray(calendars)).toBe(true);
            expect(calendars.length).toBeGreaterThan(0);
            expect(calendars[0].name).toBeDefined();
            expect(Array.isArray(calendars[0].events)).toBe(true);
            expect(Array.isArray(calendars[0].errors)).toBe(true);
            expect(calendars[0].errors.length).toBeGreaterThan(0);
            expect(calendars[0].errors[0].reason).toContain('network unavailable');
        });
    });

    describe('fetchUpcomingEvents 429 retry', () => {
        const futureMs = Date.now() + 30 * 24 * 60 * 60 * 1000;

        test('retries on 429 and succeeds once the rate limit clears', async () => {
            const mockRipper = new FlakyRateLimitedSquarespaceRipper(2, {
                upcoming: [{ id: 'e1', title: 'Recovered Event', startDate: futureMs }],
            });
            const events = await (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                .fetchUpcomingEvents(baseUrl);
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('e1');
            expect(mockRipper.callCount).toBe(3);
        });

        test('gives up after MAX_429_RETRIES and surfaces the error', async () => {
            const mockRipper = new FlakyRateLimitedSquarespaceRipper(Infinity, {});
            await expect(
                (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                    .fetchUpcomingEvents(baseUrl)
            ).rejects.toThrow('429');
            // 1 initial attempt + 3 retries
            expect(mockRipper.callCount).toBe(4);
        });

        test('falls back to jittered exponential backoff when Retry-After is absent', async () => {
            vi.useFakeTimers();
            try {
                const mockRipper = new FlakyRateLimitedNoRetryAfterSquarespaceRipper(2, {
                    upcoming: [{ id: 'e2', title: 'Recovered Without Retry-After', startDate: futureMs }],
                });
                const promise = (mockRipper as unknown as { fetchUpcomingEvents(u: URL): Promise<SquarespaceEvent[]> })
                    .fetchUpcomingEvents(baseUrl);
                // Worst-case backoff across 2 retries is 1s + 2s, doubled for jitter headroom.
                await vi.advanceTimersByTimeAsync(6000);
                const events = await promise;
                expect(events).toHaveLength(1);
                expect(events[0].id).toBe('e2');
                expect(mockRipper.callCount).toBe(3);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('extractCostFromBody', () => {
        test('detects a NOTAFLOF / suggested-donation phrase as free', () => {
            expect(extractCostFromBody('<p>Suggested donation $15-25, no one turned away.</p>')).toEqual({ min: 0 });
            expect(extractCostFromBody('<p>Pay-what-you-can, PWYC.</p>')).toEqual({ min: 0 });
        });

        test('an optional donation with a dollar amount is still free (live example, inner-alchemy 2026-09-24)', () => {
            // A real amount appears in the text, but it's explicitly framed as
            // optional/appreciated on top of a stated free offering — the
            // rubric's NOTAFLOF rule wins over the dollar amount.
            expect(extractCostFromBody(
                '<p>Y12SR is a free offering. Donations of $10-$15 are deeply appreciated. Your presence matters most.</p>'
            )).toEqual({ min: 0 });
            expect(extractCostFromBody('<p>Donations welcome at the door.</p>')).toEqual({ min: 0 });
        });

        test('detects an explicit free-admission phrase', () => {
            expect(extractCostFromBody('<p>Free admission, all ages welcome.</p>')).toEqual({ min: 0 });
            expect(extractCostFromBody('<p>Free workshop, RSVP required.</p>')).toEqual({ min: 0 });
        });

        test('detects a "free community" gathering phrase (live example, inner-alchemy 2026-09-24)', () => {
            expect(extractCostFromBody(
                '<p>Heavily Meditated: A Free Community Meditation Experience Guided by Maari Falsetto.</p>'
            )).toEqual({ min: 0 });
        });

        test('extracts a sliding-scale range as {min, max}', () => {
            expect(extractCostFromBody('<p>Sliding scale $15-25 per class.</p>')).toEqual({ min: 15, max: 25 });
            expect(extractCostFromBody('<p>Cost is $10 to $20.</p>')).toEqual({ min: 10, max: 20 });
        });

        test('extracts a keyword-labeled price', () => {
            expect(extractCostFromBody('<p>Investment: $45 for the full workshop.</p>')).toEqual({ min: 45 });
            expect(extractCostFromBody('<p>Tickets $12.50 at the door.</p>')).toEqual({ min: 12.5 });
        });

        test('extracts a price mentioned right after a time (live example)', () => {
            expect(extractCostFromBody('<p>Every Tuesday 7-8pm, $25</p>')).toEqual({ min: 25 });
        });

        test('does not mistake an unrelated dollar amount later in the sentence for the time-adjacent price', () => {
            expect(extractCostFromBody('<p>Doors at 7pm, drinks $8 extra.</p>')).toBeUndefined();
        });

        test('a negated free phrase does not classify the event as free', () => {
            expect(extractCostFromBody('<p>This is not a free class — Tickets: $50.</p>')).toEqual({ min: 50 });
            expect(extractCostFromBody('<p>Heads up: this event is no longer free. Cost: $30.</p>')).toEqual({ min: 30 });
        });

        test('skips a member/tiered price and picks the general-admission one', () => {
            expect(extractCostFromBody('<p>Member price: $15, Regular price: $25.</p>')).toEqual({ min: 25 });
            expect(extractCostFromBody('<p>Student price: $10.</p>')).toBeUndefined();
        });

        test('returns undefined when no price signal is present', () => {
            expect(extractCostFromBody('<p>Join us for a fun evening with friends!</p>')).toBeUndefined();
            expect(extractCostFromBody(undefined)).toBeUndefined();
            expect(extractCostFromBody('')).toBeUndefined();
        });
    });
});
