import { describe, expect, it } from 'vitest';
import { extractRepairBankLocation } from './ripper.js';

describe('extractRepairBankLocation', () => {
    it('extracts the shop address from a plain Repair Day body', () => {
        const body = '<p><strong><em>Sign Up: Visit our </em></strong>' +
            '<a href="https://repairbank.galaxydigital.com/"><strong><em>volunteer portal</em></strong></a>' +
            '<strong><em>!</em></strong></p>' +
            '<p><strong><em>Shift times: </em></strong><em>10 am to 12:30 pm and 1:30 pm to 4:00 pm.</em></p>' +
            '<p><strong><em>Address:</em></strong><em>&nbsp;1938B Occidental Ave S, Seattle, WA 98134</em></p>';
        expect(extractRepairBankLocation(body)).toBe('1938B Occidental Ave S, Seattle, WA 98134');
    });

    it('extracts a Collection Event address at a different Seattle site', () => {
        const body = '<p>Sign up through our volunteer portal if you are interested in joining us to ' +
            'save furniture from the landfill at the source!Address: South Transfer Station, 130 S Kenyon St, ' +
            'Seattle, WA 98108Volunteer Support Needed from 9 am to 2:30 pm: Set up &amp; breakdown of ' +
            'signage/tents at the beginning &amp; end of the event</p>';
        expect(extractRepairBankLocation(body)).toBe('South Transfer Station, 130 S Kenyon St, Seattle, WA 98108');
    });

    it('takes the first Address: line when a body mentions more than one', () => {
        // Documents current first-match-wins behavior; not exercised by real
        // data today (every observed body has exactly one Address: line).
        const body = '<p>Address: 1938B Occidental Ave S, Seattle, WA 98134</p>' +
            '<p>Drop off donations at Address: 555 Other St, Seattle, WA 98101</p>';
        expect(extractRepairBankLocation(body)).toBe('1938B Occidental Ave S, Seattle, WA 98134');
    });

    it('returns undefined when no Address: line is present', () => {
        const body = '<p>Furniture Repair Bank volunteer repair day. Bring your gloves!</p>';
        expect(extractRepairBankLocation(body)).toBeUndefined();
    });

    it('returns undefined for an empty body', () => {
        expect(extractRepairBankLocation('')).toBeUndefined();
    });
});
