import { describe, it, expect } from 'vitest';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { TicketmasterRipper } from './ticketmaster.js';
import { RipperCalendarEvent } from './schema.js';

const tz = ZoneId.of('America/Los_Angeles');

function makeEvent(overrides: any = {}): any {
    return {
        id: `tm-syn-${Math.abs(JSON.stringify(overrides).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0))}`,
        name: 'Test Show',
        dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' } },
        ...overrides,
    };
}

function parseOne(event: any): RipperCalendarEvent {
    const ripper = new TicketmasterRipper();
    const results = ripper.parseEvents([event], tz, { venueName: 'Test Venue' });
    const [e] = results.filter(r => 'summary' in r) as RipperCalendarEvent[];
    return e;
}

describe('TicketmasterRipper cost extraction', () => {
    it('maps priceRanges min/max to a cost range', () => {
        const e = parseOne(makeEvent({ priceRanges: [{ type: 'standard', currency: 'USD', min: 25, max: 75 }] }));
        expect(e.cost).toEqual({ min: 25, max: 75 });
    });

    it('omits max when min and max are equal', () => {
        const e = parseOne(makeEvent({ priceRanges: [{ type: 'standard', currency: 'USD', min: 40, max: 40 }] }));
        expect(e.cost).toEqual({ min: 40 });
    });

    it('treats a $0 min with a real max as paid-unknown (hidden platinum/resale junk)', () => {
        const e = parseOne(makeEvent({ priceRanges: [{ type: 'standard', currency: 'USD', min: 0, max: 199 }] }));
        expect(e.cost).toEqual({ paid: true });
    });

    it('handles a min-only price range', () => {
        const e = parseOne(makeEvent({ priceRanges: [{ type: 'standard', currency: 'USD', min: 30 }] }));
        expect(e.cost).toEqual({ min: 30 });
    });

    it('leaves cost unset when priceRanges is absent', () => {
        const e = parseOne(makeEvent());
        expect(e.cost).toBeUndefined();
    });

    it('still writes the price into the description alongside cost', () => {
        const e = parseOne(makeEvent({ priceRanges: [{ type: 'standard', currency: 'USD', min: 25, max: 75 }] }));
        expect(e.description).toContain('Price: $25 - $75');
    });
});
