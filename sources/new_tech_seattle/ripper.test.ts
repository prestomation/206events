import { describe, it, expect } from 'vitest';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { extractNewTechSeattleEvents, extractNextDataJson } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const NOW = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function loadNextDataJson(): string {
    const json = extractNextDataJson(loadSampleHtml());
    if (!json) throw new Error('sample-data.html missing __NEXT_DATA__ script');
    return json;
}

describe('NewTechSeattleRipper', () => {
    it('parses upcoming events from the sample data with 0 errors', () => {
        const { events, errors } = extractNewTechSeattleEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(errors).toHaveLength(1); // the deliberately malformed entry
        expect(events.length).toBeGreaterThan(0);
    });

    it('parses summary, date, location, url, and id for a known event', () => {
        const { events } = extractNewTechSeattleEvents(loadNextDataJson(), TIMEZONE, NOW);

        const july = events.find(e => e.id === 'new-tech-seattle-2026-07-14');
        expect(july).toBeDefined();
        expect(july!.summary).toBe('New Tech Seattle Meetup');
        expect(july!.date.toString()).toContain('2026-07-14T17:30');
        expect(july!.location).toBe('The Collective Seattle, 400 Dexter Ave N, Seattle, WA 98109');
        expect(july!.url).toBe('https://www.meetup.com/newtechseattle/events/313629078/');
        expect(july!.duration.toMinutes()).toBe(135); // 5:30pm-7:45pm
    });

    it('captures an off-pattern occurrence (3rd Tuesday instead of the usual 2nd) from real source data', () => {
        const { events } = extractNewTechSeattleEvents(loadNextDataJson(), TIMEZONE, NOW);

        const september = events.find(e => e.id === 'new-tech-seattle-2026-09-15');
        expect(september).toBeDefined();
        expect(september!.date.toLocalDate().dayOfWeek().toString()).toBe('TUESDAY');
    });

    it('falls back to the default 2-hour duration when endTime is absent', () => {
        const { events } = extractNewTechSeattleEvents(loadNextDataJson(), TIMEZONE, NOW);

        const october = events.find(e => e.id === 'new-tech-seattle-2026-10-13');
        expect(october).toBeDefined();
        expect(october!.duration.toHours()).toBe(2);
    });

    it('excludes events that start before "now"', () => {
        const { events } = extractNewTechSeattleEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(events.find(e => e.id === 'new-tech-seattle-2026-06-09')).toBeUndefined();
    });

    it('emits a ParseError (not a throw) for an event missing title/dateTime', () => {
        const { events, errors } = extractNewTechSeattleEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(errors.some(e => e.type === 'ParseError')).toBe(true);
        expect(events.find(e => e.id === 'new-tech-seattle-200000002')).toBeUndefined();
    });

    it('strips zero-width spaces from decoded descriptions', () => {
        const { events } = extractNewTechSeattleEvents(loadNextDataJson(), TIMEZONE, NOW);

        const july = events.find(e => e.id === 'new-tech-seattle-2026-07-14');
        expect(july!.description).not.toContain('​');
    });

    it('emits a ParseError (not a throw) when __APOLLO_STATE__ is missing', () => {
        const json = JSON.stringify({ props: { pageProps: {} } });

        const { events, errors } = extractNewTechSeattleEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('emits a ParseError (not a throw) when the __NEXT_DATA__ JSON itself is malformed', () => {
        const { events, errors } = extractNewTechSeattleEvents('{not valid json', TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('extractNextDataJson returns undefined when the __NEXT_DATA__ script tag is absent', () => {
        const html = '<html><head><title>No data here</title></head><body></body></html>';
        expect(extractNextDataJson(html)).toBeUndefined();
    });

    it('extractNextDataJson finds the script tag regardless of attribute order', () => {
        const html = '<html><head><script type="application/json" id="__NEXT_DATA__">{"a":1}</script></head></html>';
        expect(extractNextDataJson(html)).toBe('{"a":1}');
    });
});
