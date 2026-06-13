import { describe, expect, it } from 'vitest';
import { extractRendezvousCost } from './ripper.js';

describe('extractRendezvousCost', () => {
    it('returns {min:10} for "$10 Cover" in body', () => {
        expect(extractRendezvousCost('<p>Doors at 7pm. Show at 8pm. 21+ $10 Cover</p>', 'Kenny Lane')).toEqual({ min: 10 });
    });

    it('returns {min:16} for standalone price like "$16"', () => {
        expect(extractRendezvousCost('<p>All-Ages, $16</p>', 'Khary: BIG MAN TOUR')).toEqual({ min: 16 });
    });

    it('returns {min:5} for "$5 (or free with ...)" — dollar amount takes priority over free', () => {
        expect(extractRendezvousCost('<p>five bux $5 (or free with industry stub)</p>', 'MONDA¥ MOVE$')).toEqual({ min: 5 });
    });

    it('returns {paid:true} for "Tickets" button text with no price', () => {
        expect(extractRendezvousCost('<a href="/t">Tickets</a>', '100% Pure Love')).toEqual({ paid: true });
    });

    it('does not pick up "Tickets" text from inside <style> blocks', () => {
        expect(extractRendezvousCost('<style>.Tickets { color: blue; }</style>', 'Some Event')).toBeUndefined();
    });

    it('returns {min:0} for "free" in body when no dollar amount', () => {
        expect(extractRendezvousCost('<p>Free comedy show tonight!</p>', 'Open Mic')).toEqual({ min: 0 });
    });

    it('returns undefined when no pricing signals present', () => {
        expect(extractRendezvousCost('<p>Weekly comedy open mic. Sign-up at 7:00.</p>', 'Comedy Open Mic')).toBeUndefined();
    });

    it('returns undefined for empty body', () => {
        expect(extractRendezvousCost('', 'Mahjong')).toBeUndefined();
    });
});
