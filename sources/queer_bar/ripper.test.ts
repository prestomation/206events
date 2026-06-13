import { describe, expect, it } from 'vitest';
import { extractQueerBarCost } from './ripper.js';

describe('extractQueerBarCost', () => {
    it('returns {min:0} for "free" events', () => {
        expect(extractQueerBarCost('<p>FREE! No cover. 21+</p>', 'Motherland')).toEqual({ min: 0 });
    });

    it('returns {paid:true} for "tickets" in body', () => {
        expect(extractQueerBarCost('<a href="/tickets">Tickets</a>', 'MX. Drag Show')).toEqual({ paid: true });
    });

    it('returns {min:N} for dollar amount in body', () => {
        expect(extractQueerBarCost('<p>$15 tickets at the door.</p>', 'Special Event')).toEqual({ min: 15 });
    });

    it('returns undefined with no pricing signals', () => {
        expect(extractQueerBarCost('<p>Saturday night featuring incredible performances.</p>', 'QPF 26')).toBeUndefined();
    });
});
