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
    isSkippedTitle,
    extractImageAndDescription,
    decodeHtmlEntities,
    RawSdsmItem,
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
        expect(first.title).toContain('Mictlantecuhtli Aztec Dance Practice');
        expect(first.link).toBe('https://seattledrumschool.com/events/mictlantecuhtli-aztec-dance-practice/');
        expect(first.guid).toContain('p=11747');
        expect(first.startDate).toBe('2026-09-16');
        expect(first.startHour).toBe('6:30 pm');
        expect(first.endDate).toBe('2026-09-16');
        expect(first.endHour).toBe('8:30 pm');
        expect(first.location).toBe('The LAB@1010 | SDSM Georgetown');
    });

    it('returns an empty array for empty XML', () => {
        expect(extractFeedItems('')).toEqual([]);
    });
});

describe('parseMecDateTime', () => {
    it('parses a valid date and 12-hour PM time', () => {
        const result = parseMecDateTime('2026-09-16', '6:30 pm');
        expect(result).toEqual({ year: 2026, month: 9, day: 16, hour: 18, minute: 30 });
    });

    it('parses a valid date and 12-hour AM time', () => {
        const result = parseMecDateTime('2026-10-17', '9:30 am');
        expect(result).toEqual({ year: 2026, month: 10, day: 17, hour: 9, minute: 30 });
    });

    it('handles 12pm and 12am correctly', () => {
        expect(parseMecDateTime('2026-01-01', '12:00 pm')?.hour).toBe(12);
        expect(parseMecDateTime('2026-01-01', '12:00 am')?.hour).toBe(0);
    });

    it('returns null for malformed date', () => {
        expect(parseMecDateTime('09/16/2026', '6:30 pm')).toBeNull();
    });

    it('returns null for malformed time', () => {
        expect(parseMecDateTime('2026-09-16', '630pm')).toBeNull();
    });
});

describe('parseCost', () => {
    it('parses Free as $0', () => {
        expect(parseCost('Free')).toEqual({ min: 0 });
    });

    it('parses a dollar amount', () => {
        expect(parseCost('$10.00')).toEqual({ min: 10 });
    });

    it('returns undefined for missing cost', () => {
        expect(parseCost(undefined)).toBeUndefined();
    });

    it('falls back to paid:true for unrecognized cost text', () => {
        expect(parseCost('Donation based')).toEqual({ paid: true });
    });
});

describe('resolveLocation', () => {
    it('maps the primary Georgetown venue to its full address', () => {
        expect(resolveLocation('The LAB@1010 | SDSM Georgetown')).toBe('The LAB @ 1010, 1010 S Bailey St, Seattle, WA 98108');
    });

    it('maps the off-site brewery venue to its full address', () => {
        expect(resolveLocation('Hellbent Brewery')).toBe('Hellbent Brewing Company, 13035 Lake City Way NE, Seattle, WA 98125');
    });

    it('falls back to the bare venue name for an unknown venue', () => {
        expect(resolveLocation('Some New Venue')).toBe('Some New Venue');
    });
});

describe('isSkippedTitle', () => {
    it('flags a church service listing', () => {
        expect(isSkippedTitle('Primm Tabernacle AME Church Service (Sundays)')).toBe(true);
    });

    it('flags the sitewide, locationless T-shirt day novelty listing', () => {
        expect(isSkippedTitle('Intl Wear Your SDSM Tshirt Day!')).toBe(true);
    });

    it('does not flag an ordinary community event', () => {
        expect(isSkippedTitle('COME RUN THE ROBOTS!')).toBe(false);
    });
});

describe('decodeHtmlEntities', () => {
    it('decodes numeric and named entities', () => {
        expect(decodeHtmlEntities('Beers &#038; Beats')).toBe('Beers & Beats');
        expect(decodeHtmlEntities('mostly [&hellip;]')).toBe('mostly […]');
    });
});

describe('extractImageAndDescription', () => {
    it('extracts the image src and strips it from the description text', () => {
        const raw = '<img width="1920" height="1080" src="https://seattledrumschool.com/wp-content/uploads/2026/08/test.jpg" class="wp-post-image" alt="" /> Some description text.';
        const result = extractImageAndDescription(raw);
        expect(result.imageUrl).toBe('https://seattledrumschool.com/wp-content/uploads/2026/08/test.jpg');
        expect(result.description).toBe('Some description text.');
    });

    it('returns no fields for undefined input', () => {
        expect(extractImageAndDescription(undefined)).toEqual({});
    });
});

describe('parseFeedItem', () => {
    const validItem: RawSdsmItem = {
        title: 'COME RUN THE ROBOTS!',
        link: 'https://seattledrumschool.com/events/come-run-the-robots/',
        guid: 'https://seattledrumschool.com/?post_type=mec-events&#038;p=13575',
        startDate: '2026-09-17',
        startHour: '5:30 pm',
        endDate: '2026-09-17',
        endHour: '6:30 pm',
        location: 'The LAB@1010 | SDSM Georgetown',
        description: '<img src="https://seattledrumschool.com/x.jpg" /> Hands-on robotics workshops for ages 8-12.',
    };

    it('parses a valid item into a RipperCalendarEvent', () => {
        const result = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        expect('date' in result).toBe(true);
        expect(result.id).toBe('seattle-drum-school-13575-2026-09-17');
        expect(result.summary).toBe('COME RUN THE ROBOTS!');
        expect(result.location).toBe('The LAB @ 1010, 1010 S Bailey St, Seattle, WA 98108');
        expect(result.url).toBe(validItem.link);
        expect(result.imageUrl).toBe('https://seattledrumschool.com/x.jpg');
        expect(result.description).toBe('Hands-on robotics workshops for ages 8-12.');
    });

    it('sets date and duration from start/end fields', () => {
        const result = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(9);
        expect(result.date.dayOfMonth()).toBe(17);
        expect(result.date.hour()).toBe(17);
        expect(result.duration.toMinutes()).toBe(60);
    });

    it('produces distinct ids for two occurrences of the same recurring post', () => {
        const first: RawSdsmItem = { ...validItem, guid: '...p=12801', startDate: '2026-09-26' };
        const second: RawSdsmItem = { ...validItem, guid: '...p=12801', startDate: '2026-10-31' };
        const firstResult = parseFeedItem(first, ZONE) as RipperCalendarEvent;
        const secondResult = parseFeedItem(second, ZONE) as RipperCalendarEvent;
        expect(firstResult.id).not.toBe(secondResult.id);
    });

    it('falls back to a default duration when end time is not after start', () => {
        const sameTime: RawSdsmItem = { ...validItem, endHour: '5:30 pm' };
        const result = parseFeedItem(sameTime, ZONE) as RipperCalendarEvent;
        expect(result.duration.toMinutes()).toBe(90);
    });

    it('returns a ParseError when a required field is missing', () => {
        const missing: RawSdsmItem = { ...validItem, location: undefined };
        const result = parseFeedItem(missing, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError for an unparsable start date', () => {
        const bad: RawSdsmItem = { ...validItem, startDate: 'not-a-date' };
        const result = parseFeedItem(bad, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError for an unparsable end time', () => {
        const bad: RawSdsmItem = { ...validItem, endHour: 'garbage' };
        const result = parseFeedItem(bad, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('wraps correctly for an overnight event whose mec:endDate is the next day', () => {
        const overnight: RawSdsmItem = {
            ...validItem,
            startDate: '2026-09-17',
            startHour: '11:00 pm',
            endDate: '2026-09-18',
            endHour: '1:00 am',
        };
        const result = parseFeedItem(overnight, ZONE) as RipperCalendarEvent;
        expect(result.duration.toMinutes()).toBe(120);
    });
});

describe('parseFeedItem — full fixture', () => {
    it('produces a sane (<= 8 hour) duration for every non-skipped event in the live sample feed', () => {
        const items = extractFeedItems(loadSampleFeed()).filter(i => !(i.title && isSkippedTitle(i.title)));
        for (const raw of items) {
            const result = parseFeedItem(raw, ZONE);
            expect('date' in result).toBe(true);
            const event = result as RipperCalendarEvent;
            expect(event.duration.toMinutes()).toBeGreaterThan(0);
            expect(event.duration.toMinutes()).toBeLessThanOrEqual(8 * 60);
        }
    });

    it('filters out the church service listing before parsing', () => {
        const items = extractFeedItems(loadSampleFeed()).filter(i => !(i.title && isSkippedTitle(i.title)));
        expect(items.some(i => i.title?.includes('Church Service'))).toBe(false);
    });

    it('filters out the locationless T-shirt day listing before parsing', () => {
        const items = extractFeedItems(loadSampleFeed()).filter(i => !(i.title && isSkippedTitle(i.title)));
        expect(items.some(i => i.title?.includes('Tshirt Day'))).toBe(false);
    });

    it('would still report a ParseError if a locationless item were parsed directly (defense in depth)', () => {
        const items = extractFeedItems(loadSampleFeed());
        const tshirtDay = items.find(i => i.title?.includes('Tshirt Day'));
        expect(tshirtDay).toBeDefined();
        const result = parseFeedItem(tshirtDay!, ZONE);
        expect('type' in result && result.type).toBe('ParseError');
    });
});
