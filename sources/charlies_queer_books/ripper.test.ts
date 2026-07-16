import { describe, expect, test } from 'vitest';
import CharliesQueerBooksRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('CharliesQueerBooksRipper - parseRow', () => {
    const ripper = new CharliesQueerBooksRipper();
    const rows = loadSampleData().rows;
    const byId = (id: number) => rows.find((r: any) => r.id === id);

    test('parses an in-store event with start/end time and description', () => {
        const result = ripper.parseRow(byId(1236120260716));
        expect('date' in result).toBe(true);
        if (!('date' in result)) throw new Error('expected event');
        expect(result.summary).toBe('Silent Book Club');
        expect(result.id).toBe('charlies-queer-books-1236120260716');
        expect(result.location).toBe('Charlie\'s Queer Books, 465 N 36th St, Seattle, WA 98103');
        expect(result.date.toString()).toContain('2026-07-16T18:00');
        expect(result.duration.toHours()).toBe(2);
        expect(result.description).toBe(
            'Bring your own book and read together quietly. 6-6:30 Meet the group and see what everyone brought 6:30-7:30 Reading silently 7:30-8 Chat and hang out! Talk about the book you read or just make a new friend.'
        );
        expect(result.url).toBe('https://charliesqueerbooks.com/events/1236120260716');
    });

    test('maps a known off-site location (SPL Ballard Branch) to its address and coords', () => {
        const result = ripper.parseRow(byId(5737220260723));
        if (!('date' in result)) throw new Error('expected event');
        expect(result.location).toBe('Ballard Branch, Seattle Public Library, 5614 22nd Ave NW, Seattle, WA 98107');
        expect(result.lat).toBe(47.6671);
        expect(result.lng).toBe(-122.3836);
        expect(result.geocodeSource).toBe('ripper');
    });

    test('maps a known off-site location (Town Hall Seattle) to its address and coords', () => {
        const result = ripper.parseRow(byId(5825020261017));
        if (!('date' in result)) throw new Error('expected event');
        expect(result.location).toBe('Town Hall Seattle, 1119 8th Ave, Seattle, WA 98101');
        expect(result.lat).toBe(47.6090);
        expect(result.lng).toBe(-122.3299);
    });

    test('maps a virtual event to "Virtual" with no coordinate override', () => {
        const result = ripper.parseRow(byId(992320260811));
        if (!('date' in result)) throw new Error('expected event');
        expect(result.location).toBe('Virtual');
        expect(result.lat).toBeUndefined();
        expect(result.geocodeSource).toBeUndefined();
    });

    test('returns a ParseError for an unparseable date', () => {
        const result = ripper.parseRow({
            id: 999,
            title: 'Bad Date Event',
            date: 'not-a-date',
        } as any);
        expect('type' in result && result.type === 'ParseError').toBe(true);
    });

    test('defaults to a 1-hour duration when end_time is missing', () => {
        const result = ripper.parseRow({
            id: 1000,
            title: 'No End Time Event',
            date: '20260801',
            start_time: '10:00:00',
        } as any);
        if (!('date' in result)) throw new Error('expected event');
        expect(result.duration.toHours()).toBe(1);
    });

    test('defaults to midnight start when start_time is missing', () => {
        const result = ripper.parseRow({
            id: 1001,
            title: 'All Day Event',
            date: '20260801',
        } as any);
        if (!('date' in result)) throw new Error('expected event');
        expect(result.date.hour()).toBe(0);
        expect(result.date.minute()).toBe(0);
    });
});

describe('CharliesQueerBooksRipper - stripHtml', () => {
    const ripper = new CharliesQueerBooksRipper();

    test('strips HTML tags and collapses whitespace', () => {
        expect(ripper.stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    });

    test('handles empty string', () => {
        expect(ripper.stripHtml('')).toBe('');
    });
});
