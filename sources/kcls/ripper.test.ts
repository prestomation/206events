import { describe, expect, test } from 'vitest';
import KCLSRipper, { BCPage, Entities } from './ripper.js';
import { LocalDateTime, ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TZ = ZoneId.of('America/Los_Angeles');
const sample: BCPage = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
const WINDOW_START = LocalDateTime.parse('2026-09-24T00:00');
const WINDOW_END = LocalDateTime.parse('2026-11-05T00:00');

function entitiesOf(page: BCPage): Entities {
    return {
        locations: page.entities?.locations ?? {},
        places: page.entities?.places ?? {},
        images: page.entities?.images ?? {},
    };
}

function makeRipper() {
    return {
        config: {
            name: 'kcls',
            calendars: [
                { name: 'bellevue', friendlyname: 'KCLS - Bellevue', timezone: TZ, config: { branchId: '1492' }, tags: ['Bellevue'] },
                { name: 'des-moines', friendlyname: 'KCLS - Des Moines', timezone: TZ, config: { branchId: '1502' }, tags: ['Des Moines'] },
                { name: 'other-locations', friendlyname: 'KCLS - Other Locations', timezone: TZ, config: { otherLocations: true } },
            ],
        },
    } as any;
}

function build(page: BCPage = sample) {
    const r = new KCLSRipper();
    return r.buildCalendars(makeRipper(), KCLSRipper.pageEvents(page), entitiesOf(page), WINDOW_START, WINDOW_END);
}

describe('KCLSRipper', () => {
    test('pageEvents resolves item ids to event entities in order', () => {
        const events = KCLSRipper.pageEvents(sample);
        expect(events.length).toBe(sample.events!.items!.length);
        expect(events[0].id).toBe(sample.events!.items![0]);
    });

    test('routes events to branch calendars with no parse errors', () => {
        const cals = build();
        for (const c of cals) expect(c.errors).toEqual([]);
        const bellevue = cals.find(c => c.name === 'bellevue')!;
        expect(bellevue.events.map(e => e.summary)).toEqual(['One-on-One Ancestry Help', 'Preschool Story Time']);
        const e = bellevue.events[0];
        expect(e.location).toBe('KCLS Bellevue Library, 1111 110th Avenue NE, Bellevue, WA 98004');
        expect(e.url).toMatch(/^https:\/\/kcls\.bibliocommons\.com\/v2\/events\/[0-9a-f]+$/);
        expect(e.id).toMatch(/^kcls-[0-9a-f]+$/);
        expect(e.date.toLocalDateTime().toString()).toBe('2026-09-24T10:30');
        expect(e.duration.toMinutes()).toBe(120);
        // Branch calendars take their geo from the YAML, not the ripper.
        expect(e.lat).toBeUndefined();
    });

    test('parses date-only (all-day) events with inclusive end dates', () => {
        const desMoines = build().find(c => c.name === 'des-moines')!;
        const swaps = desMoines.events.filter(e => e.summary === 'Fall Plant Swap');
        expect(swaps.length).toBe(6);
        expect(swaps[0].date.toLocalDateTime().toString()).toBe('2026-09-28T00:00');
        expect(swaps[0].duration.toDays()).toBe(1);
    });

    test('drops online-only events and ongoing programs that began before the window', () => {
        const all = build().flatMap(c => c.events);
        const titles = all.map(e => e.summary);
        expect(titles).not.toContain('Math Club Online: Core Math 6th Grade');
        expect(titles).not.toContain('Sharing Your Screen Safely!');
        expect(titles).not.toContain('Story Walk at SeaTac Des Moines Creek Park');
        expect(titles).not.toContain('Family Story Time at the Crossroads Community Center');
        for (const e of all) expect(e.date.toLocalDateTime().isBefore(WINDOW_START)).toBe(false);
    });

    test('catch-all calendar gets non-branch places and unconfigured branches, with coordinates', () => {
        const other = build().find(c => c.name === 'other-locations')!;
        const place = other.events.find(e => e.summary === 'Story Time at the Issaquah Farmers Market')!;
        expect(place).toBeDefined();
        expect(place.lat).toBeTypeOf('number');
        expect(place.lng).toBeTypeOf('number');
        expect(place.geocodeSource).toBe('ripper');
        const unconfigured = other.events.find(e => e.summary === 'Ajolote Mixed Media Art Workshop')!;
        expect(unconfigured.location).toContain('KCLS Greenbridge Library');
        expect(unconfigured.lat).toBeTypeOf('number');
    });

    test('descriptions are plain text with room details', () => {
        const all = build().flatMap(c => c.events);
        const withDesc = all.filter(e => e.description);
        expect(withDesc.length).toBeGreaterThan(0);
        for (const e of withDesc) expect(e.description).not.toMatch(/<\/?p>/);
    });

    test('skips an event at a place named "Online"', () => {
        const page: BCPage = {
            events: { items: ['a'] },
            entities: {
                events: { a: { id: 'a', definition: { start: '2026-09-25T10:00', title: 'Web talk', nonBranchLocationId: 'p' } } },
                places: { p: { id: 'p', name: 'Online' } },
            },
        };
        expect(build(page).flatMap(c => c.events)).toEqual([]);
    });

    test('returns a ParseError for an event missing a start', () => {
        const page: BCPage = {
            events: { items: ['a'] },
            entities: {
                events: { a: { id: 'a', definition: { title: 'No start', branchLocationId: '1492' } } },
                locations: sample.entities!.locations,
            },
        };
        const bellevue = build(page).find(c => c.name === 'bellevue')!;
        expect(bellevue.events).toEqual([]);
        expect(bellevue.errors.length).toBe(1);
    });

    test('ripper.yaml branch calendars have unique names, branch ids, and geo', () => {
        const cfg = yaml.parse(fs.readFileSync(path.join(__dirname, 'ripper.yaml'), 'utf8'));
        const names = cfg.calendars.map((c: any) => c.name);
        expect(new Set(names).size).toBe(names.length);
        const branchCals = cfg.calendars.filter((c: any) => c.config?.branchId);
        const ids = branchCals.map((c: any) => c.config.branchId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const c of branchCals) {
            expect(c.geo.lat).toBeTypeOf('number');
            expect(c.tags.length).toBe(1);
        }
        expect(cfg.calendars.filter((c: any) => c.config?.otherLocations).length).toBe(1);
    });
});
