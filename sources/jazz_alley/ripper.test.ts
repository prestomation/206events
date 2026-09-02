import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseHtml } from 'node-html-parser';
import JazzAlleyRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
    return readFileSync(join(__dirname, name), 'utf-8');
}

function isEvent(e: { date?: unknown } | { type?: unknown }): e is RipperCalendarEvent {
    return 'date' in e;
}

function isError(e: { date?: unknown } | { type?: unknown }): e is RipperError {
    return 'type' in e;
}

describe('JazzAlleyRipper.parseCalendarCards', () => {
    const ripper = new JazzAlleyRipper();
    const cards = ripper.parseCalendarCards(loadFixture('sample-data.html'));

    it('parses every show card on the calendar page', () => {
        // Fixture has 4 .news-box cards: 8812, 8813, 8816, 8837.
        expect(cards.length).toBe(4);
    });

    it('dedupes the image-link and title-link (same shownum) into one card', () => {
        const shownums = cards.map(c => c.shownum);
        expect(new Set(shownums).size).toBe(shownums.length);
    });

    it('extracts shownum, title, description, and image for a normal card', () => {
        const card = cards.find(c => c.shownum === '8813');
        expect(card).toBeDefined();
        expect(card!.title).toBe('Lee Ritenour Quartet');
        expect(card!.description).toContain('foundational session icon');
        expect(card!.imageUrl).toBe('https://www.jazzalley.com/www-home/gallery/leeritenour2026_3.jpg');
    });

    it('decodes HTML entities and collapses embedded <br> whitespace in multi-line titles', () => {
        const card = cards.find(c => c.shownum === '8812');
        expect(card).toBeDefined();
        expect(card!.title).toBe('Simon Phillips & Protocol 6 Ernest Tibbs, Otmaro Ruiz, Alex Sill, Phillip Whack');
    });

    it('handles a card with a "new" badge span alongside the image link', () => {
        const card = cards.find(c => c.shownum === '8837');
        expect(card).toBeDefined();
        expect(card!.title).toBe('Boney James Live');
    });
});

describe('JazzAlleyRipper.parsePerformanceText', () => {
    const ripper = new JazzAlleyRipper();

    it('parses a standard "Day, Mon D, YYYY H:MM AM/PM" performance option', () => {
        const parsed = ripper.parsePerformanceText('Fri, Sep 4, 2026 9:30 PM');
        expect(parsed).not.toBeNull();
        expect(parsed!.date.toString()).toBe('2026-09-04');
        expect(parsed!.hour).toBe(21);
        expect(parsed!.minute).toBe(30);
    });

    it('handles 12 AM / 12 PM edge cases correctly', () => {
        expect(ripper.parsePerformanceText('Sun, Jan 4, 2026 12:00 PM')!.hour).toBe(12);
        expect(ripper.parsePerformanceText('Sun, Jan 4, 2026 12:00 AM')!.hour).toBe(0);
    });

    it('returns null for unparsable text', () => {
        expect(ripper.parsePerformanceText('Choose a Performance')).toBeNull();
        expect(ripper.parsePerformanceText('')).toBeNull();
    });
});

describe('JazzAlleyRipper.parseShowDetail', () => {
    const ripper = new JazzAlleyRipper();
    const card = { shownum: '8813', title: 'Lee Ritenour Quartet', description: 'desc', imageUrl: 'https://example.com/img.jpg' };
    const url = 'https://www.jazzalley.com/www-home/artist.jsp?shownum=8813';
    const results = ripper.parseShowDetail(card, loadFixture('sample-event.html'), url);
    const events = results.filter(isEvent);
    const errors = results.filter(isError);

    it('emits one event per remaining performance (a 4-night run with two double-set nights)', () => {
        // Thu 7:30, Fri 7:30, Fri 9:30, Sat 7:30, Sat 9:30, Sun 7:30 = 6 performances
        expect(events.length).toBe(6);
        expect(errors).toEqual([]);
    });

    it('gives every performance a stable, unique id keyed off shownum + perfnum', () => {
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^jazz-alley-8813-\d+$/);
    });

    it('parses the early/late showtimes on a double-set night correctly', () => {
        const early = events.find(e => e.date.toLocalDate().toString() === '2026-09-04' && e.date.hour() === 19);
        const late = events.find(e => e.date.toLocalDate().toString() === '2026-09-04' && e.date.hour() === 21);
        expect(early).toBeDefined();
        expect(late).toBeDefined();
        expect(early!.id).not.toBe(late!.id);
    });

    it('applies the shared show fields (title, description, image, venue, price) to every performance', () => {
        for (const e of events) {
            expect(e.summary).toBe('Lee Ritenour Quartet');
            expect(e.description).toBe('desc');
            expect(e.imageUrl).toBe('https://example.com/img.jpg');
            expect(e.location).toBe("Dimitriou's Jazz Alley, 2033 6th Ave, Seattle, WA 98121");
            expect(e.cost).toEqual({ min: 43 });
            expect(e.url).toBe(url);
        }
    });

    it('returns a ParseError when no performance options are present (sold-out / past run)', () => {
        const emptyHtml = '<html><body><select name="perfnum"><option value="0">Choose a Performance</option></select></body></html>';
        const result = ripper.parseShowDetail(card, emptyHtml, url);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ type: 'ParseError' });
    });

    it('emits an event with cost.soldOut for a fully-sold-out performance instead of a ParseError', () => {
        // Real observed shape: value stays "0" (shared with the placeholder) but the
        // text carries the real date/time plus a " - FULL" suffix.
        const soldOutHtml = `<html><body>
            <select name="perfnum">
                <option value="0">Choose a Performance</option>
                <option value=0>Mon, Sep 28, 2026 7:30 PM - FULL</option>
            </select>
            <div class="price-box"><strong class="price">$45.00</strong></div>
        </body></html>`;
        const result = ripper.parseShowDetail(card, soldOutHtml, url);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ date: expect.anything() });
        const event = result[0] as RipperCalendarEvent;
        expect(event.date.toLocalDate().toString()).toBe('2026-09-28');
        expect(event.date.hour()).toBe(19);
        expect(event.cost).toEqual({ soldOut: true });
    });
});

describe('JazzAlleyRipper.parsePerformances', () => {
    const ripper = new JazzAlleyRipper();

    it('skips the placeholder "Choose a Performance" option', () => {
        const doc = parseHtml(loadFixture('sample-event.html'));
        const performances = ripper.parsePerformances(doc);
        expect(performances.every(p => p.perfnum !== '0')).toBe(true);
        expect(performances.length).toBe(6);
    });
});
