import { describe, it, expect, vi } from 'vitest';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import AiHouseRipper, {
    extractAiHouseEvents,
    extractNextDataJson,
    extractTicketInfo,
    costFromTicketInfo,
    LumaTicketInfo,
} from './ripper.js';

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

function eventPageHtml(ticketInfo: unknown): string {
    return `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: { pageProps: { initialData: { data: { ticket_info: ticketInfo } } } },
    })}</script></head></html>`;
}

describe('extractTicketInfo', () => {
    it('reads ticket_info from an individual event page', () => {
        const html = eventPageHtml({ price: null, is_free: true, max_price: null, is_sold_out: false });
        expect(extractTicketInfo(html)).toEqual({ price: null, is_free: true, max_price: null, is_sold_out: false });
    });

    it('returns undefined when the __NEXT_DATA__ script tag is absent', () => {
        expect(extractTicketInfo('<html></html>')).toBeUndefined();
    });

    it('returns undefined when the JSON is malformed', () => {
        const html = '<html><head><script id="__NEXT_DATA__">{not json</script></head></html>';
        expect(extractTicketInfo(html)).toBeUndefined();
    });

    it('returns undefined when ticket_info is absent from the data path', () => {
        const html = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { initialData: { data: {} } } } })}</script></head></html>`;
        expect(extractTicketInfo(html)).toBeUndefined();
    });
});

describe('costFromTicketInfo', () => {
    it('maps is_free: true to a free EventCost', () => {
        const ti: LumaTicketInfo = { price: null, is_free: true, max_price: null, is_sold_out: false };
        expect(costFromTicketInfo(ti)).toEqual({ min: 0 });
    });

    it('maps is_sold_out to a soldOut EventCost regardless of price', () => {
        const ti: LumaTicketInfo = { price: 2000, is_free: false, max_price: null, is_sold_out: true };
        expect(costFromTicketInfo(ti)).toEqual({ soldOut: true });
    });

    it('converts a numeric price from cents to dollars', () => {
        const ti: LumaTicketInfo = { price: 2500, is_free: false, max_price: null, is_sold_out: false };
        expect(costFromTicketInfo(ti)).toEqual({ min: 25 });
    });

    it('includes max when max_price is greater than price', () => {
        const ti: LumaTicketInfo = { price: 2500, is_free: false, max_price: 4500, is_sold_out: false };
        expect(costFromTicketInfo(ti)).toEqual({ min: 25, max: 45 });
    });

    it('maps is_free: false with no numeric price to paid-unknown', () => {
        const ti: LumaTicketInfo = { price: null, is_free: false, max_price: null, is_sold_out: false };
        expect(costFromTicketInfo(ti)).toEqual({ paid: true });
    });

    it('returns undefined for an empty/unreadable ticket_info', () => {
        expect(costFromTicketInfo(undefined)).toBeUndefined();
        expect(costFromTicketInfo({})).toBeUndefined();
    });
});

describe('AiHouseRipper.rip() — cost enrichment from each event\'s own Luma page', () => {
    function makeRipperConfig() {
        return {
            config: {
                name: 'ai-house',
                url: new URL('https://luma.com/aihouse'),
                tags: ['Tech', 'Belltown'],
                geo: { lat: 47.614787, lng: -122.355809 },
                disabled: false,
                proxy: false,
                calendars: [{ name: 'calendar', friendlyname: 'AI House', timezone: TIMEZONE }],
            },
        } as any;
    }

    function calendarHtml(entries: unknown[]): string {
        return `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: { pageProps: { initialData: { data: { upcoming: { has_more: false, entries } } } } },
        })}</script></head></html>`;
    }

    it('sets cost free when the event page reports is_free: true', async () => {
        const calendar = calendarHtml([
            { event: { api_id: 'evt-free', name: 'Founder Mixer', start_at: '2026-10-18T17:00:00-07:00', end_at: '2026-10-18T18:00:00-07:00', url: 'evt-free-slug' } },
        ]);
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('evt-free-slug')) {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(eventPageHtml({ price: null, is_free: true, max_price: null, is_sold_out: false })) });
            }
            return Promise.resolve({ ok: true, text: () => Promise.resolve(calendar) });
        });
        vi.stubGlobal('fetch', mockFetch);

        const result = await new AiHouseRipper().rip(makeRipperConfig());
        const { events, errors } = result[0];
        const event = events.find(e => e.id === 'ai-house-evt-free');
        expect(event).toBeDefined();
        expect(event!.cost).toEqual({ min: 0 });
        expect(errors.some(e => 'event' in e && (e as any).event?.id === 'ai-house-evt-free')).toBe(false);

        vi.unstubAllGlobals();
    });

    it('flags cost (without clobbering an existing duration flag) when the detail fetch fails', async () => {
        const calendar = calendarHtml([
            { event: { api_id: 'evt-noend', name: 'AI Governance Panel', start_at: '2026-10-18T17:00:00-07:00', url: 'evt-noend-slug' } },
        ]);
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('evt-noend-slug')) {
                return Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' });
            }
            return Promise.resolve({ ok: true, text: () => Promise.resolve(calendar) });
        });
        vi.stubGlobal('fetch', mockFetch);

        const result = await new AiHouseRipper().rip(makeRipperConfig());
        const { events, errors } = result[0];
        const event = events.find(e => e.id === 'ai-house-evt-noend');
        expect(event).toBeDefined();
        expect(event!.cost).toBeUndefined();

        const uncertainty = errors.find(e => e.type === 'Uncertainty' && 'event' in e && e.event.id === 'ai-house-evt-noend') as any;
        expect(uncertainty).toBeDefined();
        expect(uncertainty.unknownFields.sort()).toEqual(['cost', 'duration']);

        vi.unstubAllGlobals();
    });
});
