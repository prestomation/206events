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

        // Cherry Blossom Festival ("Spring 2027") has no resolvable day and
        // must surface as a ParseError, never be silently dropped.
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
            type: 'ParseError',
            context: 'U District Cherry Blossom Festival',
        });
        expect((errors[0] as any).reason).toContain('Spring 2027');

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
