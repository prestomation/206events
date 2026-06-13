import { describe, expect, it } from 'vitest';
import { extractBallardBrewedCost } from './ripper.js';

describe('extractBallardBrewedCost', () => {
    it('returns {min:0} for "Free event!" in body', () => {
        expect(extractBallardBrewedCost('<p>Join us for a teach-in! Free event!</p>', 'Beer Reviewed Science')).toEqual({ min: 0 });
    });

    it('returns {min:0} for "Free admission" in body', () => {
        expect(extractBallardBrewedCost('<p>3-8p Free admission • 21+</p>', 'FaeFest')).toEqual({ min: 0 });
    });

    it('returns {paid:true} for "Tickets" link/text with no price', () => {
        expect(extractBallardBrewedCost('<p>Tickets: PENDING. Shared high top tables available.</p>', 'Drag & Burlesque Cabaret')).toEqual({ paid: true });
    });

    it('returns {paid:true} for "tickets" keyword in body', () => {
        expect(extractBallardBrewedCost('<p>Watch this space for a link for tickets once ready!</p>', 'Ballard Bites & Brews')).toEqual({ paid: true });
    });

    it('does not pick up "Tickets" text from inside <style> blocks', () => {
        expect(extractBallardBrewedCost('<style>.Tickets { display: none; }</style>', 'Some Event')).toBeUndefined();
    });

    it('returns undefined when no pricing signals present', () => {
        expect(extractBallardBrewedCost('<p>Watch Belgium with us!</p>', 'Belgium v Egypt')).toBeUndefined();
    });

    it('returns undefined for empty body', () => {
        expect(extractBallardBrewedCost('', 'Spring into Summer')).toBeUndefined();
    });
});
