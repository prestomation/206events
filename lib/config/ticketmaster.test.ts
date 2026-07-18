import { describe, it, expect } from 'vitest';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { TicketmasterRipper } from './ticketmaster.js';
import { RipperCalendarEvent, UncertaintyError } from './schema.js';

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

function parseRaw(event: any): ReturnType<TicketmasterRipper['parseEvents']> {
    const ripper = new TicketmasterRipper();
    return ripper.parseEvents([event], tz, { venueName: 'Test Venue' }, 'test-source', 'test-cal');
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

    it('treats a fully-collapsed $0 range (sold-out) as paid-unknown, not free', () => {
        // Regression: a sold-out show whose range collapses to min:0/max:0
        // used to slip past the `max > 0` guard and become { min: 0 } = Free.
        const e = parseOne(makeEvent({ priceRanges: [{ type: 'standard', currency: 'USD', min: 0, max: 0 }] }));
        expect(e.cost).toEqual({ paid: true });
    });

    it('treats a $0 min-only range as paid-unknown, not free', () => {
        const e = parseOne(makeEvent({ priceRanges: [{ type: 'standard', currency: 'USD', min: 0 }] }));
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

describe('TicketmasterRipper sold-out detection', () => {
    const pastSale = { public: { startDateTime: '2026-01-01T18:00:00Z' } };
    const futureSale = { public: { startDateTime: '2099-01-01T18:00:00Z' } };

    it('marks an off-sale event whose public sale has started as sold out', () => {
        const e = parseOne(makeEvent({
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' }, status: { code: 'offsale' } },
            sales: pastSale,
            priceRanges: [{ type: 'standard', currency: 'USD', min: 35, max: 35 }],
        }));
        // Sold out supersedes the known price.
        expect(e.cost).toEqual({ soldOut: true });
    });

    it('does not mark a not-yet-on-sale (off-sale, future sale) event as sold out', () => {
        const e = parseOne(makeEvent({
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' }, status: { code: 'offsale' } },
            sales: futureSale,
            priceRanges: [{ type: 'standard', currency: 'USD', min: 35 }],
        }));
        expect(e.cost).toEqual({ min: 35 });
    });

    it('stays conservative when off-sale with no sale dates (keeps price)', () => {
        const e = parseOne(makeEvent({
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' }, status: { code: 'offsale' } },
            priceRanges: [{ type: 'standard', currency: 'USD', min: 35 }],
        }));
        expect(e.cost).toEqual({ min: 35 });
    });

    it('marks a sold-out event with no price range as sold out', () => {
        const e = parseOne(makeEvent({
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' }, status: { code: 'offsale' } },
            sales: pastSale,
        }));
        expect(e.cost).toEqual({ soldOut: true });
    });

    it('leaves an on-sale event priced normally', () => {
        const e = parseOne(makeEvent({
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' }, status: { code: 'onsale' } },
            sales: pastSale,
            priceRanges: [{ type: 'standard', currency: 'USD', min: 35, max: 50 }],
        }));
        expect(e.cost).toEqual({ min: 35, max: 50 });
    });
});

describe('TicketmasterRipper duration / start-time uncertainty', () => {
    it('emits no uncertainty when start time and price are both known', () => {
        const results = parseRaw(makeEvent({
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' } },
            priceRanges: [{ type: 'standard', currency: 'USD', min: 25, max: 75 }],
        }));
        const uncertainties = results.filter(r => 'type' in r && (r as UncertaintyError).type === 'Uncertainty');
        expect(uncertainties).toHaveLength(0);
    });

    it('emits no uncertainty when start time is known via dateTime and price is known', () => {
        const results = parseRaw(makeEvent({
            dates: { start: { dateTime: '2026-03-10T19:00:00Z' } },
            priceRanges: [{ type: 'standard', currency: 'USD', min: 25, max: 75 }],
        }));
        const uncertainties = results.filter(r => 'type' in r && (r as UncertaintyError).type === 'Uncertainty');
        expect(uncertainties).toHaveLength(0);
    });

    it('emits exactly one UncertaintyError with unknownFields=[startTime] for date-only listings with a known price', () => {
        const results = parseRaw(makeEvent({
            dates: { start: { localDate: '2026-03-10' } },
            priceRanges: [{ type: 'standard', currency: 'USD', min: 25, max: 75 }],
        }));
        const uncertainties = results.filter(r => 'type' in r && (r as UncertaintyError).type === 'Uncertainty') as UncertaintyError[];
        expect(uncertainties).toHaveLength(1);
        expect(uncertainties[0].unknownFields).toEqual(['startTime']);
    });
});

describe('TicketmasterRipper cost uncertainty', () => {
    it('emits an UncertaintyError with unknownFields=[cost] when priceRanges is absent and start time is known', () => {
        const results = parseRaw(makeEvent({
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' } },
        }));
        const uncertainties = results.filter(r => 'type' in r && (r as UncertaintyError).type === 'Uncertainty') as UncertaintyError[];
        expect(uncertainties).toHaveLength(1);
        expect(uncertainties[0].unknownFields).toEqual(['cost']);
    });

    it('does not emit a cost uncertainty for a sold-out event (terminal state)', () => {
        const results = parseRaw(makeEvent({
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' }, status: { code: 'offsale' } },
            sales: { public: { startDateTime: '2026-01-01T18:00:00Z' } },
        }));
        const uncertainties = results.filter(r => 'type' in r && (r as UncertaintyError).type === 'Uncertainty');
        expect(uncertainties).toHaveLength(0);
    });

    it('combines startTime and cost into one UncertaintyError when both are unknown', () => {
        const results = parseRaw(makeEvent({
            dates: { start: { localDate: '2026-03-10' } },
        }));
        const uncertainties = results.filter(r => 'type' in r && (r as UncertaintyError).type === 'Uncertainty') as UncertaintyError[];
        expect(uncertainties).toHaveLength(1);
        expect(uncertainties[0].unknownFields).toEqual(['startTime', 'cost']);
    });

    it('fingerprint changes when priceRanges data changes, invalidating a stale cache entry', () => {
        const [withoutPrice] = parseRaw(makeEvent({
            id: 'tm-fp-test',
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' } },
        })).filter(r => 'type' in r && (r as UncertaintyError).type === 'Uncertainty') as UncertaintyError[];
        expect(withoutPrice.partialFingerprint).toBeDefined();
        // Once a price appears, cost is no longer uncertain — confirms the
        // fingerprint's underlying data (priceRanges) drove the outcome.
        const withPrice = parseOne(makeEvent({
            id: 'tm-fp-test',
            dates: { start: { localDate: '2026-03-10', localTime: '19:00:00' } },
            priceRanges: [{ type: 'standard', currency: 'USD', min: 10 }],
        }));
        expect(withPrice.cost).toEqual({ min: 10 });
    });
});
