import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { LocalDateTime, ZonedDateTime, ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { extractTrucks, parseSchedule, parseStopTime, buildEvents } from './ripper.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'sample-data.html'), 'utf8');
const zone = ZoneId.of('America/Los_Angeles');
const pageUrl = 'https://findfoodtrucks.wafoodtrucks.org/';
// The sample was captured on 2026-09-27.
const sampleNow = ZonedDateTime.of(LocalDateTime.of(2026, 9, 27, 0, 0), zone);

describe('extractTrucks', () => {
    it('reads the embedded trucks array without eval', () => {
        const trucks = extractTrucks(html);
        expect(trucks.length).toBe(101);
        expect(trucks[0].truckName).toBe('321 Icecream Parlor');
        expect(trucks.some(t => t.scheduleHtml?.includes('scheduleItem'))).toBe(true);
    });

    it('keeps colons and commas inside string values', () => {
        const trucks = extractTrucks('<script>const trucks = [{a:"x, b: y",n:2,ok:true}];\n</script>');
        expect(trucks).toEqual([{ a: 'x, b: y', n: 2, ok: true }]);
    });

    it('throws when the array is missing', () => {
        expect(() => extractTrucks('<html></html>')).toThrow();
    });
});

describe('parseStopTime', () => {
    it('parses am/pm times', () => {
        expect(parseStopTime('Fri 10/2/2026 4:00:00 pm')!.toString()).toBe('2026-10-02T16:00');
        expect(parseStopTime('Mon 10/5/2026 10:30:00 am')!.toString()).toBe('2026-10-05T10:30');
        expect(parseStopTime('Mon 10/5/2026 12:15:00 am')!.toString()).toBe('2026-10-05T00:15');
        expect(parseStopTime('Mon 10/5/2026 12:15:00 pm')!.toString()).toBe('2026-10-05T12:15');
    });

    it('returns null for bad input', () => {
        expect(parseStopTime('sometime soon')).toBeNull();
    });
});

describe('parseSchedule', () => {
    it('reads location, address, times and coordinates', () => {
        const stops = parseSchedule("<div class='scheduleItem'><a href='https://www.google.com/maps/search/?api=1&query=47.4548341,-122.2523855'>📍</a> <strong>Seattle Boss Markets</strong><br>300 Andover Park W, Tukwila<br>Sun 9/27/2026 12:00:00 pm - Sun 9/27/2026 5:00:00 pm</div>");
        expect(stops).toHaveLength(1);
        const s = stops[0] as any;
        expect(s.locationName).toBe('Seattle Boss Markets');
        expect(s.address).toBe('300 Andover Park W, Tukwila');
        expect(s.start.toString()).toBe('2026-09-27T12:00');
        expect(s.end.toString()).toBe('2026-09-27T17:00');
        expect(s.lat).toBeCloseTo(47.4548341);
        expect(s.lng).toBeCloseTo(-122.2523855);
    });

    it('returns a ParseError for a bad time line', () => {
        const stops = parseSchedule("<div class='scheduleItem'><strong>X</strong><br>addr<br>TBD</div>");
        expect(stops[0]).toMatchObject({ type: 'ParseError' });
    });
});

describe('buildEvents', () => {
    const { events, errors } = buildEvents(extractTrucks(html), pageUrl, zone, sampleNow);

    it('produces Seattle-area stops with no errors', () => {
        expect(errors).toEqual([]);
        expect(events.length).toBeGreaterThan(0);
        const boss = events.find(e => e.summary === 'Bun and Press @ Seattle Boss Markets');
        expect(boss).toBeDefined();
        expect(boss!.location).toBe('Seattle Boss Markets, 300 Andover Park W, Tukwila, WA');
        expect(boss!.date.toLocalDateTime().toString()).toBe('2026-09-27T12:00');
        expect(boss!.duration.toHours()).toBe(5);
        expect(boss!.url).toBe('https://instagram.com/bun_press_food_truck/');
    });

    it('drops stops outside the city map bounds (Tacoma, Spokane, Puyallup)', () => {
        expect(events.some(e => e.location?.includes('Tacoma'))).toBe(false);
        expect(events.some(e => /puyallup/i.test(e.location ?? ''))).toBe(false);
        expect(events.some(e => e.summary.startsWith("Amy's Coffee"))).toBe(false);
    });

    it('gives stable, unique ids', () => {
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain('wa-food-trucks-bun-and-press-2026-09-27-1200');
    });

    it('drops stops that already ended', () => {
        const later = ZonedDateTime.of(LocalDateTime.of(2027, 1, 1, 0, 0), zone);
        expect(buildEvents(extractTrucks(html), pageUrl, zone, later).events).toEqual([]);
    });
});
