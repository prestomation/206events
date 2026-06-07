import { describe, expect, test } from 'vitest';
import SewardParkAudubonRipper from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('Seward Park Audubon Ripper', () => {
    test('emits one event per timeslot', async () => {
        const json = loadSample();
        const ripper = new SewardParkAudubonRipper();
        const events = await ripper.parseEvents(json, null as any, null);

        // count total timeslots across all events in sample
        const totalSlots = json.data.reduce((n: number, e: any) => n + e.timeslots.length, 0);
        const parsed = events.filter(e => 'date' in e);
        expect(parsed.length).toBe(totalSlots);
    });

    test('parses Birding for Beginners correctly', async () => {
        const json = loadSample();
        const ripper = new SewardParkAudubonRipper();
        const events = await ripper.parseEvents(json, null as any, null);

        const e = events.find(
            ev => 'summary' in ev && (ev as RipperCalendarEvent).summary === 'Birding for Beginners'
        ) as RipperCalendarEvent;

        expect(e).toBeDefined();
        expect(e.id).toBe('seward-park-audubon-897512-6060084');
        expect(e.date.year()).toBe(2026);
        expect(e.date.monthValue()).toBe(7);
        expect(e.date.dayOfMonth()).toBe(18);
        expect(e.date.hour()).toBe(14);   // 2:00 PM PDT
        expect(e.duration.toMinutes()).toBe(120);
        expect(e.location).toContain('5902 Lake Washington Blvd S');
        expect(e.url).toBe('https://www.mobilize.us/seward-park-audubon/event/897512/');
        expect(e.imageUrl).toBeDefined();
    });

    test('stable IDs use event id and timeslot id', async () => {
        const json = loadSample();
        const ripper = new SewardParkAudubonRipper();
        const events = await ripper.parseEvents(json, null as any, null);

        const ids = events
            .filter(e => 'id' in e)
            .map(e => (e as RipperCalendarEvent).id);

        // all ids start with source prefix
        expect(ids.every(id => id.startsWith('seward-park-audubon-'))).toBe(true);
        // all ids are unique
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('builds location string from API location object', async () => {
        const json = loadSample();
        const ripper = new SewardParkAudubonRipper();
        const events = await ripper.parseEvents(json, null as any, null);

        // Rainier Arts Center events have a different location
        const urbanForest = events.find(
            ev => 'summary' in ev &&
                (ev as RipperCalendarEvent).summary.includes('Urban Forest and Heat Islands')
        ) as RipperCalendarEvent;
        expect(urbanForest).toBeDefined();
        expect(urbanForest.location).toContain('Rainier Arts Center');
        expect(urbanForest.location).toContain('3515 S Alaska St');
    });

    test('returns ParseError for invalid response', async () => {
        const ripper = new SewardParkAudubonRipper();
        const events = await ripper.parseEvents({}, null as any, null);
        expect(events.length).toBe(1);
        expect((events[0] as any).type).toBe('ParseError');
    });

    test('returns ParseError for event with no timeslots', async () => {
        const ripper = new SewardParkAudubonRipper();
        const events = await ripper.parseEvents(
            { data: [{ id: 1, title: 'No Slots', timeslots: [] }] },
            null as any, null
        );
        expect(events.length).toBe(1);
        expect((events[0] as any).type).toBe('ParseError');
    });
});
