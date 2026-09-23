import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { parseWorkParties, parseWorkParty, isInSeattle, isPublic, WtaWorkParty } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadItems(): WtaWorkParty[] {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
    return json.results.items;
}

describe('WTA work parties ripper', () => {
    it('keeps only Seattle trailheads', () => {
        const items = loadItems();
        const results = parseWorkParties(items);
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const errors = results.filter((r): r is RipperError => 'type' in r);
        expect(errors).toHaveLength(0);
        expect(events).toHaveLength(4);
        for (const e of events) {
            expect(e.summary).toContain('Schmitz Preserve Park');
        }
    });

    it('parses dates, duration, location, url and cost', () => {
        const events = parseWorkParties(loadItems()).filter((r): r is RipperCalendarEvent => 'date' in r);
        const first = events[0];
        expect(first.id).toBe('wta-' + loadItems()[0]._id);
        expect(first.summary).toBe('WTA Trail Work Party: Youth & Families at Schmitz Preserve Park');
        expect(first.date.toLocalDate().toString()).toBe('2026-09-26');
        expect(first.date.hour()).toBe(9);
        expect(first.duration.toHours()).toBe(6);
        expect(first.location).toBe('Schmitz Park Bridge, WA');
        expect(first.url).toMatch(/^https:\/\/www\.wta\.org\/volunteer\/schedule\/workparty\/a2m/);
        expect(first.cost).toEqual({ min: 0 });
        expect(first.lat).toBeCloseTo(47.577, 2);
        expect(first.description).not.toMatch(/<[a-z]/i);
    });

    it('excludes non-Seattle, missing-coordinate, private and unpublished work parties', () => {
        const base = loadItems()[0];
        expect(isInSeattle(base)).toBe(true);
        expect(isInSeattle({ ...base, trailhead: { name: 'x', location: { latitude: 48.67, longitude: -121.26 } } })).toBe(false);
        expect(isInSeattle({ ...base, trailhead: null })).toBe(false);
        expect(isPublic(base)).toBe(true);
        expect(isPublic({ ...base, work_party_status: 'Preview' })).toBe(false);
        expect(isPublic({ ...base, work_party_groups: [{ name: 'Corp' }], group_wp_open_to_public: false })).toBe(false);
        expect(isPublic({ ...base, work_party_groups: [{ name: 'Corp' }], group_wp_open_to_public: true })).toBe(true);
    });

    it('returns a ParseError for a bad start date', () => {
        const base = loadItems()[0];
        const result = parseWorkParty({ ...base, start_date_time: 'not a date' });
        expect('type' in result && result.type).toBe('ParseError');
    });
});
