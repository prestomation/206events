import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import {
    extractFeedItems,
    parseFeedItem,
    parseMecDate,
    parseMecHour,
    resolveSeattleVenue,
    extractImageAndDescription,
    RawOfaItem,
} from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE = ZoneId.of('America/Los_Angeles');

function loadSampleFeed(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.xml'), 'utf8');
}

describe('extractFeedItems', () => {
    it('extracts all items from the sample feed', () => {
        const items = extractFeedItems(loadSampleFeed());
        expect(items.length).toBe(10);
    });

    it('extracts required fields for the first item', () => {
        const items = extractFeedItems(loadSampleFeed());
        const first = items[0];
        expect(first.title).toBe('Learn to Ride');
        expect(first.link).toBe('https://outdoorsforall.org/events/learn-to-ride-6/');
        expect(first.guid).toContain('p=19335');
        expect(first.startDate).toBe('2026-09-19');
        expect(first.startHour).toBe('');
        expect(first.location).toBe('Magnuson Park');
    });

    it('extracts a fully-specified item with a real start/end time', () => {
        const items = extractFeedItems(loadSampleFeed());
        const screening = items.find(i => i.title === 'Adaptive Sport Film Screening');
        expect(screening?.startDate).toBe('2026-10-12');
        expect(screening?.startHour).toBe('6:00 pm');
        expect(screening?.endHour).toBe('8:00 pm');
        expect(screening?.location).toBe('Old Stove Brewing Ballard');
    });

    it('returns an empty array for empty XML', () => {
        expect(extractFeedItems('')).toEqual([]);
    });
});

describe('resolveSeattleVenue', () => {
    it('resolves a known Seattle venue to its full address', () => {
        expect(resolveSeattleVenue('Magnuson Park')).toBe('6344 NE 74th St, Seattle, WA 98115');
        expect(resolveSeattleVenue('Old Stove Brewing Ballard')).toBe('1550 NW 49th St, Seattle, WA 98107');
    });

    it('returns undefined for a location outside Seattle', () => {
        expect(resolveSeattleVenue('Snoqualmie Valley Trail')).toBeUndefined();
        expect(resolveSeattleVenue('i-90 Corridor')).toBeUndefined();
    });

    it('returns undefined for a blank or missing location', () => {
        expect(resolveSeattleVenue('')).toBeUndefined();
        expect(resolveSeattleVenue(undefined)).toBeUndefined();
    });
});

describe('parseMecDate', () => {
    it('parses a valid ISO date', () => {
        expect(parseMecDate('2026-09-19')).toEqual({ year: 2026, month: 9, day: 19 });
    });

    it('returns null for a malformed date', () => {
        expect(parseMecDate('09/19/2026')).toBeNull();
    });
});

describe('parseMecHour', () => {
    it('parses a 12-hour PM time', () => {
        expect(parseMecHour('6:00 pm')).toEqual({ hour: 18, minute: 0 });
    });

    it('parses a 12-hour AM time', () => {
        expect(parseMecHour('9:00 am')).toEqual({ hour: 9, minute: 0 });
    });

    it('handles 12pm and 12am correctly', () => {
        expect(parseMecHour('12:00 pm')?.hour).toBe(12);
        expect(parseMecHour('12:00 am')?.hour).toBe(0);
    });

    it('returns null for an empty or missing hour (mec:startHour blank)', () => {
        expect(parseMecHour('')).toBeNull();
        expect(parseMecHour(undefined)).toBeNull();
    });

    it('returns null for a malformed time', () => {
        expect(parseMecHour('6pm')).toBeNull();
    });
});

describe('extractImageAndDescription', () => {
    it('extracts the image src and strips it from the description text', () => {
        const raw = '<img width="768" height="1024" src="https://outdoorsforall.org/wp-content/uploads/2026/09/test.png" class="wp-post-image" alt="" /> Some description text.';
        const result = extractImageAndDescription(raw);
        expect(result.imageUrl).toBe('https://outdoorsforall.org/wp-content/uploads/2026/09/test.png');
        expect(result.description).toBe('Some description text.');
    });

    it('returns no fields for undefined input', () => {
        expect(extractImageAndDescription(undefined)).toEqual({});
    });
});

describe('parseFeedItem', () => {
    const validItem: RawOfaItem = {
        title: 'Adaptive Sport Film Screening',
        link: 'https://outdoorsforall.org/events/adaptive-sport-film-screening/',
        guid: 'https://outdoorsforall.org/?post_type=mec-events&#038;p=19381',
        startDate: '2026-10-12',
        startHour: '6:00 pm',
        endDate: '2026-10-12',
        endHour: '8:00 pm',
        location: 'Old Stove Brewing Ballard',
        description: '<img src="https://outdoorsforall.org/x.jpg" /> A film screening.',
    };
    const SEATTLE_ADDRESS = '1550 NW 49th St, Seattle, WA 98107';

    it('parses a valid item into a RipperCalendarEvent', () => {
        const result = parseFeedItem(validItem, ZONE, SEATTLE_ADDRESS) as RipperCalendarEvent;
        expect('date' in result).toBe(true);
        expect(result.id).toBe('outdoors-for-all-19381-2026-10-12');
        expect(result.summary).toBe('Adaptive Sport Film Screening');
        expect(result.location).toBe(SEATTLE_ADDRESS);
        expect(result.url).toBe(validItem.link);
        expect(result.imageUrl).toBe('https://outdoorsforall.org/x.jpg');
        expect(result.description).toBe('A film screening.');
    });

    it('sets date and duration from start/end fields', () => {
        const result = parseFeedItem(validItem, ZONE, SEATTLE_ADDRESS) as RipperCalendarEvent;
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(10);
        expect(result.date.dayOfMonth()).toBe(12);
        expect(result.date.hour()).toBe(18);
        expect(result.duration.toMinutes()).toBe(120);
    });

    it('uses a noon placeholder and a longer default duration when start/end hour are blank', () => {
        const noTime: RawOfaItem = { ...validItem, startHour: '', endHour: '' };
        const result = parseFeedItem(noTime, ZONE, SEATTLE_ADDRESS) as RipperCalendarEvent;
        expect(result.date.hour()).toBe(12);
        expect(result.date.minute()).toBe(0);
        expect(result.duration.toHours()).toBe(2);
    });

    it('produces distinct ids for two occurrences of the same recurring post', () => {
        const first: RawOfaItem = { ...validItem, guid: '...p=19335', startDate: '2026-09-19' };
        const second: RawOfaItem = { ...validItem, guid: '...p=19335', startDate: '2026-09-26' };
        const firstResult = parseFeedItem(first, ZONE, SEATTLE_ADDRESS) as RipperCalendarEvent;
        const secondResult = parseFeedItem(second, ZONE, SEATTLE_ADDRESS) as RipperCalendarEvent;
        expect(firstResult.id).not.toBe(secondResult.id);
    });

    it('returns a ParseError when a required field is missing', () => {
        const missing: RawOfaItem = { ...validItem, title: undefined };
        const result = parseFeedItem(missing, ZONE, SEATTLE_ADDRESS) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError for an unparsable start date', () => {
        const bad: RawOfaItem = { ...validItem, startDate: 'not-a-date' };
        const result = parseFeedItem(bad, ZONE, SEATTLE_ADDRESS) as RipperError;
        expect(result.type).toBe('ParseError');
    });
});

describe('parseFeedItem — full fixture (Seattle-only filter applied)', () => {
    it('keeps only the known-Seattle-venue listings from the live sample feed', () => {
        const items = extractFeedItems(loadSampleFeed());
        const seattleItems = items.filter(i => resolveSeattleVenue(i.location));
        // Sample feed has 4 Seattle-located occurrences: 2x "Learn to Ride"
        // (Magnuson Park), 1x "Adaptive Sport Film Screening" (Old Stove
        // Brewing Ballard), 1x "Indoor Spin Class" (Magnuson Park). The
        // Hiking Series (i-90 Corridor) and Gravel Biking (Snoqualmie Valley
        // Trail / blank location) occurrences are dropped.
        expect(seattleItems.length).toBe(4);
        expect(seattleItems.every(i => i.location === 'Magnuson Park' || i.location === 'Old Stove Brewing Ballard')).toBe(true);
    });

    it('produces a sane (<= 8 hour) duration for every Seattle-located event in the live sample feed', () => {
        const items = extractFeedItems(loadSampleFeed());
        for (const raw of items) {
            const address = resolveSeattleVenue(raw.location);
            if (!address) continue;
            const result = parseFeedItem(raw, ZONE, address);
            expect('date' in result).toBe(true);
            const event = result as RipperCalendarEvent;
            expect(event.duration.toMinutes()).toBeGreaterThan(0);
            expect(event.duration.toMinutes()).toBeLessThanOrEqual(8 * 60);
        }
    });
});
