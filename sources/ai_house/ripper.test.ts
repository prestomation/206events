import { describe, it, expect } from 'vitest';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { extractAiHouseEvents, extractNextDataJson } from './ripper.js';

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

describe('AiHouseRipper', () => {
    it('parses upcoming events from the sample data, reporting the malformed entry and the missing-end_at uncertainty', () => {
        const { events, errors } = extractAiHouseEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(errors.filter(e => e.type === 'ParseError')).toHaveLength(1);
        expect(errors.filter(e => e.type === 'Uncertainty')).toHaveLength(1);
        expect(events).toHaveLength(3);
    });

    it('parses summary, date, location, url, and id for a known event', () => {
        const { events } = extractAiHouseEvents(loadNextDataJson(), TIMEZONE, NOW);

        const showcase = events.find(e => e.id === 'ai-house-evt-founder-showcase-1');
        expect(showcase).toBeDefined();
        expect(showcase!.summary).toBe('Founder Showcase');
        expect(showcase!.date.toString()).toContain('2026-09-18T10:00');
        expect(showcase!.location).toBe('AI House, 2801 Alaskan Wy, Seattle, WA 98121');
        expect(showcase!.url).toBe('https://luma.com/aihouse-4ift');
        expect(showcase!.imageUrl).toBe('https://images.lumacdn.com/event-covers/founder-showcase.jpg');
        expect(showcase!.duration.toMinutes()).toBe(120);
    });

    it('falls back to the default 1-hour duration and emits an Uncertainty error when end_at is absent', () => {
        const { events, errors } = extractAiHouseEvents(loadNextDataJson(), TIMEZONE, NOW);

        const governance = events.find(e => e.id === 'ai-house-evt-no-end-time');
        expect(governance).toBeDefined();
        expect(governance!.duration.toHours()).toBe(1);

        const uncertainty = errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === governance!.id);
        expect(uncertainty).toBeDefined();
        expect((uncertainty as any).unknownFields).toEqual(['duration']);
    });

    it('does not emit an Uncertainty error when end_at is present', () => {
        const { errors } = extractAiHouseEvents(loadNextDataJson(), TIMEZONE, NOW);

        const showcaseUncertainty = errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === 'ai-house-evt-founder-showcase-1');
        expect(showcaseUncertainty).toBeUndefined();
    });

    it('excludes events that start before "now"', () => {
        const { events } = extractAiHouseEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(events.find(e => e.id === 'ai-house-evt-past-event')).toBeUndefined();
    });

    it('emits a ParseError (not a throw) for an event missing api_id/name/start_at', () => {
        const { events, errors } = extractAiHouseEvents(loadNextDataJson(), TIMEZONE, NOW);

        expect(errors.some(e => e.type === 'ParseError')).toBe(true);
        expect(events.find(e => e.id === 'ai-house-evt-malformed')).toBeUndefined();
    });

    it('dedups on the upstream event api_id, keeping two distinct events that happen to fall on the same calendar day', () => {
        const json = upcomingEntriesJson([
            { event: { api_id: 'evt-1', name: 'Pitch Please', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00' } },
            { event: { api_id: 'evt-2', name: 'Founder Mixer', start_at: '2026-09-18T19:00:00-07:00', end_at: '2026-09-18T20:00:00-07:00' } },
        ]);

        const { events, errors } = extractAiHouseEvents(json, TIMEZONE, NOW);
        expect(errors).toHaveLength(0);
        expect(events.map(e => e.id).sort()).toEqual(['ai-house-evt-1', 'ai-house-evt-2']);
    });

    it('does not throw on a duplicate upstream event api_id within a single parse (defensive dedup)', () => {
        const json = upcomingEntriesJson([
            { event: { api_id: 'evt-1', name: 'Pitch Please', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00' } },
            { event: { api_id: 'evt-1', name: 'Pitch Please', start_at: '2026-09-18T17:00:00-07:00', end_at: '2026-09-18T18:30:00-07:00' } },
        ]);

        const { events } = extractAiHouseEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(1);
    });

    it('emits a ParseError (not a throw) when upcoming.entries is missing', () => {
        const json = JSON.stringify({ props: { pageProps: { initialData: { data: {} } } } });

        const { events, errors } = extractAiHouseEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('emits a ParseError (not a throw) when the __NEXT_DATA__ JSON itself is malformed', () => {
        const { events, errors } = extractAiHouseEvents('{not valid json', TIMEZONE, NOW);
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
