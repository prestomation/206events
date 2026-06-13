import { describe, it, expect } from 'vitest';
import TheFeastRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { LocalDate, ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';

const timezone = ZoneRegion.of('America/Los_Angeles');

function futureDateStr(daysFromNow: number): string {
    const date = LocalDate.now().plusDays(daysFromNow);
    const m = String(date.monthValue()).padStart(2, '0');
    const d = String(date.dayOfMonth()).padStart(2, '0');
    const y = String(date.year());
    return `${m}/${d}/${y}`;
}

function makePerformance(overrides: Record<string, any> = {}): any {
    return {
        performanceId: 11798240,
        performanceDate: futureDateStr(63),
        performanceTime: "8:00 PM",
        performanceTime24: "20:00:00",
        performanceSuperTitle: "",
        performanceSubTitle: "",
        performanceNotes: "",
        productionId: 1272441,
        productionName: "Artists Doing",
        productionDescription: "<p>A one-day experimental festival.</p>",
        productionLogoLink: null,
        hasAvailableTickets: true,
        allDayEvent: false,
        ...overrides
    };
}

describe('TheFeastRipper', () => {
    const ripper = new TheFeastRipper();

    it('should parse a performance into a calendar event', () => {
        const events = ripper.parseEvents([makePerformance()], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        const event = calEvents[0];
        expect(event.summary).toBe('Artists Doing');
        expect(event.id).toBe('ovationtix-the-feast-11798240');
        expect(event.url).toBe('https://ci.ovationtix.com/35379/production/1272441');
        expect(event.location).toBeUndefined();
    });

    it('should fall back to box-office URL when productionId is absent', () => {
        const events = ripper.parseEvents([makePerformance({ productionId: null })], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].url).toBe('https://the-feast.org/box-office/');
    });

    it('should parse date and time correctly', () => {
        const events = ripper.parseEvents([makePerformance({ performanceTime24: '16:00:00' })], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].date.hour()).toBe(16);
        expect(calEvents[0].date.minute()).toBe(0);
    });

    it('should skip past events', () => {
        const pastDate = LocalDate.now().minusDays(1);
        const m = String(pastDate.monthValue()).padStart(2, '0');
        const d = String(pastDate.dayOfMonth()).padStart(2, '0');
        const pastDateStr = `${m}/${d}/${pastDate.year()}`;

        const events = ripper.parseEvents([
            makePerformance({ performanceDate: pastDateStr }),
            makePerformance({ performanceId: 99999, performanceDate: futureDateStr(5) }),
        ], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].id).toBe('ovationtix-the-feast-99999');
    });

    it('should set duration to 2 hours', () => {
        const events = ripper.parseEvents([makePerformance()], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].duration.toMinutes()).toBe(120);
    });

    it('should include superTitle in summary when present', () => {
        const events = ripper.parseEvents([makePerformance({ performanceSuperTitle: "Outdoor" })], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].summary).toBe('Artists Doing: Outdoor');
    });

    it('should include subtitle and description', () => {
        const events = ripper.parseEvents([makePerformance({
            performanceSubTitle: "Pay what you choose",
            productionDescription: "<p>A great <b>show</b></p>"
        })], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].description).toContain('Pay what you choose');
        expect(calEvents[0].description).toContain('A great show');
    });

    it('should return undefined description when all optional fields are empty', () => {
        const events = ripper.parseEvents([makePerformance({
            performanceSubTitle: "",
            performanceNotes: "",
            productionDescription: "",
        })], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].description).toBeUndefined();
    });

    it('should strip HTML from description', () => {
        const events = ripper.parseEvents([makePerformance({
            performanceSubTitle: "",
            productionDescription: "<div><p>Hello &amp; <strong>world</strong></p></div>"
        })], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].description).toBe('Hello & world');
    });

    it('should return ParseError for null dates', () => {
        const events = ripper.parseEvents([makePerformance({ performanceDate: null, performanceTime24: null })], timezone);
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });

    it('should return ParseError for malformed date string', () => {
        const events = ripper.parseEvents([makePerformance({ performanceDate: '20260815', performanceTime24: '20:00:00' })], timezone);
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toHaveLength(1);
    });

    it('should set imageUrl from productionLogoLink', () => {
        const events = ripper.parseEvents([makePerformance({ productionLogoLink: 'https://example.com/logo.jpg' })], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].imageUrl).toBe('https://example.com/logo.jpg');
    });

    it('should leave imageUrl undefined when productionLogoLink is null', () => {
        const events = ripper.parseEvents([makePerformance({ productionLogoLink: null })], timezone);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].imageUrl).toBeUndefined();
    });
});
