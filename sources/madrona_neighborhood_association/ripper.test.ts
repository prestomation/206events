import { describe, expect, test } from 'vitest';
import MadronaNeighborhoodAssociationRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

const TRICK_OR_TREAT_PAGE = {
    slug: 'trick-or-treat-34th-ave',
    path: '/trickortreat/',
    title: 'Trick or Treat 34th Ave',
    location: 'The Madrona Business District, 34th Ave, Seattle, WA 98122',
    url: 'https://madrona.us/trickortreat/',
};

const MONTHLY_MEETING_PAGE = {
    slug: 'monthly-meeting',
    path: '/monthlymeetings/',
    title: 'Madrona Neighborhood Association Monthly Meeting',
    location: 'Madrona Playground Shelter House, 3211 E Spring St, Seattle, WA 98122',
    url: 'https://madrona.us/monthlymeetings/',
};

const MUSIC_PAGE = {
    slug: 'music-in-the-playfield',
    path: '/musicintheplayfield/',
    title: 'Music In The Playfield',
    location: 'Madrona Playfield, 3211 E Spring St, Seattle, WA 98122',
    url: 'https://madrona.us/musicintheplayfield/',
};

const TBA_PAGE = { ...TRICK_OR_TREAT_PAGE, slug: 'unknown-page' };

describe('MadronaNeighborhoodAssociationRipper - stripHtml', () => {
    const ripper = new MadronaNeighborhoodAssociationRipper();

    test('strips tags, collapses whitespace, and decodes entities', () => {
        expect(ripper.stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
        expect(ripper.stripHtml('&amp; &lt; &gt; &quot; &#039;')).toBe('& < > " \'');
        expect(ripper.stripHtml('a&nbsp;b')).toBe('a b');
        expect(ripper.stripHtml('a&middot;b')).toBe('a·b');
    });

    test('drops script and style blocks entirely', () => {
        const html = '<script>var x = 1;</script><style>.a{color:red}</style><p>Text</p>';
        expect(ripper.stripHtml(html)).toBe('Text');
    });
});

describe('MadronaNeighborhoodAssociationRipper - parseTimeRange', () => {
    const ripper = new MadronaNeighborhoodAssociationRipper();

    test('parses "4-6PM" inferring the start period from the end', () => {
        const result = ripper.parseTimeRange('4-6PM');
        expect(result).toEqual({ hour: 16, minute: 0, endHour: 18, endMinute: 0 });
    });

    test('parses "7:00PM-8:15PM" with explicit periods on both sides', () => {
        const result = ripper.parseTimeRange('7:00PM-8:15PM');
        expect(result).toEqual({ hour: 19, minute: 0, endHour: 20, endMinute: 15 });
    });

    test('parses "6 to 8 PM" using "to" as the separator', () => {
        const result = ripper.parseTimeRange('6 to 8 PM');
        expect(result).toEqual({ hour: 18, minute: 0, endHour: 20, endMinute: 0 });
    });

    test('returns null when no time range is present', () => {
        expect(ripper.parseTimeRange('Date To be Announced')).toBeNull();
    });
});

describe('MadronaNeighborhoodAssociationRipper - parsePage', () => {
    const ripper = new MadronaNeighborhoodAssociationRipper();

    test('parses Trick or Treat with a concrete date and time', () => {
        const text = ripper.stripHtml(loadFixture('sample-trickortreat.html'));
        const results = ripper.parsePage(TRICK_OR_TREAT_PAGE, text);

        expect(results).toHaveLength(1);
        const event = results[0] as RipperCalendarEvent;
        expect(event.date.year()).toBe(2026);
        expect(event.date.monthValue()).toBe(10);
        expect(event.date.dayOfMonth()).toBe(31);
        expect(event.date.hour()).toBe(16);
        expect(event.duration.toMinutes()).toBe(120);
        expect(event.id).toBe('madrona-trick-or-treat-2026-10-31');
        expect(event.location).toBe(TRICK_OR_TREAT_PAGE.location);
        expect(event.summary).toBe('Trick or Treat 34th Ave');
    });

    test('parses the next Monthly Meeting announcement', () => {
        const text = ripper.stripHtml(loadFixture('sample-monthlymeetings.html'));
        const results = ripper.parsePage(MONTHLY_MEETING_PAGE, text);

        expect(results).toHaveLength(1);
        const event = results[0] as RipperCalendarEvent;
        expect(event.date.year()).toBe(2026);
        expect(event.date.monthValue()).toBe(10);
        expect(event.date.dayOfMonth()).toBe(7);
        expect(event.date.hour()).toBe(19);
        expect(event.date.minute()).toBe(0);
        expect(event.duration.toMinutes()).toBe(75);
        expect(event.id).toBe('madrona-monthly-meeting-2026-10-7');
    });

    test('parses Music In The Playfield into one event per dated Tuesday', () => {
        const text = ripper.stripHtml(loadFixture('sample-musicintheplayfield.html'));
        const results = ripper.parsePage(MUSIC_PAGE, text) as RipperCalendarEvent[];

        expect(results).toHaveLength(3);
        expect(results.map(e => e.date.dayOfMonth())).toEqual([11, 18, 25]);
        for (const event of results) {
            expect(event.date.year()).toBe(2026);
            expect(event.date.monthValue()).toBe(8);
            expect(event.date.hour()).toBe(18);
            expect(event.duration.toMinutes()).toBe(120);
            expect(event.summary).toBe('Music In The Playfield');
        }
        expect(results[0].id).toBe('madrona-music-in-the-playfield-2026-8-11');
    });

    test('returns a ParseError for a TBA event with no concrete date', () => {
        const text = ripper.stripHtml(loadFixture('sample-tba.html'));
        const results = ripper.parsePage(TBA_PAGE, text);

        expect(results).toHaveLength(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });

    test('ignores an unrelated "Month D, YYYY"-shaped decoy elsewhere on the page (Trick or Treat is anchored on "Business District")', () => {
        const decoyText = `Copyright © September 5, 2026 Madrona Neighborhood Association. `
            + ripper.stripHtml(loadFixture('sample-trickortreat.html'));
        const results = ripper.parsePage(TRICK_OR_TREAT_PAGE, decoyText) as RipperCalendarEvent[];

        expect(results).toHaveLength(1);
        expect(results[0].date.monthValue()).toBe(10);
        expect(results[0].date.dayOfMonth()).toBe(31);
        expect(results[0].date.year()).toBe(2026);
    });

    test('parses a 4-Tuesday season without dropping the 4th date', () => {
        const text = ripper.stripHtml(loadFixture('sample-musicintheplayfield.html'))
            .replace('AUGUST 11 · 18 · 25', 'AUGUST 4 · 11 · 18 · 25');
        const results = ripper.parsePage(MUSIC_PAGE, text) as RipperCalendarEvent[];

        expect(results.map(e => e.date.dayOfMonth())).toEqual([4, 11, 18, 25]);
    });

    test('matches the dated-Tuesdays heading case-insensitively', () => {
        const text = ripper.stripHtml(loadFixture('sample-musicintheplayfield.html'))
            .replace('AUGUST 11 · 18 · 25', 'August 11 · 18 · 25');
        const results = ripper.parsePage(MUSIC_PAGE, text) as RipperCalendarEvent[];

        expect(results).toHaveLength(3);
        expect(results.map(e => e.date.dayOfMonth())).toEqual([11, 18, 25]);
    });

    test('returns a ParseError instead of throwing when the parsed date is invalid', () => {
        const text = ripper.stripHtml(loadFixture('sample-trickortreat.html'))
            .replace('Oct 31, 2026', 'Feb 30, 2026');
        expect(() => ripper.parsePage(TRICK_OR_TREAT_PAGE, text)).not.toThrow();

        const results = ripper.parsePage(TRICK_OR_TREAT_PAGE, text);
        expect(results).toHaveLength(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });
});
