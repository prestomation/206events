import { describe, expect, it } from 'vitest';
import { extractThreeDollarBillCinemaCost } from './ripper.js';

describe('extractThreeDollarBillCinemaCost', () => {
    it('returns {min:N} for dollar amount in body', () => {
        expect(extractThreeDollarBillCinemaCost('<p>Tickets: $15 general / $10 members</p>', 'Screening')).toEqual({ min: 15 });
    });

    it('returns {paid:true} for "tickets" without price', () => {
        expect(extractThreeDollarBillCinemaCost('<p>Tickets available at the door.</p>', 'Film Night')).toEqual({ paid: true });
    });

    it('returns {min:0} for "free" in body', () => {
        expect(extractThreeDollarBillCinemaCost('<p>Free screening — donations welcome!</p>', 'Community Film')).toEqual({ min: 0 });
    });

    it('returns {min:0} for NOTAFLOF', () => {
        expect(extractThreeDollarBillCinemaCost('<p>NOTAFLOF applies to this event.</p>', 'Film')).toEqual({ min: 0 });
    });

    it('returns undefined with no pricing signals', () => {
        expect(extractThreeDollarBillCinemaCost('<p>Join Scarecrow for the annual archive screening.</p>', 'Queercrow Archive')).toBeUndefined();
    });
});
