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
    extractSeriesIdFromGuid,
    occurrenceSlug,
    extractDescription,
    decodeHtmlEntities,
    RawMsgItem,
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
        expect(items.length).toBe(14);
    });

    it('extracts required fields for a game-night item', () => {
        const items = extractFeedItems(loadSampleFeed());
        const traveller = items.find(i => i.title?.startsWith('Traveller'));
        expect(traveller).toBeDefined();
        expect(traveller!.link).toBe('https://www.metroseattlegamers.org/event-6830181');
        expect(traveller!.guid).toBe('https://www.metroseattlegamers.org/event-6830181');
        expect(traveller!.pubDate).toBe('Sat, 19 Sep 2026 02:00:00 GMT');
    });

    it('returns an empty array for empty XML', () => {
        expect(extractFeedItems('')).toEqual([]);
    });

    it('stays fast on adversarial input with many unclosed <item> tags', () => {
        const adversarial = '<item>'.repeat(50000);
        const start = Date.now();
        const items = extractFeedItems(adversarial);
        expect(items).toEqual([]);
        expect(Date.now() - start).toBeLessThan(1000);
    });
});

describe('isNonPublicEvent', () => {
    it('flags board meetings and the AGM as non-public', () => {
        expect(isNonPublicEvent('Q3 Board Meeting - Red Room (28 Sep 2026)')).toBe(true);
        expect(isNonPublicEvent('q4 board meeting (10 Dec 2026)')).toBe(true);
        expect(isNonPublicEvent('Club Annual General Meeting (AGM) (14 Nov 2026)')).toBe(true);
    });

    it('does not flag public game nights', () => {
        expect(isNonPublicEvent('Thursday night Euros (17 Sep 2026)')).toBe(false);
        expect(isNonPublicEvent('World in Flames (22 Sep 2026)')).toBe(false);
    });
});

describe('stripDateSuffix', () => {
    it('removes the trailing (DD Mon YYYY) suffix', () => {
        expect(stripDateSuffix('Thursday night Euros (17 Sep 2026)')).toBe('Thursday night Euros');
        expect(stripDateSuffix('World in Flames (22 Sep 2026)')).toBe('World in Flames');
    });

    it('leaves a title with no date suffix unchanged', () => {
        expect(stripDateSuffix('Traveller')).toBe('Traveller');
    });
});

describe('extractSeriesIdFromGuid', () => {
    it('extracts a stable series id from a guid URL', () => {
        expect(extractSeriesIdFromGuid('https://www.metroseattlegamers.org/event-6830181')).toBe('6830181');
    });

    it('returns undefined for a guid with no event id', () => {
        expect(extractSeriesIdFromGuid('https://www.metroseattlegamers.org/events')).toBeUndefined();
    });
});

describe('occurrenceSlug', () => {
    it('formats as zero-padded local date and time', () => {
        const parsed = parsePubDate('Sat, 19 Sep 2026 02:00:00 GMT', ZONE)!;
        expect(occurrenceSlug(parsed.date)).toBe('2026-09-18-1900');
    });

    it('zero-pads single-digit hours and minutes', () => {
        const parsed = parsePubDate('Sat, 19 Sep 2026 08:05:00 GMT', ZONE)!;
        expect(occurrenceSlug(parsed.date)).toBe('2026-09-19-0105');
    });
});

describe('decodeHtmlEntities', () => {
    it('decodes named entities', () => {
        expect(decodeHtmlEntities('Games &amp; More')).toBe('Games & More');
        expect(decodeHtmlEntities('&quot;Root&quot;')).toBe('"Root"');
    });

    it('decodes double-encoded entities (HTML content re-encoded for the RSS XML layer)', () => {
        expect(decodeHtmlEntities('Games &amp;amp; More')).toBe('Games & More');
    });
});

describe('extractDescription', () => {
    it('strips HTML tags and collapses whitespace', () => {
        const raw = '&lt;p&gt;We typically have two-three tables of Euro games.&lt;br&gt;&lt;/p&gt;';
        expect(extractDescription(raw)).toBe('We typically have two-three tables of Euro games.');
    });

    it('returns undefined for undefined input', () => {
        expect(extractDescription(undefined)).toBeUndefined();
    });

    it('returns undefined for a description with no text content', () => {
        expect(extractDescription('&lt;p&gt;&lt;br&gt;&lt;/p&gt;')).toBeUndefined();
    });
});

describe('parsePubDate', () => {
    it('flags a local-midnight pubDate as time-unknown', () => {
        // 07:00 GMT in September (PDT, UTC-7) is midnight local.
        const result = parsePubDate('Sat, 19 Sep 2026 07:00:00 GMT', ZONE);
        expect(result?.timeUnknown).toBe(true);
        expect(result?.date.hour()).toBe(0);
    });

    it('does not flag a genuine evening local time as time-unknown', () => {
        // 02:00 GMT the next day in September (PDT, UTC-7) is 7pm local.
        const result = parsePubDate('Sat, 19 Sep 2026 02:00:00 GMT', ZONE);
        expect(result?.timeUnknown).toBe(false);
        expect(result?.date.hour()).toBe(19);
    });

    it('returns null for an unparsable pubDate', () => {
        expect(parsePubDate('not-a-date', ZONE)).toBeNull();
    });
});

describe('parseFeedItem', () => {
    const validItem: RawMsgItem = {
        title: 'Traveller (18 Sep 2026)',
        link: 'https://www.metroseattlegamers.org/event-6830181',
        guid: 'https://www.metroseattlegamers.org/event-6830181',
        pubDate: 'Sat, 19 Sep 2026 02:00:00 GMT',
        description: '&lt;p&gt;&lt;br&gt;&lt;/p&gt;',
    };

    it('parses a valid item into a RipperCalendarEvent', () => {
        const result = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        expect('date' in result).toBe(true);
        expect(result.id).toBe('metro-seattle-gamers-6830181-2026-09-18-1900');
        expect(result.summary).toBe('Traveller');
        expect(result.location).toBe('Nickerson Marina Building, Suite 301, 1080 W Ewing Pl, Seattle, WA 98119');
        expect(result.url).toBe(validItem.link);
        expect(result.duration.toHours()).toBe(4);
    });

    it('appends the occurrence date so recurring items sharing a guid get distinct ids', () => {
        const laterOccurrence: RawMsgItem = { ...validItem, title: 'Traveller (25 Sep 2026)', pubDate: 'Sat, 26 Sep 2026 02:00:00 GMT' };
        const first = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        const second = parseFeedItem(laterOccurrence, ZONE) as RipperCalendarEvent;
        expect(first.id).not.toBe(second.id);
    });

    it('appends the occurrence time too, so a same-series makeup session on the same date still gets a distinct id', () => {
        const sameDayLaterSlot: RawMsgItem = { ...validItem, pubDate: 'Sat, 19 Sep 2026 04:00:00 GMT' };
        const first = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        const second = parseFeedItem(sameDayLaterSlot, ZONE) as RipperCalendarEvent;
        expect(first.date.toLocalDate().toString()).toBe(second.date.toLocalDate().toString());
        expect(first.id).not.toBe(second.id);
    });

    it('uses the noon placeholder when no time was posted', () => {
        const untimed: RawMsgItem = { ...validItem, pubDate: 'Sat, 19 Sep 2026 07:00:00 GMT' };
        const result = parseFeedItem(untimed, ZONE) as RipperCalendarEvent;
        expect(result.date.hour()).toBe(12);
        expect(result.date.minute()).toBe(0);
    });

    it('uses the real posted time when one is present', () => {
        const result = parseFeedItem(validItem, ZONE) as RipperCalendarEvent;
        expect(result.date.hour()).toBe(19);
        expect(result.date.minute()).toBe(0);
    });

    it('returns a ParseError when a required field is missing', () => {
        const missing: RawMsgItem = { ...validItem, guid: undefined };
        const result = parseFeedItem(missing, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError for an unparsable pubDate', () => {
        const bad: RawMsgItem = { ...validItem, pubDate: 'not-a-date' };
        const result = parseFeedItem(bad, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });

    it('returns a ParseError when the guid has no extractable event id', () => {
        const bad: RawMsgItem = { ...validItem, guid: 'https://www.metroseattlegamers.org/events' };
        const result = parseFeedItem(bad, ZONE) as RipperError;
        expect(result.type).toBe('ParseError');
    });
});

describe('parseFeedItem — full fixture', () => {
    it('parses every non-board-meeting/non-AGM item into an event with no errors', () => {
        const items = extractFeedItems(loadSampleFeed()).filter(i => !i.title || !isNonPublicEvent(i.title));
        expect(items.length).toBe(12);
        for (const raw of items) {
            const result = parseFeedItem(raw, ZONE);
            expect('date' in result).toBe(true);
        }
    });

    it('excludes board meetings and the AGM from the public item set', () => {
        const items = extractFeedItems(loadSampleFeed());
        const nonPublic = items.filter(i => i.title && isNonPublicEvent(i.title));
        expect(nonPublic.length).toBe(2);
    });

    it('produces unique ids across the whole fixture despite shared guids for recurring series', () => {
        const items = extractFeedItems(loadSampleFeed()).filter(i => !i.title || !isNonPublicEvent(i.title));
        const ids = items.map(raw => (parseFeedItem(raw, ZONE) as RipperCalendarEvent).id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
