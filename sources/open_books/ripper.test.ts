import { describe, expect, test } from 'vitest';
import OpenBooksRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function loadSampleData() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('OpenBooksRipper - stripHtml', () => {
    const ripper = new OpenBooksRipper();

    test('strips HTML tags and collapses whitespace', () => {
        expect(ripper.stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    });

    test('decodes common HTML entities', () => {
        expect(ripper.stripHtml('&amp; &lt; &gt; &quot; &#039;')).toBe('& < > " \'');
    });
});

describe('OpenBooksRipper - extractListItems', () => {
    const ripper = new OpenBooksRipper();

    test('extracts every <li> tagged with its enclosing month header, ignoring stray empty <ul>s', () => {
        const html = `
            <ul><ul></ul></ul>
            <p><strong><span>September</span></strong></p>
            <ul><li>9/20: Poetry in Conversation</li></ul>
            <p><strong><span>October</span></strong></p>
            <ul>
              <li>10/9: Reading with Ellie Black</li>
              <li>10/18: Poetry in Conversation</li>
            </ul>
        `;
        const items = ripper.extractListItems(html);
        expect(items).toHaveLength(3);
        expect(items[0].monthHeader).toBe('september');
        expect(items[1].monthHeader).toBe('october');
        expect(items[2].monthHeader).toBe('october');
    });

    test('extracts all items from the live sample data', () => {
        const data = loadSampleData();
        const items = ripper.extractListItems(data.page.body_html);
        expect(items.length).toBeGreaterThan(0);
    });
});

describe('OpenBooksRipper - parseTailSegments', () => {
    const ripper = new OpenBooksRipper();

    test('splits a title containing commas from a time range and free cost', () => {
        const result = ripper.parseTailSegments('Reading with Ellie Black, Rivka Clifton & Charlie Lou Evans, 7pm, free');
        expect(result.title).toBe('Reading with Ellie Black, Rivka Clifton & Charlie Lou Evans');
        expect(result.hour).toBe(19);
        expect(result.timeConfident).toBe(true);
        expect(result.cost).toEqual({ min: 0 });
    });

    test('parses a "H:MM-Hpm" range where only the end carries am/pm', () => {
        const result = ripper.parseTailSegments('Poetry in Conversation, feat. Lue Hughes, 12:30-2pm, free');
        expect(result.title).toBe('Poetry in Conversation, feat. Lue Hughes');
        expect(result.hour).toBe(12);
        expect(result.minute).toBe(30);
        expect(result.endHour).toBe(14);
        expect(result.endMinute).toBe(0);
        expect(result.timeConfident).toBe(true);
    });

    test('parses a "H:MM-H:MM" range with NO am/pm on either side as PM-PM (daytime bookstore default)', () => {
        const result = ripper.parseTailSegments('Poetry Office Hours, feat. Kelli Russell Agodon, 12:30-2:30, free');
        expect(result.title).toBe('Poetry Office Hours, feat. Kelli Russell Agodon');
        expect(result.hour).toBe(12);
        expect(result.minute).toBe(30);
        expect(result.endHour).toBe(14);
        expect(result.endMinute).toBe(30);
        expect(result.timeConfident).toBe(true);
    });

    test('title-only entry with no link still yields a clean title (comma-separated trailing fields stripped)', () => {
        const result = ripper.parseTailSegments("Other People's Poems, 7pm, free");
        expect(result.title).toBe("Other People's Poems");
        expect(result.hour).toBe(19);
        expect(result.cost).toEqual({ min: 0 });
    });

    test('extracts a dollar cost', () => {
        const result = ripper.parseTailSegments('Ticketed Reading, 7pm, $10');
        expect(result.cost).toEqual({ min: 10 });
    });

    test('leaves cost undefined when no cost segment is present', () => {
        const result = ripper.parseTailSegments('Some Reading, 7pm');
        expect(result.cost).toBeUndefined();
    });

    test('maps a "donation" cost segment to a $0 minimum, matching the pricing rubric', () => {
        const result = ripper.parseTailSegments('Benefit Reading, 7pm, donation');
        expect(result.title).toBe('Benefit Reading');
        expect(result.cost).toEqual({ min: 0 });
    });

    test('returns timeConfident=false and a placeholder time when no time is present at all', () => {
        const result = ripper.parseTailSegments('A Poetry Reading With No Listed Time, free');
        expect(result.timeConfident).toBe(false);
        expect(result.title).toBe('A Poetry Reading With No Listed Time');
        expect(result.cost).toEqual({ min: 0 });
    });
});

describe('OpenBooksRipper - resolveYear', () => {
    const ripper = new OpenBooksRipper();

    test('keeps the current year when the month/day is still upcoming', () => {
        const now = ZonedDateTime.of(2026, 9, 6, 12, 0, 0, 0, TIMEZONE);
        expect(ripper.resolveYear(11, 22, now)).toBe(2026);
    });

    test('rolls over to next year when the month/day has already passed this year', () => {
        const now = ZonedDateTime.of(2026, 9, 6, 12, 0, 0, 0, TIMEZONE);
        expect(ripper.resolveYear(3, 3, now)).toBe(2027);
    });

    test('rolls over across a year boundary (December -> January)', () => {
        const now = ZonedDateTime.of(2026, 12, 15, 12, 0, 0, 0, TIMEZONE);
        expect(ripper.resolveYear(1, 5, now)).toBe(2027);
    });
});

describe('OpenBooksRipper - parseListItem', () => {
    const ripper = new OpenBooksRipper();
    const eventOf = (results: any[]) => results.find((r: any) => 'date' in r);
    const uncertaintyOf = (results: any[]) => results.find((r: any) => r.type === 'Uncertainty');

    test('parses a linked list item into an event with title, date, time, url, and cost', () => {
        const item = {
            monthHeader: 'september',
            innerHtml: '<span><strong>9/20: </strong><a href="https://open-books-a-poem-emporium.myshopify.com/pages/9-20-poetry-in-conversation-feat-lue-hughes">Poetry in Conversation, feat. Lue Hughes</a>, 12:30-2pm, free</span>',
        };
        const results = ripper.parseListItem(item);
        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event!.summary).toBe('Poetry in Conversation, feat. Lue Hughes');
        expect(event!.date.monthValue()).toBe(9);
        expect(event!.date.dayOfMonth()).toBe(20);
        expect(event!.date.hour()).toBe(12);
        expect(event!.date.minute()).toBe(30);
        expect(event!.duration.toMinutes()).toBe(90);
        expect(event!.url).toBe('https://open-books-a-poem-emporium.myshopify.com/pages/9-20-poetry-in-conversation-feat-lue-hughes');
        expect(event!.cost).toEqual({ min: 0 });
        expect(event!.location).toContain('108 Cherry Street');
        expect(uncertaintyOf(results)).toBeUndefined();
    });

    test('a list item with NO <a> link falls back to the events-calendar page URL and still parses a clean title', () => {
        const item = {
            monthHeader: 'october',
            innerHtml: "<span><strong>10/24</strong>: Other People's Poems, 7pm, free</span>",
        };
        const results = ripper.parseListItem(item);
        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event!.summary).toBe("Other People's Poems");
        expect(event!.url).toBe('https://open-books-a-poem-emporium.myshopify.com/pages/events-calendar');
        expect(event!.date.monthValue()).toBe(10);
        expect(event!.date.dayOfMonth()).toBe(24);
        expect(event!.date.hour()).toBe(19);
    });

    test('emits a startTime UncertaintyError with a placeholder time when no time can be found', () => {
        const item = {
            monthHeader: 'december',
            innerHtml: '<span><strong>12/5</strong>: A Reading With No Listed Time, free</span>',
        };
        const results = ripper.parseListItem(item);
        const event = eventOf(results);
        const uncertainty = uncertaintyOf(results);
        expect(event).toBeDefined();
        expect(event!.date.hour()).toBe(12); // placeholder noon
        expect(uncertainty).toBeDefined();
        expect(uncertainty.unknownFields).toContain('startTime');
        expect(uncertainty.unknownFields).toContain('duration');
        expect(uncertainty.source).toBe('open-books');
        expect(uncertainty.event).toBe(event);
        expect(uncertainty.partialFingerprint).toBeTruthy();
    });

    test('parses the "H:MM-H:MM" no-am/pm range as PM-PM and computes duration', () => {
        const item = {
            monthHeader: 'november',
            innerHtml: '<span><strong>11/29</strong>: <a href="https://open-books-a-poem-emporium.myshopify.com/pages/poet-office-hours">Poetry Office Hours, feat. Kelli Russell Agodon</a>, 12:30-2:30, free</span>',
        };
        const results = ripper.parseListItem(item);
        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event!.date.hour()).toBe(12);
        expect(event!.date.minute()).toBe(30);
        expect(event!.duration.toMinutes()).toBe(120);
        expect(uncertaintyOf(results)).toBeUndefined();
    });

    test('returns a ParseError (not null, not thrown) when no M/D date prefix is found', () => {
        const item = {
            monthHeader: 'october',
            innerHtml: '<span>Some announcement with no date at all</span>',
        };
        const results = ripper.parseListItem(item);
        expect(results).toHaveLength(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });

    test('produces a stable, deterministic id derived from title and date', () => {
        const item = {
            monthHeader: 'october',
            innerHtml: "<span><strong>10/24</strong>: Other People's Poems, 7pm, free</span>",
        };
        const results = ripper.parseListItem(item);
        const event = eventOf(results);
        expect(event!.id).toBe(`open-books-other-people-s-poems-${event!.date.year()}-10-24`);
        // Re-parsing the identical item yields the identical id.
        const again = eventOf(ripper.parseListItem(item));
        expect(again!.id).toBe(event!.id);
    });

    test('returns a ParseError (not a thrown exception) for a calendar-invalid month/day', () => {
        const item = {
            monthHeader: 'october',
            innerHtml: '<span><strong>13/40</strong>: Bogus Date Entry, 7pm, free</span>',
        };
        const results = ripper.parseListItem(item);
        expect(results).toHaveLength(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });

    test('returns a ParseError (not a thrown exception) for a day that does not exist in the given month', () => {
        const item = {
            monthHeader: 'february',
            innerHtml: '<span><strong>2/30</strong>: Bogus Date Entry, 7pm, free</span>',
        };
        const results = ripper.parseListItem(item);
        expect(results).toHaveLength(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });

    test('computes duration across midnight when the event spans into the next day', () => {
        const item = {
            monthHeader: 'october',
            innerHtml: '<span><strong>10/31</strong>: Late Night Reading, 11pm-1am, free</span>',
        };
        const results = ripper.parseListItem(item);
        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event!.date.hour()).toBe(23);
        expect(event!.duration.toMinutes()).toBe(120);
    });
});

describe('OpenBooksRipper - end to end against live sample data', () => {
    const ripper = new OpenBooksRipper();

    test('parses every list item in the sample data into an event or a ParseError, never dropping one silently', () => {
        const data = loadSampleData();
        const items = ripper.extractListItems(data.page.body_html);
        expect(items.length).toBeGreaterThan(0);

        let eventCount = 0;
        let errorCount = 0;
        for (const item of items) {
            const results = ripper.parseListItem(item);
            expect(results.length).toBeGreaterThan(0);
            for (const r of results) {
                if ('date' in r) eventCount++;
                else if (r.type === 'ParseError') errorCount++;
            }
        }
        expect(eventCount).toBeGreaterThan(0);
        expect(errorCount).toBe(0);
    });

    test('finds the "Poetry in Conversation, feat. Lue Hughes" event with correct fields', () => {
        const data = loadSampleData();
        const items = ripper.extractListItems(data.page.body_html);
        const parsedEvents = items
            .flatMap(item => ripper.parseListItem(item))
            .filter((r): r is any => 'date' in r);

        const hughes = parsedEvents.find(e => e.summary.includes('Lue Hughes'));
        expect(hughes).toBeDefined();
        expect(hughes.date.monthValue()).toBe(9);
        expect(hughes.date.dayOfMonth()).toBe(20);
        expect(hughes.date.hour()).toBe(12);
        expect(hughes.date.minute()).toBe(30);
        expect(hughes.cost).toEqual({ min: 0 });
        expect(hughes.url).toContain('9-20-poetry-in-conversation-feat-lue-hughes');
    });
});
