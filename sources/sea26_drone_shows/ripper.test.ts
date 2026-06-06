import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseTimeStr, parseShowItem } from './ripper.js';
import Sea26DroneShowsRipper from './ripper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');

describe('parseTimeStr', () => {
    it('parses 10pm', () => expect(parseTimeStr('10pm')).toEqual({ hour: 22, minute: 0 }));
    it('parses 11pm', () => expect(parseTimeStr('11pm')).toEqual({ hour: 23, minute: 0 }));
    it('parses 11:30pm', () => expect(parseTimeStr('11:30pm')).toEqual({ hour: 23, minute: 30 }));
    it('parses 10:00pm', () => expect(parseTimeStr('10:00pm')).toEqual({ hour: 22, minute: 0 }));
    it('returns null for TBD', () => expect(parseTimeStr('TBD')).toBeNull());
    it('returns null for empty', () => expect(parseTimeStr('')).toBeNull());
});

describe('parseShowItem', () => {
    it('parses a show at exact time', () => {
        const result = parseShowItem('Monday, June 15 show at 10pm', 'Monday, June 15 show at 10pm (Belgium vs. Egypt)', 2026);
        expect(result).not.toHaveProperty('type');
        const show = result as any;
        expect(show.dateStr).toBe('2026-06-15');
        expect(show.hour).toBe(22);
        expect(show.minute).toBe(0);
        expect(show.timeKnown).toBe(true);
        expect(show.timeApproximate).toBe(false);
        expect(show.matchName).toBe('Belgium vs. Egypt');
    });

    it('parses showtime TBD', () => {
        const result = parseShowItem('Friday, June 19 showtime TBD', 'Friday, June 19 showtime TBD (USA vs. Australia)', 2026);
        expect(result).not.toHaveProperty('type');
        const show = result as any;
        expect(show.dateStr).toBe('2026-06-19');
        expect(show.timeKnown).toBe(false);
        expect(show.matchName).toBe('USA vs. Australia');
    });

    it('parses show after 11pm as approximate', () => {
        const result = parseShowItem('Friday, June 26 show after 11pm', 'Friday, June 26 show after 11pm (Egypt vs. IR Iran)', 2026);
        expect(result).not.toHaveProperty('type');
        const show = result as any;
        expect(show.dateStr).toBe('2026-06-26');
        expect(show.hour).toBe(23);
        expect(show.timeKnown).toBe(true);
        expect(show.timeApproximate).toBe(true);
    });

    it('parses 11:30pm show', () => {
        const result = parseShowItem('Wednesday, July 1 show at 11:30pm', 'Wednesday, July 1 show at 11:30pm (Match 82)', 2026);
        expect(result).not.toHaveProperty('type');
        const show = result as any;
        expect(show.dateStr).toBe('2026-07-01');
        expect(show.hour).toBe(23);
        expect(show.minute).toBe(30);
        expect(show.timeKnown).toBe(true);
        expect(show.timeApproximate).toBe(false);
        expect(show.matchName).toBe('Match 82');
    });

    it('returns ParseError for unrecognizable text', () => {
        const result = parseShowItem('No date here', 'No date here', 2026) as any;
        expect(result.type).toBe('ParseError');
    });
});

describe('Sea26DroneShowsRipper.parseShows', () => {
    const ripper = new Sea26DroneShowsRipper();

    it('parses all 6 shows from sample HTML producing 8 results (6 events + 2 UncertaintyErrors)', () => {
        const results = ripper.parseShows(sampleHtml, 2026);
        // 2 TBD shows each produce an event + UncertaintyError = 4 results
        // 4 other shows produce only an event = 4 results
        // Total: 8
        expect(results.length).toBe(8);
    });

    it('emits UncertaintyError (type "Uncertainty") for TBD shows', () => {
        const results = ripper.parseShows(sampleHtml, 2026);
        const uncertain = results.filter((r: any) => r.type === 'Uncertainty');
        expect(uncertain.length).toBe(2);
        for (const u of uncertain as any[]) {
            expect(u.unknownFields).toContain('startTime');
            expect(u.event).toBeDefined();
            expect(u.event.summary).toMatch(/SEA 26 Drone Show/);
        }
    });

    it('all events have stable IDs derived from date', () => {
        const results = ripper.parseShows(sampleHtml, 2026);
        const events = results.filter((r: any) => 'date' in r);
        const ids = events.map((r: any) => r.id);
        expect(ids).toContain('sea26-drone-show-2026-06-15');
        expect(ids).toContain('sea26-drone-show-2026-06-19');
        expect(ids).toContain('sea26-drone-show-2026-07-06');
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('confirmed-time events include match name in summary', () => {
        const results = ripper.parseShows(sampleHtml, 2026);
        const june15 = results.find((r: any) => r.id === 'sea26-drone-show-2026-06-15') as any;
        expect(june15).toBeDefined();
        expect(june15.summary).toMatch(/Belgium vs. Egypt/);
    });

    it('all events have ripped timestamp', () => {
        const results = ripper.parseShows(sampleHtml, 2026);
        const events = results.filter((r: any) => 'date' in r);
        for (const e of events as any[]) {
            expect(e.ripped).toBeInstanceOf(Date);
        }
    });

    it('never returns null', () => {
        const results = ripper.parseShows(sampleHtml, 2026);
        for (const r of results) {
            expect(r).not.toBeNull();
        }
    });
});
