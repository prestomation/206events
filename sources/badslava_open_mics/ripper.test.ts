import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseHtml } from 'node-html-parser';
import { ZoneId } from '@js-joda/core';
import { extractOpenMicEntries, parseOpenMicEntry, cleanVenueName, hasParseableTime } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE = ZoneId.of('America/Los_Angeles');

function loadFixture(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-events.html'), 'utf8');
}

describe('extractOpenMicEntries', () => {
    it('extracts every listing from the week table', () => {
        const html = parseHtml(loadFixture());
        const entries = extractOpenMicEntries(html);
        expect(entries.length).toBeGreaterThan(20);
    });

    it('carries the most recent date header forward across rows', () => {
        const html = parseHtml(loadFixture());
        const entries = extractOpenMicEntries(html);
        const first = entries.find(e => e.venueName.includes('Innervisions'));
        expect(first?.dateStr).toBe('09/04/26');
        const saturday = entries.find(e => e.venueName === 'Inside');
        expect(saturday?.dateStr).toBe('09/05/26');
    });

    it('parses venue name, address, time, and detail id/url', () => {
        const html = parseHtml(loadFixture());
        const entries = extractOpenMicEntries(html);
        const substation = entries.find(e => e.venueName === 'Substation Seattle');
        expect(substation).toBeDefined();
        expect(substation!.address).toBe('645 NW 45th St Seattle WA');
        expect(substation!.time).toBe('8:00pm');
        expect(substation!.detailId).toBe('13690');
        expect(substation!.detailUrl).toContain('details.php?id=13690');
    });

    it('returns an empty list for a table with no header rows', () => {
        const entries = extractOpenMicEntries(parseHtml('<table><tr><td>7:00pm</td><td><a href="x"><b>V</b><br>addr</a></td></tr></table>'));
        expect(entries).toEqual([]);
    });

    it('skips a row missing a venue name or address', () => {
        const html = parseHtml(`
            <table>
                <tr><th colspan="2">Friday 09/04/26</th></tr>
                <tr><td>7:00pm</td><td><a href="https://badslava.com/details.php?id=1"><b></b></a></td></tr>
            </table>
        `);
        expect(extractOpenMicEntries(html)).toEqual([]);
    });

    it('strips marketing-tagline suffixes from scraped venue names', () => {
        const html = parseHtml(loadFixture());
        const entries = extractOpenMicEntries(html);
        const skylark = entries.find(e => e.venueName.startsWith('Skylark'));
        expect(skylark?.venueName).toBe('Skylark Cafe & Club');
        const couthBuzzard = entries.find(e => e.venueName.includes('Couth Buzzard'));
        expect(couthBuzzard?.venueName).toBe('The Couth Buzzard');
    });
});

describe('cleanVenueName', () => {
    it('trims a "- tagline" suffix', () => {
        expect(cleanVenueName('The Couth Buzzard - Books & Community')).toBe('The Couth Buzzard');
    });

    it('trims a "- tagline | more" suffix with no space before the hyphen', () => {
        expect(cleanVenueName('Skylark Cafe & Club- Live Music | Scratch Kitchen | West Seattle')).toBe('Skylark Cafe & Club');
    });

    it('leaves a plain venue name with no delimiter unchanged', () => {
        expect(cleanVenueName('Rickshaw Restaurant & Lounge')).toBe('Rickshaw Restaurant & Lounge');
    });

    it('leaves apostrophes in venue names unchanged', () => {
        expect(cleanVenueName("BoneYard's Howlin' Bistro")).toBe("BoneYard's Howlin' Bistro");
    });
});

describe('hasParseableTime', () => {
    it('recognizes a standard listing time', () => {
        expect(hasParseableTime('8:00pm')).toBe(true);
    });

    it('rejects free-text placeholders', () => {
        expect(hasParseableTime('TBD')).toBe(false);
    });
});

describe('parseOpenMicEntry', () => {
    const baseEntry = {
        detailId: '13690',
        detailUrl: 'https://badslava.com/details.php?id=13690',
        venueName: 'Substation Seattle',
        address: '645 NW 45th St Seattle WA',
        time: '8:00pm',
        dateStr: '09/07/26',
    };

    it('parses a well-formed entry into an event', () => {
        const result = parseOpenMicEntry(baseEntry, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.summary).toBe('Open Mic at Substation Seattle');
        expect(result.id).toBe('badslava-13690-20260907');
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(9);
        expect(result.date.dayOfMonth()).toBe(7);
        expect(result.date.hour()).toBe(20);
        expect(result.date.minute()).toBe(0);
        expect(result.location).toBe('645 NW 45th St Seattle WA');
    });

    it('parses a 12am time as midnight', () => {
        const result = parseOpenMicEntry({ ...baseEntry, time: '12:00am' }, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.hour()).toBe(0);
    });

    it('returns a ParseError for an unparseable date', () => {
        const result = parseOpenMicEntry({ ...baseEntry, dateStr: 'not-a-date' }, ZONE);
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });

    it('returns a ParseError for an out-of-range date', () => {
        const result = parseOpenMicEntry({ ...baseEntry, dateStr: '02/30/27' }, ZONE);
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });

    it('falls back to a default evening time when the time is unparseable', () => {
        const result = parseOpenMicEntry({ ...baseEntry, time: 'TBD' }, ZONE);
        if (!('date' in result)) throw new Error('expected an event');
        expect(result.date.hour()).toBe(19);
        expect(result.date.minute()).toBe(0);
    });
});
