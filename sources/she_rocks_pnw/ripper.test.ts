import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { parse } from 'node-html-parser';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import SheRocksPnwRipper, { extractSections, isSeattleAddress, parseTimeRange } from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const html = parse(readFileSync(new URL('./sample-data.html', import.meta.url), 'utf8'));
const zone = ZoneId.of('America/Los_Angeles');

describe('parseTimeRange', () => {
    it('parses "5:30 - 7:30 PM"', () => {
        const t = parseTimeRange('from 5:30 - 7:30 PM. Discounted day pass.')!;
        expect(t.start.toString()).toBe('17:30');
        expect(t.duration.toMinutes()).toBe(120);
    });
    it('parses "7-9pm"', () => {
        const t = parseTimeRange('last Tuesday of the month 7-9pm, please')!;
        expect(t.start.toString()).toBe('19:00');
        expect(t.duration.toMinutes()).toBe(120);
    });
    it('parses "7-8:30 PM"', () => {
        const t = parseTimeRange('from 7-8:30 PM.')!;
        expect(t.start.toString()).toBe('19:00');
        expect(t.duration.toMinutes()).toBe(90);
    });
    it('returns undefined without a range', () => {
        expect(parseTimeRange('Grab a name tag and come find us!')).toBeUndefined();
    });
});

describe('extractSections', () => {
    it('finds each gym with address, year and dates', () => {
        const sections = extractSections(html);
        const edge = sections.find(s => s.name === 'Edgeworks Seattle')!;
        expect(edge.address).toBe('2839 NW Market St, Seattle, WA 98107');
        expect(edge.year).toBe(2026);
        expect(edge.dates).toHaveLength(12);
        const halfMoon = sections.find(s => /half moon/i.test(s.name))!;
        // "2/4 (RESCHEDULED DATE!!!)" is split across paragraphs.
        expect(halfMoon.dates).toHaveLength(12);
        expect(halfMoon.dates[1]).toEqual({ month: 2, day: 4 });
    });
    it('identifies Seattle addresses', () => {
        expect(isSeattleAddress('2759 1st Ave S, Seattle, WA 98134')).toBe(true);
        expect(isSeattleAddress('12300 Beverly Park Rd, Lynnwood, WA 98087')).toBe(false);
    });
});

describe('SheRocksPnwRipper', () => {
    it('emits events only for Seattle gyms', async () => {
        const ripper = new SheRocksPnwRipper();
        const out = await (ripper as any).parseEvents(html, ZonedDateTime.now(zone), {});
        const errors = out.filter((e: any) => 'type' in e);
        expect(errors).toEqual([]);
        const events = out as RipperCalendarEvent[];
        // Edgeworks Seattle, VW Seattle, Half Moon, Momentum: 12 dates each.
        expect(events).toHaveLength(48);
        expect(events.some(e => /Lynnwood|Shoreline/.test(e.location ?? ''))).toBe(false);
        const e = events.find(ev => ev.id === 'edgeworks-seattle-2026-10-15')!;
        expect(e.summary).toBe('She Rocks Gym Night at Edgeworks Seattle');
        expect(e.date.toLocalDateTime().toString()).toBe('2026-10-15T17:30');
        expect(e.duration.toMinutes()).toBe(120);
        expect(e.location).toBe('Edgeworks Seattle, 2839 NW Market St, Seattle, WA 98107');
        const m = events.find(ev => ev.id === 'momentum-2026-10-06')!;
        expect(m.date.toLocalDateTime().toString()).toBe('2026-10-06T18:30');
    });
});
