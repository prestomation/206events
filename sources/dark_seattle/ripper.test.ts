import { describe, expect, test } from 'vitest';
import DarkSeattleRipper, { isOutsideSeattle } from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleHtml = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
const testDate = ZonedDateTime.parse('2026-09-23T10:00:00-07:00[America/Los_Angeles]');

async function run(html: string, date = testDate) {
    const events = await new DarkSeattleRipper().parseEvents(parse(html), date, {});
    return {
        events: events.filter(e => 'date' in e) as RipperCalendarEvent[],
        errors: events.filter(e => 'type' in e) as RipperError[],
    };
}

function page(body: string): string {
    return `<html><body><main><h1>x</h1>${body}</main></body></html>`;
}

function listing(title: string, line: string, notes = ''): string {
    return `<div class="outlined">${title}<hr><small>${line}<br><a href="https://example.com/e">Event details</a><br>${notes}</small></div><p></p>`;
}

describe('DarkSeattleRipper (sample)', () => {
    test('parses live listings with no parse errors, skipping commented-out past events', async () => {
        const { events, errors } = await run(sampleHtml);
        expect(errors.filter(e => e.type === 'ParseError')).toHaveLength(0);
        expect(events.length).toBeGreaterThan(50);
        // The commented-out block contains a Jan 2 listing; it must not appear.
        expect(events.some(e => e.summary === 'All Waves: DJs Rota, VJ Scruff')).toBe(false);
        // Earliest event is the first live header (Tue, Sep 22 2026).
        const first = events.map(e => e.date.toLocalDate().toString()).sort()[0];
        expect(first).toBe('2026-09-22');
    });

    test('extracts title, time, venue and link', async () => {
        const { events } = await run(sampleHtml);
        const e = events.find(e => e.summary === 'Peter Hook & The Light')!;
        expect(e).toBeDefined();
        expect(e.date.toLocalDate().toString()).toBe('2026-09-25');
        expect(e.date.hour()).toBe(20);
        expect(e.date.minute()).toBe(30);
        expect(e.location).toBe('The Showbox, Seattle, WA');
        expect(e.url).toBe('https://www.showboxpresents.com/events/detail/1099616');
    });

    test('filters out non-Seattle venues', async () => {
        const { events } = await run(sampleHtml);
        expect(events.some(e => /Tacoma|Olympia|Everett|Bellingham/.test(e.location ?? ''))).toBe(false);
        expect(events.some(e => e.summary.startsWith('Tiny Vipers, somesurprises'))).toBe(false);
    });

    test('rolls the year over and honors explicit years', async () => {
        const { events } = await run(sampleHtml);
        const vnv = events.find(e => e.summary === 'VNV Nation')!;
        expect(vnv.date.toLocalDate().toString()).toBe('2027-03-24');
        expect(events.every(e => e.date.year() >= 2026)).toBe(true);
    });

    test('ids are stable and unique', async () => {
        const a = (await run(sampleHtml)).events.map(e => e.id);
        const b = (await run(sampleHtml)).events.map(e => e.id);
        expect(a).toEqual(b);
        expect(new Set(a).size).toBe(a.length);
    });
});

describe('DarkSeattleRipper (synthetic)', () => {
    test('time range sets duration, including past midnight', async () => {
        const { events } = await run(page(`<br>Sat, Sep 26<br><br>${listing('Bloodlust', '9:00pm-1:00am at Twist of Fate')}`));
        expect(events).toHaveLength(1);
        expect(events[0].date.hour()).toBe(21);
        expect(events[0].duration.toMinutes()).toBe(240);
    });

    test('"late" end falls back to default duration', async () => {
        const { events } = await run(page(`<br>Sat, Sep 26<br><br>${listing('Dead Disko', '10:00pm-late at Baba Yaga')}`));
        expect(events[0].duration.toHours()).toBe(3);
    });

    test('Time TBA emits an event plus a startTime uncertainty', async () => {
        const { events, errors } = await run(page(`<br>Sat, Sep 26<br><br>${listing('Mystery', 'Time TBA at Kremwerk')}`));
        expect(events).toHaveLength(1);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('Uncertainty');
        expect((errors[0] as any).event.id).toBe(events[0].id);
    });

    test('range header expands to one event per day', async () => {
        const { events } = await run(page(`<br>Thu, Nov 5 - Sun, Nov 8<br><br>${listing('Fest', '7:00pm at Baba Yaga')}`));
        expect(events.map(e => e.date.toLocalDate().toString())).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
        expect(new Set(events.map(e => e.id)).size).toBe(4);
    });

    test('December -> January rolls over the year', async () => {
        const dec = ZonedDateTime.parse('2026-12-20T10:00:00-08:00[America/Los_Angeles]');
        const { events } = await run(page(`<br>Mon, Dec 21<br><br>${listing('A', '8:00pm at Pony')}<br>Sat, Jan 2<br><br>${listing('B', '8:00pm at Pony')}`), dec);
        expect(events.map(e => e.date.toLocalDate().toString())).toEqual(['2026-12-21', '2027-01-02']);
    });

    test('unrecognized date-like header is a ParseError and does not misattribute listings', async () => {
        const { events, errors } = await run(page(`<br>Sat, Sep 26<br><br>${listing('A', '8:00pm at Pony')}<br>Sat, Sep 27ish<br><br>${listing('B', '8:00pm at Pony')}`));
        expect(events.map(e => e.summary)).toEqual(['A']);
        expect(errors.some(e => e.type === 'ParseError')).toBe(true);
    });

    test('listing missing "at <venue>" is a ParseError', async () => {
        const { events, errors } = await run(page(`<br>Sat, Sep 26<br><br>${listing('A', '8:00pm somewhere')}`));
        expect(events).toHaveLength(0);
        expect(errors[0].type).toBe('ParseError');
    });
});

describe('isOutsideSeattle', () => {
    test.each([
        ['Baba Yaga', false],
        ['The Church Cantina, Tacoma', true],
        ['The Coffin, Portland, OR', true],
        ['2 Fingers Social, White Center', true],
        ['California Ave & SW Genesee St, West Seattle', false],
        ['Belltown Yacht Club, enter through Screwdriver', false],
        ['Montana Badlands (Lower Queen Anne)', false],
        ['Kremwerk, Timbre Room', false],
        ['Some Bar, Greenwood', false],
    ])('%s -> %s', (venue, expected) => {
        expect(isOutsideSeattle(venue)).toBe(expected);
    });
});
