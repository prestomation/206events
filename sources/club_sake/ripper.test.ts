import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node-html-parser';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { parseEventCard } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE = ZoneId.of('America/Los_Angeles');

function loadSampleCards() {
    const html = fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
    return parse(html).querySelectorAll('.card.card-hover');
}

describe('parseEventCard', () => {
    it('parses a normal event card', () => {
        const cards = loadSampleCards();
        const parsed = parseEventCard(cards[1], ZONE); // OC6 - General Session
        expect('type' in parsed).toBe(false);
        if ('type' in parsed) return;
        expect(parsed.id).toBe('club-sake-371422');
        expect(parsed.title).toBe('OC6 - General Session');
        expect(parsed.url).toBe('https://www.clubsake.com/events/371422');
        expect(parsed.location).toBe('Lakewood Marina - 4500 Lake Washington Blvd S, Seattle WA');
        expect(parsed.category).toBe('OC6 Session');
        expect(parsed.date.toString()).toContain('2026-09-01T18:30');
        expect(parsed.duration.toMinutes()).toBe(120);
    });

    it('parses a bare venue-name location', () => {
        const cards = loadSampleCards();
        const parsed = parseEventCard(cards[2], ZONE); // Recreational Crew Dragon Boat
        expect('type' in parsed).toBe(false);
        if ('type' in parsed) return;
        expect(parsed.location).toBe('Leschi South Sailboat Moorage');
    });

    it('still parses a manually-flagged cancellation (filtering happens in the caller)', () => {
        const cards = loadSampleCards();
        const parsed = parseEventCard(cards[0], ZONE);
        expect('type' in parsed).toBe(false);
        if ('type' in parsed) return;
        expect(parsed.title).toContain('CANCELED');
    });

    it('extracts the stable numeric event id from the details URL', () => {
        const cards = loadSampleCards();
        const parsed = parseEventCard(cards[3], ZONE); // Kikaha Ruston Relay
        expect('type' in parsed).toBe(false);
        if ('type' in parsed) return;
        expect(parsed.id).toBe('club-sake-375125');
        expect(parsed.location).toBe('Jack Hyde Park - 2000 Ruston Way Tacoma, WA');
    });

    it('parses a multi-day event with a dated end (spans two calendar days)', () => {
        const cards = loadSampleCards();
        const parsed = parseEventCard(cards[4], ZONE); // Portland International Dragon Boat Festival
        expect('type' in parsed).toBe(false);
        if ('type' in parsed) return;
        expect(parsed.id).toBe('club-sake-344702');
        expect(parsed.date.toString()).toContain('2026-09-12T08:00');
        // Sat 8:00AM -> Sun 5:00PM is 33 hours = 1980 minutes
        expect(parsed.duration.toMinutes()).toBe(1980);
    });

    it('wraps duration past midnight for a same-day card with no dated end', () => {
        const card = parse(`
            <div class="card card-hover">
                <div class="p-4">
                    <div class="flex-grow-1">
                        <a href="https://www.clubsake.com/events/555555">Late Night Paddle</a>
                        <div>Fri 04 Sep 2026 11:30PM - 12:30AM</div>
                        <div class="font-size-sm">Lakewood Marina - 4500 Lake Washington Blvd S, Seattle WA</div>
                    </div>
                </div>
            </div>
        `).querySelector('.card.card-hover')!;
        const parsed = parseEventCard(card, ZONE);
        expect('type' in parsed).toBe(false);
        if ('type' in parsed) return;
        expect(parsed.duration.toMinutes()).toBe(60);
    });

    it('returns a ParseError for a multi-day card whose dated end is not after the start (bad source data)', () => {
        const card = parse(`
            <div class="card card-hover">
                <div class="p-4">
                    <div class="flex-grow-1">
                        <a href="https://www.clubsake.com/events/666666">Backwards Dates</a>
                        <div>Sun 13 Sep 2026 5:00PM - Sat 12 Sep 2026 8:00AM</div>
                        <div class="font-size-sm">Tom McCall Waterfront Park</div>
                    </div>
                </div>
            </div>
        `).querySelector('.card.card-hover')!;
        const parsed = parseEventCard(card, ZONE);
        expect('type' in parsed).toBe(true);
        if (!('type' in parsed)) return;
        expect(parsed.type).toBe('ParseError');
    });

    it('falls back to a default location when the card has no .font-size-sm div', () => {
        const card = parse(`
            <div class="card card-hover">
                <div class="p-4">
                    <div class="flex-grow-1">
                        <a href="https://www.clubsake.com/events/777777">No Location Listed</a>
                        <div>Fri 04 Sep 2026 6:00PM - 7:00PM</div>
                    </div>
                </div>
            </div>
        `).querySelector('.card.card-hover')!;
        const parsed = parseEventCard(card, ZONE);
        expect('type' in parsed).toBe(false);
        if ('type' in parsed) return;
        expect(parsed.location).toBe('Seattle SAKE Paddling Club, Seattle, WA');
    });

    it('returns a ParseError when the card has no title/url', () => {
        const card = parse('<div class="card card-hover"><div class="p-4"><div class="flex-grow-1"></div></div></div>')
            .querySelector('.card.card-hover')!;
        const parsed = parseEventCard(card, ZONE);
        expect('type' in parsed).toBe(true);
        if (!('type' in parsed)) return;
        expect(parsed.type).toBe('ParseError');
    });

    it('returns a ParseError when no date/time text is found', () => {
        const card = parse(`
            <div class="card card-hover">
                <div class="p-4">
                    <div class="flex-grow-1">
                        <a href="https://www.clubsake.com/events/999999">No Date Event</a>
                        <div class="font-size-sm">Somewhere</div>
                    </div>
                </div>
            </div>
        `).querySelector('.card.card-hover')!;
        const parsed = parseEventCard(card, ZONE);
        expect('type' in parsed).toBe(true);
    });
});
