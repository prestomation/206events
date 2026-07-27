import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parse } from 'node-html-parser';
import { ZonedDateTime, ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import UDistrictPartnershipRipper from './ripper.js';

describe('UDistrictPartnershipRipper', () => {
    const timezone = ZoneId.of('America/Los_Angeles');
    const testDate = ZonedDateTime.of(2026, 7, 26, 12, 0, 0, 0, timezone);

    it('parses the signature events from the sample events page', async () => {
        const ripper = new UDistrictPartnershipRipper();
        const htmlContent = readFileSync('sources/u-district-partnership/sample-data.html', 'utf-8');
        const html = parse(htmlContent);

        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];
        const errors = events.filter(e => 'type' in e && e.type !== 'Uncertainty');
        const uncertainties = events.filter(e => 'type' in e && (e as any).type === 'Uncertainty');

        // Boba Fest, Chow Down, and Street Fair have parseable dates.
        expect(calEvents.map(e => e.summary).sort()).toEqual([
            'Seattle Boba Fest',
            'U District Chow Down & Street Party',
            'U District Street Fair',
        ]);

        // Cherry Blossom Festival ("Spring 2027") has no resolvable day —
        // a season, not a month, so there's genuinely no date on the page
        // yet. Skipped silently (no event, no error) rather than guessed or
        // flagged, and never appears as an event either.
        expect(errors).toHaveLength(0);
        expect(calEvents.map(e => e.summary)).not.toContain('U District Cherry Blossom Festival');

        // The page never states a start time, so every emitted event pairs
        // with an Uncertainty error for startTime/duration.
        expect(uncertainties).toHaveLength(calEvents.length);
        for (const u of uncertainties) {
            expect(u.unknownFields).toEqual(['startTime', 'duration']);
        }

        // Every event gets a stable id and does not silently skip fields.
        for (const e of calEvents) {
            expect(e.id).toBeTruthy();
            expect(e.imageUrl).toMatch(/^https:\/\/udistrictseattle\.com\//);
            expect(e.url).toMatch(/^https:\/\/udistrictseattle\.com\//);
        }
    });

    it('never selects cards from the venue-directory section', async () => {
        const ripper = new UDistrictPartnershipRipper();
        const htmlContent = readFileSync('sources/u-district-partnership/sample-data.html', 'utf-8');
        const html = parse(htmlContent);

        const events = await ripper.parseEvents(html, testDate, {});
        const summaries = events
            .filter(e => 'date' in e)
            .map(e => (e as any).summary);

        // "U District Art Walk" is a card in the second, dateless
        // "Other Events & Performance Venues" section — it must never be
        // parsed as a dated event by this ripper (it has its own recurring
        // source: sources/recurring/university-district-artwalk.yaml).
        expect(summaries).not.toContain('U District Art Walk');
    });

    it('expands a two-day "Month D & Month D, Year" range into a multi-day duration', async () => {
        const ripper = new UDistrictPartnershipRipper();
        const sampleHtml = `
            <section class="features view-grid">
                <div class="feature column">
                    <div class="feature-text content">
                        <h3>U District Street Fair</h3>
                        <div class="content">
                            <p><strong>Saturday May 15 &amp; Sunday, May 16, 2027</strong></p>
                            <p>Two-day street fair.</p>
                            <p><a class="button" href="https://udistrictseattle.com/streetfair">Learn More</a></p>
                        </div>
                    </div>
                </div>
            </section>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e) as any[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].id).toBe('u-district-street-fair-2027-05-15');
        // Noon day 1 through the placeholder length on day 2 (30h), not a
        // full extra day bleeding past the announced May 16 end date.
        expect(calEvents[0].duration.toHours()).toBe(30);
        const end = calEvents[0].date.plus(calEvents[0].duration);
        expect(end.toLocalDate().toString()).toBe('2027-05-16');
    });

    it('reports a ParseError instead of guessing when a card has no date at all', async () => {
        const ripper = new UDistrictPartnershipRipper();
        const sampleHtml = `
            <section class="features view-grid">
                <div class="feature column">
                    <div class="feature-text content">
                        <h3>Mystery Event</h3>
                        <div class="content">
                            <p>Coming eventually.</p>
                        </div>
                    </div>
                </div>
            </section>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'ParseError', context: 'Mystery Event' });
    });

    it('skips a card with a vague season/year date silently (no event, no error)', async () => {
        const ripper = new UDistrictPartnershipRipper();
        const sampleHtml = `
            <section class="features view-grid">
                <div class="feature column">
                    <div class="feature-text content">
                        <h3>U District Cherry Blossom Festival</h3>
                        <div class="content">
                            <p><strong>Spring 2027</strong></p>
                            <p>Cherry-inspired bites and drinks.</p>
                        </div>
                    </div>
                </div>
            </section>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        // No month name in "Spring 2027" — the org hasn't set a date yet,
        // not a parsing gap. Nothing emitted at all: no event, no error.
        expect(events).toHaveLength(0);
    });

    it('reports a ParseError when a month name is present but does not match any known date pattern', async () => {
        const ripper = new UDistrictPartnershipRipper();
        const sampleHtml = `
            <section class="features view-grid">
                <div class="feature column">
                    <div class="feature-text content">
                        <h3>Mystery Festival</h3>
                        <div class="content">
                            <p><strong>Early July 2027</strong></p>
                            <p>Date format not yet handled.</p>
                        </div>
                    </div>
                </div>
            </section>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        // "July" is a real month name — this is a genuine gap in
        // parseDateRange to fix, not an unannounced date, so it must
        // surface as a ParseError rather than being silently skipped.
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'ParseError', context: 'Mystery Festival' });
        expect((events[0] as any).reason).toContain('Early July 2027');
    });

    it('reports a ParseError for an abbreviated month the date parser does not handle, rather than silently skipping it', async () => {
        // Regression test: containsMonthName must recognize abbreviations
        // ("Aug.", "Sept") even though parseDateRange's own regexes only
        // match full month names — otherwise an abbreviated date the parser
        // can't handle would be indistinguishable from a genuinely
        // unannounced "Spring 2027"-style placeholder and get silently
        // skipped instead of surfaced as a gap to fix.
        const ripper = new UDistrictPartnershipRipper();
        const sampleHtml = `
            <section class="features view-grid">
                <div class="feature column">
                    <div class="feature-text content">
                        <h3>Abbreviated Date Festival</h3>
                        <div class="content">
                            <p><strong>Aug. 1, 2027</strong></p>
                            <p>Abbreviated month format not yet handled.</p>
                        </div>
                    </div>
                </div>
            </section>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'ParseError', context: 'Abbreviated Date Festival' });
        expect((events[0] as any).reason).toContain('Aug. 1, 2027');
    });

    it('reports a ParseError for a card with no title', async () => {
        const ripper = new UDistrictPartnershipRipper();
        const sampleHtml = `
            <section class="features view-grid">
                <div class="feature column">
                    <div class="feature-text content">
                        <div class="content">
                            <p><strong>August 1, 2026</strong></p>
                        </div>
                    </div>
                </div>
            </section>
        `;
        const html = parse(sampleHtml);
        const events = await ripper.parseEvents(html, testDate, {});

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'ParseError', reason: expect.stringContaining('no title') });
    });

    it('never emits the same event twice for duplicate cards', async () => {
        const ripper = new UDistrictPartnershipRipper();
        const card = `
                <div class="feature column">
                    <div class="feature-text content">
                        <h3>Seattle Boba Fest</h3>
                        <div class="content">
                            <p><strong>August 1, 2026</strong></p>
                            <p>Bubble tea festival.</p>
                        </div>
                    </div>
                </div>`;
        const html = parse(`<section class="features view-grid">${card}${card}</section>`);
        const events = await ripper.parseEvents(html, testDate, {});
        const calEvents = events.filter(e => 'date' in e);

        expect(calEvents).toHaveLength(1);
    });
});
