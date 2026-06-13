import { describe, expect, it } from 'vitest';
import { extractKenyonHallCost } from './ripper.js';

describe('extractKenyonHallCost', () => {
    it('returns {min:0} for "ALL ENTRY - FREE"', () => {
        expect(extractKenyonHallCost('ALL ENTRY - FREE')).toEqual({ min: 0 });
    });

    it('returns {min:0} for lowercase "free"', () => {
        expect(extractKenyonHallCost('Free admission tonight')).toEqual({ min: 0 });
    });

    it('returns {min:0} for suggested donation (ignores dollar amount)', () => {
        expect(extractKenyonHallCost('Suggested Donation - $20')).toEqual({ min: 0 });
    });

    it('returns {min:0} for PWYW', () => {
        expect(extractKenyonHallCost('Pay what you can')).toEqual({ min: 0 });
    });

    it('extracts floor price from "$20 General / Half-priced Senior/Students"', () => {
        expect(extractKenyonHallCost('$20 General / Half-priced Senior/Students')).toEqual({ min: 20 });
    });

    it('extracts price from simple "$15" pattern', () => {
        expect(extractKenyonHallCost('Tickets $15 advance / $18 door')).toEqual({ min: 15 });
    });

    it('returns undefined when no price info', () => {
        expect(extractKenyonHallCost('Bold harmonies from Nashville')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
        expect(extractKenyonHallCost('')).toBeUndefined();
    });
});
