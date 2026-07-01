import { describe, it, expect } from 'vitest';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { extractSeaMonsterEvents, extractWarmupDataJson } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const NOW = ZonedDateTime.parse('2026-07-01T00:00:00-07:00[America/Los_Angeles]');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

function loadWarmupJson(): string {
    const json = extractWarmupDataJson(loadSampleHtml());
    if (!json) throw new Error('sample-data.html missing wix-warmup-data script');
    return json;
}

describe('SeaMonsterLoungeRipper', () => {
    it('parses events from the sample warmup data with 0 errors', () => {
        const { events, errors } = extractSeaMonsterEvents(loadWarmupJson(), TIMEZONE, NOW);

        expect(errors).toHaveLength(0);
        expect(events.length).toBeGreaterThan(0);
    });

    it('parses summary, date, location, imageUrl, and id for a known event', () => {
        const { events } = extractSeaMonsterEvents(loadWarmupJson(), TIMEZONE, NOW);

        const xray = events.find(e => e.id === 'sea-monster-lounge-x-ray-friends-2026-07-01');
        expect(xray).toBeDefined();
        expect(xray!.summary).toBe('X-Ray & Friends');
        expect(xray!.date.toString()).toContain('2026-07-01T19:30');
        expect(xray!.location).toBe('Sea Monster Lounge, 2202 N 45th St, Seattle, WA 98103');
        expect(xray!.imageUrl).toBe('https://static.wixstatic.com/media/f53b7e_1cf1ea0b00d74466bce2605fbd9d9b2b~mv2.png');
        // Duration derived from startDate/endDate (1.5h in the fixture).
        expect(xray!.duration.toMinutes()).toBe(90);
        expect(xray!.cost).toBeUndefined();
    });

    it('falls back to the default 2-hour duration when endDate equals startDate', () => {
        const { events } = extractSeaMonsterEvents(loadWarmupJson(), TIMEZONE, NOW);

        const noEndTime = events.find(e => e.summary.includes('No End Time Listed Night'));
        expect(noEndTime).toBeDefined();
        expect(noEndTime!.duration.toHours()).toBe(2);
    });

    it('decodes HTML entities in title and description', () => {
        const { events } = extractSeaMonsterEvents(loadWarmupJson(), TIMEZONE, NOW);

        const marmalade = events.find(e => e.id?.startsWith('sea-monster-lounge-marmalade-friends'));
        expect(marmalade).toBeDefined();
        expect(marmalade!.summary).toBe('Marmalade & Friends');
        expect(marmalade!.description).toContain('funk & soul');
        expect(marmalade!.description).not.toContain('&amp;');
    });

    it('excludes events that start before "now"', () => {
        const { events } = extractSeaMonsterEvents(loadWarmupJson(), TIMEZONE, NOW);

        expect(events.find(e => e.summary.includes('Past Jam Session'))).toBeUndefined();
    });

    it('disambiguates recurring same-titled events on different nights with distinct, stable ids', () => {
        const { events: first } = extractSeaMonsterEvents(loadWarmupJson(), TIMEZONE, NOW);
        const { events: second } = extractSeaMonsterEvents(loadWarmupJson(), TIMEZONE, NOW);

        const stingsharks = first.filter(e => e.summary === 'Stingshark');
        expect(stingsharks).toHaveLength(2);

        const ids = stingsharks.map(e => e.id).sort();
        expect(ids).toEqual(['sea-monster-lounge-stingshark-2026-07-09', 'sea-monster-lounge-stingshark-2026-07-16']);

        // Stable across separate parses of the same source content — no Date.now()/random.
        const secondIds = second.filter(e => e.summary === 'Stingshark').map(e => e.id).sort();
        expect(secondIds).toEqual(ids);
    });

    it('does not throw on duplicate ids within a single parse (defensive dedup)', () => {
        const json = JSON.stringify({
            appsWarmupData: {
                '140603ad-af8d-84a5-2c80-a0f60cb47351': {
                    'widgetcomp-kxpbo2ev': {
                        events: {
                            events: [
                                {
                                    title: 'Dup Night',
                                    slug: 'dup-night',
                                    scheduling: { config: { startDate: '2026-07-05T02:00:00.000Z', endDate: '2026-07-05T04:00:00.000Z' } },
                                },
                                {
                                    title: 'Dup Night',
                                    slug: 'dup-night',
                                    scheduling: { config: { startDate: '2026-07-05T02:00:00.000Z', endDate: '2026-07-05T04:00:00.000Z' } },
                                },
                            ],
                        },
                    },
                },
            },
        });

        const { events, errors } = extractSeaMonsterEvents(json, TIMEZONE, NOW);
        expect(errors).toHaveLength(0);
        expect(events).toHaveLength(1);
    });

    it('emits a ParseError for an event missing title/startDate/slug', () => {
        const json = JSON.stringify({
            appsWarmupData: {
                '140603ad-af8d-84a5-2c80-a0f60cb47351': {
                    'widgetcomp-kxpbo2ev': {
                        events: { events: [{ scheduling: { config: {} } }] },
                    },
                },
            },
        });

        const { events, errors } = extractSeaMonsterEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('emits a ParseError (not a throw) when the events.events path is missing', () => {
        const json = JSON.stringify({ appsWarmupData: {} });

        const { events, errors } = extractSeaMonsterEvents(json, TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('emits a ParseError (not a throw) when the warmup JSON itself is malformed', () => {
        const { events, errors } = extractSeaMonsterEvents('{not valid json', TIMEZONE, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('extractWarmupDataJson returns undefined when the wix-warmup-data script tag is absent', () => {
        const html = '<html><head><title>No warmup data here</title></head><body></body></html>';
        expect(extractWarmupDataJson(html)).toBeUndefined();
    });

    it('extractWarmupDataJson finds the script tag regardless of attribute order', () => {
        const html = '<html><head><script id="wix-warmup-data" type="application/json">{"a":1}</script></head></html>';
        expect(extractWarmupDataJson(html)).toBe('{"a":1}');
    });
});
