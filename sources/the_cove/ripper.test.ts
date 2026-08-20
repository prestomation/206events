import { describe, expect, it } from 'vitest';
import { isPrivateBooking } from './ripper.js';

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
});
