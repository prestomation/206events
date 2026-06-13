import { describe, expect, it } from 'vitest';
import { extractSeattleFilmSocietyCost } from './ripper.js';

describe('extractSeattleFilmSocietyCost', () => {
    it('returns {paid:true} for "Tickets" in body', () => {
        expect(extractSeattleFilmSocietyCost('<p>Tickets on sale now at seattlefilmsociety.com</p>', 'Film Screening')).toEqual({ paid: true });
    });

    it('returns {min:N} for dollar amount in body', () => {
        expect(extractSeattleFilmSocietyCost('<p>General admission $12, members $8.</p>', 'Film Screening')).toEqual({ min: 12 });
    });

    it('returns {min:0} for "free" in body', () => {
        expect(extractSeattleFilmSocietyCost('<p>Free discussion — open to the public!</p>', 'Discussion Series')).toEqual({ min: 0 });
    });

    it('returns undefined with no pricing signals', () => {
        expect(extractSeattleFilmSocietyCost('<p>More details coming soon!</p>', 'Upcoming Film')).toBeUndefined();
    });
});
