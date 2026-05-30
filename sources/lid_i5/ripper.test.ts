import { describe, expect, test } from 'vitest';
import LidI5Ripper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('LidI5Ripper - extractTourLinks', () => {
    const ripper = new LidI5Ripper();

    test('extracts only Seattle Parks Foundation registration links', () => {
        const links = ripper.extractTourLinks(loadSampleHtml());
        expect(links).toHaveLength(3);
        expect(links[0].href).toContain('seattleparksfoundation.org/event/');
        // The plain Seattle Parks Foundation homepage link is excluded.
        expect(links.some(l => l.href === 'https://www.seattleparksfoundation.org/')).toBe(false);
    });

    test('decodes HTML entities in link text', () => {
        const links = ripper.extractTourLinks(loadSampleHtml());
        // &#8211; (en dash) should be decoded by the HTML parser.
        expect(links[0].text).toBe('Tuesday, June 23, 2026, 5:30 PM – 7:00');
    });
});

describe('LidI5Ripper - parseTourLink', () => {
    const ripper = new LidI5Ripper();

    test('parses date, time, and duration from link text', () => {
        const result = ripper.parseTourLink(
            'https://give.seattleparksfoundation.org/event/lid-i-5-walking-tour-core-area-6-23/e800432',
            'Tuesday, June 23, 2026, 5:30 PM – 7:00',
        );
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;

        expect(result.id).toBe('lidi5-e800432');
        expect(result.date.year()).toBe(2026);
        expect(result.date.monthValue()).toBe(6);
        expect(result.date.dayOfMonth()).toBe(23);
        expect(result.date.hour()).toBe(17);
        expect(result.date.minute()).toBe(30);
        // 5:30 PM – 7:00 PM = 90 minutes (end inherits the start meridiem).
        expect(result.duration.toMinutes()).toBe(90);
        expect(result.summary).toBe('Lid I-5 Walking Tour');
        expect(result.location).toContain('703 Marion St');
        expect(result.url).toContain('e800432');
    });

    test('uses a stable upstream id derived from the registration URL', () => {
        const a = ripper.parseTourLink(
            'https://give.seattleparksfoundation.org/event/lid-i-5-walking-tour-core-area-7-23/e801252',
            'Thursday, July 23, 2026, 5:30 PM – 7:00',
        );
        const b = ripper.parseTourLink(
            'https://give.seattleparksfoundation.org/event/lid-i-5-walking-tour-core-area-7-23/e801252',
            'Thursday, July 23, 2026, 5:30 PM – 7:00',
        );
        expect('date' in a && 'date' in b).toBe(true);
        if ('date' in a && 'date' in b) expect(a.id).toBe(b.id);
    });

    test('falls back to a date-based id when the URL has no upstream id', () => {
        const result = ripper.parseTourLink(
            'https://give.seattleparksfoundation.org/event/lid-i-5-walking-tour',
            'Wednesday, August 19, 2026, 5:30 PM – 7:00',
        );
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.id).toBe('lidi5-2026-8-19');
    });

    test('returns a ParseError (never null) when no date is present', () => {
        const result = ripper.parseTourLink(
            'https://give.seattleparksfoundation.org/event/lid-i-5-walking-tour/e999999',
            'Register here',
        );
        expect('date' in result).toBe(false);
        if ('date' in result) return;
        expect(result.type).toBe('ParseError');
    });

    test('falls back to default 5:30 PM start when no time is present', () => {
        const result = ripper.parseTourLink(
            'https://give.seattleparksfoundation.org/event/lid-i-5-walking-tour/e123456',
            'Saturday, September 12, 2026',
        );
        expect('date' in result).toBe(true);
        if (!('date' in result)) return;
        expect(result.date.hour()).toBe(17);
        expect(result.date.minute()).toBe(30);
        expect(result.duration.toMinutes()).toBe(90);
    });
});
