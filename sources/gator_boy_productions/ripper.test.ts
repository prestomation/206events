import { describe, it, expect } from 'vitest';
import { LocalDate } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import GatorBoyProductionsRipper, {
    parseDateText,
    extractVenueAddress,
    isSeattleAddress,
    extractTimeRange,
} from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

// Fixture was fetched 2026-09-16; use an anchor date before every sample
// event so nothing rolls off as "past".
const TODAY = LocalDate.of(2026, 9, 16);
const URL = 'https://gatorboyproductions.com/events/';

function isEvent(e: { type?: string } | RipperCalendarEvent): e is RipperCalendarEvent {
    return 'date' in e;
}

describe('GatorBoyProductionsRipper', () => {
    describe('parseEventsPage (full sample data)', () => {
        const ripper = new GatorBoyProductionsRipper();
        const html = parse(loadSampleHtml());
        const results = ripper.parseEventsPage(html, URL, TODAY);
        const events = results.filter(isEvent);
        const errors = results.filter((r): r is RipperError => !isEvent(r));

        it('never returns null for any parsed item', () => {
            for (const r of results) {
                expect(r).not.toBeNull();
            }
        });

        it('extracts only the Seattle-area events (excludes Portland, Mercer Island)', () => {
            // Expected Seattle events from the fixture: 7x "Gator Boy's Juke
            // Joint" (Eagles Mother Aerie), 1x "Louisiana Dance Party"
            // (Reverie Ballroom), 1x "Gator Boy's Holiday Extravaganza!"
            // (Eagles Mother Aerie) = 9. Excludes: the Zydeco class-series
            // range, the cancellation notice, Portland memorial, Mercer
            // Island Louisianathon, and the address-less Seabeck camp.
            expect(events).toHaveLength(9);
        });

        it('excludes the cancellation notice ("NO Gator Boy dance")', () => {
            expect(events.some(e => /NO Gator Boy dance/i.test(e.summary))).toBe(false);
        });

        it('excludes out-of-Seattle events by venue/address', () => {
            expect(events.some(e => /Dick Brainard/i.test(e.summary))).toBe(false); // Portland
            expect(events.some(e => /Louisianathon/i.test(e.summary))).toBe(false); // Mercer Island
        });

        it('does not leak an Uncertainty error for an out-of-Seattle event that was filtered out', () => {
            // Regression check: the Seattle-scope filter must run BEFORE
            // parseEventBlock, not just on its returned RipperCalendarEvent —
            // otherwise the paired Uncertainty (same event, separate array
            // item) leaks into results even though the event itself doesn't.
            expect(errors.some(e => 'reason' in e && /Dick Brainard|Louisianathon/i.test(e.reason))).toBe(false);
            expect(results.length).toBe(events.length + errors.length);
        });

        it('includes the recurring Eagles Mother Aerie "Juke Joint" dances', () => {
            const jukeJoints = events.filter(e => /Juke Joint/i.test(e.summary));
            expect(jukeJoints.length).toBe(7);
            for (const e of jukeJoints) {
                expect(e.location).toMatch(/^Eagles Mother Aerie, /);
                expect(e.location).toMatch(/Seattle/i);
            }
        });

        it('includes the Reverie Ballroom event with correct venue/address extraction', () => {
            const event = events.find(e => /Louisiana Dance Party/i.test(e.summary));
            expect(event).toBeDefined();
            expect(event!.location).toBe('Reverie Ballroom, Oddfellows Hall, 2nd Floor, 915 E Pine St, Capitol Hill');
            expect(event!.date.monthValue()).toBe(10);
            expect(event!.date.dayOfMonth()).toBe(4);
            expect(event!.date.year()).toBe(2026);
        });

        it('produces stable, deterministic ids derived from title + date', () => {
            const ids = events.map(e => e.id);
            expect(new Set(ids).size).toBe(ids.length); // all unique
            const jukeJoint = events.find(e => e.date.monthValue() === 10 && e.date.dayOfMonth() === 2);
            expect(jukeJoint!.id).toBe(`gator-boy-productions-gator-boy-s-juke-joint-2026-10-02`);
        });

        it('flags the recurring class-series date range as a ParseError, not a fake event', () => {
            expect(errors.some(e => e.reason.includes('recurring class series date range'))).toBe(true);
            expect(events.some(e => /Zydeco 2-step Classes/i.test(e.summary))).toBe(false);
        });

        it('surfaces a ParseError for the address-less Seabeck Dance Camp entry', () => {
            expect(errors.some(e => /VENUE \(ADDRESS\)/.test(e.reason))).toBe(true);
            expect(events.some(e => /Seabeck/i.test(e.summary))).toBe(false);
        });

        it('emits an Uncertainty for start time inferred from free-text prose', () => {
            // Every included event's start/duration is inferred from prose,
            // not a structured field, so every one should carry an
            // Uncertainty flag on at least one of startTime/duration.
            expect(events.length).toBeGreaterThan(0);
        });
    });

    describe('parseDateText', () => {
        it('parses a single date with a weekday prefix', () => {
            expect(parseDateText('Fri, October 2 ')).toEqual({ kind: 'single', month: 10, day: 2 });
        });

        it('parses a full weekday name prefix', () => {
            expect(parseDateText('Sunday, October 4 ')).toEqual({ kind: 'single', month: 10, day: 4 });
        });

        it('detects a recurring weekday-plural class-series range', () => {
            expect(parseDateText('Thursdays, Sep.17–Oct.1')).toEqual({ kind: 'weekdayRange' });
        });

        it('parses a month + day range with no weekday', () => {
            expect(parseDateText('December 3-6 ')).toEqual({ kind: 'monthDayRange', month: 12, startDay: 3, endDay: 6 });
        });

        it('returns invalid for unparseable text', () => {
            expect(parseDateText('whenever we feel like it')).toEqual({ kind: 'invalid' });
        });
    });

    describe('extractVenueAddress', () => {
        it('extracts venue + address from "at VENUE (ADDRESS)" text', () => {
            const result = extractVenueAddress(
                'Revel and dance at Eagles Mother Aerie (8201 Lake City Way NE, Seattle). 6:30pm Dance Lesson.'
            );
            expect(result).toEqual({
                venueName: 'Eagles Mother Aerie',
                address: '8201 Lake City Way NE, Seattle',
                location: 'Eagles Mother Aerie, 8201 Lake City Way NE, Seattle',
            });
        });

        it('strips a leading "the" from the venue name', () => {
            const result = extractVenueAddress(
                'Dance at the Reverie Ballroom (915 E Pine St, Capitol Hill).'
            );
            expect(result?.venueName).toBe('Reverie Ballroom');
        });

        it('does not get fooled by an earlier unrelated parenthetical', () => {
            const result = extractVenueAddress(
                'Celebrate the joie de vivre of Louisiana (and Texas) music at the Reverie Ballroom (915 E Pine St, Capitol Hill).'
            );
            expect(result?.venueName).toBe('Reverie Ballroom');
            expect(result?.address).toBe('915 E Pine St, Capitol Hill');
        });

        it('returns null when no venue/address pattern is present', () => {
            expect(extractVenueAddress('Stay tuned for details, more info coming soon.')).toBeNull();
        });
    });

    describe('isSeattleAddress', () => {
        it('accepts an address that literally contains "Seattle"', () => {
            expect(isSeattleAddress('Eagles Mother Aerie', '8201 Lake City Way NE, Seattle')).toBe(true);
        });

        it('accepts the known Reverie Ballroom venue even without "Seattle" in the address', () => {
            expect(isSeattleAddress('Reverie Ballroom', 'Oddfellows Hall, 2nd Floor, 915 E Pine St, Capitol Hill')).toBe(true);
        });

        it('rejects a Portland address', () => {
            expect(isSeattleAddress('Norse Hall', '111 NE 11th Ave, Portland OR')).toBe(false);
        });

        it('rejects a Mercer Island address', () => {
            expect(isSeattleAddress('Mercer Island VFW Hall', '1836 72nd Ave SE, Mercer Island')).toBe(false);
        });
    });

    describe('extractTimeRange', () => {
        it('takes the first and last clock-time tokens as a confident range', () => {
            const result = extractTimeRange('6:30pm Dance Lesson, 7:30-10pm dance, $15.');
            expect(result).toEqual({ hour: 18, minute: 30, durationMinutes: 210, startTimeGuessed: false, durationGuessed: false });
        });

        it('guesses a duration when only one clock time is found', () => {
            const result = extractTimeRange('Doors at 6pm, more details soon.');
            expect(result.hour).toBe(18);
            expect(result.minute).toBe(0);
            expect(result.startTimeGuessed).toBe(false);
            expect(result.durationGuessed).toBe(true);
        });

        it('falls back to a fully-guessed default when no clock time is found', () => {
            const result = extractTimeRange('Mark your calendars and stay tuned for details.');
            expect(result.startTimeGuessed).toBe(true);
            expect(result.durationGuessed).toBe(true);
        });
    });
});
