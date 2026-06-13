import { describe, it, expect } from 'vitest';
import { OvationTixRipper } from './ovationtix.js';
import { RipperCalendarEvent, RipperError } from './schema.js';
import { LocalDate, ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';

const tz = ZoneRegion.of('America/Los_Angeles');
const FIXED_VENUE = "Taproot Theatre, 204 N 85th St, Seattle, WA 98103";
const CLIENT_ID = 37019;
const SOURCE_NAME = "taproot";

function futureDateStr(daysFromNow: number): string {
    const date = LocalDate.now().plusDays(daysFromNow);
    const m = String(date.monthValue()).padStart(2, '0');
    const d = String(date.dayOfMonth()).padStart(2, '0');
    return `${m}/${d}/${date.year()}`;
}

function makePerf(overrides: Record<string, any> = {}): any {
    return {
        performanceId: 11740149,
        performanceDate: futureDateStr(7),
        performanceTime: "7:30 PM",
        performanceTime24: "19:30:00",
        performanceSuperTitle: "",
        performanceSubTitle: "By C.S. Lewis",
        performanceNotes: "",
        productionId: 1261756,
        productionName: "Till We Have Faces",
        productionDescription: "<b>A world premiere.</b>",
        productionLogoLink: "https://web.ovationtix.com/trs/clientFile/603312",
        hasAvailableTickets: true,
        allDayEvent: false,
        ...overrides
    };
}

const ripper = new OvationTixRipper();

describe('OvationTixRipper — fixed venue (taproot-like)', () => {
    it('parses a performance into a calendar event', () => {
        const [event] = ripper.parseEvents([makePerf()], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz) as RipperCalendarEvent[];
        expect(event.summary).toBe('Till We Have Faces');
        expect(event.id).toBe('ovationtix-taproot-11740149');
        expect(event.location).toBe(FIXED_VENUE);
        expect(event.url).toBe(`https://web.ovationtix.com/trs/pe.c/${CLIENT_ID}`);
        expect(event.duration.toMinutes()).toBe(150);
        expect(event.imageUrl).toBe('https://web.ovationtix.com/trs/clientFile/603312');
    });

    it('includes superTitle in summary', () => {
        const [event] = ripper.parseEvents([makePerf({ performanceSuperTitle: "Mainstage" })], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz) as RipperCalendarEvent[];
        expect(event.summary).toBe('Till We Have Faces: Mainstage');
    });

    it('parses date and time correctly', () => {
        const [event] = ripper.parseEvents([makePerf({ performanceTime24: '14:00:00' })], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz) as RipperCalendarEvent[];
        expect(event.date.hour()).toBe(14);
        expect(event.date.minute()).toBe(0);
    });

    it('builds description from subtitle + body + notes', () => {
        const [event] = ripper.parseEvents([makePerf({
            performanceSubTitle: "Adapted by Karen Lund",
            productionDescription: "<p>A great <b>show</b></p>",
            performanceNotes: "No late seating",
        })], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz) as RipperCalendarEvent[];
        expect(event.description).toContain('Adapted by Karen Lund');
        expect(event.description).toContain('A great show');
        expect(event.description).toContain('No late seating');
    });

    it('strips HTML entities from description', () => {
        const [event] = ripper.parseEvents([makePerf({
            performanceSubTitle: "",
            productionDescription: "Caf&#233; &amp; &#x2665;",
        })], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz) as RipperCalendarEvent[];
        expect(event.description).toContain('Café');
        expect(event.description).toContain('♥');
    });

    it('returns undefined description when all optional fields empty', () => {
        const [event] = ripper.parseEvents([makePerf({
            performanceSubTitle: "",
            performanceNotes: "",
            productionDescription: "",
        })], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz) as RipperCalendarEvent[];
        expect(event.description).toBeUndefined();
    });

    it('skips past events', () => {
        const past = LocalDate.now().minusDays(1);
        const pastStr = `${String(past.monthValue()).padStart(2, '0')}/${String(past.dayOfMonth()).padStart(2, '0')}/${past.year()}`;
        const events = ripper.parseEvents([
            makePerf({ performanceDate: pastStr }),
            makePerf({ performanceId: 99999, performanceDate: futureDateStr(3) }),
        ], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].id).toBe('ovationtix-taproot-99999');
    });

    it('returns ParseError for null date', () => {
        const errors = ripper.parseEvents([makePerf({ performanceDate: null })], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz).filter(e => 'type' in e) as RipperError[];
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('returns ParseError for malformed date', () => {
        const errors = ripper.parseEvents([makePerf({ performanceDate: '20260220' })], SOURCE_NAME, CLIENT_ID, FIXED_VENUE, 150, tz).filter(e => 'type' in e) as RipperError[];
        expect(errors).toHaveLength(1);
    });
});

describe('OvationTixRipper — itinerant (the-feast-like)', () => {
    it('leaves location undefined', () => {
        const [event] = ripper.parseEvents([makePerf()], 'the-feast', 35379, undefined, 120, tz) as RipperCalendarEvent[];
        expect(event.location).toBeUndefined();
    });

    it('uses per-production ticket URL', () => {
        const [event] = ripper.parseEvents([makePerf({ productionId: 1272441 })], 'the-feast', 35379, undefined, 120, tz) as RipperCalendarEvent[];
        expect(event.url).toBe('https://ci.ovationtix.com/35379/production/1272441');
    });

    it('falls back to client root URL when productionId absent', () => {
        const [event] = ripper.parseEvents([makePerf({ productionId: null })], 'the-feast', 35379, undefined, 120, tz) as RipperCalendarEvent[];
        expect(event.url).toBe('https://ci.ovationtix.com/35379');
    });

    it('uses source name in event ID', () => {
        const [event] = ripper.parseEvents([makePerf({ performanceId: 11798240 })], 'the-feast', 35379, undefined, 120, tz) as RipperCalendarEvent[];
        expect(event.id).toBe('ovationtix-the-feast-11798240');
    });

    it('uses 120-minute default duration', () => {
        const [event] = ripper.parseEvents([makePerf()], 'the-feast', 35379, undefined, 120, tz) as RipperCalendarEvent[];
        expect(event.duration.toMinutes()).toBe(120);
    });
});

describe('OvationTixRipper — source name in IDs', () => {
    it('encodes source name in event ID', () => {
        const [event] = ripper.parseEvents([makePerf({ performanceId: 1 })], 'spectrum-dance', 36947, FIXED_VENUE, 120, tz) as RipperCalendarEvent[];
        expect(event.id).toBe('ovationtix-spectrum-dance-1');
    });
});
