import { describe, expect, it } from 'vitest';
import { isStoreHoursEntry } from './ripper.js';

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
