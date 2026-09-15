import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import Do206Ripper from './ripper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml() {
    const htmlPath = path.join(__dirname, 'sample-data.html');
    return parse(fs.readFileSync(htmlPath, 'utf8'));
}

describe('Do206Ripper', () => {
    it('parses Seattle events from the sample day listing', () => {
        const ripper = new Do206Ripper();
        const html = loadSampleHtml();

        const events = ripper.parseDayEvents(html);
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const errors = events.filter(e => 'type' in e) as RipperError[];

        expect(errors).toEqual([]);
        // Sample has 3 cards: Lido Pimienta (Seattle), Boz Scaggs (Seattle),
        // Bingo at Anderson (Bothell — filtered out as out-of-scope).
        expect(calEvents.length).toBe(2);
        const titles = calEvents.map(e => e.summary);
        expect(titles).toContain('Lido Pimienta');
        expect(titles).toContain('Boz Scaggs');
        expect(titles).not.toContain('Bingo at Anderson');
    });

    it('filters out events outside Seattle by addressLocality', () => {
        const ripper = new Do206Ripper();
        const html = loadSampleHtml();

        const events = ripper.parseDayEvents(html);
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];

        expect(calEvents.every(e => e.location?.includes('Seattle'))).toBe(true);
    });

    it('parses start date, venue, and coordinates from itemprop microdata', () => {
        const ripper = new Do206Ripper();
        const html = loadSampleHtml();

        const events = ripper.parseDayEvents(html);
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        const lido = calEvents.find(e => e.summary === 'Lido Pimienta');

        expect(lido).toBeDefined();
        expect(lido!.date.year()).toBe(2026);
        expect(lido!.date.monthValue()).toBe(9);
        expect(lido!.date.dayOfMonth()).toBe(15);
        expect(lido!.date.hour()).toBe(19);
        expect(lido!.date.minute()).toBe(0);
        expect(lido!.location).toBe('Neumos, 925 East Pike Street, Seattle, WA 98122');
        expect(lido!.lat).toBeCloseTo(47.6138108);
        expect(lido!.lng).toBeCloseTo(-122.3196641);
        expect(lido!.geocodeSource).toBe('ripper');
        expect(lido!.url).toBe('https://do206.com/events/2026/9/15/lido-pimienta-tickets');
        expect(lido!.id).toBe('do206-2026-09-15-lido-pimienta-tickets');
    });

    it('deduplicates the same event seen across multiple day fetches', () => {
        const ripper = new Do206Ripper();
        const html = loadSampleHtml();

        const firstPass = ripper.parseDayEvents(html);
        const secondPass = ripper.parseDayEvents(html);

        const firstCount = firstPass.filter(e => 'summary' in e).length;
        const secondCount = secondPass.filter(e => 'summary' in e).length;

        expect(firstCount).toBeGreaterThan(0);
        expect(secondCount).toBe(0);
    });

    it('emits a ParseError for a card with no startDate', () => {
        const ripper = new Do206Ripper();
        const html = parse(`
            <div class="ds-listing event-card ds-event-category-music" data-permalink="/events/2026/9/20/no-date-tickets" itemprop="event" itemscope itemtype="http://schema.org/Event">
                <a href="/events/2026/9/20/no-date-tickets" itemprop="url" class="ds-listing-event-title url summary">
                    <span class="ds-listing-event-title-text" itemprop="name">Mystery Show</span>
                </a>
                <div class="ds-venue-name" itemprop="location" itemscope itemtype="http://schema.org/Place">
                    <a href="/venues/some-venue" itemprop="url"><span itemprop="name">Some Venue</span></a>
                    <span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
                        <meta itemprop="addressLocality" content="Seattle" />
                    </span>
                </div>
            </div>
        `);

        const events = ripper.parseDayEvents(html);
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(1);
        expect(errors[0].reason).toContain('No startDate found');
    });

    it('emits a ParseError for a card with no permalink or title', () => {
        const ripper = new Do206Ripper();
        const html = parse(`
            <div class="ds-listing event-card" itemprop="event" itemscope itemtype="http://schema.org/Event">
            </div>
        `);

        const events = ripper.parseDayEvents(html);
        const errors = events.filter(e => 'type' in e) as RipperError[];
        expect(errors.length).toBe(1);
        expect(errors[0].reason).toContain('missing permalink or title');
    });

    it('keeps an event with no addressLocality rather than dropping it as out-of-scope', () => {
        const ripper = new Do206Ripper();
        const html = parse(`
            <div class="ds-listing event-card ds-event-category-music" data-permalink="/events/2026/9/20/virtual-show-tickets" itemprop="event" itemscope itemtype="http://schema.org/Event">
                <a href="/events/2026/9/20/virtual-show-tickets" itemprop="url" class="ds-listing-event-title url summary">
                    <span class="ds-listing-event-title-text" itemprop="name">Virtual Show</span>
                </a>
                <meta itemprop="startDate" datetime="2026-09-20T19:00-0700" content="2026-09-20T19:00-0700"/>
            </div>
        `);

        const events = ripper.parseDayEvents(html);
        const calEvents = events.filter(e => 'summary' in e) as RipperCalendarEvent[];
        expect(calEvents.length).toBe(1);
        expect(calEvents[0].summary).toBe('Virtual Show');
        expect(calEvents[0].lat).toBeUndefined();
    });
});
