import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import ElSuenitoBrewingRipper, { extractWixEvents, isSeattleEvent } from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDate = ZonedDateTime.parse('2026-07-22T00:00:00-07:00[America/Los_Angeles]');

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

function warmupHtml(events: any[]) {
    const warmup = { appsWarmupData: { app1: { widget1: { events: { events } } } } };
    return parse(`<html><body><script type="application/json" id="wix-warmup-data">${JSON.stringify(warmup)}</script></body></html>`);
}

const seattleLocation = {
    name: 'El Sueñito & Frelard Tamales Seattle',
    address: '106 N 36th St, Seattle, WA 98103, USA',
    fullAddress: { city: 'Seattle' },
};

const bellinghamLocation = {
    name: 'Bellingham El Sueñito & Frelard Tamales',
    address: '1926 Humboldt St, Bellingham, WA 98225, USA',
    fullAddress: { city: 'Bellingham' },
};

describe('isSeattleEvent', () => {
    it('keeps events whose structured city is Seattle', () => {
        expect(isSeattleEvent({ id: '1', location: seattleLocation })).toBe(true);
    });

    it('drops events whose structured city is Bellingham', () => {
        expect(isSeattleEvent({ id: '1', location: bellinghamLocation })).toBe(false);
    });

    it('drops events with no location', () => {
        expect(isSeattleEvent({ id: '1' })).toBe(false);
    });

    it('matches case-insensitively and trims whitespace', () => {
        expect(isSeattleEvent({ id: '1', location: { fullAddress: { city: '  SEATTLE  ' } } })).toBe(true);
    });
});

describe('extractWixEvents', () => {
    it('finds the events array under an arbitrary widget id', () => {
        const events = [{ id: 'a' }];
        const warmup = { appsWarmupData: { 'some-app': { 'widgetcomp-xyz': { events: { events } } } } };
        expect(extractWixEvents(warmup)).toEqual(events);
    });

    it('returns an empty array when no events widget is present', () => {
        expect(extractWixEvents({ appsWarmupData: { app: { widget: {} } } })).toEqual([]);
        expect(extractWixEvents({})).toEqual([]);
        expect(extractWixEvents(undefined)).toEqual([]);
    });
});

describe('ElSuenitoBrewingRipper', () => {
    it('parses Seattle events from sample data and filters out Bellingham ones', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = loadSampleHtml();

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents.length).toBeGreaterThan(0);
        for (const event of calEvents) {
            expect(event.location).toBe('El Sueñito & Frelard Tamales, 106 N 36th St Suite 100, Seattle, WA 98103');
        }
        expect(calEvents.some(e => e.summary === 'Trivia Thursday | Bellingham')).toBe(false);
    });

    it('uses the fixed Seattle venue address even when upstream mislabels an event as Bellingham', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = warmupHtml([{
            id: 'mislabeled-event',
            title: 'Blood Drive',
            location: {
                name: 'Bellingham El Sueñito & Frelard Tamales',
                address: '1926 Humboldt St, Bellingham, WA 98225, USA',
                fullAddress: { city: 'Seattle' },
            },
            scheduling: { config: { startDate: '2026-07-31T18:00:00.000Z', endDate: '2026-07-31T20:00:00.000Z' } },
        }]);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].location).toBe('El Sueñito & Frelard Tamales, 106 N 36th St Suite 100, Seattle, WA 98103');
    });

    it('builds a stable id from the Wix event id', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = warmupHtml([{
            id: 'abc-123',
            title: 'Karaoke Night',
            slug: 'karaoke-night',
            location: seattleLocation,
            scheduling: { config: { startDate: '2026-07-24T02:00:00.000Z', endDate: '2026-07-24T04:00:00.000Z' } },
        }]);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].id).toBe('el-suenito-brewing-abc-123');
        expect(calEvents[0].url).toBe('https://www.elsuenitobrewing.com/event-details/karaoke-night');
    });

    it('converts the UTC start/end times to Pacific and computes duration', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = warmupHtml([{
            id: 'time-test',
            title: 'Drag Bingo',
            location: seattleLocation,
            scheduling: { config: { startDate: '2026-08-02T00:00:00.000Z', endDate: '2026-08-02T02:00:00.000Z' } },
        }]);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        // 2026-08-02T00:00:00Z = 2026-08-01 5:00 PM PDT
        expect(calEvents[0].date.hour()).toBe(17);
        expect(calEvents[0].duration.toHours()).toBe(2);
    });

    it('defaults to a 2 hour duration when endDate is missing', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = warmupHtml([{
            id: 'no-end',
            title: 'No End Date Event',
            location: seattleLocation,
            scheduling: { config: { startDate: '2026-08-02T00:00:00.000Z' } },
        }]);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].duration.toHours()).toBe(2);
    });

    it('emits a ParseError for an event with no title', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = warmupHtml([{
            id: 'no-title',
            location: seattleLocation,
            scheduling: { config: { startDate: '2026-08-02T00:00:00.000Z' } },
        }]);

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('emits a ParseError for an event with no start time', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = warmupHtml([{
            id: 'no-date',
            title: 'No Date Event',
            location: seattleLocation,
        }]);

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('deduplicates events across multiple parseEvents calls', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = warmupHtml([{
            id: 'dedup-test',
            title: 'Test Event',
            location: seattleLocation,
            scheduling: { config: { startDate: '2026-08-02T00:00:00.000Z', endDate: '2026-08-02T02:00:00.000Z' } },
        }]);

        const events1 = await ripper.parseEvents(html, testDate, {});
        const events2 = await ripper.parseEvents(html, testDate, {});

        const valid1 = events1.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const valid2 = events2.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(valid1).toHaveLength(1);
        expect(valid2).toHaveLength(0);
    });

    it('handles a missing wix-warmup-data script tag gracefully', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = parse('<html><body>no events here</body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('handles invalid JSON in wix-warmup-data gracefully', async () => {
        const ripper = new ElSuenitoBrewingRipper();
        const html = parse('<html><body><script type="application/json" id="wix-warmup-data">{not valid json</script></body></html>');

        const events = await ripper.parseEvents(html, testDate, {});
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });
});
