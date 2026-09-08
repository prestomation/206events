import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import {
    extractFeedItems,
    parseFeedItem,
    parsePubDate,
    isNonPublicEvent,
    stripDateSuffix,
    extractIdFromGuid,
    extractImageAndDescription,
    decodeHtmlEntities,
    RawStycItem,
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
        expect(items.length).toBe(11);
    });

    it('extracts required fields for a race item', () => {
        const items = extractFeedItems(loadSampleFeed());
        const wath = items.find(i => i.title?.startsWith('Women at the Helm 2'));
        expect(wath).toBeDefined();
        expect(wath!.link).toBe('https://www.styc.org/event-6475352');
        expect(wath!.guid).toBe('https://www.styc.org/event-6475352');
        expect(wath!.pubDate).toBe('Sat, 12 Sep 2026 07:00:00 GMT');
        expect(wath!.description).toContain('Women at the Helm');
    });

    it('returns an empty array for empty XML', () => {
        expect(extractFeedItems('')).toEqual([]);
    });

    it('stays fast on adversarial input with many unclosed <item> tags', () => {
        // Regression test for a quadratic-time worst case: a global
        // backtracking regex here would restart its lazy scan from every
        // "<item>" occurrence, each rescanning to the end of the string.
        // indexOf-based scanning stays linear regardless of how many
        // "<item>" occurrences never find a matching "</item>".
        const adversarial = '<item>'.repeat(50000);
        const start = Date.now();
        const items = extractFeedItems(adversarial);
        expect(items).toEqual([]);
        expect(Date.now() - start).toBeLessThan(1000);
    });
});

describe('isNonPublicEvent', () => {
    it('flags board meetings as non-public', () => {
        expect(isNonPublicEvent('Board Meeting (10 Sep 2026)')).toBe(true);
        expect(isNonPublicEvent('board meeting (10 Sep 2026)')).toBe(true);
    });

    it('does not flag public races/cruises', () => {
        expect(isNonPublicEvent('Fall Regatta (19 Sep 2026)')).toBe(false);
        expect(isNonPublicEvent('NEW: Everett Marina Fall Cruise (17 Oct 2026)')).toBe(false);
    });
});

describe('stripDateSuffix', () => {
    it('removes the trailing (DD Mon YYYY) suffix', () => {
        expect(stripDateSuffix('Fall Regatta (19 Sep 2026)')).toBe('Fall Regatta');
        expect(stripDateSuffix('2026 Cruising Bingo (5 Dec 2026)')).toBe('2026 Cruising Bingo');
    });

    it('leaves a title with no date suffix unchanged', () => {
        expect(stripDateSuffix('Great Pumpkin Race')).toBe('Great Pumpkin Race');
    });
});

describe('extractIdFromGuid', () => {
    it('extracts a stable id from a guid URL', () => {
        expect(extractIdFromGuid('https://www.styc.org/event-6475352')).toBe('sloop-tavern-yc-6475352');
    });

    it('returns undefined for a guid with no event id', () => {
        expect(extractIdFromGuid('https://www.styc.org/calendar')).toBeUndefined();
    });
});

describe('decodeHtmlEntities', () => {
    it('decodes named entities', () => {
        expect(decodeHtmlEntities('Rough &amp; Tumble')).toBe('Rough & Tumble');
        expect(decodeHtmlEntities('&quot;Sloopiest&quot;')).toBe('"Sloopiest"');
    });

    it('decodes double-encoded entities (HTML content re-encoded for the RSS XML layer)', () => {
        expect(decodeHtmlEntities('Rough &amp;amp; Tumble')).toBe('Rough & Tumble');
    });
});

describe('extractImageAndDescription', () => {
    it('extracts the first image src and a plain-text description', () => {
        const raw = '&lt;p&gt;&lt;img src="https://www.styc.org/x.jpg" alt="" border="0"&gt;&lt;/p&gt;&lt;p&gt;Come race with us.&lt;/p&gt;';
        const result = extractImageAndDescription(raw);
        expect(result.imageUrl).toBe('https://www.styc.org/x.jpg');
        expect(result.description).toContain('Come race with us.');
    });

    it('returns no fields for undefined input', () => {
        expect(extractImageAndDescription(undefined)).toEqual({});
    });
});

describe('parsePubDate', () => {
    it('flags a local-midnight pubDate as time-unknown', () => {
        // 07:00 GMT in September (PDT, UTC-7) is midnight local.
        const result = parsePubDate('Sat, 12 Sep 2026 07:00:00 GMT', ZONE);
        expect(result?.timeUnknown).toBe(true);
        expect(result?.date.hour()).toBe(0);
    });

    it('does not flag a genuine evening local time as time-unknown', () => {
        // 01:00 GMT the next day in September (PDT, UTC-7) is 6pm local.
        const result = parsePubDate('Fri, 11 Sep 2026 01:00:00 GMT', ZONE);
        expect(result?.timeUnknown).toBe(false);
        expect(result?.date.hour()).toBe(18);
    });

    it('correctly handles the PDT/PST boundary', () => {
        // December is PST (UTC-8); 08:00 GMT is local midnight.
        const result = parsePubDate('Sat, 05 Dec 2026 08:00:00 GMT', ZONE);
        expect(result?.timeUnknown).toBe(true);
    });

    it('returns null for an unparsable pubDate', () => {
        expect(parsePubDate('not-a-date', ZONE)).toBeNull();
    });
});

describe('parseFeedItem', () => {
    const validItem: RawStycItem = {
        title: 'Fall Regatta (19 Sep 2026)',
        link: 'https://www.styc.org/event-6475354',
        guid: 'https://www.styc.org/event-6475354',
        pubDate: 'Sat, 19 Sep 2026 07:00:00 GMT',
        description: '&lt;p&gt;&lt;img src="https://www.styc.org/f.jpg" border="0"&gt;&lt;/p&gt;&lt;p&gt;Up to three races in one day.&lt;/p&gt;',
    };

    it('parses a valid item into a RipperCalendarEvent', () => {
        const result = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        expect('date' in result).toBe(true);
        expect(result.id).toBe('sloop-tavern-yc-6475354');
        expect(result.summary).toBe('Fall Regatta');
        expect(result.location).toBe('Puget Sound, Seattle, WA');
        expect(result.url).toBe(validItem.link);
        expect(result.imageUrl).toBe('https://www.styc.org/f.jpg');
        expect(result.description).toContain('Up to three races in one day.');
    });

    it('uses the noon placeholder and a 3-hour duration when no time was posted', () => {
        const result = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(9);
        expect(result.date.dayOfMonth()).toBe(19);
        expect(result.date.hour()).toBe(12);
        expect(result.date.minute()).toBe(0);
        expect(result.duration.toHours()).toBe(3);
    });

    it('uses the real posted time when one is present', () => {
        const timed: RawStycItem = { ...validItem, pubDate: 'Fri, 11 Sep 2026 01:00:00 GMT' };
        const result = parseFeedItem(timed, ZONE) as RipperCalendarEvent;
        expect(result.date.hour()).toBe(18);
        expect(result.date.minute()).toBe(0);
    });

    it('returns a ParseError when a required field is missing', () => {
        const missing: RawStycItem = { ...validItem, guid: undefined };
        const result = parseFeedItem(missing, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError for an unparsable pubDate', () => {
        const bad: RawStycItem = { ...validItem, pubDate: 'not-a-date' };
        const result = parseFeedItem(bad, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError when the guid has no extractable event id', () => {
        const bad: RawStycItem = { ...validItem, guid: 'https://www.styc.org/calendar' };
        const result = parseFeedItem(bad, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });
});

describe('parseFeedItem — full fixture', () => {
    it('parses every non-board-meeting item into an event with no errors', () => {
        const items = extractFeedItems(loadSampleFeed()).filter(i => !i.title || !isNonPublicEvent(i.title));
        expect(items.length).toBe(7);
        for (const raw of items) {
            const result = parseFeedItem(raw, ZONE);
            expect('date' in result).toBe(true);
        }
    });

    it('excludes board meetings from the public item set', () => {
        const items = extractFeedItems(loadSampleFeed());
        const boardMeetings = items.filter(i => i.title && isNonPublicEvent(i.title));
        expect(boardMeetings.length).toBe(4);
    });
});
