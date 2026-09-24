import { describe, expect, it } from 'vitest';
import { isStoreHoursEntry, hasFreeSignal } from './ripper.js';

describe('isStoreHoursEntry', () => {
    it('matches the retail store-hours entries', () => {
        expect(isStoreHoursEntry('Shop is OPEN')).toBe(true);
        expect(isStoreHoursEntry('Shop is OPEN ')).toBe(true);
        expect(isStoreHoursEntry(' shop is open')).toBe(true);
    });

    it('keeps real classes and workshops', () => {
        expect(isStoreHoursEntry('Yin Yoga and Sound Bath')).toBe(false);
        expect(isStoreHoursEntry('Death Cafe')).toBe(false);
        expect(isStoreHoursEntry('Workshop: Open your heart')).toBe(false);
        expect(isStoreHoursEntry(undefined)).toBe(false);
    });
});

describe('hasFreeSignal', () => {
    it('matches free and donation-based admission language', () => {
        expect(hasFreeSignal('a free community gathering devoted to presence')).toBe(true);
        expect(hasFreeSignal('by donation')).toBe(true);
        expect(hasFreeSignal('donation-based')).toBe(true);
        expect(hasFreeSignal('donation based workshop')).toBe(true);
        expect(hasFreeSignal('suggested donation at the door')).toBe(true);
        expect(hasFreeSignal('pay what you can')).toBe(true);
        expect(hasFreeSignal('pay what you will')).toBe(true);
        expect(hasFreeSignal('FREE admission for all ages')).toBe(true);
    });

    it('returns false for paid events', () => {
        expect(hasFreeSignal('Vinyasa Flow Yoga — register at the link')).toBe(false);
        expect(hasFreeSignal('$25 drop-in rate')).toBe(false);
        expect(hasFreeSignal('Death Cafe')).toBe(false);
        expect(hasFreeSignal('')).toBe(false);
    });
});
