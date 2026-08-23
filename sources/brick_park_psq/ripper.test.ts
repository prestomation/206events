import { describe, expect, test, vi, afterEach } from 'vitest';
import { parse } from 'node-html-parser';
import BrickParkPSQRipper from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

function buildPage(eventBlocks: string): ReturnType<typeof parse> {
    return parse(`
        <div class="sqs-html-content"><h2>Upcoming Events</h2></div>
        ${eventBlocks}
        <div class="sqs-html-content"><h2>Past Events</h2></div>
    `);
}

function eventBlock(presenter: string, dateLine: string, name: string, ticketUrl?: string): string {
    const ticket = ticketUrl ? `<a href="${ticketUrl}">Tickets</a>` : '';
    return `<div class="sqs-html-content"><h4>${presenter}</h4><h3>${dateLine}<br>${name}</h3>${ticket}</div>`;
}

describe('BrickParkPSQRipper.parseEvents — year inference', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    test('a listing still stale-past by a couple weeks keeps the current year, not next year', () => {
        // Regression test: "Sat Aug 15" stayed under "Upcoming Events" 8 days
        // after it already happened (2026-08-15 is a Saturday). The ripper must
        // not bump this to 2027 — 2027-08-15 is a Sunday, which wouldn't even
        // match the site's own "Sat" label, and the event never actually
        // recurs the following year.
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-23T12:00:00-07:00'));

        const html = buildPage(eventBlock('Hometeam & Relentless Beats present:', 'Sat Aug 15', 'RuPaul', 'https://www.tixr.com/groups/rbfestivals/events/rupaul-198497'));
        const ripper = new BrickParkPSQRipper();
        const events = ripper.parseEvents(html);

        const event = events.find(e => 'date' in e) as RipperCalendarEvent;
        expect(event.id).toBe('brickpark-2026-8-15-rupaul');
        expect(event.date.toLocalDate().toString()).toBe('2026-08-15');
    });

    test('a date far enough in the past under "Upcoming Events" rolls over to next year', () => {
        // A date more than the stale-listing buffer (45 days) in the past is
        // treated as a genuine year-boundary rollover rather than a merely
        // slow-to-update listing.
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-01T12:00:00-08:00'));

        const html = buildPage(eventBlock('Brick Park presents:', 'Fri June 12', 'Summer Kickoff'));
        const ripper = new BrickParkPSQRipper();
        const events = ripper.parseEvents(html);

        const event = events.find(e => 'date' in e) as RipperCalendarEvent;
        expect(event.id).toBe('brickpark-2027-6-12-summer-kickoff');
        expect(event.date.toLocalDate().toString()).toBe('2027-06-12');
    });

    test('an upcoming date within the current year is left alone', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-01T12:00:00-07:00'));

        const html = buildPage(eventBlock('Brick Park presents:', 'Sat Sept 26', 'Bunt!'));
        const ripper = new BrickParkPSQRipper();
        const events = ripper.parseEvents(html);

        const event = events.find(e => 'date' in e) as RipperCalendarEvent;
        expect(event.id).toBe('brickpark-2026-9-26-bunt-');
        expect(event.date.toLocalDate().toString()).toBe('2026-09-26');
    });

    test('defaults to a 7pm / 3-hour placeholder and emits an Uncertainty error', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-01T12:00:00-07:00'));

        const html = buildPage(eventBlock('Brick Park presents:', 'Sat Sept 26', 'Bunt!'));
        const ripper = new BrickParkPSQRipper();
        const events = ripper.parseEvents(html);

        const event = events.find(e => 'date' in e) as RipperCalendarEvent;
        expect(event.date.hour()).toBe(19);
        expect(event.duration.toHours()).toBe(3);

        const uncertainty = events.find(e => 'type' in e && (e as any).type === 'Uncertainty');
        expect(uncertainty).toBeDefined();
    });
});
