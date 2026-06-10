import { describe, it, expect } from 'vitest';
import { LocalDate } from '@js-joda/core';
import { parse } from 'yaml';
import { RecurringEventProcessor, recurringEventSchema } from './recurring.js';

/**
 * Build a processor from inline YAML text in `events:` form. Bypasses the
 * filesystem so tests don't depend on any directory layout. The string
 * format matches what the live source files contain (with the `events:`
 * wrapper) so existing fixtures stay readable.
 */
function makeProcessor(yamlText: string): RecurringEventProcessor {
  return new RecurringEventProcessor(parse(yamlText));
}

describe('RecurringEventProcessor', () => {
  describe('constructor', () => {
    it('should parse valid YAML configuration', () => {
      const mockYaml = `
events:
  - geo: null
    name: test-event
    friendlyname: "Test Event"
    description: "Test Description"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["test"]
    schedules:
      - schedule: "2nd Thursday"
        start_time: "19:00"
        duration: "PT2H"
`;
      const processor = makeProcessor(mockYaml);
      expect(processor.getEvents()).toHaveLength(1);
      expect(processor.getEvents()[0].name).toBe('test-event');
    });
  });

  describe('generateCalendars', () => {
    it('should generate calendars from recurring events', () => {
      const mockYaml = `
events:
  - geo: null
    name: test-event
    friendlyname: "Test Event"
    description: "Test Description"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["test"]
    schedules:
      - schedule: "2nd Thursday"
        start_time: "19:00"
        duration: "PT2H"
`;


      const processor = makeProcessor(mockYaml);

      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 3, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      expect(calendars[0].name).toBe('test-event');
      expect(calendars[0].friendlyname).toBe('Test Event');
    });

    it('should generate weekly recurring events with "every <day>" schedule', () => {
      const mockYaml = `
events:
  - geo: null
    name: weekly-market
    friendlyname: "Weekly Sunday Market"
    description: "A weekly market every Sunday"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    schedules:
      - schedule: "every Sunday"
        start_time: "10:00"
        duration: "PT5H"
`;


      const processor = makeProcessor(mockYaml);

      // Start on a Wednesday (2024-01-03)
      const startDate = LocalDate.of(2024, 1, 3);
      const endDate = LocalDate.of(2024, 3, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      expect(calendars[0].events).toHaveLength(1);

      const event = calendars[0].events[0];
      // Next Sunday after Jan 3, 2024 is Jan 7
      expect(event.date.dayOfWeek().value()).toBe(7); // Sunday
      expect(event.date.dayOfMonth()).toBe(7);
      expect(event.rrule).toBe('FREQ=WEEKLY;BYDAY=SU');
    });

    it('should generate seasonal weekly recurring events with DTSTART in allowed month', () => {
      const mockYaml = `
events:
  - geo: null
    name: seasonal-market
    friendlyname: "Summer Wednesday Market"
    description: "A seasonal weekly market"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    schedules:
      - schedule: "every Wednesday"
        start_time: "15:00"
        duration: "PT4H"
        seasonal: "summer"
`;


      const processor = makeProcessor(mockYaml);

      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 12, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      expect(event.rrule).toBe('FREQ=YEARLY;BYDAY=WE;BYMONTH=6,7,8,9');
      // DTSTART must be in an allowed month (June-September), not January
      expect(event.date.monthValue()).toBeGreaterThanOrEqual(6);
      expect(event.date.monthValue()).toBeLessThanOrEqual(9);
    });

    it('should set DTSTART in first allowed month when start date is outside months range', () => {
      const mockYaml = `
events:
  - geo: null
    name: columbia-city-market
    friendlyname: "Columbia City Farmers Market"
    description: "Runs May through October"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    schedules:
      - schedule: "every Wednesday"
        start_time: "15:00"
        duration: "PT4H"
        months: [5, 6, 7, 8, 9, 10]
`;


      const processor = makeProcessor(mockYaml);
      // Start in February - outside the May-October range
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 2, 10),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      // DTSTART must be in May (first allowed month), not February
      expect(event.date.monthValue()).toBe(5);
      expect(event.date.dayOfWeek().value()).toBe(3); // Wednesday
      expect(event.rrule).toBe('FREQ=YEARLY;BYDAY=WE;BYMONTH=5,6,7,8,9,10');
    });

    it('should set DTSTART in allowed month for monthly schedule with months restriction', () => {
      const mockYaml = `
events:
  - geo: null
    name: summer-artwalk
    friendlyname: "Summer Art Walk"
    description: "Art walk May through September"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["Artwalk"]
    schedules:
      - schedule: "2nd Wednesday"
        start_time: "18:00"
        duration: "PT4H"
        months: [5, 6, 7, 8, 9]
`;


      const processor = makeProcessor(mockYaml);
      // Start in January - outside the May-September range
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 15),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      // DTSTART must be in May (first allowed month)
      expect(event.date.monthValue()).toBe(5);
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=2WE;BYMONTH=5,6,7,8,9');
    });

    it('should use explicit months array for BYMONTH in RRULE', () => {
      const mockYaml = `
events:
  - geo: null
    name: custom-months-market
    friendlyname: "May-October Market"
    description: "A market running May through October"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    schedules:
      - schedule: "every Wednesday"
        start_time: "15:00"
        duration: "PT4H"
        months: [5, 6, 7, 8, 9, 10]
`;


      const processor = makeProcessor(mockYaml);
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      expect(event.rrule).toBe('FREQ=YEARLY;BYDAY=WE;BYMONTH=5,6,7,8,9,10');
    });

    it('should use explicit months for monthly recurring events', () => {
      const mockYaml = `
events:
  - geo: null
    name: custom-months-artwalk
    friendlyname: "May-September Art Walk"
    description: "An art walk running May through September"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["Artwalk"]
    schedules:
      - schedule: "2nd Wednesday"
        start_time: "18:00"
        duration: "PT4H"
        months: [5, 6, 7, 8, 9]
`;


      const processor = makeProcessor(mockYaml);
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=2WE;BYMONTH=5,6,7,8,9');
    });

    it('should generate compound schedule with "1st and 3rd Tuesday"', () => {
      const mockYaml = `
events:
  - geo: null
    name: open-mic
    friendlyname: "Open Mic Night"
    description: "Twice-monthly open mic"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["OpenMic"]
    schedules:
      - schedule: "1st and 3rd Tuesday"
        start_time: "20:00"
        duration: "PT2H"
`;


      const processor = makeProcessor(mockYaml);

      // Start on Jan 1, 2024 (Monday)
      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 3, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      expect(calendars[0].events).toHaveLength(1);

      const event = calendars[0].events[0];
      // First Tuesday on or after Jan 1 is Jan 2 (1st Tuesday of January)
      expect(event.date.dayOfWeek().value()).toBe(2); // Tuesday
      expect(event.date.dayOfMonth()).toBe(2);
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=1TU,3TU');
    });

    it('should pick earliest ordinal for DTSTART with compound schedule', () => {
      const mockYaml = `
events:
  - geo: null
    name: open-mic
    friendlyname: "Open Mic Night"
    description: "Twice-monthly open mic"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["OpenMic"]
    schedules:
      - schedule: "1st and 3rd Tuesday"
        start_time: "20:00"
        duration: "PT2H"
`;


      const processor = makeProcessor(mockYaml);

      // Start on Jan 10, 2024 — after 1st Tuesday (Jan 2) but before 3rd Tuesday (Jan 16)
      const startDate = LocalDate.of(2024, 1, 10);
      const endDate = LocalDate.of(2024, 3, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      // Should pick 3rd Tuesday (Jan 16) since 1st Tuesday (Jan 2) is before startDate
      expect(event.date.dayOfMonth()).toBe(16);
      expect(event.date.monthValue()).toBe(1);
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=1TU,3TU');
    });

    it('should support compound schedule with month restriction', () => {
      const mockYaml = `
events:
  - geo: null
    name: summer-open-mic
    friendlyname: "Summer Open Mic"
    description: "Twice-monthly open mic in summer"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["OpenMic"]
    schedules:
      - schedule: "2nd and 4th Friday"
        start_time: "19:00"
        duration: "PT2H"
        months: [6, 7, 8]
`;


      const processor = makeProcessor(mockYaml);

      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 12, 31);

      const calendars = processor.generateCalendars(startDate, endDate);

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      expect(event.date.monthValue()).toBe(6); // June (first allowed month)
      expect(event.rrule).toBe('FREQ=MONTHLY;BYDAY=2FR,4FR;BYMONTH=6,7,8');
    });

    it('should prefer explicit months over seasonal when both are provided', () => {
      const mockYaml = `
events:
  - geo: null
    name: override-event
    friendlyname: "Override Event"
    description: "Event with both seasonal and months"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["FarmersMarket"]
    schedules:
      - schedule: "every Thursday"
        start_time: "15:00"
        duration: "PT4H"
        seasonal: "summer"
        months: [4, 5, 6, 7, 8, 9, 10]
`;


      const processor = makeProcessor(mockYaml);
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      const event = calendars[0].events[0];
      // months should take precedence over seasonal
      expect(event.rrule).toBe('FREQ=YEARLY;BYDAY=TH;BYMONTH=4,5,6,7,8,9,10');
    });
  });

  describe('multiple schedules', () => {
    const georgetownYaml = `
events:
  - geo: null
    name: georgetown-trailer-park-mall
    friendlyname: "Georgetown Trailer Park Mall"
    description: "Weekend marketplace"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["MakersMarket"]
    schedules:
      - schedule: "every Saturday"
        start_time: "11:00"
        duration: "PT5H"
      - schedule: "every Sunday"
        start_time: "11:00"
        duration: "PT5H"
`;

    it('should expand multiple schedules into one calendar with multiple events', () => {
      const processor = makeProcessor(georgetownYaml);
      const calendars = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      );

      expect(calendars).toHaveLength(1);
      expect(calendars[0].name).toBe('georgetown-trailer-park-mall');
      expect(calendars[0].events).toHaveLength(2);

      const byDay = new Map(calendars[0].events.map(e => [e.date.dayOfWeek().value(), e]));
      const sat = byDay.get(6)!;
      const sun = byDay.get(7)!;
      expect(sat.rrule).toBe('FREQ=WEEKLY;BYDAY=SA');
      expect(sun.rrule).toBe('FREQ=WEEKLY;BYDAY=SU');
      expect(sat.duration.toHours()).toBe(5);
      expect(sun.duration.toHours()).toBe(5);
      expect(sat.date.hour()).toBe(11);
      expect(sun.date.hour()).toBe(11);
    });

    it('should give multi-schedule events distinct, deterministic ids', () => {
      const processor = makeProcessor(georgetownYaml);
      const startDate = LocalDate.of(2024, 1, 1);
      const endDate = LocalDate.of(2024, 12, 31);

      const ids1 = processor
        .generateCalendars(startDate, endDate)[0]
        .events.map(e => e.id)
        .sort();

      expect(ids1).toEqual([
        'georgetown-trailer-park-mall-every-saturday',
        'georgetown-trailer-park-mall-every-sunday',
      ]);

      // Stable across repeated builds (not derived from index/timestamp/random).
      const ids2 = processor
        .generateCalendars(startDate, endDate)[0]
        .events.map(e => e.id)
        .sort();
      expect(ids2).toEqual(ids1);
    });

    it('should keep id === name for a single-schedule event (no suffix)', () => {
      const mockYaml = `
events:
  - geo: null
    name: solo-event
    friendlyname: "Solo Event"
    description: "One schedule only"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["test"]
    schedules:
      - schedule: "every Sunday"
        start_time: "10:00"
        duration: "PT2H"
`;
      const processor = makeProcessor(mockYaml);
      const calendar = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      )[0];

      expect(calendar.events).toHaveLength(1);
      expect(calendar.events[0].id).toBe('solo-event');
    });

    it('should honor per-entry start_time and months independently', () => {
      const mockYaml = `
events:
  - geo: null
    name: mixed-event
    friendlyname: "Mixed Event"
    description: "Two schedules with different timing"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["test"]
    schedules:
      - schedule: "every Saturday"
        start_time: "09:00"
        duration: "PT2H"
      - schedule: "every Wednesday"
        start_time: "18:00"
        duration: "PT3H"
        months: [6, 7, 8]
`;
      const processor = makeProcessor(mockYaml);
      const events = processor.generateCalendars(
        LocalDate.of(2024, 1, 1),
        LocalDate.of(2024, 12, 31)
      )[0].events;

      const sat = events.find(e => e.date.dayOfWeek().value() === 6)!;
      const wed = events.find(e => e.date.dayOfWeek().value() === 3)!;

      expect(sat.date.hour()).toBe(9);
      expect(sat.rrule).toBe('FREQ=WEEKLY;BYDAY=SA');
      expect(wed.date.hour()).toBe(18);
      // Month-restricted entry uses the YEARLY+BYMONTH workaround.
      expect(wed.rrule).toBe('FREQ=YEARLY;BYDAY=WE;BYMONTH=6,7,8');
      expect(wed.date.monthValue()).toBe(6);
    });
  });
});

describe('recurringEventSchema', () => {
  const baseEvent = {
    name: 'test-event',
    friendlyname: 'Test Event',
    description: 'Test Description',
    timezone: 'America/Los_Angeles',
    location: 'Test Location',
    url: 'https://example.com',
    tags: ['test'],
    geo: null,
  };

  it('should validate correct recurring event data', () => {
    const result = recurringEventSchema.safeParse({
      ...baseEvent,
      schedules: [{ schedule: '2nd Thursday', start_time: '19:00', duration: 'PT2H' }],
    });
    expect(result.success).toBe(true);
  });

  it('should validate recurring event with months field', () => {
    const result = recurringEventSchema.safeParse({
      ...baseEvent,
      schedules: [{ schedule: '2nd Thursday', start_time: '19:00', duration: 'PT2H', months: [5, 6, 7, 8, 9] }],
    });
    expect(result.success).toBe(true);
  });

  it('should validate multiple schedules', () => {
    const result = recurringEventSchema.safeParse({
      ...baseEvent,
      schedules: [
        { schedule: 'every Saturday', start_time: '11:00', duration: 'PT5H' },
        { schedule: 'every Sunday', start_time: '11:00', duration: 'PT5H' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('normalizes `cost: free` and numeric cost; rejects negatives', () => {
    const schedules = [{ schedule: 'every Saturday', start_time: '11:00', duration: 'PT5H' }];
    const free = recurringEventSchema.safeParse({ ...baseEvent, schedules, cost: 'free' });
    expect(free.success).toBe(true);
    expect(free.success && free.data.cost).toEqual({ min: 0 });
    const paid = recurringEventSchema.safeParse({ ...baseEvent, schedules, cost: 10 });
    expect(paid.success && paid.data.cost).toEqual({ min: 10 });
    const negative = recurringEventSchema.safeParse({ ...baseEvent, schedules, cost: -5 });
    expect(negative.success).toBe(false);
  });

  it('applies the declared cost to every generated occurrence', () => {
    const yaml = `
events:
  - geo: null
    name: free-market
    friendlyname: "Free Market"
    description: "Test"
    timezone: "America/Los_Angeles"
    location: "Test Location"
    url: "https://example.com"
    tags: ["test"]
    cost: free
    schedules:
      - schedule: "every Saturday"
        start_time: "11:00"
        duration: "PT5H"
`;
    const calendars = makeProcessor(yaml).generateCalendars(
      LocalDate.parse('2026-06-01'), LocalDate.parse('2026-07-01'));
    expect(calendars[0].events.length).toBeGreaterThan(0);
    for (const e of calendars[0].events) {
      expect(e.cost).toEqual({ min: 0 });
    }
  });

  it('should reject an empty schedules list', () => {
    const result = recurringEventSchema.safeParse({ ...baseEvent, schedules: [] });
    expect(result.success).toBe(false);
  });

  it('should reject a missing schedules list', () => {
    const result = recurringEventSchema.safeParse({ ...baseEvent });
    expect(result.success).toBe(false);
  });

  it('should reject a schedule entry missing start_time', () => {
    const result = recurringEventSchema.safeParse({
      ...baseEvent,
      schedules: [{ schedule: '2nd Thursday', duration: 'PT2H' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject months with invalid values', () => {
    const result = recurringEventSchema.safeParse({
      ...baseEvent,
      schedules: [{ schedule: '2nd Thursday', start_time: '19:00', duration: 'PT2H', months: [0, 13] }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty url', () => {
    const result = recurringEventSchema.safeParse({
      ...baseEvent,
      url: '',
      schedules: [{ schedule: '2nd Thursday', start_time: '19:00', duration: 'PT2H' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid url', () => {
    const result = recurringEventSchema.safeParse({
      ...baseEvent,
      url: 'not-a-url',
      schedules: [{ schedule: '2nd Thursday', start_time: '19:00', duration: 'PT2H' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid event data', () => {
    const result = recurringEventSchema.safeParse({
      name: 'invalid name with spaces',
      friendlyname: 'Test Event',
      // missing required fields
    });
    expect(result.success).toBe(false);
  });
});
