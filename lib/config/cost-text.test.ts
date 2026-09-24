import { describe, expect, test } from 'vitest';
import { firstNonTieredPrice, firstNonTieredMatch, isNearTierWord } from './cost-text.js';

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

describe('firstNonTieredMatch', () => {
    const rangeRe = /\$(\d+)-\$(\d+)/gi;

    test('skips a tiered range and returns the full match for the next one', () => {
        // A bare "$15-$20" range doesn't start with the tier word itself
        // (unlike "Member price: $145", where the match starts at "price"),
        // so isTierPrefixed's adjacency check alone can't see "Member" —
        // callers whose match doesn't include the keyword combine this with
        // isNearTierWord (see lib/config/squarespace.ts's RANGE_RE usage).
        const text = 'Member price: $15-$20, Regular price: $25-$35.';
        const m = firstNonTieredMatch(text, rangeRe, match => !isNearTierWord(text, match.index));
        expect(m?.[1]).toBe('25');
        expect(m?.[2]).toBe('35');
    });

    test('an extra accept() predicate can reject an otherwise-untiered match', () => {
        expect(firstNonTieredMatch('$10-$20', rangeRe, () => false)).toBeUndefined();
        expect(firstNonTieredMatch('$10-$20', rangeRe, () => true)?.[1]).toBe('10');
    });
});

describe('isNearTierWord', () => {
    test('finds a tier word anywhere in the preceding window, not just immediately adjacent', () => {
        const text = 'Member price: $15-$20';
        expect(isNearTierWord(text, text.indexOf('$'))).toBe(true);
    });

    test('returns false when no tier word is nearby', () => {
        const text = 'Regular price: $25-$35';
        expect(isNearTierWord(text, text.indexOf('$'))).toBe(false);
    });

    test('does not treat an incidental tier-word mention (not labeling a price) as tiered', () => {
        const text = 'Family friendly show, kids welcome! Admission: $10-$20';
        expect(isNearTierWord(text, text.indexOf('$'))).toBe(false);
    });

    test('recognizes a tier label with no colon punctuation', () => {
        const text = 'Member price $15-$20';
        expect(isNearTierWord(text, text.indexOf('$'))).toBe(true);
    });

    test('an unrelated earlier label inside the window does not bleed through to a later, untiered price', () => {
        const text = 'Member price: $15-$20, Regular price: $25-$35';
        expect(isNearTierWord(text, text.lastIndexOf('$'))).toBe(false);
    });
});
