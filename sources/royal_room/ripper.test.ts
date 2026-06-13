import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseRSSFeed, parseRoyalRoomCost } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleFeed(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-feed.xml'), 'utf8');
}

describe('parseRSSFeed', () => {
    it('extracts event links from RSS feed', () => {
        const links = parseRSSFeed(loadSampleFeed());
        expect(links.length).toBeGreaterThan(10);
    });

    it('decodes HTML entities in titles', () => {
        const links = parseRSSFeed(loadSampleFeed());
        const shma = links.find(l => l.title.includes('Sh'));
        expect(shma).toBeDefined();
        expect(shma!.title).not.toContain('&#');
        expect(shma!.title).not.toContain('&amp;');
    });

    it('includes event page URLs', () => {
        const links = parseRSSFeed(loadSampleFeed());
        expect(links[0].url).toContain('theroyalroomseattle.com/event/');
    });

    it('extracts startDate from event_listing:start_date', () => {
        const links = parseRSSFeed(loadSampleFeed());
        expect(links.length).toBeGreaterThan(0);
        expect(links[0].startDate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('first item has expected startDate and title', () => {
        const links = parseRSSFeed(loadSampleFeed());
        const shma = links.find(l => l.title.includes('Sh'));
        expect(shma).toBeDefined();
        expect(shma!.startDate).toBe('2026-05-10 19:30:00');
    });

    it('returns empty array for empty XML', () => {
        expect(parseRSSFeed('')).toEqual([]);
    });

    it('skips items missing event_listing:start_date', () => {
        const xml = `<rss><channel><item>
            <title>No Date Event</title>
            <link>https://theroyalroomseattle.com/event/no-date/</link>
        </item></channel></rss>`;
        const links = parseRSSFeed(xml);
        expect(links).toEqual([]);
    });

    it('extracts ticket_price field when present', () => {
        const xml = `<rss><channel><item>
            <title>Free Happy Hour</title>
            <link>https://theroyalroomseattle.com/event/happy-hour/</link>
            <description><![CDATA[Happy hour description]]></description>
            <event_listing:ticket_price><![CDATA[Free]]></event_listing:ticket_price>
            <event_listing:start_date><![CDATA[2026-06-01 16:00:00]]></event_listing:start_date>
        </item></channel></rss>`;
        const links = parseRSSFeed(xml);
        expect(links).toHaveLength(1);
        expect(links[0].ticketPrice).toBe('Free');
    });

    it('leaves ticketPrice undefined when field is absent', () => {
        const xml = `<rss><channel><item>
            <title>Ticketed Show</title>
            <link>https://theroyalroomseattle.com/event/show/</link>
            <description><![CDATA[Tickets: $20 advance, $25 doors]]></description>
            <event_listing:start_date><![CDATA[2026-06-01 19:30:00]]></event_listing:start_date>
        </item></channel></rss>`;
        const links = parseRSSFeed(xml);
        expect(links).toHaveLength(1);
        expect(links[0].ticketPrice).toBeUndefined();
        expect(links[0].description).toContain('$20');
    });
});

describe('parseRoyalRoomCost', () => {
    it('returns { min: 0 } for Free ticket_price', () => {
        expect(parseRoyalRoomCost('Free', undefined)).toEqual({ min: 0 });
        expect(parseRoyalRoomCost('free', undefined)).toEqual({ min: 0 });
    });

    it('extracts minimum advance price from description', () => {
        expect(parseRoyalRoomCost(undefined, 'Tickets: $20 advance, $25 doors')).toEqual({ min: 20 });
        expect(parseRoyalRoomCost(undefined, 'Tickets: $15 advance, $20 doors')).toEqual({ min: 15 });
        expect(parseRoyalRoomCost(undefined, 'Tickets: $15 ADV, $20 DOS')).toEqual({ min: 15 });
    });

    it('extracts price from description when ticket_price is Paid', () => {
        expect(parseRoyalRoomCost('Paid', 'Tickets: $20 advance, $25 doors')).toEqual({ min: 20 });
    });

    it('falls back to paid:true when no price info available', () => {
        expect(parseRoyalRoomCost(undefined, undefined)).toEqual({ paid: true });
        expect(parseRoyalRoomCost(undefined, 'Join us for a great evening')).toEqual({ paid: true });
    });

    it('returns paid:true for Paid ticket_price with no parseable description', () => {
        expect(parseRoyalRoomCost('Paid', 'Happy Hour description without price')).toEqual({ paid: true });
    });
});
