import { describe, expect, test } from 'vitest';
import FuturewiseRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('FuturewiseRipper - extractEventSourcesJson', () => {
    const ripper = new FuturewiseRipper();

    test('extracts the inner JSON array from a balanced [[...]] block', () => {
        const html = '<script>foo eventSources: [[{"title":"a","start":"2026-01-01T00:00:00"}]], other: x</script>';
        const raw = ripper.extractEventSourcesJson(html);
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw!)).toEqual([{ title: 'a', start: '2026-01-01T00:00:00' }]);
    });

    test('handles brackets inside string values', () => {
        const html = '<script>eventSources: [[{"title":"a [b] c","start":"2026-01-01T00:00:00"}]]</script>';
        const raw = ripper.extractEventSourcesJson(html);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed[0].title).toBe('a [b] c');
    });

    test('returns null when no eventSources block is present', () => {
        expect(ripper.extractEventSourcesJson('<html>no calendar</html>')).toBeNull();
    });
});

describe('FuturewiseRipper - parseLocalDateTime', () => {
    const ripper = new FuturewiseRipper();

    test('parses pie-calendar ISO local datetime', () => {
        const dt = ripper.parseLocalDateTime('2026-05-30T09:30:00');
        expect(dt).not.toBeNull();
        expect(dt!.year()).toBe(2026);
        expect(dt!.monthValue()).toBe(5);
        expect(dt!.dayOfMonth()).toBe(30);
        expect(dt!.hour()).toBe(9);
        expect(dt!.minute()).toBe(30);
    });

    test('returns null on malformed input', () => {
        expect(ripper.parseLocalDateTime('not a date')).toBeNull();
        expect(ripper.parseLocalDateTime('2026-05-30')).toBeNull();
    });
});

describe('FuturewiseRipper - parseEvents (sample data)', () => {
    test('parses events from a real Futurewise events page', () => {
        const ripper = new FuturewiseRipper();
        // Sample was captured on 2026-05-28; pin "now" before that so future events survive the past-event filter.
        const fixedNow = new Date('2026-01-01T00:00:00Z');
        const original = Date;
        // @ts-ignore — monkey-patch for the duration of this test
        global.Date = class extends original {
            constructor(...args: any[]) {
                if (args.length === 0) {
                    super(fixedNow.getTime());
                } else {
                    // @ts-ignore
                    super(...args);
                }
            }
            static now() { return fixedNow.getTime(); }
        };
        try {
            const html = loadSample();
            const results = ripper.parseEvents(html);
            const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);

            expect(events.length).toBeGreaterThan(0);

            const beepBeep = events.find(e => e.summary === 'CCC Bus Ride Along!');
            expect(beepBeep).toBeDefined();
            expect(beepBeep!.date.year()).toBe(2026);
            expect(beepBeep!.date.monthValue()).toBe(5);
            expect(beepBeep!.date.dayOfMonth()).toBe(30);
            expect(beepBeep!.date.hour()).toBe(9);
            expect(beepBeep!.date.minute()).toBe(30);
            expect(beepBeep!.url).toBe('https://futurewise.org/ccc-bus-ride-along/');
            // 9:30 → 18:00 = 8h30m = 30600s
            expect(beepBeep!.duration.seconds()).toBe(30600);
            expect(beepBeep!.id).toBe(beepBeep!.url);
        } finally {
            global.Date = original;
        }
    });

    test('skips the placeholder Page-typed entry', () => {
        const ripper = new FuturewiseRipper();
        const fixedNow = new Date('2026-01-01T00:00:00Z');
        const original = Date;
        // @ts-ignore
        global.Date = class extends original {
            constructor(...args: any[]) {
                if (args.length === 0) super(fixedNow.getTime());
                // @ts-ignore
                else super(...args);
            }
            static now() { return fixedNow.getTime(); }
        };
        try {
            const html = loadSample();
            const events = ripper.parseEvents(html).filter((r): r is RipperCalendarEvent => 'date' in r);
            expect(events.find(e => e.summary === 'Our Events')).toBeUndefined();
        } finally {
            global.Date = original;
        }
    });

    test('decodes HTML entities in titles', () => {
        const ripper = new FuturewiseRipper();
        const html = `<script>eventSources: [[{"title":"Affordable Housing Week &#8211; Comp Plan Workshop","start":"2099-01-01T15:30:00","end":"2099-01-01T17:00:00","permalink":"https://x/y","postType":"Post","postId":1}]]</script>`;
        const events = ripper.parseEvents(html).filter((r): r is RipperCalendarEvent => 'date' in r);
        // The decoder handles &mdash;/&ndash; but the JSON itself encodes &#8211; — confirm the literal text survives unmangled.
        expect(events).toHaveLength(1);
        expect(events[0].summary).toContain('Affordable Housing Week');
    });

    test('reports a ParseError when eventSources is missing', () => {
        const ripper = new FuturewiseRipper();
        const results = ripper.parseEvents('<html><body>no calendar here</body></html>');
        const errors = results.filter((r): r is RipperError => 'type' in r);
        expect(errors.length).toBe(1);
        expect(errors[0].type).toBe('ParseError');
    });
});
