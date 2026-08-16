import { describe, expect, test, vi, afterEach } from 'vitest';
import DowntownSeattleRipper from './ripper.js';
import { ZonedDateTime, Duration, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function makeRipper(overrides: Record<string, any> = {}) {
  return {
    config: {
      name: 'downtown-seattle-association',
      url: new URL('https://downtownseattle.org/wp-json/tribe/events/v1/events'),
      tags: ['Downtown'],
      geo: null,
      disabled: false,
      proxy: false,
      calendars: [
        {
          name: 'pioneer-park',
          friendlyname: 'Pioneer Park Events',
          timezone: TIMEZONE,
          config: { venue_id: 53757 },
          tags: ['Pioneer Square'],
        },
        {
          name: 'other-events',
          friendlyname: 'Other Downtown Seattle Association Events',
          timezone: TIMEZONE,
          config: { catchAll: true },
        },
      ],
      ...overrides,
    },
  } as any;
}

describe('Downtown Seattle Association Ripper', () => {
  test('parses Pioneer Park events correctly from JSON', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Test Pioneer Park events
    const pioneerParkConfig = { venue_id: 53757 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const pioneerParkEvents = await ripper.parseEvents(jsonData, date, pioneerParkConfig);
    
    // Get the expected Pioneer Park events from the JSON data
    const expectedPioneerParkEvents = jsonData.events.filter(
      (event: any) => event.venue && event.venue.id === 53757
    );
    
    // Verify we got the correct number of Pioneer Park events
    expect(pioneerParkEvents.length).toBe(expectedPioneerParkEvents.length);
    
    // Verify specific event properties for the first event
    if (pioneerParkEvents.length > 0 && 'date' in pioneerParkEvents[0]) {
      const event = pioneerParkEvents[0] as RipperCalendarEvent;
      const expectedEvent = expectedPioneerParkEvents[0];
      
      // Check basic properties
      expect(event.id).toBe(expectedEvent.id.toString());
      expect(event.summary).toBe(expectedEvent.title);
      expect(event.url).toBe(expectedEvent.url);
      
      // Check that the description has HTML stripped
      expect(event.description).not.toContain('<p>');
      expect(event.description).toContain('Enjoy a free lunchtime serenade');
      
      // Check location formatting
      expect(event.location).toContain('Pioneer Park');
      expect(event.location).toContain('100 Yesler Way');
      expect(event.location).toContain('Seattle');
      
    // Check date and duration
    const expectedYear = parseInt(expectedEvent.start_date_details.year);
    const expectedMonth = parseInt(expectedEvent.start_date_details.month);
    const expectedDay = parseInt(expectedEvent.start_date_details.day);
    const expectedHour = parseInt(expectedEvent.start_date_details.hour);
    const expectedMinute = parseInt(expectedEvent.start_date_details.minutes);
    
    expect(event.date.year()).toBe(expectedYear);
    expect(event.date.monthValue()).toBe(expectedMonth);
    expect(event.date.dayOfMonth()).toBe(expectedDay);
    expect(event.date.hour()).toBe(expectedHour);
    expect(event.date.minute()).toBe(expectedMinute);
    }
  });
  
  test('parses Westlake Park events correctly from JSON', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Test Westlake Park events
    const westlakeParkConfig = { venue_id: 53732 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const westlakeParkEvents = await ripper.parseEvents(jsonData, date, westlakeParkConfig);
    
    // Get the expected Westlake Park events from the JSON data
    const expectedWestlakeParkEvents = jsonData.events.filter(
      (event: any) => event.venue && event.venue.id === 53732
    );
    
    // Verify we got the correct number of Westlake Park events
    expect(westlakeParkEvents.length).toBe(expectedWestlakeParkEvents.length);
    
    // Verify specific event properties for the first event
    if (westlakeParkEvents.length > 0 && 'date' in westlakeParkEvents[0]) {
      const event = westlakeParkEvents[0] as RipperCalendarEvent;
      const expectedEvent = expectedWestlakeParkEvents[0];
      
      // Check basic properties
      expect(event.id).toBe(expectedEvent.id.toString());
      expect(event.summary).toBe(expectedEvent.title);
      expect(event.url).toBe(expectedEvent.url);
      
      // Check that the description has HTML stripped
      expect(event.description).not.toContain('<p>');
      
      // Check location formatting
      expect(event.location).toContain('Westlake Park');
      expect(event.location).toContain('401 Pine St');
      expect(event.location).toContain('Seattle');
      
      // Check specific event details for Food Truck Fest
      expect(event.summary).toContain('Food Truck Fest');
      expect(event.description).toContain('Spice up your lunch break');
      
      // Check duration calculation
      const startDetails = expectedEvent.start_date_details;
      const endDetails = expectedEvent.end_date_details;
      
      // Calculate expected duration
      const startHour = parseInt(startDetails.hour);
      const startMinute = parseInt(startDetails.minutes);
      const endHour = parseInt(endDetails.hour);
      const endMinute = parseInt(endDetails.minutes);
      
      // Calculate duration in hours and minutes
      let expectedDurationHours = endHour - startHour;
      let expectedDurationMinutes = endMinute - startMinute;
      
      // Adjust if minutes are negative
      if (expectedDurationMinutes < 0) {
        expectedDurationHours--;
        expectedDurationMinutes += 60;
      }
      
      expect(event.duration.toHours()).toBe(expectedDurationHours);
      expect(event.duration.toMinutes() % 60).toBe(expectedDurationMinutes);
    }
  });
  
  test('handles filtering by venue correctly', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Test with a non-existent venue ID
    const nonExistentVenueConfig = { venue_id: 99999 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, nonExistentVenueConfig);
    
    // Should return an empty array since no events match this venue
    expect(events.length).toBe(0);
    
    // Test with no venue filter
    const noVenueConfig = {};
    const allEvents = await ripper.parseEvents(jsonData, date, noVenueConfig);
    
    // Should return all events
    expect(allEvents.length).toBe(jsonData.events.length);
  });
  
  test('calculates event duration correctly', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Get Earth Day Market event (which has a longer duration)
    const westlakeParkConfig = { venue_id: 53732 };
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, westlakeParkConfig);
    
    // Find the Earth Day Market event
    const earthDayEvent = events.find(e => 
      'summary' in e && e.summary.includes('Earth Day Market')
    ) as RipperCalendarEvent | undefined;
    
    if (earthDayEvent) {
      // Earth Day Market is from 11am to 5pm (6 hours)
      expect(earthDayEvent.duration.toHours()).toBe(6);
      expect(earthDayEvent.duration.toMinutes() % 60).toBe(0);
    }
    
    // Find a standard 2-hour event
    const standardEvent = events.find(e => 
      'summary' in e && e.summary.includes('Food Truck Fest')
    ) as RipperCalendarEvent | undefined;
    
    if (standardEvent) {
      // Food Truck Fest is from 11am to 2pm (3 hours)
      expect(standardEvent.duration.toHours()).toBe(3);
      expect(standardEvent.duration.toMinutes() % 60).toBe(0);
    }
  });

  test('includes image URLs in events', async () => {
    // Load the sample JSON file
    const jsonPath = path.join(__dirname, 'dsa-2025-04-04.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Create an instance of the ripper
    const ripper = new DowntownSeattleRipper();
    
    // Get events
    const config = { venue_id: 53757 }; // Pioneer Park
    const date = ZonedDateTime.parse('2025-04-04T00:00:00-07:00[America/Los_Angeles]');
    const events = await ripper.parseEvents(jsonData, date, config);
    
    // Find an event with an image
    const eventWithImage = events.find(e => 
      'imageUrl' in e && e.imageUrl
    ) as RipperCalendarEvent | undefined;
    
    if (eventWithImage) {
      // Verify image URL is set
      expect(eventWithImage.imageUrl).toBeDefined();
      expect(eventWithImage.imageUrl).toContain('https://downtownseattle.org');

      // Verify image URL is appended to description
      expect(eventWithImage.description).toContain('Event image:');
      expect(eventWithImage.description).toContain(eventWithImage.imageUrl);
    }
  });

  function makeEvent(overrides: Record<string, any>) {
    return {
      id: 1,
      title: 'Test Event',
      description: '<p>Test description</p>',
      url: 'https://downtownseattle.org/event/test-event/',
      start_date_details: { year: '2026', month: '08', day: '15', hour: '12', minutes: '00', seconds: '00' },
      end_date_details: { year: '2026', month: '08', day: '15', hour: '13', minutes: '00', seconds: '00' },
      timezone: 'America/Los_Angeles',
      categories: [{ slug: 'public' }],
      venue: [],
      ...overrides,
    };
  }

  test('catch-all calendar includes events with no venue and unknown venues, excludes tracked venues', async () => {
    const ripper = new DowntownSeattleRipper();
    const jsonData = {
      events: [
        makeEvent({ id: 1, title: 'Belltown Blast', venue: [] }), // no venue at all
        makeEvent({ id: 2, title: 'One-off performer slot', venue: { id: 99999 } }), // untracked venue
        makeEvent({ id: 3, title: 'Pioneer Park show', venue: { id: 53757 } }), // tracked venue
      ],
    };
    const date = ZonedDateTime.parse('2026-08-15T00:00:00-07:00[America/Los_Angeles]');

    const otherEvents = await ripper.parseEvents(jsonData, date, {
      catchAll: true,
      excludeVenueIds: [53757, 53732],
    });

    const titles = otherEvents.filter((e): e is RipperCalendarEvent => 'summary' in e).map(e => e.summary);
    expect(titles).toContain('Belltown Blast');
    expect(titles).toContain('One-off performer slot');
    expect(titles).not.toContain('Pioneer Park show');
  });

  test('excludes DSA member-only events from every calendar', async () => {
    const ripper = new DowntownSeattleRipper();
    const jsonData = {
      events: [
        makeEvent({ id: 1, title: 'DSA Member Roundtable', venue: [], categories: [{ slug: 'member' }] }),
        makeEvent({ id: 2, title: 'Belltown Blast', venue: [], categories: [{ slug: 'public' }] }),
        makeEvent({ id: 3, title: 'Member reception at Pioneer Park', venue: { id: 53757 }, categories: [{ slug: 'member' }] }),
      ],
    };
    const date = ZonedDateTime.parse('2026-08-15T00:00:00-07:00[America/Los_Angeles]');

    const otherEvents = await ripper.parseEvents(jsonData, date, { catchAll: true, excludeVenueIds: [53757] });
    const otherTitles = otherEvents.filter((e): e is RipperCalendarEvent => 'summary' in e).map(e => e.summary);
    expect(otherTitles).toEqual(['Belltown Blast']);

    const pioneerParkEvents = await ripper.parseEvents(jsonData, date, { venue_id: 53757 });
    expect(pioneerParkEvents.length).toBe(0);
  });

  test('parses McGraw Square events by venue_id', async () => {
    const ripper = new DowntownSeattleRipper();
    const jsonData = {
      events: [
        makeEvent({ id: 1, title: 'Double Dutch Divas at McGraw Square', venue: { id: 60595 } }),
        makeEvent({ id: 2, title: 'Belltown Blast', venue: [] }),
      ],
    };
    const date = ZonedDateTime.parse('2026-08-15T00:00:00-07:00[America/Los_Angeles]');

    const mcgrawEvents = await ripper.parseEvents(jsonData, date, { venue_id: 60595 });
    const titles = mcgrawEvents.filter((e): e is RipperCalendarEvent => 'summary' in e).map(e => e.summary);
    expect(titles).toEqual(['Double Dutch Divas at McGraw Square']);
  });

  describe('rip()', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    function jsonResponse(body: any) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }

    test('computes start_date from the calendars\' own (Pacific) timezone, not the system clock', async () => {
      // 2026-08-16T03:00:00Z is 2026-08-15T20:00:00-07:00 in Seattle — still
      // "today" locally even though UTC has already rolled over to the 16th.
      // DSA's API excludes events dated before start_date, so requesting the
      // UTC date here would silently drop a same-day event still in progress
      // (e.g. an event running noon-11:30pm Pacific).
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-16T03:00:00Z'));

      const mockFetch = vi.fn().mockImplementation(() => jsonResponse({ events: [], total_pages: 1 }));
      vi.stubGlobal('fetch', mockFetch);

      const ripper = new DowntownSeattleRipper();
      await ripper.rip(makeRipper());

      const requestedUrl = mockFetch.mock.calls[0][0] as string;
      expect(requestedUrl).toContain('start_date=2026-08-15');
      expect(requestedUrl).not.toContain('start_date=2026-08-16');
    });

    test('wires excludeVenueIds from configured venue_ids into the catch-all calendar', async () => {
      const events = [
        makeEvent({ id: 1, title: 'Pioneer Park show', venue: { id: 53757 } }),
        makeEvent({ id: 2, title: 'Belltown Blast', venue: [] }),
        makeEvent({ id: 3, title: 'One-off performer slot', venue: { id: 99999 } }),
      ];
      const mockFetch = vi.fn().mockImplementation(() => jsonResponse({ events, total_pages: 1 }));
      vi.stubGlobal('fetch', mockFetch);

      const ripper = new DowntownSeattleRipper();
      const result = await ripper.rip(makeRipper());

      // Fetched once (single unfiltered page), not once per calendar.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).not.toContain('venue=');

      const pioneerPark = result.find(c => c.name === 'pioneer-park')!;
      expect(pioneerPark.events.map(e => e.summary)).toEqual(['Pioneer Park show']);

      const other = result.find(c => c.name === 'other-events')!;
      const otherTitles = other.events.map(e => e.summary).sort();
      expect(otherTitles).toEqual(['Belltown Blast', 'One-off performer slot']);
    });

    test('fully paginates the unfiltered fetch before bucketing', async () => {
      const page1Events = [makeEvent({ id: 1, title: 'Page 1 event', venue: { id: 53757 } })];
      const page2Events = [makeEvent({ id: 2, title: 'Page 2 event', venue: { id: 53757 } })];
      const mockFetch = vi.fn()
        .mockImplementationOnce(() => jsonResponse({ events: page1Events, total_pages: 2 }))
        .mockImplementationOnce(() => jsonResponse({ events: page2Events, total_pages: 2 }));
      vi.stubGlobal('fetch', mockFetch);

      const ripper = new DowntownSeattleRipper();
      const result = await ripper.rip(makeRipper());

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const pioneerPark = result.find(c => c.name === 'pioneer-park')!;
      expect(pioneerPark.events.map(e => e.summary).sort()).toEqual(['Page 1 event', 'Page 2 event']);
    });

    test('surfaces a malformed page as a per-calendar error without dropping other pages\' events', async () => {
      const goodEvents = [makeEvent({ id: 1, title: 'Pioneer Park show', venue: { id: 53757 } })];
      const mockFetch = vi.fn()
        .mockImplementationOnce(() => jsonResponse({ events: goodEvents, total_pages: 2 }))
        .mockImplementationOnce(() => jsonResponse({ total_pages: 2 })); // page 2: malformed, no events array
      vi.stubGlobal('fetch', mockFetch);

      const ripper = new DowntownSeattleRipper();
      const result = await ripper.rip(makeRipper());

      const pioneerPark = result.find(c => c.name === 'pioneer-park')!;
      expect(pioneerPark.events.map(e => e.summary)).toEqual(['Pioneer Park show']);
      expect(pioneerPark.errors).toHaveLength(1);
      expect(pioneerPark.errors[0].reason).toContain('page 2');

      // The fetch error is surfaced on every calendar, not just one.
      const other = result.find(c => c.name === 'other-events')!;
      expect(other.errors).toHaveLength(1);
      expect(other.errors[0].reason).toContain('page 2');
    });

    test('throws when a page fetch returns a non-OK status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
      vi.stubGlobal('fetch', mockFetch);

      const ripper = new DowntownSeattleRipper();
      await expect(ripper.rip(makeRipper())).rejects.toThrow(/503/);
    });
  });
});
