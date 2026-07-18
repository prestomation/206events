import { describe, expect, it } from 'vitest';
import { filterSeattleEvents } from './ripper.js';
import { SquarespaceEvent } from '../../lib/config/squarespace.js';

function makeEvent(overrides: Partial<SquarespaceEvent>): SquarespaceEvent {
    return {
        id: 'evt',
        title: 'Test Event',
        startDate: 0,
        ...overrides,
    };
}

describe('filterSeattleEvents', () => {
    it('keeps events at the Seattle tasting room', () => {
        const events = [makeEvent({
            id: '1',
            location: { addressTitle: 'Browne Family Vineyards – Seattle', addressLine1: '413 1st Avenue South', addressLine2: 'Seattle, WA, 98104' },
        })];
        expect(filterSeattleEvents(events)).toEqual(events);
    });

    it('drops events at other-city tasting rooms', () => {
        const events = [
            makeEvent({ id: '1', location: { addressTitle: 'Browne Family Vineyards – Bellevue', addressLine2: 'Bellevue, WA, 98004' } }),
            makeEvent({ id: '2', location: { addressTitle: 'Browne Family Vineyards – Walla Walla', addressLine2: 'Walla Walla, WA, 99362' } }),
            makeEvent({ id: '3', location: { addressTitle: 'Browne Family Vineyards – Tacoma', addressLine2: 'Tacoma, WA, 98406' } }),
            makeEvent({ id: '4', location: { addressTitle: 'Browne Family Spirits', addressLine2: 'Spokane, Washington, 99202' } }),
        ];
        expect(filterSeattleEvents(events)).toEqual([]);
    });

    it('keeps a Seattle partner venue that does not share the tasting-room naming pattern', () => {
        const events = [makeEvent({
            id: '1',
            location: { addressTitle: 'Tulio Ristorante', addressLine1: '1100 5th Avenue', addressLine2: 'Seattle, Washington, 98101' },
        })];
        expect(filterSeattleEvents(events)).toEqual(events);
    });

    it('drops events with no location', () => {
        expect(filterSeattleEvents([makeEvent({ id: '1' })])).toEqual([]);
    });

    it('matches case-insensitively', () => {
        const events = [
            makeEvent({ id: '1', location: { addressLine2: 'seattle, WA, 98104' } }),
            makeEvent({ id: '2', location: { addressLine2: 'SEATTLE, WA, 98104' } }),
        ];
        expect(filterSeattleEvents(events)).toEqual(events);
    });
});
