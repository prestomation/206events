import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { parseTechMeetupsHtml, extractLdEvents, isInPersonSeattle, parseLdEvent } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');

describe('TechMeetups.io Seattle ripper', () => {
    it('extracts all Event items from the JSON-LD ItemList', () => {
        const { events, errors } = extractLdEvents(html);
        expect(errors).toHaveLength(0);
        expect(events).toHaveLength(20);
    });

    it('keeps only in-person Seattle events', () => {
        const results = parseTechMeetupsHtml(html);
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const errors = results.filter((r): r is RipperError => 'type' in r);
        expect(errors).toHaveLength(0);
        expect(events).toHaveLength(4);
        expect(events.map(e => e.summary)).toContain('Project Hack Night & Social');
    });

    it('parses fields with a stable Meetup-derived id', () => {
        const events = parseTechMeetupsHtml(html).filter((r): r is RipperCalendarEvent => 'date' in r);
        const hack = events.find(e => e.summary === 'Project Hack Night & Social')!;
        expect(hack.id).toBe('meetup-316259929');
        expect(hack.date.toLocalDate().toString()).toBe('2026-09-24');
        expect(hack.date.hour()).toBe(18);
        expect(hack.duration.toHours()).toBe(2);
        expect(hack.location).toBe('Stoup Brewing - Capitol Hill, 1158 Broadway, Seattle, WA');
        expect(hack.url).toBe('https://www.meetup.com/psppython/events/316259929/');
        expect(hack.description).toContain('Hosted by Puget Sound Programming Python');
        expect(hack.imageUrl).toBeUndefined();
    });

    it('rejects virtual and non-Seattle events', () => {
        expect(isInPersonSeattle({ location: { '@type': 'VirtualLocation' } })).toBe(false);
        expect(isInPersonSeattle({ location: { '@type': 'Place', address: { addressLocality: 'Bellevue' } } })).toBe(false);
        expect(isInPersonSeattle({ location: { '@type': 'Place', address: { addressLocality: 'Seattle' } } })).toBe(true);
    });

    it('returns a ParseError for a bad startDate', () => {
        const r = parseLdEvent({ name: 'X', startDate: 'nope' });
        expect('type' in r && r.type).toBe('ParseError');
    });
});
