import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import YAML from 'yaml';
import SeattleFoodTruckRipper, { POD_CONFIG, Pod, SFTBooking } from './ripper.js';
import { LocalDate, ZoneRegion, ChronoUnit, Duration } from '@js-joda/core';
import '@js-joda/timezone';
import sampleData from './sample-data.json';

const yamlCalendarNames: string[] = (() => {
    const here = dirname(fileURLToPath(import.meta.url));
    const cfg = YAML.parse(readFileSync(join(here, 'ripper.yaml'), 'utf8'));
    return cfg.calendars.map((c: any) => c.name);
})();

const timezone = ZoneRegion.of('America/Los_Angeles');
const ripper = new SeattleFoodTruckRipper();

// Build a future timestamp (N days from now) in Seattle winter time (-08:00)
function futureTimestamp(daysFromNow: number, hour: number, minutes = 0): string {
    const date = LocalDate.now().plusDays(daysFromNow);
    const h = String(hour).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    return `${date}T${h}:${m}:00.000-08:00`;
}

// --- Unit tests for date-parsing helpers ---

describe('SeattleFoodTruckRipper.parseLocalDate', () => {
    it('extracts the date part from an SFT timestamp', () => {
        const result = ripper.parseLocalDate('2026-03-06T11:00:00.000-08:00');
        expect(result).not.toBeNull();
        expect(result!.toString()).toBe('2026-03-06');
    });

    it('returns null for an empty string', () => {
        expect(ripper.parseLocalDate('')).toBeNull();
    });
});

describe('SeattleFoodTruckRipper.parseZonedDateTime', () => {
    it('parses an SFT timestamp and converts to Pacific time', () => {
        const result = ripper.parseZonedDateTime('2026-03-06T11:00:00.000-08:00', timezone);
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(11);
        expect(result!.minute()).toBe(0);
    });

    it('handles PDT offset (-07:00) correctly', () => {
        const result = ripper.parseZonedDateTime('2026-04-01T11:00:00.000-07:00', timezone);
        expect(result).not.toBeNull();
        expect(result!.hour()).toBe(11);
    });

    it('returns null for an empty string', () => {
        expect(ripper.parseZonedDateTime('', timezone)).toBeNull();
    });
});

// --- Test helpers ---

function makePod(name: string, slug: string, locId: number, neighborhood: string | null): Pod {
    return {
        name,
        id: slug,
        uid: locId,
        location: {
            id: locId,
            slug,
            name,
            ...(neighborhood ? { neighborhood: { name: neighborhood, id: 1, slug: neighborhood.toLowerCase() } } : {}),
        },
    };
}

function makeBooking(id: number, displayName: string, daysFromNow: number, startHour = 11, endHour = 14): SFTBooking {
    return {
        id,
        name: '',
        description: '',
        start_time: futureTimestamp(daysFromNow, startHour),
        end_time: futureTimestamp(daysFromNow, endHour),
        event_id: id * 100,
        shift: 'Lunch',
        display_name: displayName,
        title: '',
    };
}

function podMap(pods: Pod[]): Map<string, Pod> {
    const m = new Map<string, Pod>();
    for (const p of pods) m.set(p.name.toLowerCase(), p);
    return m;
}

// Minimal calendar configs mirroring ripper.yaml (only fields buildCalendars reads).
const CALENDARS: any = [
    { name: 'seattle-food-trucks', friendlyname: 'Seattle Food Trucks', timezone, tags: ['Food'] },
    { name: 'westlake-park', friendlyname: 'Food Trucks @ Westlake Park', timezone, tags: ['FoodTruck', 'Downtown'] },
    { name: 'starbucks-center', friendlyname: 'Food Trucks @ Starbucks Center', timezone, tags: ['FoodTruck', 'SoDo'] },
];

// --- Seattle filtering ---

describe('SeattleFoodTruckRipper.isSeattlePod', () => {
    it('includes pods in Seattle neighborhoods and excludes suburban ones', () => {
        expect(ripper.isSeattlePod(makePod('Westlake Park', 'westlake-park', 38, 'Downtown'))).toBe(true);
        expect(ripper.isSeattlePod(makePod('Bellefield Office Park', 'bellefield', 999, 'Bellevue'))).toBe(false);
    });

    it('keeps a no-neighborhood pod unless its slug looks suburban', () => {
        expect(ripper.isSeattlePod(makePod('Mystery Pod', 'mystery', 1, null))).toBe(true);
        expect(ripper.isSeattlePod(makePod('Shoreline CC', 'shoreline-cc', 2, null))).toBe(false);
    });
});

// --- Per-pod bucketing ---

describe('SeattleFoodTruckRipper.buildCalendars', () => {
    const pods = [
        makePod('Westlake Park', 'westlake-park', 38, 'Downtown'),
        makePod('Starbucks Center', 'starbucks-center', 40, 'SoDo'),
    ];
    const bookings = [
        makeBooking(1, 'Westlake Park', 2),
        makeBooking(2, 'Starbucks Center', 3),
    ];

    it('merged calendar contains every pod slot; per-pod calendars are filtered', () => {
        const cals = ripper.buildCalendars(CALENDARS, pods, bookings, podMap(pods), new Map(), timezone);
        const merged = cals.find(c => c.name === 'seattle-food-trucks')!;
        const westlake = cals.find(c => c.name === 'westlake-park')!;
        const starbucks = cals.find(c => c.name === 'starbucks-center')!;

        expect(merged.events).toHaveLength(2);
        expect(westlake.events).toHaveLength(1);
        expect(westlake.events[0].summary).toBe('Food Trucks @ Westlake Park');
        expect(starbucks.events).toHaveLength(1);
        expect(starbucks.events[0].summary).toBe('Food Trucks @ Starbucks Center');
    });

    it('produces stable per-booking ids and free cost', () => {
        const cals = ripper.buildCalendars(CALENDARS, pods, bookings, podMap(pods), new Map(), timezone);
        const westlake = cals.find(c => c.name === 'westlake-park')!;
        expect(westlake.events[0].id).toBe('sft-1');
        expect(westlake.events[0].cost).toEqual({ min: 0 });
    });

    it('carries per-calendar tags through', () => {
        const cals = ripper.buildCalendars(CALENDARS, pods, bookings, podMap(pods), new Map(), timezone);
        expect(cals.find(c => c.name === 'seattle-food-trucks')!.tags).toEqual(['Food']);
        expect(cals.find(c => c.name === 'westlake-park')!.tags).toEqual(['FoodTruck', 'Downtown']);
    });

    it('attaches unknown-pod errors to the merged calendar only', () => {
        const withUnknown = [...pods, makePod('Brand New Pod', 'brand-new-pod', 77, 'Ballard')];
        const cals = ripper.buildCalendars(CALENDARS, withUnknown, bookings, podMap(withUnknown), new Map(), timezone);
        const merged = cals.find(c => c.name === 'seattle-food-trucks')!;
        const westlake = cals.find(c => c.name === 'westlake-park')!;
        expect(merged.errors.some(e => e.reason.includes('Brand New Pod'))).toBe(true);
        expect(westlake.errors).toHaveLength(0);
    });
});

// --- Unknown-pod detection ---

describe('SeattleFoodTruckRipper.detectUnknownPods', () => {
    it('flags Seattle pods missing from POD_CONFIG and ignores configured ones', () => {
        const pods = [
            makePod('Westlake Park', 'westlake-park', 38, 'Downtown'),  // configured (calendar)
            makePod('Saleh\'s', 'salehs', 50, 'Breweries'),             // configured (skip)
            makePod('Brand New Pod', 'brand-new-pod', 77, 'Ballard'),   // unknown
        ];
        const errors = ripper.detectUnknownPods(pods);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('Brand New Pod');
    });
});

// --- POD_CONFIG integrity ---

describe('POD_CONFIG', () => {
    it('every entry is either a calendar route or a skip, never both', () => {
        for (const [name, route] of Object.entries(POD_CONFIG)) {
            const hasCal = 'calendar' in route;
            const hasSkip = 'skip' in route;
            expect(hasCal !== hasSkip, `${name} must be exactly one of calendar/skip`).toBe(true);
        }
    });

    it('calendar routes have unique slugs', () => {
        const slugs = Object.values(POD_CONFIG)
            .filter((r): r is { calendar: string } => 'calendar' in r)
            .map(r => r.calendar);
        expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('every POD_CONFIG calendar slug is a declared calendar in ripper.yaml', () => {
        const declared = new Set(yamlCalendarNames);
        for (const route of Object.values(POD_CONFIG)) {
            if ('calendar' in route) {
                expect(declared.has(route.calendar), `${route.calendar} must be declared in ripper.yaml`).toBe(true);
            }
        }
    });

    it('ripper.yaml declares the merged anchor calendar plus one per routed pod', () => {
        const routedSlugs = Object.values(POD_CONFIG)
            .filter((r): r is { calendar: string } => 'calendar' in r)
            .map(r => r.calendar);
        expect(yamlCalendarNames).toContain('seattle-food-trucks');
        expect(yamlCalendarNames.length).toBe(routedSlugs.length + 1); // +1 for the merged anchor
    });
});

// --- Sample data shape ---

describe('SeattleFoodTruckRipper sample data', () => {
    it('sample data contains pod records', () => {
        const pods = sampleData.pods_response.pods;
        expect(pods.length).toBeGreaterThan(0);
        expect(pods.some((p: any) => p.name === 'Westlake Park')).toBe(true);
    });

    it('Starbucks Center is in the pod list (SoDo - Seattle proper)', () => {
        const starbucks = sampleData.pods_response.pods.find((p: any) => p.name === 'Starbucks Center') as any;
        expect(starbucks).toBeDefined();
        expect(starbucks.location.neighborhood.name).toBe('SoDo');
    });

    it('Bellevue pods exist in the full pod list but are filtered out by isSeattlePod', () => {
        const bellevuePods = sampleData.pods_response.pods.filter((p: any) => p.location?.neighborhood?.name === 'Bellevue');
        expect(bellevuePods.length).toBeGreaterThan(0);
        for (const p of bellevuePods) expect(ripper.isSeattlePod(p as Pod)).toBe(false);
    });
});
