import { describe, expect, test } from 'vitest';
import CardfestNWRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('CardfestNWRipper - parseEventBlocks', () => {
    const ripper = new CardfestNWRipper();

    test('extracts two event blocks from sample data', () => {
        const html = loadSampleData();
        const blocks = ripper.parseEventBlocks(html);
        expect(blocks).toHaveLength(2);
    });

    test('parses Emerald City Cardfest block correctly', () => {
        const html = loadSampleData();
        const blocks = ripper.parseEventBlocks(html);
        const block = blocks[0];
        expect(block.slug).toBe('emerald-city-cardfest-seattle-06062026');
        expect(block.dateText).toBe('June 6-7');
        expect(block.timeText).toBe('12pm-5pm (10am VIP Entry)');
        expect(block.building).toBe('Seattle Center Exhibition Hall');
        expect(block.address).toBe('301 Mercer St Seattle, WA 98109');
    });

    test('parses Gold Star Card Show block correctly', () => {
        const html = loadSampleData();
        const blocks = ripper.parseEventBlocks(html);
        const block = blocks[1];
        expect(block.slug).toBe('gold-star-card-show-06132026');
        expect(block.dateText).toBe('June 13');
        expect(block.timeText).toBe('11am-4pm (10am VIP Entry)');
        expect(block.building).toBe('Everett Community College Walt Price Student Fitness Center');
        expect(block.address).toBe('2206 Tower St, Everett, WA 98201');
    });
});

describe('CardfestNWRipper - titleFromSlug', () => {
    const ripper = new CardfestNWRipper();

    test('strips date and title-cases slug words', () => {
        expect(ripper.titleFromSlug('emerald-city-cardfest-seattle-06062026'))
            .toBe('Emerald City Cardfest Seattle');
        expect(ripper.titleFromSlug('gold-star-card-show-06132026'))
            .toBe('Gold Star Card Show');
    });
});

describe('CardfestNWRipper - parseEvent', () => {
    const ripper = new CardfestNWRipper();

    test('parses Emerald City Cardfest event correctly', () => {
        const block = {
            slug: 'emerald-city-cardfest-seattle-06062026',
            dateText: 'June 6-7',
            timeText: '12pm-5pm (10am VIP Entry)',
            building: 'Seattle Center Exhibition Hall',
            address: '301 Mercer St Seattle, WA 98109',
        };
        const result = ripper.parseEvent(block, 'Emerald City Cardfest - Seattle');
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.id).toBe('cardfestnw-emerald-city-cardfest-seattle-06062026');
        expect(result.summary).toBe('Emerald City Cardfest - Seattle');
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(6);
        expect(result.date.dayOfMonth()).toBe(6);
        expect(result.date.hour()).toBe(12);
        expect(result.duration.toMinutes()).toBe(300); // 12pm-5pm = 5 hours
        expect(result.location).toBe('Seattle Center Exhibition Hall, 301 Mercer St Seattle, WA 98109');
        expect(result.url).toBe('https://www.ontreasure.com/events/emerald-city-cardfest-seattle-06062026');
    });

    test('parses Gold Star Card Show event correctly', () => {
        const block = {
            slug: 'gold-star-card-show-06132026',
            dateText: 'June 13',
            timeText: '11am-4pm (10am VIP Entry)',
            building: 'Everett Community College Walt Price Student Fitness Center',
            address: '2206 Tower St, Everett, WA 98201',
        };
        const result = ripper.parseEvent(block, 'Gold Star Card Show');
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(6);
        expect(result.date.dayOfMonth()).toBe(13);
        expect(result.date.hour()).toBe(11);
        expect(result.duration.toMinutes()).toBe(300); // 11am-4pm = 5 hours
    });

    test('returns ParseError for slug without date suffix', () => {
        const block = {
            slug: 'no-date-here',
            dateText: 'June 13',
            timeText: '11am-4pm',
            building: 'Some Venue',
            address: '123 Main St',
        };
        const result = ripper.parseEvent(block, 'Test Event');
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    test('returns ParseError for unparseable time', () => {
        const block = {
            slug: 'some-event-06132026',
            dateText: 'June 13',
            timeText: 'noon until evening',
            building: 'Some Venue',
            address: '123 Main St',
        };
        const result = ripper.parseEvent(block, 'Test Event');
        expect('type' in result).toBe(true);
        if (!('type' in result)) return;
        expect(result.type).toBe('ParseError');
    });

    test('handles midnight-crossing times correctly', () => {
        const block = {
            slug: 'late-event-06132026',
            dateText: 'June 13',
            timeText: '11pm-2am',
            building: 'Some Venue',
            address: '123 Main St, Seattle, WA 98101',
        };
        const result = ripper.parseEvent(block, 'Late Night Event');
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.date.hour()).toBe(23);
        expect(result.duration.toMinutes()).toBe(180); // 11pm to 2am = 3 hours
    });
});
