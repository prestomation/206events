import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LocalDate, LocalTime, ZoneId, ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { parseShow } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

// Fixed "now": June 2, 2026 noon Pacific — after past show, before Footloose and Noises Off
const NOW = ZonedDateTime.of(LocalDate.of(2026, 6, 2), LocalTime.of(12, 0), PACIFIC);

function loadSampleData() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('parseShow', () => {
    it('skips shows that have already closed', () => {
        const data = loadSampleData();
        const pastShow = data.docs[0]; // "Past Show", closed 2025-03-02
        const results = parseShow(pastShow, NOW);
        expect(results).toHaveLength(0);
    });

    it('parses an upcoming show with Industry Night', () => {
        const data = loadSampleData();
        const footloose = data.docs[1]; // Footloose
        const results = parseShow(footloose, NOW);

        // Main show event + Industry Night event
        expect(results).toHaveLength(2);

        const main = results[0];
        expect('date' in main).toBe(true);
        if ('date' in main) {
            expect(main.summary).toBe('Footloose');
            expect(main.id).toBe('renton-civic-theatre-footloose');
            expect(main.date.monthValue()).toBe(6);
            expect(main.date.dayOfMonth()).toBe(5);
            expect(main.date.hour()).toBe(20);
            expect(main.duration.toMinutes()).toBe(150);
            expect(main.description).toContain('2026-06-05 – 2026-06-21');
            expect(main.url).toBe('https://www.rentoncivictheatre.org/shows/footloose');
            expect(main.imageUrl).toBe('https://www.rentoncivictheatre.org/api/media/file/Footloose%20Open%20Graphic.jpg');
            expect(main.location).toBe('Renton Civic Theatre, 507 S 3rd St, Renton, WA 98057');
        }

        const industryNight = results[1];
        expect('date' in industryNight).toBe(true);
        if ('date' in industryNight) {
            expect(industryNight.summary).toBe('Footloose – Industry Night');
            expect(industryNight.date.dayOfMonth()).toBe(15);
            expect(industryNight.description).toContain('Pay-What-You-Will');
        }
    });

    it('parses a future show without otherDates', () => {
        const data = loadSampleData();
        const noisesOff = data.docs[2]; // Noises Off
        const results = parseShow(noisesOff, NOW);

        expect(results).toHaveLength(1);
        const event = results[0];
        expect('date' in event).toBe(true);
        if ('date' in event) {
            expect(event.summary).toBe('Noises Off');
            expect(event.id).toBe('renton-civic-theatre-noises-off');
            expect(event.imageUrl).toBeUndefined();
        }
    });

    it('returns a ParseError for shows missing dates', () => {
        const data = loadSampleData();
        const noDateShow = data.docs[3]; // No Dates Show
        const results = parseShow(noDateShow, NOW);

        expect(results).toHaveLength(1);
        const error = results[0];
        expect('type' in error).toBe(true);
        if ('type' in error) {
            expect(error.type).toBe('ParseError');
        }
    });

    it('skips otherDate entries that are in the past', () => {
        const show = {
            id: 'abc',
            slug: 'test-show',
            title: 'Test Show',
            showInfo: { showTitle: 'Test Show', shortDescription: 'A test show.' },
            dates: {
                openingDate: '2026-06-05T12:00:00.000Z',
                closingDate: '2026-06-21T12:00:00.000Z',
                otherDates: [
                    {
                        id: 'past-id',
                        purpose: 'Past Special Night',
                        date: '2026-05-01T12:00:00.000Z', // in the past
                    },
                ],
            },
            meta: undefined,
        };

        const results = parseShow(show, NOW);
        // Only the main event; past otherDate is skipped
        expect(results).toHaveLength(1);
        if ('date' in results[0]) {
            expect(results[0].summary).toBe('Test Show');
        }
    });
});

describe('sample data integration', () => {
    it('processes all sample docs: 1 past (skipped), 2 upcoming, 1 error', () => {
        const data = loadSampleData();
        const allEvents = [];
        const allErrors = [];

        for (const show of data.docs) {
            for (const result of parseShow(show, NOW)) {
                if ('date' in result) allEvents.push(result);
                else allErrors.push(result);
            }
        }

        // Footloose (2 events) + Noises Off (1 event)
        expect(allEvents).toHaveLength(3);
        // No Dates Show produces 1 ParseError
        expect(allErrors).toHaveLength(1);
    });
});
