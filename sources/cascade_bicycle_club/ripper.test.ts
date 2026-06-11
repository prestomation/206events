import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { parseEventsFromHtml } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('parseEventsFromHtml', () => {
    it('extracts events from sample HTML', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html);
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('all results are events (no parse errors in sample data)', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html);
        const events = results.filter(r => 'date' in r);
        const errors = results.filter(r => 'type' in r);
        expect(events.length).toBeGreaterThan(0);
        expect(errors).toHaveLength(0);
    });

    it('events have stable IDs derived from URL slug', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html);
        const events = results.filter(r => 'date' in r);
        for (const event of events) {
            if ('id' in event) {
                expect(event.id).toMatch(/^cascade-/);
                expect(event.id).not.toMatch(/undefined/);
            }
        }
    });

    it('events have valid ISO datetimes', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html);
        const events = results.filter(r => 'date' in r);
        for (const event of events) {
            if ('date' in event) {
                expect(event.date.year()).toBeGreaterThanOrEqual(2026);
            }
        }
    });

    it('events have positive duration', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html);
        const events = results.filter(r => 'date' in r);
        for (const event of events) {
            if ('duration' in event) {
                expect(event.duration.toMinutes()).toBeGreaterThan(0);
            }
        }
    });

    it('events link to cascade.org', () => {
        const html = loadSampleHtml();
        const results = parseEventsFromHtml(html);
        const events = results.filter(r => 'date' in r);
        for (const event of events) {
            if ('url' in event) {
                expect(event.url).toMatch(/^https:\/\/cascade\.org/);
            }
        }
    });

    it('returns empty array for HTML with no events section', () => {
        const results = parseEventsFromHtml('<html><body><p>No events</p></body></html>');
        expect(results).toHaveLength(0);
    });

    it('skips cards without datetime attributes', () => {
        const html = `
            <div class="cards--list events">
                <div class="card-sm-event">
                    <h3>Missing Date Event</h3>
                    <a href="/rides-events/test-slug" class="card-overlay-link"></a>
                </div>
            </div>
        `;
        const results = parseEventsFromHtml(html);
        expect(results).toHaveLength(0);
    });

    it('returns ParseError for unparseable datetime', () => {
        const html = `
            <div class="cards--list events">
                <div class="card-sm-event">
                    <time datetime="not-a-date">Bad date</time>
                    <h3>Bad Date Event</h3>
                    <a href="/rides-events/bad-event" class="card-overlay-link"></a>
                </div>
            </div>
        `;
        const results = parseEventsFromHtml(html);
        expect(results).toHaveLength(1);
        expect('type' in results[0]).toBe(true);
        if ('type' in results[0]) {
            expect(results[0].type).toBe('ParseError');
        }
    });

    it('uses default 3-hour duration when only start time is available', () => {
        const html = `
            <div class="cards--list events">
                <div class="card-sm-event">
                    <time datetime="2026-09-15T10:00:00-07:00">Sep 15</time>
                    <h3>Single Time Event</h3>
                    <a href="/rides-events/single-time" class="card-overlay-link"></a>
                </div>
            </div>
        `;
        const results = parseEventsFromHtml(html);
        expect(results).toHaveLength(1);
        if ('duration' in results[0]) {
            expect(results[0].duration.toMinutes()).toBe(180);
        }
    });

    it('emits ParseError when end time is not after start time', () => {
        const html = `
            <div class="cards--list events">
                <div class="card-sm-event">
                    <time datetime="2026-09-15T10:00:00-07:00">Sep 15</time>
                    <time datetime="2026-09-15T09:00:00-07:00">Sep 15</time>
                    <h3>Bad Duration Event</h3>
                    <a href="/rides-events/bad-duration" class="card-overlay-link"></a>
                </div>
            </div>
        `;
        const results = parseEventsFromHtml(html);
        expect(results).toHaveLength(1);
        expect('type' in results[0]).toBe(true);
        if ('type' in results[0]) {
            expect(results[0].type).toBe('ParseError');
            expect(results[0].reason).toMatch(/not after start time/);
        }
    });
});
