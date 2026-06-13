import { describe, expect, it } from 'vitest';
import { extractWingLukeCost } from './ripper.js';

describe('extractWingLukeCost', () => {
    it('returns {min:0} for "Free First Thursday" in title', () => {
        expect(extractWingLukeCost('', 'Free First Thursday Evenings: Wing Luke Museum')).toEqual({ min: 0 });
    });

    it('returns {min:0} for "free" in body', () => {
        expect(extractWingLukeCost('<p>Community event — free and open to all!</p>', 'C-ID Summer Kickoff')).toEqual({ min: 0 });
    });

    it('returns {min:N} for dollar amount in body', () => {
        expect(extractWingLukeCost('<p>General admission $17, members free.</p>', 'Exhibition Opening')).toEqual({ min: 17 });
    });

    it('returns undefined with no pricing signals', () => {
        expect(extractWingLukeCost('<p>Join us for mahjong fun!</p>', 'Mahjong 101')).toBeUndefined();
    });
});
