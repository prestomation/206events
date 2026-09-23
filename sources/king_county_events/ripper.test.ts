import { describe, expect, test } from 'vitest';
import KingCountyEventsRipper from './ripper.js';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TZ = ZoneId.of('America/Los_Angeles');
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));

async function parse(data: any) {
    const results = await new KingCountyEventsRipper().parseEvents(data, ZonedDateTime.now(TZ), {});
    return {
        events: results.filter((r): r is RipperCalendarEvent => 'date' in r),
        errors: results.filter(r => 'type' in r),
    };
}

describe('KingCountyEventsRipper', () => {
    test('parses public events from the sample with no errors', async () => {
        const { events, errors } = await parse(sample);
        expect(errors).toEqual([]);
        expect(events.length).toBe(11);
        for (const e of events) {
            expect(e.id).toMatch(/^king-county-/);
            expect(e.summary).toBeTruthy();
            expect(e.url).toBeTruthy();
        }
        expect(new Set(events.map(e => e.id)).size).toBe(events.length);
    });

    test('filters out admin rows (closures, hearings, orientations, test rows, online, HHW collections)', async () => {
        const { events } = await parse(sample);
        const titles = events.map(e => e.summary).join('\n');
        expect(titles).not.toMatch(/holiday|Inquest|Orientation|Hello World|Online|Household Hazardous Waste Collection|Pet Adoption Center CLOSED/);
        expect(titles).toContain('Smoke on the Sound');
    });

    test('maps times (floating Pacific), duration, location, coords, and free cost', async () => {
        const { events } = await parse(sample);
        const e = events.find(ev => ev.summary === 'Free Workshop - Composting at Home')!;
        expect(e.date.toLocalDateTime().toString()).toBe('2026-09-23T18:30');
        expect(e.date.zone().id()).toBe('America/Los_Angeles');
        expect(e.duration.toMinutes()).toBe(90);
        expect(e.location).toBe('Skyway Library, 12601 76th Avenue South, Seattle, WA 98178');
        expect(e.lat).toBeCloseTo(47.49057, 4);
        expect(e.lng).toBeCloseTo(-122.2383, 4);
        expect(e.cost).toEqual({ min: 0 });
        expect(e.description).toContain('Composting');
        expect(e.description).not.toContain('<p>');
    });

    test('abbreviates spelled-out compass directions and omits bare-state locations', async () => {
        const { events } = await parse(sample);
        const lakeCity = events.find(ev => ev.summary.includes('Senior Resource Fair'))!;
        expect(lakeCity.location).toContain('33rd Avenue NE');
        const trek = events.find(ev => ev.summary.includes('Transit Trek'))!;
        expect(trek.location).toBeUndefined();
    });

    test('returns a ParseError for rows missing start_time', async () => {
        const { events, errors } = await parse([{ event_name: 'Park Party', parks: true }]);
        expect(events).toEqual([]);
        expect(errors.length).toBe(1);
    });

    test('returns a ParseError for non-array payloads', async () => {
        const { errors } = await parse({ error: true });
        expect(errors.length).toBe(1);
    });
});
