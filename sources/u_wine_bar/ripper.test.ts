import { describe, expect, test } from 'vitest';
import UWineBarRipper from './ripper.js';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('UWineBarRipper - parseTitle', () => {
    const ripper = new UWineBarRipper();

    test('parses a zero-padded date with a time', () => {
        const p = ripper.parseTitle('09/09/26 6:30pm Mystery Booster 1 Convention Edition Throwback Draft');
        expect(p).not.toBeNull();
        expect(p!.date.year()).toBe(2026);
        expect(p!.date.monthValue()).toBe(9);
        expect(p!.date.dayOfMonth()).toBe(9);
        expect(p!.hour).toBe(18);
        expect(p!.minute).toBe(30);
        expect(p!.name).toBe('Mystery Booster 1 Convention Edition Throwback Draft');
    });

    test('parses a date with no time', () => {
        const p = ripper.parseTitle('09/14/26 Sip & Sculpt Bag Charms & Key Chains');
        expect(p).not.toBeNull();
        expect(p!.date.toString()).toBe('2026-09-14');
        expect(p!.hour).toBeNull();
        expect(p!.minute).toBeNull();
        expect(p!.name).toBe('Sip & Sculpt Bag Charms & Key Chains');
    });

    test('parses a single-digit month/day date', () => {
        const p = ripper.parseTitle('10/3/26 1pm ONE PIECE TCG Store Tournament');
        expect(p).not.toBeNull();
        expect(p!.date.toString()).toBe('2026-10-03');
        expect(p!.hour).toBe(13);
        expect(p!.minute).toBe(0);
        expect(p!.name).toBe('ONE PIECE TCG Store Tournament');
    });

    test('parses an AM time', () => {
        const p = ripper.parseTitle('09/26/26 9am Reality Fracture Prerelease 2');
        expect(p).not.toBeNull();
        expect(p!.hour).toBe(9);
        expect(p!.minute).toBe(0);
    });

    test('parses a 12am/12pm boundary correctly', () => {
        expect(ripper.parseTitle('01/01/26 12am New Year Draft')!.hour).toBe(0);
        expect(ripper.parseTitle('01/01/26 12pm Noon Draft')!.hour).toBe(12);
    });

    test('returns null for a title with no leading date (recurring weekly template)', () => {
        expect(ripper.parseTitle('Friday Night Magic 6:30pm Weekly')).toBeNull();
        expect(ripper.parseTitle('Monday Chaos Draft 6pm Weekly')).toBeNull();
        expect(ripper.parseTitle('')).toBeNull();
    });

});

describe('UWineBarRipper - HTML entity decoding', () => {
    const ripper = new UWineBarRipper();

    // parseTitle itself just splits date/time/name; entity decoding happens
    // upstream in parseEventsFromHtml (matching traveling_goat's pattern of
    // decode()-ing text pulled from the DOM) before parseTitle ever sees it.
    // This exercises that end-to-end, using an `&amp;`-encoded title
    // attribute value, which some browsers/authoring tools do emit even
    // though the live site currently serves literal "&" (see sample-data.html).
    test('decodes an HTML-entity-encoded title attribute end to end', () => {
        const html = `
            <li class="product">
                <div class="meta">
                    <a itemprop="url" href="/catalog/events/test/1"></a>
                    <h4 itemprop="name" title="09/09/26 6:30pm Wine &amp; Draft Night">09/09/26 6:30pm Wine &amp; Draft Night</h4>
                </div>
            </li>
        `;
        const results = ripper.parseEventsFromHtml(html, 'https://example.com');
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);
        expect(events.length).toBe(1);
        expect(events[0].summary).toBe('Wine & Draft Night');
    });
});

describe('UWineBarRipper - parseEventsFromHtml', () => {
    const ripper = new UWineBarRipper();
    const html = loadSampleHtml();
    const url = 'https://www.uwinebar.com/catalog/events/12713';
    const results = ripper.parseEventsFromHtml(html, url);
    const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);
    const errors = results.filter((e): e is RipperError => 'type' in e);
    const uncertainties = results.filter((e): e is RipperError => 'type' in e && e.type === 'Uncertainty');

    test('parses only the dated products, skipping the two recurring "Weekly" templates', () => {
        // sample-data.html has 7 <li class="product"> total: 5 dated + 2 weekly templates
        expect(events.length).toBe(5);
    });

    test('produces no ParseErrors on the sample page', () => {
        const parseErrors = errors.filter(e => e.type === 'ParseError');
        expect(parseErrors).toEqual([]);
    });

    test('every event has a stable id, location, and non-empty summary', () => {
        for (const e of events) {
            expect(e.id).toBeTruthy();
            expect(e.location).toBe('U Wine Bar, 4455 Stone Way N, Seattle, WA 98103');
            expect(e.summary.length).toBeGreaterThan(0);
        }
    });

    test('parses the timed Mystery Booster event with correct date/time/url/image', () => {
        const ev = events.find(e => e.summary.includes('Mystery Booster'));
        expect(ev).toBeDefined();
        expect(ev!.date.toLocalDate().toString()).toBe('2026-09-09');
        expect(ev!.date.hour()).toBe(18);
        expect(ev!.date.minute()).toBe(30);
        expect(ev!.url).toBe('https://www.uwinebar.com/catalog/events/090926_630pm_mystery_booster_1_convention_edition_throwback_draft/2390400');
        expect(ev!.imageUrl).toBe('https://cc-client-assets.cdn.crystalcommerce.com/photo/uwinebar/file/79153379ef4b497fa98448e05d0a9147/medium/217533_in_1000x1000.jpg');
    });

    test('decodes the "&" entity in the Sip & Sculpt title and flags it uncertain (no time)', () => {
        const ev = events.find(e => e.summary.includes('Sip & Sculpt'));
        expect(ev).toBeDefined();
        expect(ev!.summary).toBe('Sip & Sculpt Bag Charms & Key Chains');

        const uncertainty = uncertainties.find(e => 'event' in e && e.event.id === ev!.id);
        expect(uncertainty).toBeDefined();
        if (uncertainty && 'unknownFields' in uncertainty) {
            expect(uncertainty.unknownFields).toContain('startTime');
        }
    });

    test('parses the single-digit-day ONE PIECE TCG event', () => {
        const ev = events.find(e => e.summary.includes('ONE PIECE TCG'));
        expect(ev).toBeDefined();
        expect(ev!.date.toLocalDate().toString()).toBe('2026-10-03');
        expect(ev!.date.hour()).toBe(13);
    });

    test('emits an Uncertainty for the apostrophe-titled Leylines\' Eve event (no time)', () => {
        const ev = events.find(e => e.summary.includes("Leylines"));
        expect(ev).toBeDefined();
        expect(ev!.summary).toBe("Magic Presents: All Leylines' Eve Chaos Draft");
        const uncertainty = uncertainties.find(e => 'event' in e && e.event.id === ev!.id);
        expect(uncertainty).toBeDefined();
    });

    test('exactly two events are missing a start time (the two no-time listings)', () => {
        expect(uncertainties.length).toBe(2);
    });

    test('ids are stable across repeated parses of the same page', () => {
        const again = ripper.parseEventsFromHtml(html, url)
            .filter((e): e is RipperCalendarEvent => 'date' in e);
        expect(again.map(e => e.id)).toEqual(events.map(e => e.id));
    });

    test('same-day differently-named showings get distinct ids', () => {
        // Only one "Reality Fracture Prerelease N" showing is in the trimmed
        // fixture, but assert general id uniqueness across all events.
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('UWineBarRipper - parseEventsFromHtml edge cases', () => {
    const ripper = new UWineBarRipper();

    test('returns an empty array for a page with no products', () => {
        const html = '<html><body><div class="products-container"></div></body></html>';
        expect(ripper.parseEventsFromHtml(html, 'https://example.com')).toEqual([]);
    });

    test('skips a product with no title attribute rather than erroring', () => {
        const html = `
            <li class="product">
                <h4 class="name" itemprop="name"></h4>
            </li>
        `;
        const results = ripper.parseEventsFromHtml(html, 'https://example.com');
        expect(results).toEqual([]);
    });

    test('skips only-weekly-template products with no leading date', () => {
        const html = `
            <li class="product">
                <h4 class="name" itemprop="name" title="Trivia Night Weekly">Trivia Night Weekly</h4>
            </li>
        `;
        const results = ripper.parseEventsFromHtml(html, 'https://example.com');
        expect(results).toEqual([]);
    });
});
