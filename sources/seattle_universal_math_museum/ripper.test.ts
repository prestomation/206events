import { describe, expect, it } from 'vitest';
import { extractSUMMCost } from './ripper.js';

describe('extractSUMMCost', () => {
    it('returns {paid:true} for "PAID CLASS"', () => {
        expect(extractSUMMCost('REGISTRATION REQUIRED — PAID CLASS')).toEqual({ paid: true });
    });

    it('returns {paid:true} for summer camp titles', () => {
        expect(extractSUMMCost('Tabletop RPG Summer Camp @ Kent Station')).toEqual({ paid: true });
        expect(extractSUMMCost('Level Up Summer Camp @ Kent Station')).toEqual({ paid: true });
    });

    it('returns {min:0} for "FREE ADMISSION"', () => {
        expect(extractSUMMCost('FREE ADMISSION — DROP-IN')).toEqual({ min: 0 });
    });

    it('returns {min:0} for "FREE EVENT"', () => {
        expect(extractSUMMCost('FREE EVENT — Registration Required')).toEqual({ min: 0 });
    });

    it('returns {min:0} for lowercase "free"', () => {
        expect(extractSUMMCost('free drop-in hours')).toEqual({ min: 0 });
    });

    it('paid class takes priority over free keyword (no mixed case expected, but belt-and-suspenders)', () => {
        expect(extractSUMMCost('PAID CLASS — free rescheduling policy')).toEqual({ paid: true });
    });

    it('returns undefined for events with no pricing info', () => {
        expect(extractSUMMCost('Math talks and activities')).toBeUndefined();
    });
});
