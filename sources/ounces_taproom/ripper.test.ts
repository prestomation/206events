import { describe, expect, it } from 'vitest';
import { extractOuncesTaproomCost } from './ripper.js';

describe('extractOuncesTaproomCost', () => {
    it('returns {min:0} for "free" events', () => {
        expect(extractOuncesTaproomCost('<p>Free entry! Come watch the game.</p>', 'Watch Party')).toEqual({ min: 0 });
    });

    it('returns {min:N} for dollar amount in body', () => {
        expect(extractOuncesTaproomCost('<p>Tickets $15 at the door.</p>', 'Live Music')).toEqual({ min: 15 });
    });

    it('returns {paid:true} for "tickets" without price', () => {
        expect(extractOuncesTaproomCost('<p>Get your tickets now!</p>', 'Comedy Night')).toEqual({ paid: true });
    });

    it('does not detect "Tickets" inside <style> blocks', () => {
        expect(extractOuncesTaproomCost('<style>.Tickets { color: red; }</style>', 'Event')).toBeUndefined();
    });

    it('returns undefined with no pricing signals', () => {
        expect(extractOuncesTaproomCost('<p>Join us to cheer on the team!</p>', 'Soccer Watch')).toBeUndefined();
    });
});
