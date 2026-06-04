import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parseEventCards, parseDateText, parseLocationFromHtml, parseImageFromHtml, EventCard } from './ripper.js';
import SeattlePrideRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');
const sampleDetailHtml = readFileSync(join(__dirname, 'sample-detail.html'), 'utf-8');

const ZONE = ZoneId.of('America/Los_Angeles');
const CURRENT_YEAR = 2026;

describe('parseEventCards', () => {
    it('extracts event cards from list page', () => {
        const cards = parseEventCards(sampleHtml);
        expect(cards.length).toBeGreaterThan(20);
    });

    it('extracts title, dateText, description, and link from a card', () => {
        const cards = parseEventCards(sampleHtml);
        const first = cards[0];
        expect(first.title).toBeTruthy();
        expect(first.dateText).toMatch(/May|June|July|August/i);
        expect(first.link).toContain('seattlepride.org');
    });

    it('all cards have non-empty titles', () => {
        const cards = parseEventCards(sampleHtml);
        for (const card of cards) {
            expect(card.title.length).toBeGreaterThan(0);
        }
    });
});

describe('parseDateText', () => {
    it('parses date with start and end time', () => {
        const result = parseDateText('May 23, 7:00 pm\n                 - 11:45 pm', CURRENT_YEAR);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(23);
        expect(result!.year).toBe(2026);
        expect(result!.startHour).toBe(19);
        expect(result!.startMinute).toBe(0);
        expect(result!.endHour).toBe(23);
        expect(result!.endMinute).toBe(45);
    });

    it('parses date with explicit year and no time', () => {
        const result = parseDateText('June 3, 2026', CURRENT_YEAR);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(6);
        expect(result!.day).toBe(3);
        expect(result!.year).toBe(2026);
        expect(result!.startHour).toBe(12); // default noon
    });

    it('parses date with no year and no time', () => {
        const result = parseDateText('June 6, 2026', CURRENT_YEAR);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(6);
        expect(result!.day).toBe(6);
        expect(result!.year).toBe(2026);
    });

    it('treats midnight-to-midnight as date-only (noon default)', () => {
        const result = parseDateText(
            'May 29, 12:00 am\n                 - 12:00 am\n             \n             - Shows run May 29-30, June 4-6',
            CURRENT_YEAR
        );
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(29);
        expect(result!.startHour).toBe(12); // noon default for midnight-to-midnight
    });

    it('parses multi-date annotation and uses only first date', () => {
        const result = parseDateText(
            'June 25, 12:00 pm\n                 - 5:00 pm\n      \n - Thursday June 25th, Friday June 26th, Saturday June 27th',
            CURRENT_YEAR
        );
        expect(result).not.toBeNull();
        expect(result!.month).toBe(6);
        expect(result!.day).toBe(25);
        expect(result!.startHour).toBe(12);
        expect(result!.endHour).toBe(17);
    });

    it('parses afternoon times correctly', () => {
        const result = parseDateText('June 6, 9:30 am\n                 - 1:00 pm', CURRENT_YEAR);
        expect(result).not.toBeNull();
        expect(result!.startHour).toBe(9);
        expect(result!.startMinute).toBe(30);
        expect(result!.endHour).toBe(13);
        expect(result!.endMinute).toBe(0);
    });

    it('parses 12pm correctly as noon', () => {
        const result = parseDateText('August 16, 12:00 pm\n                 - 6:00 pm', CURRENT_YEAR);
        expect(result).not.toBeNull();
        expect(result!.startHour).toBe(12);
        expect(result!.endHour).toBe(18);
    });

    it('returns null for unparseable date', () => {
        const result = parseDateText('not a date', CURRENT_YEAR);
        expect(result).toBeNull();
    });
});

describe('parseLocationFromHtml', () => {
    it('extracts address from detail page', () => {
        const location = parseLocationFromHtml(sampleDetailHtml);
        expect(location).not.toBeNull();
        expect(location).toContain('Seattle');
        expect(location).toContain('WA');
    });

    it('returns null for pages with no address', () => {
        const location = parseLocationFromHtml('<html><body><p>No address here</p></body></html>');
        expect(location).toBeNull();
    });
});

describe('parseImageFromHtml', () => {
    it('extracts the per-event og:image from the detail page', () => {
        const image = parseImageFromHtml(sampleDetailHtml);
        expect(image).toBe(
            'https://seattlepride.org/web/app/templates/assets/image/_1200x620_crop_center-center_none/156899/QPS2026_1.jpg'
        );
    });

    it('returns null for pages with no og:image', () => {
        const image = parseImageFromHtml('<html><head></head><body><p>nothing</p></body></html>');
        expect(image).toBeNull();
    });
});

describe('SeattlePrideRipper.parseCard', () => {
    const ripper = new SeattlePrideRipper();

    it('returns a RipperCalendarEvent for a valid card', () => {
        const card: EventCard = {
            title: 'Seattle Pride Parade',
            dateText: 'June 28, 2026',
            description: 'Annual Seattle Pride Parade',
            link: 'https://seattlepride.org/events/seattle-pride-parade-2026',
        };
        const zone = ZoneId.of('America/Los_Angeles');
        const result = ripper.parseCard(card, 2026, '600 1st Ave, Seattle, WA 98104', zone, card.link);
        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.summary).toBe('Seattle Pride Parade');
            expect(result.date.monthValue()).toBe(6);
            expect(result.date.dayOfMonth()).toBe(28);
            expect(result.id).toBe('seattle-pride-seattle-pride-parade-2026');
            expect(result.location).toBe('600 1st Ave, Seattle, WA 98104');
        }
    });

    it('returns a RipperCalendarEvent with duration from start/end times', () => {
        const card: EventCard = {
            title: 'Queer Prom',
            dateText: 'May 23, 7:00 pm\n                 - 11:45 pm',
            description: 'Myths & Rainbows',
            link: 'https://seattlepride.org/events/queer-prom-seattle-2026',
        };
        const zone = ZoneId.of('America/Los_Angeles');
        const result = ripper.parseCard(card, 2026, null, zone, card.link);
        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.date.hour()).toBe(19);
            // Duration: 7pm to 11:45pm = 285 minutes
            expect(result.duration.toMinutes()).toBe(285);
        }
    });

    it('sets imageUrl when a detail-page image is provided', () => {
        const card: EventCard = {
            title: 'Queer Prom',
            dateText: 'May 23, 7:00 pm\n                 - 11:45 pm',
            description: 'Myths & Rainbows',
            link: 'https://seattlepride.org/events/queer-prom-seattle-2026',
        };
        const zone = ZoneId.of('America/Los_Angeles');
        const imageUrl =
            'https://seattlepride.org/web/app/templates/assets/image/_1200x620_crop_center-center_none/156899/QPS2026_1.jpg';
        const result = ripper.parseCard(card, 2026, null, zone, card.link, imageUrl);
        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.imageUrl).toBe(imageUrl);
        }
    });

    it('leaves imageUrl undefined when none is provided', () => {
        const card: EventCard = {
            title: 'No Image Event',
            dateText: 'June 28, 2026',
            description: '',
            link: 'https://seattlepride.org/events/no-image',
        };
        const zone = ZoneId.of('America/Los_Angeles');
        const result = ripper.parseCard(card, 2026, null, zone, card.link);
        expect('date' in result).toBe(true);
        if ('date' in result) {
            expect(result.imageUrl).toBeUndefined();
        }
    });

    it('returns a ParseError for unparseable date', () => {
        const card: EventCard = {
            title: 'Bad Event',
            dateText: 'not a valid date',
            description: '',
            link: '',
        };
        const zone = ZoneId.of('America/Los_Angeles');
        const result = ripper.parseCard(card, 2026, null, zone, 'https://seattlepride.org/events/bad');
        expect('type' in result).toBe(true);
        expect((result as any).type).toBe('ParseError');
    });

    it('uses default duration when no end time provided', () => {
        const card: EventCard = {
            title: 'Date-only Event',
            dateText: 'June 28, 2026',
            description: '',
            link: 'https://seattlepride.org/events/date-only',
        };
        const zone = ZoneId.of('America/Los_Angeles');
        const result = ripper.parseCard(card, 2026, null, zone, card.link);
        expect('date' in result).toBe(true);
        if ('date' in result) {
            // Default 2 hours
            expect(result.duration.toHours()).toBe(2);
        }
    });
});
