import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { parse } from 'node-html-parser';
import { ZonedDateTime } from '@js-joda/core';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import Events12Ripper from './ripper.js';
import { Ripper } from '../../lib/config/schema.js';

describe('Events12Ripper', () => {
    const timezone = ZoneId.of('America/Los_Angeles');
    const testDate = ZonedDateTime.of(2026, 2, 21, 12, 0, 0, 0, timezone);

    it('should parse events from sample HTML data', { timeout: 120000 }, async () => {
        const ripper = new Events12Ripper();
        const htmlContent = readFileSync('sources/events12/sample-data.html', 'utf-8');
        // Exercise the actual preprocessHtml -> parse -> parseEvents flow
        const processedHtml = (ripper as any).preprocessHtml(htmlContent);
        const html = parse(processedHtml);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);

        // With date-range expansion, the rip yields several hundred events.
        expect(calEvents.length).toBeGreaterThan(200);
    });

    it('maps a per-event flyer image to an absolute imageUrl', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="113825" class="qc q10 q22 qq d1">
                <h3>Cabaret set in 1890s Hungary</h3>
                <p class="date">February 22, 2026 <span class="nobreak">(5 p.m.)</span>
                <p class="miles">Downtown (0.3 miles S)
                <img src="/img/113825b.jpg" alt="" width="180" height="180" srcset="/img/113825bz.jpg 2x">
                <p class="event">
                <a href="https://example.com/bohemia">Bohemia</a> is a dream cabaret.
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(1);
        expect(calEvents[0].imageUrl).toBe('https://www.events12.com/img/113825b.jpg');
    });

    it('leaves imageUrl undefined when the article has no per-event image', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="100003" class="qc q2 qq d1">
                <h3>Wedding show</h3>
                <p class="date icon">February 22, 2026 <span class="nobreak">(10:30 a.m. to 4 p.m.)</span>
                <p class="miles">Downtown (0.2 miles E)
                <p class="event">
                Live and breathe weddings at the <a href="https://example.com">Seattle Wedding Show</a>.
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(1);
        expect(calEvents[0].imageUrl).toBeUndefined();
    });

    it('ignores an image whose filename does not match the article id', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="999999" class="qc q2 qq d1">
                <h3>Event with a banner only</h3>
                <p class="date">February 22, 2026 <span class="nobreak">(5 p.m.)</span>
                <p class="miles">Downtown (0.2 miles E)
                <img class="margin0 wide100" src="/img/100000.jpg" alt="concerts">
                <p class="event">Some event.</p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(1);
        expect(calEvents[0].imageUrl).toBeUndefined();
    });

    it('should parse event with valid date and title', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="test123">
                <h3>Family Christmas event &nbsp;<span class="free">FREE</span></h3>
                <p class="date icon">December 1, 2025 <span class="nobreak">(4 to 7 p.m.)</span>
                <p class="miles">Downtown (0.1 miles N)
                <p class="event">
                Vote for your favorite of 12 designer-decorated Christmas trees at <a href="https://example.com">Family Preview</a>, with Santa, festive entertainment, and free arts & crafts for kids in the ballroom of The Westin Seattle, 1900 5th Ave. in Seattle.
                <a class="b1" href="https://www.google.com/maps/search/?api=1&query=Test%20Location" rel="nofollow">map</a>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);

        expect(calEvents.length).toBe(1);
        expect(calEvents[0]).toHaveProperty('summary', 'Family Christmas event');
        expect(calEvents[0]).toHaveProperty('date');
        expect(calEvents[0]).toHaveProperty('location');
        expect((calEvents[0] as any).description).toContain('Downtown (0.1 miles N)');

        // 4 to 7 p.m. = 16:00 start, 3h duration
        const event = calEvents[0] as any;
        expect(event.date.hour()).toBe(16);
        expect(event.duration.toMinutes()).toBe(180);

        // Explicit time present → no UncertaintyError emitted.
        const uncertainty = events.filter(e => (e as any).type === 'Uncertainty');
        expect(uncertainty.length).toBe(0);
    });

    it('expands date ranges into one event per day', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="range1">
                <h3>Multi-day Festival</h3>
                <p class="date">February 2 - 7, 2026 <span class="nobreak">(10 a.m. to 8 p.m.)</span></p>
                <p class="miles">Shoreline (11 miles N)</p>
                <p class="event">A multi-day event <a href="https://example.com/festival">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        // 6 days (Feb 2-7 inclusive) × 1 time slot
        expect(calEvents.length).toBe(6);
        expect(calEvents[0].date.dayOfMonth()).toBe(2);
        expect(calEvents[5].date.dayOfMonth()).toBe(7);
        // Each occurrence carries the parsed time
        for (const e of calEvents) {
            expect(e.date.hour()).toBe(10);
            expect(e.duration.toMinutes()).toBe(600);
        }
    });

    it('handles cross-month ranges (same year)', async () => {
        const ripper = new Events12Ripper();
        // Real format from sample-data.html — "January 1 - Dec. 31, 2026 (4:30 to 10 p.m.)"
        const sampleHtml = `
            <article id="cm1">
                <h3>Year-round Event</h3>
                <p class="date">January 1 - Feb. 5, 2026 <span class="nobreak">(4:30 to 10 p.m.)</span></p>
                <p class="event">Spans Jan into Feb <a href="https://example.com/yr">details</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        // Jan 1 - Feb 5 = 36 days
        expect(calEvents.length).toBe(36);
        expect(calEvents[0].date.monthValue()).toBe(1);
        expect(calEvents[0].date.dayOfMonth()).toBe(1);
        expect(calEvents[calEvents.length - 1].date.monthValue()).toBe(2);
        expect(calEvents[calEvents.length - 1].date.dayOfMonth()).toBe(5);
    });

    it('emits an UncertaintyError when no time is provided', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="untimed1">
                <h3>Time-less Event</h3>
                <p class="date">February 14, 2026</p>
                <p class="event">No time provided <a href="https://example.com/untimed">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        const uncertainty = events.filter((e: any) => e.type === 'Uncertainty') as any[];

        // Still emitted with a placeholder so the calendar isn't empty
        expect(calEvents.length).toBe(1);
        expect(calEvents[0].date.hour()).toBe(12);
        expect(calEvents[0].date.minute()).toBe(0);

        // Paired UncertaintyError carrying the event
        expect(uncertainty.length).toBe(1);
        expect(uncertainty[0].source).toBe('events12');
        expect(uncertainty[0].unknownFields).toContain('startTime');
        expect(uncertainty[0].unknownFields).toContain('duration');
        expect(uncertainty[0].unknownFields).toContain('cost');
        expect(uncertainty[0].event.id).toBe(calEvents[0].id);
        expect(uncertainty[0].event.summary).toBe('Time-less Event');
        expect(uncertainty[0].partialFingerprint).toBeTruthy();
    });

    it('untimed date ranges emit one UncertaintyError per day', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="untimed-range">
                <h3>Untimed Run</h3>
                <p class="date">February 6 - 7, 2026</p>
                <p class="event">No time given <a href="https://example.com/r">details</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        const uncertainty = events.filter((e: any) => e.type === 'Uncertainty') as any[];

        expect(calEvents.length).toBe(2);
        expect(uncertainty.length).toBe(2);
        // Per-day fingerprints share the same value because the source
        // listing produced the same parsed data for both days.
        expect(uncertainty[0].partialFingerprint).toBe(uncertainty[1].partialFingerprint);
    });

    it('parses (5 & 8 p.m.) as two showings per day', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="multi-time">
                <h3>Two Showings</h3>
                <p class="date">February 12 - 15, 2026 <span class="nobreak">(5 & 8 p.m.)</span></p>
                <p class="event">Daily showings <a href="https://example.com/ms">details</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        const uncertainty = events.filter((e: any) => e.type === 'Uncertainty');

        // 4 days × 2 slots = 8 events. No time uncertainty (times are known),
        // but cost uncertainty is emitted for each occurrence (no cost indicator).
        expect(calEvents.length).toBe(8);
        expect(uncertainty.length).toBe(8);
        for (const u of uncertainty as any[]) {
            expect(u.unknownFields).not.toContain('startTime');
            expect(u.unknownFields).not.toContain('duration');
            expect(u.unknownFields).toContain('cost');
        }

        // First day: 5pm and 8pm slots produce distinct IDs
        const feb12 = calEvents.filter((e: any) => e.date.dayOfMonth() === 12);
        expect(feb12.length).toBe(2);
        const ids = feb12.map((e: any) => e.id).sort();
        expect(ids[0]).not.toBe(ids[1]);
        expect(feb12.find((e: any) => e.date.hour() === 17)).toBeTruthy();
        expect(feb12.find((e: any) => e.date.hour() === 20)).toBeTruthy();
    });

    it('parses ampersand date format as two separate events', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="118800">
                <h3>New musicians</h3>
                <p class="date">February 21 & 28, 2026 <span class="nobreak">(8 to 10 p.m.)</span></p>
                <p class="miles">University District (5 miles NE)</p>
                <p class="event">Live music <a href="https://example.com/music">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(2);

        expect(calEvents[0].summary).toBe('New musicians');
        expect(calEvents[0].date.dayOfMonth()).toBe(21);
        expect(calEvents[0].date.hour()).toBe(20);
        expect(calEvents[0].duration.toMinutes()).toBe(120);

        expect(calEvents[1].date.dayOfMonth()).toBe(28);
        expect(calEvents[1].date.hour()).toBe(20);
    });

    it('handles noon time format', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="noon1">
                <h3>Noon Event</h3>
                <p class="date">February 15, 2026 (noon)</p>
                <p class="miles">Downtown</p>
                <p class="event">Event at noon <a href="https://example.com/noon">details</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(1);
        expect(calEvents[0].date.hour()).toBe(12);
        expect(calEvents[0].date.minute()).toBe(0);

        // (noon) is an explicit time — no time uncertainty, but cost uncertainty
        // is emitted because the article has no free/ticket indicator.
        const uncertainty = events.filter((e: any) => e.type === 'Uncertainty') as any[];
        expect(uncertainty.length).toBe(1);
        expect(uncertainty[0].unknownFields).not.toContain('startTime');
        expect(uncertainty[0].unknownFields).not.toContain('duration');
        expect(uncertainty[0].unknownFields).toContain('cost');
    });

    it('parses various single-day time formats', async () => {
        const ripper = new Events12Ripper();
        const cases = [
            { time: '(7 p.m.)', expectedHour: 19, expectedMin: 0, expectedDuration: 120 },
            { time: '(9 a.m. to 2 p.m.)', expectedHour: 9, expectedMin: 0, expectedDuration: 300 },
            { time: '(9:30 a.m. to 12 p.m.)', expectedHour: 9, expectedMin: 30, expectedDuration: 150 },
            { time: '(10 a.m.)', expectedHour: 10, expectedMin: 0, expectedDuration: 120 },
        ];

        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            const sampleHtml = `
                <article id="time${i}">
                    <h3>Event ${i}</h3>
                    <p class="date">January 15, 2026 ${c.time}</p>
                    <p class="event">Desc <a href="https://example.com/${i}">link</a></p>
                </article>
            `;
            const html = parse(sampleHtml);
            const events = await ripper.parseEvents(html, testDate, {});
            const calEvents = events.filter(e => 'date' in e) as any[];
            expect(calEvents.length).toBe(1);
            expect(calEvents[0].date.hour()).toBe(c.expectedHour);
            expect(calEvents[0].date.minute()).toBe(c.expectedMin);
            expect(calEvents[0].duration.toMinutes()).toBe(c.expectedDuration);
        }
    });

    it('reports a ParseError for unparseable dates', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="bad1">
                <h3>Bad Date Event</h3>
                <p class="date">Unparseable date string</p>
                <p class="event">Desc <a href="https://example.com/bad">link</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const parseErrors = events.filter((e: any) => e.type === 'ParseError');
        expect(parseErrors.length).toBe(1);
    });

    it('should extract event URLs correctly', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="test456">
                <h3>Test Event</h3>
                <p class="date">December 15, 2025 (7 p.m.)</p>
                <p class="miles">Downtown (0.1 miles N)</p>
                <p class="event">Description with <a href="https://example.com/event">event link</a> and <a href="https://www.google.com/maps">map link</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents.length).toBe(1);
        expect(calEvents[0]).toHaveProperty('url', 'https://example.com/event');
    });

    it('deduplicates identical (title, date, slot) tuples', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="dup1">
                <h3>Same Event</h3>
                <p class="date">February 14, 2026 (8 p.m.)</p>
                <p class="event">First instance <a href="https://example.com/1">link</a></p>
            </article>
            <article id="dup2">
                <h3>Same Event</h3>
                <p class="date">February 14, 2026 (8 p.m.)</p>
                <p class="event">Second instance <a href="https://example.com/2">link</a></p>
            </article>
        `;

        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);
        expect(calEvents.length).toBe(1);
    });

    it('marks free events via <span class="free"> as cost: { min: 0 }', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="freetest">
                <h3>Night market &nbsp;<span class="free">FREE</span></h3>
                <p class="date">February 22, 2026 (6 p.m.)</p>
                <p class="miles">Columbia City (5.5 miles SE)</p>
                <p class="event">Monthly night market <a href="https://example.com/market">details</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        expect(calEvents.length).toBe(1);
        expect(calEvents[0].summary).toBe('Night market');
        expect(calEvents[0].cost).toEqual({ min: 0 });
    });

    it('marks ticketed events via <a class="b2"> as cost: { paid: true }', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="tickettest">
                <h3>Concert</h3>
                <p class="date">February 22, 2026 (8 p.m.)</p>
                <p class="miles">Downtown (0.5 miles S)</p>
                <p class="event">Amazing concert <a href="https://example.com/concert">details</a></p>
                <a class="b2" href="https://tickets.example.com/123" rel="nofollow">tickets</a>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        expect(calEvents.length).toBe(1);
        expect(calEvents[0].cost).toEqual({ paid: true });
    });

    it('leaves cost undefined when no free/ticket indicator is present', async () => {
        const ripper = new Events12Ripper();
        const sampleHtml = `
            <article id="nopricetest">
                <h3>Soup weekend</h3>
                <p class="date">February 22, 2026</p>
                <p class="miles">Fremont (3 miles N)</p>
                <p class="event">Walk to restaurants <a href="https://example.com/soup">details</a></p>
            </article>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        expect(calEvents.length).toBeGreaterThan(0);
        for (const e of calEvents) {
            expect(e.cost).toBeUndefined();
        }
    });

    describe('parseScheduleTable via parseEvents (season-schedule tables)', () => {
        // node-html-parser silently drops every <tr> in this markup and
        // mis-splits the last <td> of a row when it parses the *whole*
        // document tree, but preprocessHtml + the per-article regex extraction
        // (which the ripper always uses in production) sidesteps that — the
        // table is parsed via regex against the raw article text, not the
        // DOM. Route these tests through preprocessHtml like the "should
        // parse events from sample HTML data" test above so they exercise
        // the same path production uses; parsing sampleHtml directly with
        // parse() would silently fall back to the broken DOM-based path.
        function parseViaPreprocess(sampleHtml: string) {
            const ripper: any = new Events12Ripper();
            const processedHtml = ripper.preprocessHtml(sampleHtml);
            const html = parse(processedHtml);
            return ripper.parseEvents(html, testDate, {}) as Promise<any[]>;
        }

        it('parses a 4-column sports schedule table into one home game per row, skipping away games', async () => {
            const sampleHtml = `
                <article id="118511" class="qc q12">
                    <h3>Baseball</h3>
                    <p class="date">August 6 - Sept. 27, 2026
                    <p class="miles">SoDo (1.6 miles S)
                    <p class="event">
                    Watch the Mariners play at T-Mobile Park.
                    <table class="table1">
                    <tr>
                       <td>Date
                       <td colspan="2"><span class="zt"></span>
                       <td><span class="zg"></span><a class="zr" onclick="tables(7)"></a>

                    <tr><td>Aug. 6<td>1:10 PM<td><td>Detroit Tigers
                    <tr class="za"><td>Aug. 13<td>10:35 AM<td>@<td>New York Yankees
                    <tr><td>Aug. 21<td>7:10 PM<td><td>Chicago Cubs

                    <tr>
                       <td colspan="3"><a class="zd" onclick="tables(8)"></a>
                       <td><a class="zy" onclick="tables(9)"></a>
                    </table>
                    <p>
                    <a class="b1" href="https://www.google.com/maps/search/?api=1&query=T-Mobile%20Park">map</a>
                    <a class="b2" href="https://stubhub.example.com/x" rel="sponsored">tickets</a>
                </article>
            `;
            const events = await parseViaPreprocess(sampleHtml);
            const calEvents = events.filter(e => 'date' in e) as any[];
            const errors = events.filter(e => 'type' in e);

            // 3 home games; the away game against the Yankees is dropped.
            expect(calEvents.length).toBe(2);
            expect(errors.some((e: any) => e.type === 'ParseError')).toBe(false);

            const tigers = calEvents.find(e => e.summary === 'Baseball vs. Detroit Tigers')!;
            expect(tigers).toBeDefined();
            expect(tigers.date.toLocalDate().toString()).toBe('2026-08-06');
            expect(tigers.date.hour()).toBe(13);
            expect(tigers.date.minute()).toBe(10);
            expect(tigers.id).toBe('baseball-vs-detroit-tigers-2026-08-06');

            const cubs = calEvents.find(e => e.summary === 'Baseball vs. Chicago Cubs')!;
            expect(cubs.date.toLocalDate().toString()).toBe('2026-08-21');
            expect(cubs.date.hour()).toBe(19);

            expect(calEvents.some(e => (e.summary as string).includes('Yankees'))).toBe(false);

            // Known real times — no startTime/duration Uncertainty for these.
            const uncertainty = errors.filter((e: any) => e.type === 'Uncertainty');
            expect(uncertainty.some((e: any) => e.unknownFields?.includes('startTime'))).toBe(false);
        });

        it('parses a 3-column concert schedule table (no home/away marker)', async () => {
            const sampleHtml = `
                <article id="103560" class="qc q0">
                    <h3>Zoo concerts</h3>
                    <p class="date">August 6 - Oct. 9, 2026
                    <p class="miles">Phinney Ridge (4.1 miles N)
                    <p class="event">
                    ZooTunes at Woodland Park Zoo.
                    <table class="table1">
                    <tr><td>Date<td>Time<td>Artist<a class="zr" onclick="tables(7)"></a>
                    <tr><td>Aug. 6<td>6:00 PM<td>Suki Waterhouse
                    <tr><td>Aug. 9<td>5:45 PM<td>Mountain Goats
                    </table>
                    <p>
                    <a class="b1" href="https://www.google.com/maps/search/?api=1&query=Woodland%20Park%20Zoo">map</a>
                </article>
            `;
            const events = await parseViaPreprocess(sampleHtml);
            const calEvents = events.filter(e => 'date' in e) as any[];
            expect(calEvents.length).toBe(2);

            const suki = calEvents.find(e => e.summary === 'Zoo concerts: Suki Waterhouse')!;
            expect(suki).toBeDefined();
            expect(suki.date.toLocalDate().toString()).toBe('2026-08-06');
            expect(suki.date.hour()).toBe(18);

            const goats = calEvents.find(e => e.summary === 'Zoo concerts: Mountain Goats')!;
            expect(goats.date.toLocalDate().toString()).toBe('2026-08-09');
        });

        it('expands a same-month multi-day row (e.g. "Aug. 11 - 12") into one event per day', async () => {
            const sampleHtml = `
                <article id="118511b" class="qc q12">
                    <h3>Baseball</h3>
                    <p class="date">August 6 - Sept. 27, 2026
                    <p class="miles">SoDo (1.6 miles S)
                    <p class="event">Watch the Mariners.
                    <table class="table1">
                    <tr><td>Date<td colspan="2"><span></span><td><span></span>
                    <tr><td>Aug. 24 - 25<td>6:40 PM<td><td>Philadelphia Phillies
                    </table>
                </article>
            `;
            const events = await parseViaPreprocess(sampleHtml);
            const calEvents = events.filter(e => 'date' in e) as any[];
            expect(calEvents.length).toBe(2);
            expect(calEvents.map(e => e.date.toLocalDate().toString()).sort()).toEqual(['2026-08-24', '2026-08-25']);
            for (const e of calEvents) {
                expect(e.summary).toBe('Baseball vs. Philadelphia Phillies');
                expect(e.date.hour()).toBe(18);
                expect(e.date.minute()).toBe(40);
            }
        });

        it('rolls the year over when a row crosses from December into January', async () => {
            const sampleHtml = `
                <article id="118515" class="qc q12">
                    <h3>Football</h3>
                    <p class="date">August 15 - Dec. 25, 2026
                    <p class="miles">Pioneer Square (1.3 miles S)
                    <p class="event">Watch the Seahawks.
                    <table class="table1">
                    <tr><td>Date<td colspan="2"><span></span><td><span></span>
                    <tr><td>Dec. 25<td>5:15 PM<td><td>Los Angeles Rams
                    <tr class="za2"><td>Jan. 3<td>10:00 AM<td>@<td>Carolina Panthers
                    <tr class="za2"><td>TBD<td>TBD<td>@<td>Los Angeles Rams
                    </table>
                </article>
            `;
            const events = await parseViaPreprocess(sampleHtml);
            const calEvents = events.filter(e => 'date' in e) as any[];

            // Jan. 3 is an away game (dropped) and TBD has no confirmed date
            // (dropped) — only the Dec. 25 home game survives, but critically
            // it must not have been miscounted into the next year.
            expect(calEvents.length).toBe(1);
            expect(calEvents[0].date.toLocalDate().toString()).toBe('2026-12-25');
        });

        it('emits nothing (and no ParseError) when every remaining row is an away game', async () => {
            const sampleHtml = `
                <article id="allaway" class="qc q12">
                    <h3>Baseball</h3>
                    <p class="date">August 6 - Sept. 27, 2026
                    <p class="miles">SoDo (1.6 miles S)
                    <p class="event">Watch the Mariners.
                    <table class="table1">
                    <tr><td>Date<td colspan="2"><span></span><td><span></span>
                    <tr class="za"><td>Aug. 13<td>10:35 AM<td>@<td>New York Yankees
                    <tr class="za"><td>Aug. 14<td>5:10 PM<td>@<td>Houston Astros
                    </table>
                </article>
            `;
            const events = await parseViaPreprocess(sampleHtml);
            expect(events.filter(e => 'date' in e).length).toBe(0);
            expect(events.filter((e: any) => e.type === 'ParseError').length).toBe(0);
        });

        it('leaves the multi-venue "Location / Next concert" table1 shape to the generic date-range path', async () => {
            // Same table1 class, but the header's first column is "Location"
            // (one row per *different* venue's next show), not "Date" — must
            // not be mistaken for a single-venue schedule.
            const sampleHtml = `
                <article id="120202" class="qm q7">
                    <h3>Concerts</h3>
                    <p class="date">August 6 - Sept. 7, 2026
                    <p class="miles">
                    <p class="event">
                    <table class="table1">
                    <tr class="zh"><td>Location<td colspan="2">Next concert
                    <tr class="zh"><td><a href="https://example.com">Ballard Locks</a><td>Aug. 8<td>2:00 PM
                    <tr class="zh"><td><a href="https://example.com">Columbia City</a><td>Aug. 9<td>4:00 PM
                    </table>
                </article>
            `;
            const events = await parseViaPreprocess(sampleHtml);
            const calEvents = events.filter(e => 'date' in e) as any[];
            // Falls back to expanding the header's "August 6 - Sept. 7, 2026"
            // range — unchanged pre-existing behavior for this shape.
            expect(calEvents.length).toBeGreaterThan(1);
            expect(calEvents.every(e => e.summary === 'Concerts')).toBe(true);
        });
    });

    describe('rip() drops stale occurrences', () => {
        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        // events12.com's own "current month" page has been observed serving
        // weeks-stale content instead of rolling forward as it claims to.
        // parseEvents() has no "now" concept (its other tests deliberately use
        // dates before the fixed testDate above), so this filtering lives in
        // rip() against the real wall-clock instant. Year 2020/2099 keep this
        // test from aging out.
        it('filters past occurrences (and their paired Uncertainty errors) but keeps future ones', async () => {
            const html = `
                <article id="stale1">
                    <h3>Stale Listing</h3>
                    <p class="date">July 1 - 6, 2020</p>
                    <p class="event">Long past <a href="https://example.com/stale">details</a></p>
                </article>
                <article id="fresh1">
                    <h3>Fresh Listing</h3>
                    <p class="date">July 1 - 6, 2099 <span class="nobreak">(7 p.m.)</span></p>
                    <p class="event">Still upcoming <a href="https://example.com/fresh">details</a></p>
                </article>
            `;
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: () => Promise.resolve(html),
            }));

            const ripper: Ripper = {
                config: {
                    name: 'events12',
                    url: 'https://www.events12.com/seattle/',
                    proxy: false,
                    calendars: [
                        { name: 'seattle-events', friendlyname: 'Events12 Seattle', timezone },
                    ],
                } as any,
            } as Ripper;

            const calendars = await new Events12Ripper().rip(ripper);
            const cal = calendars.find(c => c.name === 'seattle-events')!;

            expect(cal.events.some(e => e.summary === 'Stale Listing')).toBe(false);
            expect(cal.events.some(e => e.summary === 'Fresh Listing')).toBe(true);

            // The stale listing's paired cost-Uncertainty error must not survive
            // either — otherwise it churns the uncertainty queue for an event
            // nobody will ever see.
            const uncertainty = cal.errors.filter((e: any) => e.type === 'Uncertainty');
            expect(uncertainty.some((e: any) => e.event.summary === 'Stale Listing')).toBe(false);
        });
    });
});
