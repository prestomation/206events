import { describe, expect, test } from 'vitest';
import BookLarderRipper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

// Trimmed, representative capture of the live Evey product page for the Kenji
// López-Alt event (an off-site event at The Triple Door). Preserves the real
// label/value-in-separate-flex-columns markup so the extraction regexes are
// tested against the structure they actually run on.
function loadEveyFixture() {
    return fs.readFileSync(path.join(__dirname, 'sample-evey-kenji.html'), 'utf8');
}

describe('BookLarderRipper - stripHtml', () => {
    const ripper = new BookLarderRipper();

    test('strips HTML tags and collapses whitespace', () => {
        const result = ripper.stripHtml('<p>Hello <strong>world</strong></p>');
        expect(result).toBe('Hello world');
    });

    test('decodes common HTML entities', () => {
        expect(ripper.stripHtml('&amp; &lt; &gt; &quot; &#039;')).toBe('& < > " \'');
    });

    test('converts &nbsp; to space', () => {
        expect(ripper.stripHtml('a&nbsp;b')).toBe('a b');
    });

    test('handles empty string', () => {
        expect(ripper.stripHtml('')).toBe('');
    });
});

describe('BookLarderRipper - parseDateFromText', () => {
    const ripper = new BookLarderRipper();

    test('parses "Month Ordinal at H:MMpm" format', () => {
        const result = ripper.parseDateFromText('Join us on Wednesday, May 13th at 6:30pm to celebrate');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(13);
        expect(result!.hour).toBe(18);
        expect(result!.minute).toBe(30);
        expect(result!.endHour).toBeUndefined();
        expect(result!.timeConfident).toBe(true);
    });

    test('parses "from Xam-Ypm" range format', () => {
        const result = ripper.parseDateFromText('on Saturday, May 9th from 10am-2pm for a special pop-up');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(9);
        expect(result!.hour).toBe(10);
        expect(result!.minute).toBe(0);
        expect(result!.endHour).toBe(14);
        expect(result!.endMinute).toBe(0);
    });

    test('parses "from X-Ypm" range without explicit start am/pm (e.g. "2-5pm" → 14:00–17:00)', () => {
        const result = ripper.parseDateFromText('join us on May 20th from 2-5pm for drinks');
        expect(result).not.toBeNull();
        expect(result!.hour).toBe(14);
        expect(result!.endHour).toBe(17);
    });

    test('keeps 11am when "11-1pm" style would push start past end', () => {
        const result = ripper.parseDateFromText('open June 15th from 11-1pm');
        expect(result).not.toBeNull();
        expect(result!.hour).toBe(11);
        expect(result!.endHour).toBe(13);
    });

    test('parses date with no time and defaults to 6pm', () => {
        const result = ripper.parseDateFromText('on Thursday, May 14th for an author talk');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(14);
        expect(result!.hour).toBe(18);
        expect(result!.minute).toBe(0);
        expect(result!.endHour).toBeUndefined();
        // Date but no time → not confident; caller must consult Evey / flag it.
        expect(result!.timeConfident).toBe(false);
    });

    test('parses "June 1st at 6:30pm"', () => {
        const result = ripper.parseDateFromText('on Monday, June 1st for an author talk, Q&A, and book signing starting at 6:30pm');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(6);
        expect(result!.day).toBe(1);
        expect(result!.hour).toBe(18);
        expect(result!.minute).toBe(30);
    });

    test('returns null when no date is present', () => {
        expect(ripper.parseDateFromText('Join us for our May book club pick. Bring your mug!')).toBeNull();
        expect(ripper.parseDateFromText('')).toBeNull();
    });

    test('parses date without day-of-week prefix', () => {
        const result = ripper.parseDateFromText('(April 25th) is coming up');
        expect(result).not.toBeNull();
        expect(result!.month).toBe(4);
        expect(result!.day).toBe(25);
    });
});

describe('BookLarderRipper - fetchEveyDate', () => {
    const ripper = new BookLarderRipper();

    test('extracts date from Evey hidden input HTML with time range', async () => {
        const html = `
            <p><strong>Event Date:</strong></p>
            <p>May 30, 2026</p>
            <p><strong>Event Time:</strong></p>
            <p>10:00 am - 11:00 am</p>
            <input id="event-date" type="hidden" name="properties[Event-Date]" value="May 30, 2026 10:00 AM">
        `;
        const fetchFn = async () => new Response(html, { status: 200 });
        const result = await ripper.fetchEveyDate('book-club-on-eating', fetchFn as any);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(30);
        expect(result!.hour).toBe(10);
        expect(result!.minute).toBe(0);
        expect(result!.endHour).toBe(11);
        expect(result!.endMinute).toBe(0);
    });

    test('extracts date from Evey with abbreviated month', async () => {
        const html = `<input id="event-date" type="hidden" name="properties[Event-Date]" value="Jun 27, 2026 10:00 AM">`;
        const fetchFn = async () => new Response(html, { status: 200 });
        const result = await ripper.fetchEveyDate('book-club-queer-food', fetchFn as any);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(6);
        expect(result!.day).toBe(27);
        expect(result!.hour).toBe(10);
    });

    test('extracts PM time correctly', async () => {
        const html = `<input id="event-date" type="hidden" name="properties[Event-Date]" value="May 13, 2026 6:30 PM">`;
        const fetchFn = async () => new Response(html, { status: 200 });
        const result = await ripper.fetchEveyDate('author-talk', fetchFn as any);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(5);
        expect(result!.day).toBe(13);
        expect(result!.hour).toBe(18);
        expect(result!.minute).toBe(30);
    });

    test('returns null when Evey page has no event-date input', async () => {
        const html = '<html><body>No event date here</body></html>';
        const fetchFn = async () => new Response(html, { status: 200 });
        const result = await ripper.fetchEveyDate('some-product', fetchFn as any);
        expect(result).toBeNull();
    });

    test('extracts year from Evey date string', async () => {
        const html = `<input id="event-date" type="hidden" name="properties[Event-Date]" value="Jan 15, 2027 7:00 PM">`;
        const fetchFn = async () => new Response(html, { status: 200 });
        const result = await ripper.fetchEveyDate('future-event', fetchFn as any);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(1);
        expect(result!.day).toBe(15);
        expect(result!.year).toBe(2027);
        expect(result!.hour).toBe(19);
    });

    test('returns null on fetch failure', async () => {
        const fetchFn = async () => new Response('', { status: 500 });
        const result = await ripper.fetchEveyDate('some-product', fetchFn as any);
        expect(result).toBeNull();
    });

    test('extracts the off-site venue and end time from the live-structured page', async () => {
        const html = loadEveyFixture();
        const fetchFn = async () => new Response(html, { status: 200 });
        const result = await ripper.fetchEveyDate('kenji', fetchFn as any);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(7);
        expect(result!.day).toBe(6);
        expect(result!.year).toBe(2026);
        expect(result!.hour).toBe(17);           // 5 PM start (hidden input)
        expect(result!.endHour).toBe(22);         // 10 PM end (visible block, across flex columns)
        expect(result!.timeConfident).toBe(true);
        expect(result!.location).toBe('The Triple Door, 216 Union St, Seattle, WA 98101');
    });

    test('leaves location undefined when the page has no Location block', async () => {
        const html = `<input id="event-date" type="hidden" name="properties[Event-Date]" value="May 13, 2026 6:30 PM">`;
        const fetchFn = async () => new Response(html, { status: 200 });
        const result = await ripper.fetchEveyDate('author-talk', fetchFn as any);
        expect(result).not.toBeNull();
        expect(result!.location).toBeUndefined();
        expect(result!.timeConfident).toBe(true);
    });
});

describe('BookLarderRipper - parseProduct', () => {
    const ripper = new BookLarderRipper();

    // parseProduct returns RipperEvent[]: the event first, then any paired
    // UncertaintyError. Helpers to pull each out.
    const eventOf = (results: any[]) => results.find((r: any) => 'date' in r);
    const uncertaintyOf = (results: any[]) => results.find((r: any) => r.type === 'Uncertainty');

    test('parses author talk with time from sample data', async () => {
        const data = loadSampleData();
        // "Author Talk: Saeng Douangdara, The Lao Kitchen" — May 13th at 6:30pm
        const product = data.products.find((p: any) => p.id === 9185262829786);
        expect(product).toBeDefined();

        const event = eventOf(await ripper.parseProduct(product));
        expect(event).toBeDefined();
        expect(event!.summary).toBe('Author Talk: Saeng Douangdara, The Lao Kitchen');
        expect(event!.date.monthValue()).toBe(5);
        expect(event!.date.dayOfMonth()).toBe(13);
        expect(event!.date.hour()).toBe(18);
        expect(event!.date.minute()).toBe(30);
        expect(event!.duration.toMinutes()).toBe(120);
        expect(event!.location).toContain('4252 Fremont Ave N');
        expect(event!.url).toContain('/products/author-talk-saeng-douangdara');
        expect(event!.id).toBe('book-larder-9185262829786');
        // Per-event image from the Shopify product's first image (absolute CDN URL)
        expect(event!.imageUrl).toBe('https://cdn.shopify.com/s/files/1/0558/5957/7004/files/9780593836170_d6f59.jpg?v=1772653281');
    });

    test('confident body time is not flagged uncertain', async () => {
        const data = loadSampleData();
        const product = data.products.find((p: any) => p.id === 9185262829786);
        const results = await ripper.parseProduct(product);
        expect(uncertaintyOf(results)).toBeUndefined();
    });

    test('parses pop-up with time range from sample data', async () => {
        const data = loadSampleData();
        // "Spring Pop-Up" — May 9th from 10am-2pm
        const product = data.products.find((p: any) => p.id === 9232324427994);
        expect(product).toBeDefined();

        const event = eventOf(await ripper.parseProduct(product));
        expect(event).toBeDefined();
        expect(event!.date.monthValue()).toBe(5);
        expect(event!.date.dayOfMonth()).toBe(9);
        expect(event!.date.hour()).toBe(10);
        expect(event!.duration.toMinutes()).toBe(240);
    });

    test('returns ParseError for products with no parseable date (no fetchFn)', async () => {
        const data = loadSampleData();
        // "Book Club: On Eating" — no date in body_html
        const product = data.products.find((p: any) => p.id === 9192727675098);
        expect(product).toBeDefined();

        const results = await ripper.parseProduct(product);
        expect(results).toHaveLength(1);
        expect(results[0]).toHaveProperty('type', 'ParseError');
    });

    test('uses Evey fallback when body has no date and fetchFn is provided', async () => {
        const product = {
            id: 9192727675098,
            title: 'Book Club: On Eating',
            handle: 'book-club-on-eating',
            body_html: '<p>our May pick is On Eating</p>',
            product_type: 'Event',
        };
        const eveyHtml = `<input id="event-date" type="hidden" name="properties[Event-Date]" value="May 30, 2026 10:00 AM">`;
        const fetchFn = async () => new Response(eveyHtml, { status: 200 });

        const event = eventOf(await ripper.parseProduct(product, fetchFn as any));
        // Should succeed with Evey date
        expect(event).toBeDefined();
        expect(event.date.monthValue()).toBe(5);
        expect(event.date.dayOfMonth()).toBe(30);
        expect(event.date.hour()).toBe(10);
    });

    test('consults Evey for the time when the body has a date but no time', async () => {
        // Regression for #855: body carries "July 6" (a date) but no start
        // time, so parseDateFromText returns a non-null result with the default
        // hour. We must still consult Evey — which holds the authoritative
        // 5:00 PM — rather than publishing the 6 PM placeholder.
        const product = {
            id: 42,
            title: 'Off-site Author Talk',
            handle: 'off-site-author-talk',
            body_html: '<p>Join us on <strong>July 6</strong> at The Triple Door!</p>',
            product_type: 'Event',
        };
        const eveyHtml = `
            <p><strong>Event Date:</strong></p></div><div><p>Jul 6, 2026</p>
            <p><strong>Event Time:</strong></p></div><div style="margin-left:10px;"><p>05:00 pm - 10:00 pm</p>
            <input id="event-date" type="hidden" name="properties[Event-Date]" value="Jul 06, 2026 05:00 PM">`;
        const fetchFn = async () => new Response(eveyHtml, { status: 200 });

        const results = await ripper.parseProduct(product, fetchFn as any);
        const event = eventOf(results);
        expect(event).toBeDefined();
        expect(event.date.hour()).toBe(17);      // 5 PM, from Evey — not the 6 PM default
        expect(event.date.minute()).toBe(0);
        expect(event.duration.toMinutes()).toBe(300); // 5–10 PM
        expect(uncertaintyOf(results)).toBeUndefined();
    });

    test('extracts off-site venue and coordinates from Evey', async () => {
        const product = {
            id: 9262822818010,
            title: 'Tasting Notes with Kenji Lopez-Alt + Seattle Chamber Music Society',
            handle: 'tasting-notes-with-kenji-lopez-alt-seattle-chamber-music-society',
            body_html: '<p>returns to Seattle on <strong>July 6</strong> at <strong>The Triple Door</strong></p>',
            product_type: 'Event',
        };
        const fetchFn = async () => new Response(loadEveyFixture(), { status: 200 });

        const event = eventOf(await ripper.parseProduct(product, fetchFn as any));
        expect(event).toBeDefined();
        // Off-site: location is The Triple Door, not the Fremont store.
        expect(event.location).toBe('The Triple Door, 216 Union St, Seattle, WA 98101');
        expect(event.location).not.toContain('Fremont');
        // Coordinates resolve to The Triple Door (downtown), not Book Larder.
        expect(event.lat).toBeCloseTo(47.6082, 3);
        expect(event.lng).toBeCloseTo(-122.3387, 3);
        expect(event.osmId).toBe(2404249354);
        expect(event.geocodeSource).toBe('ripper');
        // Authoritative time from Evey.
        expect(event.date.hour()).toBe(17);
        expect(event.duration.toMinutes()).toBe(300);
    });

    test('emits a startTime UncertaintyError when no time is found anywhere', async () => {
        // Body has a date but no time, and Evey fails to supply one.
        const product = {
            id: 77,
            title: 'Timeless Event',
            handle: 'timeless-event',
            body_html: '<p>Join us on <strong>June 15th</strong> for a talk.</p>',
            product_type: 'Event',
        };
        const fetchFn = async () => new Response('<html>no event date here</html>', { status: 200 });

        const results = await ripper.parseProduct(product, fetchFn as any);
        const event = eventOf(results);
        const uncertainty = uncertaintyOf(results);
        // Still published (with the placeholder hour) so it appears on the calendar.
        expect(event).toBeDefined();
        expect(event.date.hour()).toBe(18);
        // ...but paired with an UncertaintyError instead of a silent default.
        expect(uncertainty).toBeDefined();
        expect(uncertainty.unknownFields).toContain('startTime');
        expect(uncertainty.source).toBe('book-larder');
        expect(uncertainty.event).toBe(event);
        expect(uncertainty.partialFingerprint).toBeTruthy();
    });

    test('parses past events (past-event filtering happens in rip(), not parseProduct)', async () => {
        const pastProduct = {
            id: 99999,
            title: 'Past Author Talk',
            handle: 'past-author-talk',
            body_html: '<p>Join us on <strong>January 2nd</strong> at 6:30pm.</p>',
            product_type: 'Event',
        };
        // parseProduct returns the event regardless of date; rip() filters past events
        const event = eventOf(await ripper.parseProduct(pastProduct));
        expect(event).toBeDefined();
    });

    test('uses correct URL format from handle', async () => {
        const data = loadSampleData();
        const product = data.products.find((p: any) => p.id === 9232405659866);
        // "Author Talk: Claire Wadsworth and Nikki Hill, La Copine" — June 1st
        const event = eventOf(await ripper.parseProduct(product));
        expect(event).toBeDefined();
        expect(event!.url).toBe(`https://booklarder.com/products/${product.handle}`);
    });

    test('extracts paid cost from Shopify variant price', async () => {
        const data = loadSampleData();
        // "Author Talk: Saeng Douangdara, The Lao Kitchen" — variant price $39.00
        const product = data.products.find((p: any) => p.id === 9185262829786);
        expect(product).toBeDefined();

        const event = eventOf(await ripper.parseProduct(product));
        expect(event).toBeDefined();
        expect(event.cost).toEqual({ min: 39 });
    });

    test('extracts free cost when variant price is 0.00', async () => {
        const data = loadSampleData();
        // "Seattle Independent Bookstore Day 2026!" — variant price $0.00
        const product = data.products.find((p: any) => p.id === 9205656027354);
        expect(product).toBeDefined();

        const event = eventOf(await ripper.parseProduct(product));
        expect(event).toBeDefined();
        expect(event.cost).toEqual({ min: 0 });
    });

    test('cost is undefined when no variants', async () => {
        const product = {
            id: 99998,
            title: 'No Variants Event',
            handle: 'no-variants-event',
            body_html: '<p>Join us on <strong>March 5th</strong> at 6pm.</p>',
            product_type: 'Event',
        };
        const event = eventOf(await ripper.parseProduct(product));
        expect(event).toBeDefined();
        expect(event.cost).toBeUndefined();
    });
});