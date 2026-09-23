import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZonedDateTime } from '@js-joda/core';
import StroumJccRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
const date = ZonedDateTime.parse('2026-09-23T00:00:00-07:00[America/Los_Angeles]');

function parse() {
  return new StroumJccRipper().parseEvents(sample, date);
}
function byId(id: string) {
  return parse().find(e => 'id' in e && e.id === id) as RipperCalendarEvent;
}

describe('Stroum JCC Ripper', () => {
  test('parses every sample event without errors', () => {
    const results = parse();
    expect(results).toHaveLength(6);
    expect(results.filter((e): e is RipperError => 'type' in e)).toHaveLength(0);
  });

  test('parses a timed, priced event at the JCC', () => {
    const e = byId('149660');
    expect(e.summary).toBe('Sound Bath for a New Year');
    expect(e.date.toLocalDateTime().toString()).toBe('2026-09-23T19:00');
    expect(e.duration.toMinutes()).toBe(60);
    expect(e.location).toBe('Stroum Jewish Community Center, 3801 E Mercer Way, Mercer Island, WA');
    expect(e.cost).toEqual({ min: 15, max: 18 });
    expect(e.url).toContain('sjcc.org/event/');
    expect(e.imageUrl).toMatch(/^https:\/\//);
  });

  test('decodes HTML entities in titles and leaves cost unset when unpriced', () => {
    const e = byId('149716');
    expect(e.summary).toBe('Local Author Talk: “The Remarkable Rachel Romain”');
    expect(e.cost).toBeUndefined();
  });

  test('leaves location unset for missing and TBA venues', () => {
    expect(byId('149816').location).toBeUndefined();
    expect(byId('151865').location).toBeUndefined();
  });

  test('publishes a months-long all-day exhibit on its opening day', () => {
    const e = byId('150657');
    expect(e.date.toLocalDate().toString()).toBe('2026-10-12');
    expect(e.duration.toDays()).toBe(1);
    expect(e.description).toMatch(/^On view through 2026-12-06\./);
  });

  test('reports a ParseError for a malformed payload', () => {
    const results = new StroumJccRipper().parseEvents({ nope: true }, date);
    expect(results).toHaveLength(1);
    expect('type' in results[0] && results[0].type).toBe('ParseError');
  });
});
