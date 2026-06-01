import { describe, it, expect } from 'vitest';
import { toICS, RipperCalendar, RipperCalendarEvent, externalCalendarSchema } from './schema.js';
import { ZonedDateTime, Duration } from '@js-joda/core';

function makeEvent(overrides: Partial<RipperCalendarEvent> = {}): RipperCalendarEvent {
  return {
    id: 'test-1',
    ripped: new Date(),
    date: ZonedDateTime.parse('2025-06-01T18:00:00-07:00[America/Los_Angeles]'),
    duration: Duration.ofHours(2),
    summary: 'Test Event',
    ...overrides,
  };
}

function makeCalendar(events: RipperCalendarEvent[]): RipperCalendar {
  return {
    name: 'test-calendar',
    friendlyname: 'Test Calendar',
    events,
    errors: [],
    tags: [],
  };
}

/** Extract the DESCRIPTION value from an ICS string, handling ICS line folding */
function extractDescription(ics: string): string | undefined {
  // ICS uses line folding: long lines are split with \r\n followed by a space or tab
  const match = ics.match(/DESCRIPTION:([\s\S]*?)(?:\r?\n[A-Z])/);
  if (!match) return undefined;
  // Unfold: remove \r\n + space/tab (line continuation)
  const raw = match[1].replace(/\r?\n[ \t]/g, '');
  // Unescape ICS escapes
  return raw.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\');
}

describe('toICS', () => {
  describe('calendar name in aggregate event descriptions', () => {
    it('should append calendar name at end of description with URL', async () => {
      const event = makeEvent({
        description: 'A great concert',
        url: 'https://example.com/event',
        sourceCalendar: 'Stoup Brewing',
        sourceCalendarName: 'stoup-brewing',
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).toContain('A great concert');
      expect(desc).toContain('https://example.com/event');
      expect(desc).toContain('From Stoup Brewing');
      // Calendar name should come AFTER the URL
      const urlIndex = desc!.indexOf('https://example.com/event');
      const fromIndex = desc!.indexOf('From Stoup Brewing');
      expect(fromIndex).toBeGreaterThan(urlIndex);
    });

    it('should append calendar name at end when event has no URL', async () => {
      const event = makeEvent({
        description: 'A great concert',
        sourceCalendar: 'Stoup Brewing',
        sourceCalendarName: 'stoup-brewing',
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).toContain('A great concert');
      expect(desc).toContain('From Stoup Brewing');
    });

    it('should show calendar name when event has no description but has URL', async () => {
      const event = makeEvent({
        description: undefined,
        url: 'https://example.com/event',
        sourceCalendar: 'Stoup Brewing',
        sourceCalendarName: 'stoup-brewing',
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).toContain('https://example.com/event');
      expect(desc).toContain('From Stoup Brewing');
    });

    it('should show only calendar name when event has no description or URL', async () => {
      const event = makeEvent({
        description: undefined,
        url: undefined,
        sourceCalendar: 'Stoup Brewing',
        sourceCalendarName: 'stoup-brewing',
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).toContain('From Stoup Brewing');
    });

    it('should not add calendar name for non-aggregate events', async () => {
      const event = makeEvent({
        description: 'A great concert',
        url: 'https://example.com/event',
        // No sourceCalendar set = not an aggregate event
      });
      const ics = await toICS(makeCalendar([event]));

      const desc = extractDescription(ics);
      expect(desc).not.toContain('From');
    });
  });

  describe('multiple RRULE events in one calendar', () => {
    it('gives each VEVENT its own DTSTART;TZID with the correct local time', async () => {
      // Two recurring schedules in one calendar with DISTINCT start times.
      // The DTSTART;TZID post-process must align each converted DTSTART with
      // the right VEVENT (it converts the first remaining `DTSTART:...Z` per
      // event, relying on VEVENT order matching calendar.events order).
      const saturday = makeEvent({
        id: 'evt-sat',
        date: ZonedDateTime.parse('2025-06-07T11:00:00-07:00[America/Los_Angeles]'),
        duration: Duration.ofHours(5),
        summary: 'Saturday Market',
        rrule: 'FREQ=WEEKLY;BYDAY=SA',
      });
      const sunday = makeEvent({
        id: 'evt-sun',
        date: ZonedDateTime.parse('2025-06-08T14:00:00-07:00[America/Los_Angeles]'),
        duration: Duration.ofHours(3),
        summary: 'Sunday Market',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
      });

      const ics = await toICS(makeCalendar([saturday, sunday]));

      // Both local times present, each with the LA TZID.
      expect(ics).toContain('DTSTART;TZID=America/Los_Angeles:20250607T110000');
      expect(ics).toContain('DTSTART;TZID=America/Los_Angeles:20250608T140000');
      // No unconverted UTC DTSTART left behind.
      expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
    });
  });
});

describe('externalCalendarSchema', () => {
  const base = {
    name: 'example',
    friendlyname: 'Example Feed',
    icsUrl: 'https://example.com/cal.ics',
    geo: null,
  };

  it('defaults proxy to false when omitted', () => {
    const parsed = externalCalendarSchema.parse(base);
    expect(parsed.proxy).toBe(false);
  });

  it('accepts proxy: "outofband"', () => {
    const parsed = externalCalendarSchema.parse({ ...base, proxy: 'outofband' });
    expect(parsed.proxy).toBe('outofband');
  });

  it('rejects unknown proxy values', () => {
    const result = externalCalendarSchema.safeParse({ ...base, proxy: 'lambda' });
    expect(result.success).toBe(false);
  });

  it('rejects proxy: true', () => {
    const result = externalCalendarSchema.safeParse({ ...base, proxy: true });
    expect(result.success).toBe(false);
  });
});
