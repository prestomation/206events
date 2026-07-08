import { describe, expect, test } from 'vitest';
import VermillionGalleryRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('VermillionGalleryRipper - parseDateTimeFromLine', () => {
    const ripper = new VermillionGalleryRipper();

    test('parses "Opening Weekday, Month Day, Year H-Hpm"', () => {
        const result = ripper.parseDateTimeFromLine('Opening Thursday, July 2, 2026 5-8pm');
        expect(result).not.toBeNull();
        expect(result!.year).toBe(2026);
        expect(result!.month).toBe(7);
        expect(result!.day).toBe(2);
        expect(result!.startHour).toBe(17);
        expect(result!.startMinute).toBe(0);
        expect(result!.endHour).toBe(20);
        expect(result!.endMinute).toBe(0);
    });

    test('parses "Artwalk Reception: Weekday, Month Day, Year H-Hpm"', () => {
        const result = ripper.parseDateTimeFromLine('Capitol Hill Artwalk Reception: Thursday, July 9, 2026 5-9pm');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(7);
        expect(result!.day).toBe(9);
        expect(result!.startHour).toBe(17);
        expect(result!.endHour).toBe(21);
    });

    test('parses times with minutes, e.g. "6:30-8:30pm"', () => {
        const result = ripper.parseDateTimeFromLine('Opening Friday, March 6, 2026 6:30-8:30pm');
        expect(result).not.toBeNull();
        expect(result!.startHour).toBe(18);
        expect(result!.startMinute).toBe(30);
        expect(result!.endHour).toBe(20);
        expect(result!.endMinute).toBe(30);
    });

    test('returns null for lines with no date', () => {
        expect(ripper.parseDateTimeFromLine('Show runs through August 3, 2026')).toBeNull();
        expect(ripper.parseDateTimeFromLine('')).toBeNull();
    });
});

describe('VermillionGalleryRipper - parseHomepageHtml', () => {
    const ripper = new VermillionGalleryRipper();

    test('extracts opening reception and art walk events from the sample homepage', () => {
        const events = ripper.parseHomepageHtml(loadSampleHtml());
        const calEvents = events.filter((e): e is RipperCalendarEvent => 'date' in e);
        const errors = events.filter((e): e is RipperError => 'type' in e);

        expect(errors).toEqual([]);
        expect(calEvents).toHaveLength(2);

        const opening = calEvents.find(e => e.summary.includes('Opening Reception'));
        expect(opening).toBeDefined();
        expect(opening!.summary).toBe('Jeff Mihalyo: PAST & PRESENT — Opening Reception');
        expect(opening!.date.toString()).toContain('2026-07-02T17:00');
        expect(opening!.duration.toMinutes()).toBe(180);
        expect(opening!.description).toContain('Show runs through August 3, 2026');
        expect(opening!.location).toBe('Vermillion, 1508 11th Ave, Seattle, WA 98122');

        const artwalk = calEvents.find(e => e.summary.includes('Capitol Hill Art Walk'));
        expect(artwalk).toBeDefined();
        expect(artwalk!.date.toString()).toContain('2026-07-09T17:00');
        expect(artwalk!.duration.toMinutes()).toBe(240);

        // Stable ids: same title/date input always produces the same id.
        expect(opening!.id).toBe('vermillion-gallery-jeff-mihalyo-past-present-opening-reception-20260702');
        expect(artwalk!.id).toBe('vermillion-gallery-jeff-mihalyo-past-present-capitol-hill-art-walk-20260709');
    });

    test('returns a ParseError when no exhibition block is found', () => {
        const events = ripper.parseHomepageHtml('<html><body><p>no exhibition here</p></body></html>');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'ParseError' });
    });

    test('ignores html blocks with an h4 but no dated h3', () => {
        const html = `<div class="sqs-html-content"><h4>Coming Soon</h4><h3>Details to be announced</h3></div>`;
        const events = ripper.parseHomepageHtml(html);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'ParseError' });
    });
});
