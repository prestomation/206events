import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseRSSFeed } from './ripper.js';

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
});
