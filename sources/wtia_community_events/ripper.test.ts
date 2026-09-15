import { describe, it, expect } from 'vitest';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { extractWtiaCommunityEvents, extractNextDataJson, parseIsoDurationMinutes } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const NOW = ZonedDateTime.parse('2026-09-15T00:00:00-07:00[America/Los_Angeles]');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function loadNextDataJson(): string {
    const json = extractNextDataJson(loadSampleHtml());
    if (!json) throw new Error('sample-data.html missing __NEXT_DATA__ script');
    return json;
}

describe('WtiaCommunityEventsRipper', () => {
    it('parses upcoming events from the sample data, excluding the past event and the malformed entry', () => {
        const { events, errors } = extractWtiaCommunityEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(events).toHaveLength(4);
        expect(events.find(e => e.id === 'wtia-community-events-evt-past-event')).toBeUndefined();
        expect(events.find(e => e.id === 'wtia-community-events-evt-malformed')).toBeUndefined();
        expect(errors.some(e => e.type === 'ParseError')).toBe(true);
    });

    it('marks a zoom event as a confirmed "Virtual" location, not an uncertainty', () => {
        const { events, errors } = extractWtiaCommunityEvents(loadNextDataJson(), TIMEZONE, NOW);

        const townHall = events.find(e => e.id === 'wtia-community-events-evt-town-hall');
        expect(townHall).toBeDefined();
        expect(townHall!.location).toBe('Virtual');
        expect(errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === townHall!.id)).toBeUndefined();
    });

    it('handles an externally-submitted entry: falls back to the entry api_id, uses the full street address, passes through the external URL, and reads duration_interval', () => {
        const { events, errors } = extractWtiaCommunityEvents(loadNextDataJson(), TIMEZONE, NOW);

        const demoDay = events.find(e => e.id === 'wtia-community-events-calev-founder-demo-day');
        expect(demoDay).toBeDefined();
        expect(demoDay!.location).toBe('thinkspace SEATTLE, 1700 Westlake Ave N #200, Seattle, WA 98109, USA');
        expect(demoDay!.url).toBe('https://members.washingtontechnology.org/calendar/Details/wtia-founder-cohort-14-demo-day-1902483');
        expect(demoDay!.duration.toHours()).toBe(3);
        expect(errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === demoDay!.id)).toBeUndefined();
    });

    it('resolves a luma.com slug URL relative to luma.com', () => {
        const { events } = extractWtiaCommunityEvents(loadNextDataJson(), TIMEZONE, NOW);

        const townHall = events.find(e => e.id === 'wtia-community-events-evt-town-hall');
        expect(townHall!.url).toBe('https://luma.com/8u6jg0mb');
    });

    it('flags location uncertainty when only city/sublocality text is available (no street address)', () => {
        const { events, errors } = extractWtiaCommunityEvents(loadNextDataJson(), TIMEZONE, NOW);

        const vague = events.find(e => e.id === 'wtia-community-events-evt-vague-location');
        expect(vague).toBeDefined();
        expect(vague!.location).toBe('Denny Triangle, Seattle, WA');

        const uncertainty = errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === vague!.id) as any;
        expect(uncertainty).toBeDefined();
        expect(uncertainty.unknownFields).toContain('location');
    });

    it('falls back to the default 1-hour duration and flags duration uncertainty when end_at is absent', () => {
        const { events, errors } = extractWtiaCommunityEvents(loadNextDataJson(), TIMEZONE, NOW);

        const stemConnect = events.find(e => e.id === 'wtia-community-events-evt-no-end-time');
        expect(stemConnect).toBeDefined();
        expect(stemConnect!.duration.toHours()).toBe(1);

        const uncertainty = errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === stemConnect!.id) as any;
        expect(uncertainty).toBeDefined();
        expect(uncertainty.unknownFields).toEqual(['duration']);
    });

    it('emits a ParseError (not a throw) for an event missing api_id/name/start_at', () => {
        const { events, errors } = extractWtiaCommunityEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(errors.some(e => e.type === 'ParseError')).toBe(true);
        expect(events.find(e => e.id === 'wtia-community-events-evt-malformed')).toBeUndefined();
    });

    it('excludes events that start before "now"', () => {
        const { events } = extractWtiaCommunityEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(events.find(e => e.id === 'wtia-community-events-evt-past-event')).toBeUndefined();
    });

    it('dedups on the upstream event api_id, keeping two distinct events on the same calendar day', () => {
        const geo = { geo_address_info: { full_address: 'AI House, 2801 Alaskan Wy, Seattle, WA 98121, USA' } };
        const json = JSON.stringify({
            props: { pageProps: { initialData: { data: { upcoming: { has_more: false, entries: [
                { event: { api_id: 'evt-1', name: 'Tech Mixer', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00', ...geo } },
                { event: { api_id: 'evt-2', name: 'Founder Panel', start_at: '2026-09-18T19:00:00-07:00', end_at: '2026-09-18T20:00:00-07:00', ...geo } },
            ] } } } } },
        });

        const { events, errors } = extractWtiaCommunityEvents(json, TIMEZONE, NOW);
        expect(errors).toHaveLength(0);
        expect(events.map(e => e.id).sort()).toEqual(['wtia-community-events-evt-1', 'wtia-community-events-evt-2']);
    });

    it('does not throw on a duplicate upstream event api_id within a single parse (defensive dedup)', () => {
        const json = JSON.stringify({
            props: { pageProps: { initialData: { data: { upcoming: { has_more: false, entries: [
                { event: { api_id: 'evt-1', name: 'Tech Mixer', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00' } },
                { event: { api_id: 'evt-1', name: 'Tech Mixer', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00' } },
            ] } } } } },
        });

        const { events } = extractWtiaCommunityEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(1);
    });

    it('emits a ParseError (not a throw) when upcoming.entries is missing', () => {
        const json = JSON.stringify({ props: { pageProps: { initialData: { data: {} } } } });

        const { events, errors } = extractWtiaCommunityEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('emits a ParseError (not a throw) when the __NEXT_DATA__ JSON itself is malformed', () => {
        const { events, errors } = extractWtiaCommunityEvents('{not valid json', TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('extractNextDataJson returns undefined when the __NEXT_DATA__ script tag is absent', () => {
        const html = '<html><head><title>No data here</title></head><body></body></html>';
        expect(extractNextDataJson(html)).toBeUndefined();
    });
});

describe('parseIsoDurationMinutes', () => {
    it('parses hours/minutes with zero year/month/day components', () => {
        expect(parseIsoDurationMinutes('P0Y0M0DT3H0M0S')).toBe(180);
    });

    it('parses a plain PT-style duration', () => {
        expect(parseIsoDurationMinutes('PT1H30M')).toBe(90);
    });

    it('returns undefined for an all-zero duration', () => {
        expect(parseIsoDurationMinutes('P0Y0M0DT0H0M0S')).toBeUndefined();
    });

    it('returns undefined (rather than approximating) when the year component is nonzero', () => {
        expect(parseIsoDurationMinutes('P1Y0M0DT3H0M0S')).toBeUndefined();
    });

    it('returns undefined (rather than approximating) when the month component is nonzero', () => {
        expect(parseIsoDurationMinutes('P0Y1M0DT3H0M0S')).toBeUndefined();
    });

    it('returns undefined for an unparseable string', () => {
        expect(parseIsoDurationMinutes('not a duration')).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
        expect(parseIsoDurationMinutes(undefined)).toBeUndefined();
    });
});
