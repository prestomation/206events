import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import {
    extractFeedItems,
    parseFeedItem,
    parseMecDateTime,
    parseCost,
    resolveLocation,
    extractImageAndDescription,
    decodeHtmlEntities,
    RawNwDanceItem,
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
        expect(first.title).toContain('Casey MacGill Quintet');
        expect(first.link).toBe('https://nwdance.net/events/casey-macgill-quintet-free-dance/');
        expect(first.guid).toContain('p=18252');
        expect(first.startDate).toBe('2026-09-05');
        expect(first.startHour).toBe('7:00 pm');
        expect(first.endDate).toBe('2026-09-05');
        expect(first.endHour).toBe('11:00 pm');
        expect(first.location).toBe('Leif Erikson Hall');
        expect(first.cost).toBe('Free');
    });

    it('returns an empty array for empty XML', () => {
        expect(extractFeedItems('')).toEqual([]);
    });
});

describe('parseMecDateTime', () => {
    it('parses a valid date and 12-hour PM time', () => {
        const result = parseMecDateTime('2026-09-05', '7:00 pm');
        expect(result).toEqual({ year: 2026, month: 9, day: 5, hour: 19, minute: 0 });
    });

    it('parses a valid date and 12-hour AM time', () => {
        const result = parseMecDateTime('2026-11-01', '9:30 am');
        expect(result).toEqual({ year: 2026, month: 11, day: 1, hour: 9, minute: 30 });
    });

    it('handles 12pm and 12am correctly', () => {
        expect(parseMecDateTime('2026-01-01', '12:00 pm')?.hour).toBe(12);
        expect(parseMecDateTime('2026-01-01', '12:00 am')?.hour).toBe(0);
    });

    it('returns null for malformed date', () => {
        expect(parseMecDateTime('09/05/2026', '7:00 pm')).toBeNull();
    });

    it('returns null for malformed time', () => {
        expect(parseMecDateTime('2026-09-05', '7pm')).toBeNull();
    });
});

describe('parseCost', () => {
    it('parses Free as $0', () => {
        expect(parseCost('Free')).toEqual({ min: 0 });
    });

    it('parses a dollar amount', () => {
        expect(parseCost('$25.00')).toEqual({ min: 25 });
    });

    it('returns undefined for missing cost', () => {
        expect(parseCost(undefined)).toBeUndefined();
    });

    it('falls back to paid:true for unrecognized cost text', () => {
        expect(parseCost('Members Only')).toEqual({ paid: true });
    });
});

describe('resolveLocation', () => {
    it('maps a known venue to its full address', () => {
        expect(resolveLocation('Leif Erikson Hall')).toBe('Leif Erikson Hall, 2245 NW 57th St, Seattle, WA 98107');
    });

    it('falls back to the bare venue name for an unknown venue', () => {
        expect(resolveLocation('Some New Hall')).toBe('Some New Hall');
    });
});

describe('decodeHtmlEntities', () => {
    it('decodes numeric and named entities', () => {
        expect(decodeHtmlEntities('Ron Bailey &#038; the Tangents')).toBe('Ron Bailey & the Tangents');
        expect(decodeHtmlEntities('Rock&#8217;s')).toBe('Rock’s');
        expect(decodeHtmlEntities('mostly [&hellip;]')).toBe('mostly […]');
    });
});

describe('extractImageAndDescription', () => {
    it('extracts the image src and strips it from the description text', () => {
        const raw = '<img width="1920" height="1080" src="https://nwdance.net/wp-content/uploads/2026/08/test.jpg" class="wp-post-image" alt="" /> Some description text.';
        const result = extractImageAndDescription(raw);
        expect(result.imageUrl).toBe('https://nwdance.net/wp-content/uploads/2026/08/test.jpg');
        expect(result.description).toBe('Some description text.');
    });

    it('returns no fields for undefined input', () => {
        expect(extractImageAndDescription(undefined)).toEqual({});
    });

    it('returns undefined description when only an image is present', () => {
        const raw = '<img src="https://example.com/x.jpg" />';
        const result = extractImageAndDescription(raw);
        expect(result.imageUrl).toBe('https://example.com/x.jpg');
        expect(result.description).toBeUndefined();
    });
});

describe('parseFeedItem', () => {
    const validItem: RawNwDanceItem = {
        title: 'Dance: Casey MacGill Quintet &#8211; FREE dance!',
        link: 'https://nwdance.net/events/casey-macgill-quintet-free-dance/',
        guid: 'https://nwdance.net/?post_type=mec-events&#038;p=18252',
        startDate: '2026-09-05',
        startHour: '7:00 pm',
        endDate: '2026-09-05',
        endHour: '11:00 pm',
        location: 'Leif Erikson Hall',
        cost: 'Free',
        description: '<img src="https://nwdance.net/x.jpg" /> A great dance night.',
    };

    it('parses a valid item into a RipperCalendarEvent', () => {
        const result = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        expect('date' in result).toBe(true);
        expect(result.id).toBe('nw-dance-18252');
        expect(result.summary).toBe('Dance: Casey MacGill Quintet – FREE dance!');
        expect(result.location).toBe('Leif Erikson Hall, 2245 NW 57th St, Seattle, WA 98107');
        expect(result.url).toBe(validItem.link);
        expect(result.imageUrl).toBe('https://nwdance.net/x.jpg');
        expect(result.description).toBe('A great dance night.');
        expect(result.cost).toEqual({ min: 0 });
    });

    it('sets date and duration from start/end fields', () => {
        const result = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(9);
        expect(result.date.dayOfMonth()).toBe(5);
        expect(result.date.hour()).toBe(19);
        expect(result.duration.toMinutes()).toBe(240);
    });

    it('falls back to a default duration when end time is not after start', () => {
        const sameTime: RawNwDanceItem = { ...validItem, endHour: '7:00 pm' };
        const result = parseFeedItem(sameTime, ZONE) as RipperCalendarEvent;
        expect(result.duration.toMinutes()).toBe(90);
    });

    it('returns a ParseError when a required field is missing', () => {
        const missing: RawNwDanceItem = { ...validItem, location: undefined };
        const result = parseFeedItem(missing, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError for an unparsable start date', () => {
        const bad: RawNwDanceItem = { ...validItem, startDate: 'not-a-date' };
        const result = parseFeedItem(bad, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError for an unparsable end time', () => {
        const bad: RawNwDanceItem = { ...validItem, endHour: 'garbage' };
        const result = parseFeedItem(bad, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });
});
