import { describe, expect, it } from 'vitest';
import { extractSeattleJapaneseGardenCost } from './ripper.js';

describe('extractSeattleJapaneseGardenCost', () => {
    it('returns {min:0} for "Free First Thursday" in title', () => {
        expect(extractSeattleJapaneseGardenCost('', 'Free First Thursday: Wandering and Wondering 2026')).toEqual({ min: 0 });
    });

    it('returns {paid:true} for "tickets" in body', () => {
        expect(extractSeattleJapaneseGardenCost('<p>Reserve your tickets at seattlejapanesegarden.org</p>', 'Tea Ceremony')).toEqual({ paid: true });
    });

    it('returns {min:N} for dollar amount in body', () => {
        expect(extractSeattleJapaneseGardenCost('<p>Admission: $8 adults, $6 seniors</p>', 'Garden Visit')).toEqual({ min: 8 });
    });

    it('returns undefined with no pricing signals', () => {
        expect(extractSeattleJapaneseGardenCost('<p>Youth photography exhibit featuring local artists.</p>', 'SJG Youth Photography')).toBeUndefined();
    });
});
