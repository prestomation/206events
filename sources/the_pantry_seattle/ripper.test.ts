import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';
import { parsePantryItems, parsePantryItem, parsePantryDate, extractClassHeroImage, PantryItem } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const items: PantryItem[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')).data;
const classPageHtml = fs.readFileSync(path.join(__dirname, 'sample-class-page.html'), 'utf8');

describe('The Pantry ripper', () => {
    it('parses every item in the sample without errors', () => {
        const results = parsePantryItems(items);
        const events = results.filter((r): r is RipperCalendarEvent => 'date' in r);
        const errors = results.filter((r): r is RipperError => 'type' in r);
        expect(errors).toHaveLength(0);
        expect(events).toHaveLength(items.length);
    });

    it('parses the -0700 offset date format', () => {
        const d = parsePantryDate('2026-09-23T18:00:00-0700');
        expect(d.toLocalDate().toString()).toBe('2026-09-23');
        expect(d.hour()).toBe(18);
        expect(d.offset().totalSeconds()).toBe(-7 * 3600);
    });

    it('maps fields with stable ids', () => {
        const events = parsePantryItems(items).filter((r): r is RipperCalendarEvent => 'date' in r);
        const first = events[0];
        expect(first.id).toBe(`pantry-${items[0].id}`);
        expect(first.duration.toHours()).toBe(3);
        expect(first.location).toBe('The Pantry, 1417 NW 70th St, Seattle, WA 98117');
        expect(first.url).toMatch(/^https:\/\/thepantryseattle\.com\/classdate\//);
        const dinner = events.find(e => e.summary.startsWith('Family Dinner'));
        expect(dinner?.description).toContain('Family-style dinner');
    });

    it('dedups repeated ids and reports a bad date as ParseError', () => {
        expect(parsePantryItems([items[0], items[0]])).toHaveLength(1);
        const bad = parsePantryItem({ ...items[0], startDate: 'garbage' });
        expect('type' in bad && bad.type).toBe('ParseError');
    });

    it('extracts the hero photo from a class page, not the instructor headshot', () => {
        expect(extractClassHeroImage(classPageHtml)).toBe(
            'https://the-pantry-prod.imgix.net/tomatoes_2022-09-16-205414_vtlf.jpg?ar=1.6666666666667&fit=crop&fm=webp&fp-x=0.5&fp-y=0.5&ixlib=php-2.1.1&q=50&w=1244',
        );
    });

    it('returns undefined when a page has no hero figure', () => {
        expect(extractClassHeroImage('<html><body><p>no photo here</p></body></html>')).toBeUndefined();
    });
});
