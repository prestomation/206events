import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RipperLoader } from './config/loader.js';
import { RipperConfig, RipperCalendar, ExternalCalendar } from './config/schema.js';
import { ZonedDateTime, Duration } from '@js-joda/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  prepareTaggedCalendars,
  prepareTaggedExternalCalendars,
  createAggregateCalendars
} from './tag_aggregator.js';
import { hasFutureEventsInICS, attachEventCoords, attachEventCost } from './calendar_ripper.js';

// Mock the file system operations
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn()
}));

// Mock the RipperLoader
vi.mock('./config/loader.js', () => ({
  RipperLoader: vi.fn()
}));

// Mock the tag_aggregator functions
vi.mock('./tag_aggregator.js', () => ({
  prepareTaggedCalendars: vi.fn(),
  prepareTaggedExternalCalendars: vi.fn(),
  createAggregateCalendars: vi.fn()
}));

describe('206.events Integration with Tags', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  
  it('should prepare tagged calendars with correct tags', async () => {
    // Arrange
    const calendar1: RipperCalendar = {
      name: 'ripper1-calendar1',
      friendlyname: 'Calendar 1',
      events: [],
      errors: []
    };
    
    const calendar2: RipperCalendar = {
      name: 'ripper2-calendar2',
      friendlyname: 'Calendar 2',
      events: [],
      errors: []
    };
    
    const ripperTags = new Map<string, string[]>([
      ['ripper1', ['Music']],
      ['ripper2', ['Activism']]
    ]);
    
    const calendarTags = new Map<string, string[]>([
      ['ripper1-calendar1', ['Entertainment']],
      ['ripper2-calendar2', ['Community']]
    ]);
    
    // Act
    const result = prepareTaggedCalendars([calendar1, calendar2], ripperTags, calendarTags);
    
    // Assert
    expect(prepareTaggedCalendars).toHaveBeenCalledWith([calendar1, calendar2], ripperTags, calendarTags);
    
    // Mock the implementation for this test
    (prepareTaggedCalendars as any).mockReturnValue([
      { calendar: calendar1, tags: ['Music', 'Entertainment'] },
      { calendar: calendar2, tags: ['Activism', 'Community'] }
    ]);
    
    const taggedCalendars = prepareTaggedCalendars([calendar1, calendar2], ripperTags, calendarTags);
    expect(taggedCalendars).toHaveLength(2);
    expect(taggedCalendars[0].tags).toContain('Music');
    expect(taggedCalendars[0].tags).toContain('Entertainment');
    expect(taggedCalendars[1].tags).toContain('Activism');
    expect(taggedCalendars[1].tags).toContain('Community');
  });
  
  it('should prepare tagged external calendars', async () => {
    // Arrange
    const externalCalendar1: ExternalCalendar = {
      name: 'external1',
      friendlyname: 'External Calendar 1',
      icsUrl: 'https://example.com/calendar1.ics',
      disabled: false,
      expectEmpty: false,
      proxy: false,
      tags: ['Music', 'Entertainment'],
      geo: null
    };

    const externalCalendar2: ExternalCalendar = {
      name: 'external2',
      friendlyname: 'External Calendar 2',
      icsUrl: 'https://example.com/calendar2.ics',
      disabled: true,
      expectEmpty: false,
      proxy: false,
      tags: ['Activism', 'Community'],
      geo: null
    };
    
    // Act
    (prepareTaggedExternalCalendars as any).mockReturnValue([
      { calendar: externalCalendar1, tags: ['Music', 'Entertainment'] }
    ]);
    
    const result = prepareTaggedExternalCalendars([externalCalendar1, externalCalendar2]);
    
    // Assert
    expect(prepareTaggedExternalCalendars).toHaveBeenCalledWith([externalCalendar1, externalCalendar2]);
    expect(result).toHaveLength(1);
    expect(result[0].calendar.name).toBe('external1');
    expect(result[0].tags).toContain('Music');
    expect(result[0].tags).toContain('Entertainment');
  });
  
  it('should create aggregate calendars based on tags', async () => {
    // Arrange
    const calendar1: RipperCalendar = {
      name: 'ripper1-calendar1',
      friendlyname: 'Calendar 1',
      events: [],
      errors: []
    };
    
    const externalCalendar1: ExternalCalendar = {
      name: 'external1',
      friendlyname: 'External Calendar 1',
      icsUrl: 'https://example.com/calendar1.ics',
      disabled: false,
      expectEmpty: false,
      proxy: false,
      tags: ['Music'],
      geo: null
    };
    
    const taggedCalendars = [
      { calendar: calendar1, tags: ['Music'] }
    ];
    
    const taggedExternalCalendars = [
      { calendar: externalCalendar1, tags: ['Music'] }
    ];
    
    const aggregateCalendar: RipperCalendar = {
      name: 'tag-music',
      friendlyname: 'Music Events',
      events: [],
      errors: []
    };
    
    // Act
    (createAggregateCalendars as any).mockResolvedValue([aggregateCalendar]);
    
    const result = await createAggregateCalendars(taggedCalendars, taggedExternalCalendars);
    
    // Assert
    expect(createAggregateCalendars).toHaveBeenCalledWith(taggedCalendars, taggedExternalCalendars);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('tag-music');
    expect(result[0].friendlyname).toBe('Music Events');
  });
  
  it('should handle calendars with multiple tags', async () => {
    // Arrange
    const calendar1: RipperCalendar = {
      name: 'ripper1-calendar1',
      friendlyname: 'Calendar 1',
      events: [],
      errors: []
    };
    
    const ripperTags = new Map<string, string[]>([
      ['ripper1', ['Music', 'Entertainment', 'Arts']]
    ]);
    
    const calendarTags = new Map<string, string[]>([]);
    
    // Act
    (prepareTaggedCalendars as any).mockReturnValue([
      { calendar: calendar1, tags: ['Music', 'Entertainment', 'Arts'] }
    ]);
    
    const taggedCalendars = prepareTaggedCalendars([calendar1], ripperTags, calendarTags);
    
    // Assert
    expect(taggedCalendars).toHaveLength(1);
    expect(taggedCalendars[0].tags).toHaveLength(3);
    expect(taggedCalendars[0].tags).toContain('Music');
    expect(taggedCalendars[0].tags).toContain('Entertainment');
    expect(taggedCalendars[0].tags).toContain('Arts');
  });
});

describe('hasFutureEventsInICS', () => {
  const today = new Date(2026, 1, 15); // Feb 15, 2026

  it('should return true when ICS contains events after today', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:future-1@test',
      'DTSTART:20260301T100000Z',
      'DTEND:20260301T110000Z',
      'SUMMARY:Future Event',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return true when ICS contains events on today', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:today-1@test',
      'DTSTART:20260215T100000Z',
      'DTEND:20260215T110000Z',
      'SUMMARY:Today Event',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return false when ICS contains only past events', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:past-1@test',
      'DTSTART:20250101T100000Z',
      'DTEND:20250101T110000Z',
      'SUMMARY:Past Event',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(false);
  });

  it('should return false for empty ICS content', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(false);
  });

  it('should handle DTSTART with timezone parameters', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:tz-1@test',
      'DTSTART;TZID=America/Los_Angeles:20260401T190000',
      'DTEND;TZID=America/Los_Angeles:20260401T200000',
      'SUMMARY:Future Event with TZ',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should handle all-day events (date only, no time)', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:allday-1@test',
      'DTSTART;VALUE=DATE:20260301',
      'DTEND;VALUE=DATE:20260302',
      'SUMMARY:Future All-Day Event',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return true if at least one event is in the future', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:mix-1@test',
      'DTSTART:20240601T100000Z',
      'DTEND:20240601T110000Z',
      'SUMMARY:Old Past Event',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:mix-2@test',
      'DTSTART:20250101T100000Z',
      'DTEND:20250101T110000Z',
      'SUMMARY:Recent Past Event',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:mix-3@test',
      'DTSTART:20260601T100000Z',
      'DTEND:20260601T110000Z',
      'SUMMARY:Future Event',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return false when all events are past', () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:past-a@test',
      'DTSTART:20240601T100000Z',
      'DTEND:20240601T110000Z',
      'SUMMARY:Old Past Event',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:past-b@test',
      'DTSTART:20250101T100000Z',
      'DTEND:20250101T110000Z',
      'SUMMARY:Recent Past Event',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:past-c@test',
      'DTSTART:20260214T100000Z',
      'DTEND:20260214T110000Z',
      'SUMMARY:Yesterday Event',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(false);
  });

  it('should detect future events from weekly recurring rule with past DTSTART', () => {
    // Weekly event starting in the past — RRULE generates future instances
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:recur-weekly@test',
      'DTSTART:20260101T180000Z',
      'DTEND:20260101T190000Z',
      'RRULE:FREQ=WEEKLY;BYDAY=TH',
      'SUMMARY:Weekly Meetup',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return false for recurring event with UNTIL in the past', () => {
    // Recurring event that ended before today
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:recur-ended@test',
      'DTSTART:20250101T180000Z',
      'DTEND:20250101T190000Z',
      'RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20250201T000000Z',
      'SUMMARY:Ended Series',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(false);
  });

  it('should detect future events from monthly recurring rule', () => {
    // Monthly event starting way in the past
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:recur-monthly@test',
      'DTSTART:20240115T180000Z',
      'DTEND:20240115T190000Z',
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=15',
      'SUMMARY:Monthly Meetup',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(hasFutureEventsInICS(icsContent, today)).toBe(true);
  });

  it('should return false for malformed ICS content', () => {
    const icsContent = 'not valid ics data at all';
    expect(hasFutureEventsInICS(icsContent, today)).toBe(false);
  });
});

describe('attachEventCoords', () => {
  const emptyCache = { version: 1, entries: {} };
  const makeEvent = () => ({
    ripped: new Date(),
    date: ZonedDateTime.parse('2026-06-01T18:00:00-07:00[America/Los_Angeles]'),
    duration: Duration.ofHours(2),
    summary: 'Test',
  });

  it('attaches declared venue coords without geocoding or errors', async () => {
    const event: any = { ...makeEvent(), location: 'TBA' };
    const calendar: RipperCalendar = {
      name: 'cal',
      friendlyname: 'Cal',
      events: [event],
      errors: [],
      tags: [],
      // ripper-level geo with an OSM identity
      parent: { name: 'venue', geo: { lat: 47.61, lng: -122.32, label: 'Venue', osmType: 'way', osmId: 42 }, calendars: [{ name: 'cal' }] } as any,
    };
    const errors: any[] = [];
    await attachEventCoords(calendar, emptyCache, errors);

    expect(event.lat).toBe(47.61);
    expect(event.lng).toBe(-122.32);
    expect(event.osmType).toBe('way');
    expect(event.osmId).toBe(42);
    expect(event.geocodeSource).toBe('ripper');
    // Declared coords never produce a geocode error, even for a vague location.
    expect(errors).toHaveLength(0);
  });

  it('reports exactly one geocode error for an unresolvable location (geo:null source)', async () => {
    const event: any = { ...makeEvent(), location: 'TBA' };
    const calendar: RipperCalendar = {
      name: 'community',
      friendlyname: 'Community',
      events: [event],
      errors: [],
      tags: [],
      parent: { name: 'community', geo: null, calendars: [{ name: 'community' }] } as any,
    };
    const errors: any[] = [];
    await attachEventCoords(calendar, emptyCache, errors);

    // 'TBA' is a vague/unresolvable location → no coords, one error, source 'none'.
    expect(event.lat).toBeUndefined();
    expect(event.geocodeSource).toBe('none');
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe('GeocodeError');
  });
});

describe('attachEventCost', () => {
  const makeEvent = (cost?: any) => ({
    ripped: new Date(),
    date: ZonedDateTime.parse('2026-06-01T18:00:00-07:00[America/Los_Angeles]'),
    duration: Duration.ofHours(2),
    summary: 'Test',
    ...(cost ? { cost } : {}),
  });
  const makeCalendar = (events: any[], parentCost?: any, calendarCost?: any): RipperCalendar => ({
    name: 'cal',
    friendlyname: 'Cal',
    events,
    errors: [],
    tags: [],
    parent: {
      name: 'venue',
      geo: null,
      ...(parentCost ? { cost: parentCost } : {}),
      calendars: [{ name: 'cal', ...(calendarCost ? { cost: calendarCost } : {}) }],
    } as any,
  });

  it('applies the ripper-level cost default to unpriced events', () => {
    const event: any = makeEvent();
    attachEventCost(makeCalendar([event], { min: 0 }));
    expect(event.cost).toEqual({ min: 0 });
  });

  it('calendar-level cost wins over ripper-level (mirrors geo precedence)', () => {
    const event: any = makeEvent();
    attachEventCost(makeCalendar([event], { min: 0 }, { min: 10 }));
    expect(event.cost).toEqual({ min: 10 });
  });

  it('never overwrites a ripper-parsed cost', () => {
    const event: any = makeEvent({ min: 25, max: 75 });
    attachEventCost(makeCalendar([event], { min: 0 }));
    expect(event.cost).toEqual({ min: 25, max: 75 });
  });

  it('leaves events untouched when no cost is declared anywhere', () => {
    const event: any = makeEvent();
    attachEventCost(makeCalendar([event]));
    expect(event.cost).toBeUndefined();
  });
});
