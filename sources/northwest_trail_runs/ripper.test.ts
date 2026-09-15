import { describe, it, expect, vi, afterEach } from 'vitest';
import { parse } from 'node-html-parser';
import { Ripper, RipperCalendarEvent } from '../../lib/config/schema.js';
import NorthwestTrailRunsRipper, {
    parseDateDiv,
    parseTimeText,
    extractContentHeadings,
    parseEventPage,
} from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(name: string = 'sample-data.html'): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

describe('parseDateDiv', () => {
    it('parses MM/DD/YYYY', () => {
        expect(parseDateDiv('11/07/2026')).toEqual({ month: 11, day: 7, year: 2026 });
    });

    it('handles surrounding whitespace', () => {
        expect(parseDateDiv('\n\t\t\t\t\t\t11/07/2026\t\t\t\t\t')).toEqual({ month: 11, day: 7, year: 2026 });
    });

    it('returns null for unparseable text', () => {
        expect(parseDateDiv('Saturday, November 7, 2026')).toBeNull();
        expect(parseDateDiv('')).toBeNull();
    });
});

describe('parseTimeText', () => {
    it('parses AM times', () => {
        expect(parseTimeText('9:30am')).toEqual({ hour: 9, minute: 30 });
        expect(parseTimeText('9:30 am')).toEqual({ hour: 9, minute: 30 });
        expect(parseTimeText('9:30am Start')).toEqual({ hour: 9, minute: 30 });
    });

    it('parses PM times with 12-hour rollover', () => {
        expect(parseTimeText('12:00pm')).toEqual({ hour: 12, minute: 0 });
        expect(parseTimeText('12:00am')).toEqual({ hour: 0, minute: 0 });
        expect(parseTimeText('6:15pm')).toEqual({ hour: 18, minute: 15 });
    });

    it('returns null when no time pattern is present', () => {
        expect(parseTimeText('Carkeek Park, Seattle, WA')).toBeNull();
    });
});

describe('extractContentHeadings', () => {
    it('extracts heading text in order, stripping inner markup', () => {
        const html = '<h1><span style="color:#999">5k &amp; 10k</span></h1>' +
            '<h3><span>Saturday, November 7, 2026</span></h3>' +
            '<h3><span>9:30am</span></h3>' +
            '<h3><span>Carkeek Park, Seattle, WA</span></h3>' +
            '<p>Join us for a run.</p>';
        expect(extractContentHeadings(html)).toEqual([
            '5k & 10k',
            'Saturday, November 7, 2026',
            '9:30am',
            'Carkeek Park, Seattle, WA',
        ]);
    });

    it('mixes heading levels (h1/h3/h4) and still returns them in order', () => {
        const html = '<h1><span>4.2mi &amp; 10k</span></h1>' +
            '<h3><span>Saturday, December 19, 2026</span></h3>' +
            '<h3><span>9:30am Start</span></h3>' +
            '<h4><span>Seward Park, Seattle, WA</span></h4>';
        expect(extractContentHeadings(html)).toEqual([
            '4.2mi & 10k',
            'Saturday, December 19, 2026',
            '9:30am Start',
            'Seward Park, Seattle, WA',
        ]);
    });
});

describe('parseEventPage', () => {
    it('parses the sample Carkeek Cooler event page', () => {
        const html = parse(loadSampleHtml());
        const url = 'https://nwtrailruns.com/events/carkeek-cooler-trail-run/';
        const result = parseEventPage('carkeek-cooler-trail-run', html, url);

        expect('date' in result).toBe(true);
        const event = result as RipperCalendarEvent;
        expect(event.id).toBe('carkeek-cooler-trail-run-2026-11-07');
        expect(event.summary).toBe('Carkeek Cooler Trail Run');
        expect(event.date.toString()).toBe('2026-11-07T09:30-08:00[America/Los_Angeles]');
        expect(event.duration.toHours()).toBe(2);
        expect(event.location).toBe('Carkeek Park, Seattle, WA');
        expect(event.url).toBe(url);
        expect(event.description).toBeTruthy();
        expect(event.imageUrl).toContain('nwtrailruns.com');
    });

    // Real, saved pages for the other 3 configured Seattle races — each
    // uses a different heading-level layout for the time/location pair
    // (h1/h3/h3/h3, h2/h3/h3/h4, h1/h3/h3/h4, h1/h3/h4/h4) confirming the
    // content-based matching in extractContentHeadings handles all of them,
    // not just the Carkeek fixture's h1/h3/h3/h3 layout.
    it.each([
        {
            file: 'sample-data-ravenna.html',
            slug: 'ravenna-refresher-trail-run',
            summary: 'Ravenna Refresher Trail Run',
            isoDate: '2026-11-21T09:30-08:00[America/Los_Angeles]',
            location: 'Ravenna Park, Seattle, WA',
        },
        {
            file: 'sample-data-seward.html',
            slug: 'seward-solstice-run',
            summary: 'Seward Solstice Run',
            isoDate: '2026-12-19T09:30-08:00[America/Los_Angeles]',
            location: 'Seward Park, Seattle, WA',
        },
        {
            file: 'sample-data-interlaken.html',
            slug: 'interlaken-icicle-dash',
            summary: 'Interlaken Icicle Dash',
            isoDate: '2027-01-30T09:30-08:00[America/Los_Angeles]',
            location: 'Interlaken Park, Seattle, WA',
        },
    ])('parses the real $slug event page', ({ file, slug, summary, isoDate, location }) => {
        const html = parse(loadSampleHtml(file));
        const url = `https://nwtrailruns.com/events/${slug}/`;
        const result = parseEventPage(slug, html, url);

        expect('date' in result).toBe(true);
        const event = result as RipperCalendarEvent;
        expect(event.summary).toBe(summary);
        expect(event.date.toString()).toBe(isoDate);
        expect(event.location).toBe(location);
    });

    it('returns a ParseError when the title is missing', () => {
        const html = parse('<html><body><div class="date">11/07/2026</div><div class="the-content"><h3>9:30am</h3><h3>Carkeek Park, Seattle, WA</h3></div></body></html>');
        const result = parseEventPage('missing-title', html, 'https://nwtrailruns.com/events/missing-title/');
        expect(result).toMatchObject({ type: 'ParseError', context: 'missing-title' });
    });

    it('returns a ParseError when the .date element is missing', () => {
        const html = parse('<html><body><h1 class="entry-title">Some Run</h1><div class="the-content"><h3>9:30am</h3><h3>Somewhere, Seattle, WA</h3></div></body></html>');
        const result = parseEventPage('no-date', html, 'https://nwtrailruns.com/events/no-date/');
        expect(result).toMatchObject({ type: 'ParseError', context: 'no-date' });
    });

    it('returns a ParseError when no location heading is found', () => {
        const html = parse('<html><body><h1 class="entry-title">Some Run</h1><div class="date">11/07/2026</div><div class="the-content"><h3>9:30am</h3></div></body></html>');
        const result = parseEventPage('no-location', html, 'https://nwtrailruns.com/events/no-location/');
        expect(result).toMatchObject({ type: 'ParseError', context: 'no-location' });
    });

    it('falls back to a default 9am start time when no time heading is found', () => {
        const html = parse('<html><body><h1 class="entry-title">Some Run</h1><div class="date">11/07/2026</div><div class="the-content"><h3>Somewhere, Seattle, WA</h3></div></body></html>');
        const result = parseEventPage('no-time', html, 'https://nwtrailruns.com/events/no-time/');
        expect('date' in result).toBe(true);
        const event = result as RipperCalendarEvent;
        expect(event.date.hour()).toBe(9);
        expect(event.date.minute()).toBe(0);
    });
});

describe('NorthwestTrailRunsRipper.rip', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function mockRipper(config?: Record<string, unknown>): Ripper {
        return {
            config: {
                name: 'northwest-trail-runs',
                url: 'https://nwtrailruns.com/events/',
                proxy: false,
                calendars: [
                    {
                        name: 'northwest-trail-runs',
                        friendlyname: 'Northwest Trail Runs (Seattle Races)',
                        timezone: 'America/Los_Angeles',
                        config,
                    },
                ],
            } as any,
        } as Ripper;
    }

    it('throws when eventSlugs is missing from config', async () => {
        await expect(new NorthwestTrailRunsRipper().rip(mockRipper(undefined))).rejects.toThrow(/eventSlugs/);
    });

    it('throws when eventSlugs is present but empty or malformed', async () => {
        await expect(new NorthwestTrailRunsRipper().rip(mockRipper({ eventSlugs: [] }))).rejects.toThrow(/eventSlugs/);
        await expect(new NorthwestTrailRunsRipper().rip(mockRipper({ eventSlugs: [1] }))).rejects.toThrow(/eventSlugs/);
    });

    it('fetches each configured event page and returns a ParseError for one that 404s alongside a successful one', async () => {
        const sampleHtml = loadSampleHtml();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(sampleHtml) })
            .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
        vi.stubGlobal('fetch', fetchMock);

        const calendars = await new NorthwestTrailRunsRipper().rip(
            mockRipper({ eventSlugs: ['carkeek-cooler-trail-run', 'missing-race'] })
        );
        const cal = calendars[0];

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(cal.events).toHaveLength(1);
        expect(cal.events[0].summary).toBe('Carkeek Cooler Trail Run');
        expect(cal.errors).toHaveLength(1);
        expect(cal.errors[0]).toMatchObject({ type: 'ParseError', context: 'missing-race' });
    });
});
