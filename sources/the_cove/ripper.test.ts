import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import TheCoveRipper, { isPrivateBooking } from './ripper.js';

const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DAY_MS = 24 * 60 * 60 * 1000;

function makeRipper() {
    return {
        config: {
            name: 'the-cove',
            url: new URL('https://www.thecoveseattle.com/all-events'),
            tags: ['Music', 'South Lake Union'],
            geo: { lat: 47.6275761, lng: -122.3339647 },
            disabled: false,
            proxy: false,
            calendars: [{
                name: 'the-cove',
                friendlyname: 'The Cove',
                timezone: TIMEZONE,
            }],
        },
    } as any;
}

function mockEventsResponse(upcoming: object[]) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ upcoming }),
    } as any);
}

describe('isPrivateBooking', () => {
    it('matches the "Private Event" placeholder title', () => {
        expect(isPrivateBooking('Private Event')).toBe(true);
    });

    it('is case- and whitespace-insensitive', () => {
        expect(isPrivateBooking('  private event  ')).toBe(true);
        expect(isPrivateBooking('PRIVATE EVENT')).toBe(true);
    });

    it('keeps public programming', () => {
        expect(isPrivateBooking('Jazz & Drinks')).toBe(false);
        expect(isPrivateBooking('DJ Cenzoe')).toBe(false);
    });

    it('keeps a descriptive title that merely contains the phrase', () => {
        expect(isPrivateBooking('Private Event — Smith Wedding')).toBe(false);
    });
});

describe('TheCoveRipper.rip', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('drops private bookings without leaving an orphaned uncertainty', async () => {
        const start = Date.now() + 7 * DAY_MS;
        mockEventsResponse([
            { id: 'a', title: 'Jazz & Drinks', startDate: start, endDate: start + 2 * 60 * 60 * 1000 },
            // No endDate — would emit an UncertaintyError if it reached mapEvent.
            { id: 'b', title: 'Private Event', startDate: start + DAY_MS },
            { id: 'c', title: 'DJ Cenzoe', startDate: start + 2 * DAY_MS, endDate: start + 2 * DAY_MS + 3600_000 },
        ]);

        const [calendar] = await new TheCoveRipper().rip(makeRipper());

        expect(calendar.events.map(e => e.summary)).toEqual(['Jazz & Drinks', 'DJ Cenzoe']);
        expect(calendar.errors).toHaveLength(0);
    });

    it('still reports uncertainty for a public event missing endDate', async () => {
        mockEventsResponse([
            { id: 'a', title: 'Jazz & Drinks', startDate: Date.now() + 7 * DAY_MS },
        ]);

        const [calendar] = await new TheCoveRipper().rip(makeRipper());

        expect(calendar.events).toHaveLength(1);
        expect(calendar.errors.filter(e => e.type === 'Uncertainty')).toHaveLength(1);
    });
});
