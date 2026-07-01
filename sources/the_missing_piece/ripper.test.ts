import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZonedDateTime } from '@js-joda/core';
import TheMissingPieceRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData() {
  const jsonPath = path.join(__dirname, 'sample-data.json');
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

describe('The Missing Piece Ripper', () => {
  test('parses all sample events without errors', () => {
    const ripper = new TheMissingPieceRipper();
    const date = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');
    const results = ripper.parseEvents(loadSampleData(), date);

    expect(results).toHaveLength(4);
    const errors = results.filter((e): e is RipperError => 'type' in e);
    expect(errors).toHaveLength(0);
  });

  test('parses a free event with no cost data', () => {
    const ripper = new TheMissingPieceRipper();
    const date = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');
    const results = ripper.parseEvents(loadSampleData(), date);
    const event = results.find(e => 'summary' in e && e.summary === 'Scrabble Night') as RipperCalendarEvent;

    expect(event).toBeDefined();
    expect(event.id).toBe('10004147');
    expect(event.cost).toBeUndefined();
    expect(event.location).toContain('4707 California Ave SW');
    expect(event.location).toContain('Seattle');
    expect(event.imageUrl).toContain('.jpg');
    expect(event.date.year()).toBe(2026);
    expect(event.date.monthValue()).toBe(6);
    expect(event.date.dayOfMonth()).toBe(30);
    expect(event.date.hour()).toBe(18);
    expect(event.duration.toHours()).toBe(4);
  });

  test('parses a flat-priced ticketed event', () => {
    const ripper = new TheMissingPieceRipper();
    const date = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');
    const results = ripper.parseEvents(loadSampleData(), date);
    const event = results.find(e => 'summary' in e && e.summary === 'One Piece OP-17 Release Event') as RipperCalendarEvent;

    expect(event).toBeDefined();
    expect(event.cost).toEqual({ min: 35 });
  });

  test('parses a free-to-paid price range event', () => {
    const ripper = new TheMissingPieceRipper();
    const date = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');
    const results = ripper.parseEvents(loadSampleData(), date);
    const event = results.find(e => 'summary' in e && e.summary === '500 Piece Jigsaw Puzzle Race!') as RipperCalendarEvent;

    expect(event).toBeDefined();
    expect(event.cost).toEqual({ min: 0, max: 5 });
  });

  test('decodes HTML entities in title', () => {
    const ripper = new TheMissingPieceRipper();
    const date = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');
    const results = ripper.parseEvents(loadSampleData(), date);
    const event = results.find(e => 'summary' in e && (e as RipperCalendarEvent).summary.includes('Mah Jongg')) as RipperCalendarEvent;

    expect(event.summary).toBe('American Mah Jongg');
  });

  test('ignores non-numeric cost values instead of producing NaN', () => {
    const ripper = new TheMissingPieceRipper();
    const date = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');
    const sample = loadSampleData();
    const scrabble = sample.events.find((e: any) => e.title === 'Scrabble Night');
    const malformed = { ...scrabble, id: 99999999, cost_details: { values: ['TBD', 'also-not-a-number'] } };

    const results = ripper.parseEvents({ events: [malformed] }, date);
    const event = results[0] as RipperCalendarEvent;

    expect(event.cost).toBeUndefined();
  });

  test('returns a ParseError when the events array is missing', () => {
    const ripper = new TheMissingPieceRipper();
    const date = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');
    const results = ripper.parseEvents({}, date);

    expect(results).toHaveLength(1);
    expect((results[0] as RipperError).type).toBe('ParseError');
  });
});
