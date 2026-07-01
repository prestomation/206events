import { describe, it, expect } from 'vitest';
import { ZoneId } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { extractMassiveEvents } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of('America/Los_Angeles');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('MassiveRipper', () => {
    it('parses events from sample HTML', () => {
        const { events, errors } = extractMassiveEvents(loadSampleHtml(), TIMEZONE);

        expect(errors).toHaveLength(0);
        expect(events.length).toBeGreaterThan(0);
    });

    it('parses title, date/time, url, image, and cost', () => {
        const { events } = extractMassiveEvents(loadSampleHtml(), TIMEZONE);

        const servito = events.find(e => e.summary.includes('Mike Servito'));
        expect(servito).toBeDefined();
        expect(servito!.date.toString()).toContain('2026-07-03T22:00');
        expect(servito!.url).toBe('https://tixr.com/e/197328');
        expect(servito!.imageUrl).toMatch(/^https:\/\//);
        expect(servito!.cost).toEqual({ min: 10 });
        expect(servito!.location).toContain('Massive');
    });

    it('treats a missing/blank offer price as paid rather than free', () => {
        const { events } = extractMassiveEvents(loadSampleHtml(), TIMEZONE);

        const buttBlast = events.find(e => e.summary.includes('Butt Blast'));
        expect(buttBlast).toBeDefined();
        expect(buttBlast!.cost).toEqual({ paid: true });
    });

    it('deduplicates events with the same Tixr event id', () => {
        const html = `<html><body>
            <div class="event-item">
                <script type="application/ld+json">{"name":"Dup Party","offers":{"url":"https://tixr.com/e/1"}}</script>
                <div class="infotext hide">Jul 3, 2026 10:00 PM</div>
            </div>
            <div class="event-item">
                <script type="application/ld+json">{"name":"Dup Party","offers":{"url":"https://tixr.com/e/1"}}</script>
                <div class="infotext hide">Jul 3, 2026 10:00 PM</div>
            </div>
        </body></html>`;

        const { events } = extractMassiveEvents(html, TIMEZONE);
        expect(events).toHaveLength(1);
    });

    it('emits a ParseError for an event card missing the date/time text', () => {
        const html = `<html><body>
            <div class="event-item">
                <script type="application/ld+json">{"name":"No Date Party","offers":{"url":"https://tixr.com/e/2"}}</script>
            </div>
        </body></html>`;

        const { events, errors } = extractMassiveEvents(html, TIMEZONE);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });
});
