import { describe, expect, it } from 'vitest';
import { buildLocationUncertainty, extractCost, extractLocation, isBellingham } from './ripper.js';
import { SquarespaceEvent } from '../../lib/config/squarespace.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { Duration, ZonedDateTime } from '@js-joda/core';

function sqEvent(title: string): SquarespaceEvent {
    return { id: 'x', title, startDate: 0 };
}

describe('isBellingham', () => {
    it('flags events titled "Bellingham"', () => {
        expect(isBellingham(sqEvent('Not-Creepy Gathering -- Bellingham!'))).toBe(true);
    });

    it('flags events held at Wink Wink (the Bellingham venue)', () => {
        expect(isBellingham(sqEvent('The Not-Creepy Gathering -- Wink Wink!'))).toBe(true);
    });

    it('does not flag Seattle events', () => {
        expect(isBellingham(sqEvent('Not-Creepy Gathering -- Seattle!'))).toBe(false);
    });
});

describe('extractLocation', () => {
    it('recognizes Fremont Abbey', () => {
        expect(extractLocation('At the Fremont Abbey! $10-$30 Tickets here!')).toBe('Fremont Abbey, Seattle, WA');
    });

    it('recognizes Ballard Homestead', () => {
        expect(extractLocation('Ballard Homestead $10-$30, Sliding Scale Tickets here!')).toBe('Ballard Homestead, Seattle, WA');
    });

    it('returns undefined for unrecognized venues', () => {
        expect(extractLocation('At Stemma West! $10-$30 Sliding Scale Tickets here!')).toBeUndefined();
    });
});

describe('extractCost', () => {
    it('parses a sliding-scale range', () => {
        expect(extractCost('$10-$30 Sliding Scale Tickets here!')).toEqual({ min: 10, max: 30 });
    });

    it('parses a single dollar amount', () => {
        expect(extractCost('$15 at the door.')).toEqual({ min: 15 });
    });

    it('recognizes free events', () => {
        expect(extractCost('Free! No cover.')).toEqual({ min: 0 });
    });

    it('returns undefined with no pricing signals', () => {
        expect(extractCost('Come hang out with us!')).toBeUndefined();
    });
});

describe('buildLocationUncertainty', () => {
    it('flags location as unknown for an unrecognized venue, rather than shipping a silent gap', () => {
        const event: RipperCalendarEvent = {
            id: 'x',
            ripped: new Date(),
            date: ZonedDateTime.now(),
            duration: Duration.ofHours(2),
            summary: 'Not-Creepy Gathering -- Seattle!',
        };
        const uncertainty = buildLocationUncertainty('not-creepy-gathering', 'all-events', event, 'At Stemma West!');

        expect(uncertainty.type).toBe('Uncertainty');
        expect(uncertainty.unknownFields).toEqual(['location']);
        expect(uncertainty.source).toBe('not-creepy-gathering');
        expect(uncertainty.calendar).toBe('all-events');
        expect(uncertainty.event).toBe(event);
        expect(uncertainty.partialFingerprint).toBeTruthy();
    });
});
