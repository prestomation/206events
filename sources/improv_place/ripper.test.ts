import { describe, it, expect } from 'vitest';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { extractImprovPlaceEvents, extractNextDataJson } from './ripper.js';

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

function upcomingEntriesJson(entries: unknown[]): string {
    return JSON.stringify({
        props: { pageProps: { initialData: { data: { upcoming: { has_more: false, entries } } } } },
    });
}

describe('ImprovPlaceRipper', () => {
    it('parses upcoming events from the sample data, reporting the malformed entry and one duration + one location uncertainty', () => {
        const { events, errors } = extractImprovPlaceEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(errors.filter(e => e.type === 'ParseError')).toHaveLength(1);
        expect(errors.filter(e => e.type === 'Uncertainty')).toHaveLength(2);
        expect(events).toHaveLength(3);
    });

    it('uses the full street address when Luma publishes one', () => {
        const { events } = extractImprovPlaceEvents(loadNextDataJson(), TIMEZONE, NOW);

        const bipocJam = events.find(e => e.id === 'improv-place-evt-bipoc-jam-1');
        expect(bipocJam).toBeDefined();
        expect(bipocJam!.summary).toBe('Unite: A BIPOC Improv Jam');
        expect(bipocJam!.date.toString()).toContain('2026-10-07T18:00');
        expect(bipocJam!.location).toBe('Langston Hughes Performing Arts Institute, 104 17th Ave S, Seattle, WA 98144, USA');
        expect(bipocJam!.url).toBe('https://luma.com/c4cu0ai6');
        expect(bipocJam!.duration.toMinutes()).toBe(120);
    });

    it('falls back to a neighborhood-level location and flags it as uncertain when the address is obfuscated', () => {
        const { events, errors } = extractImprovPlaceEvents(loadNextDataJson(), TIMEZONE, NOW);

        const flowSeattleCenter = events.find(e => e.id === 'improv-place-evt-flow-seattle-center-1');
        expect(flowSeattleCenter).toBeDefined();
        expect(flowSeattleCenter!.location).toBe('Uptown, Seattle, WA');

        const uncertainty = errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === flowSeattleCenter!.id);
        expect(uncertainty).toBeDefined();
        expect((uncertainty as any).unknownFields).toEqual(['location']);
    });

    it('falls back to the default 1-hour duration and flags duration uncertainty when end_at is absent', () => {
        const { events, errors } = extractImprovPlaceEvents(loadNextDataJson(), TIMEZONE, NOW);

        const worldJam = events.find(e => e.id === 'improv-place-evt-no-end-time');
        expect(worldJam).toBeDefined();
        expect(worldJam!.duration.toHours()).toBe(1);

        const uncertainty = errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === worldJam!.id);
        expect(uncertainty).toBeDefined();
        expect((uncertainty as any).unknownFields).toEqual(['duration', 'location']);
    });

    it('excludes events that start before "now"', () => {
        const { events } = extractImprovPlaceEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(events.find(e => e.id === 'improv-place-evt-past-event')).toBeUndefined();
    });

    it('emits a ParseError (not a throw) for an event missing api_id/name/start_at', () => {
        const { events, errors } = extractImprovPlaceEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(errors.some(e => e.type === 'ParseError')).toBe(true);
        expect(events.find(e => e.id === 'improv-place-evt-malformed')).toBeUndefined();
    });

    it('dedups on the upstream event api_id, keeping two distinct events that happen to fall on the same calendar day', () => {
        const json = upcomingEntriesJson([
            { event: { api_id: 'evt-1', name: 'Jam Night', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00', geo_address_info: { full_address: '123 Main St, Seattle, WA' } } },
            { event: { api_id: 'evt-2', name: 'Workshop', start_at: '2026-09-18T19:00:00-07:00', end_at: '2026-09-18T20:00:00-07:00', geo_address_info: { full_address: '123 Main St, Seattle, WA' } } },
        ]);

        const { events, errors } = extractImprovPlaceEvents(json, TIMEZONE, NOW);
        expect(errors).toHaveLength(0);
        expect(events.map(e => e.id).sort()).toEqual(['improv-place-evt-1', 'improv-place-evt-2']);
    });

    it('does not throw on a duplicate upstream event api_id within a single parse (defensive dedup)', () => {
        const json = upcomingEntriesJson([
            { event: { api_id: 'evt-1', name: 'Jam Night', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00', geo_address_info: { full_address: '123 Main St, Seattle, WA' } } },
            { event: { api_id: 'evt-1', name: 'Jam Night', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00', geo_address_info: { full_address: '123 Main St, Seattle, WA' } } },
        ]);

        const { events } = extractImprovPlaceEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(1);
    });

    it('emits a ParseError (not a throw) when upcoming.entries is missing', () => {
        const json = JSON.stringify({ props: { pageProps: { initialData: { data: {} } } } });

        const { events, errors } = extractImprovPlaceEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('emits a ParseError (not a throw) when the __NEXT_DATA__ JSON itself is malformed', () => {
        const { events, errors } = extractImprovPlaceEvents('{not valid json', TIMEZONE, NOW);
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
