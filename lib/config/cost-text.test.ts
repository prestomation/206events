import { describe, expect, test } from 'vitest';
import { firstNonTieredPrice } from './cost-text.js';

describe('firstNonTieredPrice', () => {
    const priceRe = /Price:\s*\$(\d[\d,]*)/gi;

    test('returns the only price when there is no tier qualifier', () => {
        expect(firstNonTieredPrice('Price: $145', priceRe)).toBe('145');
    });

    test('skips a member/student/senior/child/youth/volunteer-tiered price', () => {
        expect(firstNonTieredPrice('Member Price: $100, Regular Price: $145', priceRe)).toBe('145');
        expect(firstNonTieredPrice('Student Price: $80, Price: $120', priceRe)).toBe('120');
        expect(firstNonTieredPrice('Senior Price: $10', priceRe)).toBeUndefined();
        expect(firstNonTieredPrice('Volunteer Price: $0, Youth Price: $5, Price: $25', priceRe)).toBe('25');
    });

    test('does not treat "Nonmember" as a discount-tier qualifier', () => {
        expect(firstNonTieredPrice('Nonmember Price: $145', priceRe)).toBe('145');
    });

    test('returns undefined when every match on the page is tiered', () => {
        expect(firstNonTieredPrice('Member Price: $100', priceRe)).toBeUndefined();
    });

    test('returns undefined when there is no match at all', () => {
        expect(firstNonTieredPrice('no price mentioned here', priceRe)).toBeUndefined();
    });
});
