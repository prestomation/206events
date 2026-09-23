import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import SeattleIndivisibleRipper, { buildLocation, isIncluded } from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('Seattle Indivisible Ripper', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    test('keeps only in-person Seattle events sponsored by Seattle Indivisible', async () => {
        const json = loadSample();
        const events = await new SeattleIndivisibleRipper().parseEvents(json, null as any, null);
        const parsed = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        const ids = new Set(parsed.map(e => e.id.split('-')[2]));
        // 878478 General Meeting, 945264 private-address party, 1025021 Stoup, 807188 Woodland Park
        expect([...ids].sort()).toEqual(['1025021', '807188', '878478', '945264']);
        expect(events.filter(e => 'type' in e)).toHaveLength(0);
    });

    test('filter rejects promoted, virtual and out-of-city events', () => {
        const json = loadSample();
        const byId = (id: number) => json.data.find((e: any) => e.id === id);
        expect(isIncluded(byId(274619))).toBe(false); // promoted Swing Left event
        expect(isIncluded(byId(878885))).toBe(false); // virtual
        expect(isIncluded(byId(790454))).toBe(false); // Lynnwood
        expect(isIncluded(byId(878478))).toBe(true);
    });

    test('parses the General Meeting timeslot', async () => {
        const json = loadSample();
        const events = await new SeattleIndivisibleRipper().parseEvents(json, null as any, null);
        const e = events.find(ev => 'id' in ev && (ev as RipperCalendarEvent).id === 'seattle-indivisible-878478-6209500') as RipperCalendarEvent;
        expect(e).toBeDefined();
        expect(e.summary).toBe('Seattle Indivisible General Meeting');
        expect(e.location).toBe('Washington State Labor Council, 321 16th Ave S, Seattle, WA 98144');
        expect(e.url).toBe('https://www.mobilize.us/seattleindivisible/event/878478/');
        expect(e.duration.toMinutes()).toBe(90);
        expect(e.date.zone().id()).toBe('America/Los_Angeles');
        expect(e.cost).toEqual({ min: 0 });
    });

    test('private addresses fall back to city and zip', () => {
        expect(buildLocation({
            venue: 'This event’s address is private. Sign up for more details',
            address_lines: ['This event’s address is private. Sign up for more details', ''],
            locality: 'Seattle', region: 'WA', postal_code: '98115',
        })).toBe('Seattle, WA 98115');
    });

    test('skips timeslots that already ended', () => {
        const ripper = new SeattleIndivisibleRipper();
        const out = ripper.parseEvent({
            id: 1, title: 'X', timezone: 'America/Los_Angeles',
            location: { locality: 'Seattle' },
            timeslots: [
                { id: 1, start_date: 100, end_date: 200 },
                { id: 2, start_date: 1000, end_date: 2000 },
            ],
        }, 500);
        expect(out).toHaveLength(1);
        expect((out[0] as RipperCalendarEvent).id).toBe('seattle-indivisible-1-2');
    });

    test('reports missing data array', async () => {
        const events = await new SeattleIndivisibleRipper().parseEvents({}, null as any, null);
        expect(events[0]).toMatchObject({ type: 'ParseError' });
    });
});
