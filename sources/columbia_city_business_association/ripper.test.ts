import { describe, it, expect } from 'vitest';
import ColumbiaCityBusinessAssociationRipper from './ripper.js';
import { RipperCalendarEvent, UncertaintyError } from '../../lib/config/schema.js';
import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

describe('ColumbiaCityBusinessAssociationRipper', () => {
    describe('parseEvents', () => {
        it('extracts every event from the "UPCOMING EVENTS" listing', () => {
            const ripper = new ColumbiaCityBusinessAssociationRipper();
            const html = parse(loadSample('sample-data.html'));
            const results = ripper.parseEvents(html);

            // Each event yields [RipperCalendarEvent, UncertaintyError] since
            // the listing only gives a start time.
            expect(results).toHaveLength(6);
            const events = results.filter((r): r is RipperCalendarEvent => !('type' in r));
            expect(events).toHaveLength(3);

            expect(events[0].id).toBe('ccba-6618258');
            expect(events[0].summary).toBe('CCBA Membership Meeting');
            // "•" (Wild Apricot's venue/address separator) is normalized to
            // ", " so lib/geocoder.ts's venue-prefix fallback can split it.
            expect(events[0].location).toBe('Seattle-Rainier Lions Club, 3714 S Ferdinand St, Seattle');
            expect(events[0].date.toString()).toContain('2026-09-22T09:00');
            expect(events[0].url).toBe('https://columbiacityseattle.com/event-6618258');

            expect(events[1].id).toBe('ccba-6833403');
            expect(events[1].summary).toBe('Sound Transit Safety Fair');
            expect(events[1].location).toBe("Odessa Brown Children's Clinic, 3939 S Othello St. #101, Seattle");
            expect(events[1].date.toString()).toContain('2026-09-26T11:00');

            expect(events[2].id).toBe('ccba-6618263');
            expect(events[2].date.toString()).toContain('2026-11-24T09:00');
        });

        it('flags every event as duration-uncertain (listing has no end time)', () => {
            const ripper = new ColumbiaCityBusinessAssociationRipper();
            const html = parse(loadSample('sample-data.html'));
            const results = ripper.parseEvents(html);
            const uncertainties = results.filter((r): r is UncertaintyError => 'type' in r && r.type === 'Uncertainty');
            expect(uncertainties).toHaveLength(3);
            for (const u of uncertainties) {
                expect(u.unknownFields).toEqual(['duration']);
            }
        });

        it('returns an empty array when there are no events in the widget', () => {
            const ripper = new ColumbiaCityBusinessAssociationRipper();
            const html = parse('<html><body><div class="WaGadgetUpcomingEvents"><ul></ul></div></body></html>');
            expect(ripper.parseEvents(html)).toEqual([]);
        });

        it('returns a ParseError for a malformed item missing a title', () => {
            const ripper = new ColumbiaCityBusinessAssociationRipper();
            const html = parse(`
                <div class="WaGadgetUpcomingEvents">
                <ul><li>
                    <div class="date"><span client-tz-display>Tue, September 22, 2026 9:00 AM</span></div>
                    <div class="location"><span>Somewhere, Seattle</span></div>
                </li></ul>
                </div>
            `);
            const results = ripper.parseEvents(html);
            expect(results).toHaveLength(1);
            expect('type' in results[0] && results[0].type).toBe('ParseError');
        });

        it('returns a ParseError for an item with an unparsable date', () => {
            const ripper = new ColumbiaCityBusinessAssociationRipper();
            const html = parse(`
                <div class="WaGadgetUpcomingEvents">
                <ul><li>
                    <div class="title"><a href="https://columbiacityseattle.com/event-1">Some Event</a></div>
                    <div class="date"><span client-tz-display>not a date</span></div>
                    <div class="location"><span>Somewhere, Seattle</span></div>
                </li></ul>
                </div>
            `);
            const results = ripper.parseEvents(html);
            expect(results).toHaveLength(1);
            expect('type' in results[0] && results[0].type).toBe('ParseError');
        });

        it('decodes HTML-entity apostrophes in location text', () => {
            const ripper = new ColumbiaCityBusinessAssociationRipper();
            const html = parse(`
                <div class="WaGadgetUpcomingEvents">
                <ul><li>
                    <div class="title"><a href="https://columbiacityseattle.com/event-1">Some Event</a></div>
                    <div class="date"><span client-tz-display>Tue, September 22, 2026 9:00 AM</span></div>
                    <div class="location"><span>Odessa Brown Children&#39;s Clinic, Seattle</span></div>
                </li></ul>
                </div>
            `);
            const results = ripper.parseEvents(html) as RipperCalendarEvent[];
            expect(results[0].location).toBe("Odessa Brown Children's Clinic, Seattle");
        });

        it('normalizes the "venue • address" bullet separator to a comma', () => {
            const ripper = new ColumbiaCityBusinessAssociationRipper();
            const html = parse(`
                <div class="WaGadgetUpcomingEvents">
                <ul><li>
                    <div class="title"><a href="https://columbiacityseattle.com/event-1">Some Event</a></div>
                    <div class="date"><span client-tz-display>Tue, September 22, 2026 9:00 AM</span></div>
                    <div class="location"><span>Some Hall • 123 Main St, Seattle</span></div>
                </li></ul>
                </div>
            `);
            const results = ripper.parseEvents(html) as RipperCalendarEvent[];
            expect(results[0].location).toBe('Some Hall, 123 Main St, Seattle');
        });
    });
});
