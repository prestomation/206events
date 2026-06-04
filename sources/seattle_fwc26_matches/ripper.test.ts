import { describe, expect, test } from 'vitest';
import SeattleFwc26MatchesRipper, {
    parseMatchDate,
    parseMatchTime,
    isPlaceholderTeam,
    humanizeTeam,
} from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

describe('parseMatchDate', () => {
    test('parses full month, day, year', () => {
        expect(parseMatchDate('June 15, 2026')).toEqual({ year: 2026, month: 6, day: 15 });
        expect(parseMatchDate('July 6, 2026')).toEqual({ year: 2026, month: 7, day: 6 });
    });

    test('returns null for unparseable text', () => {
        expect(parseMatchDate('')).toBeNull();
        expect(parseMatchDate('TBD')).toBeNull();
    });
});

describe('parseMatchTime', () => {
    test('parses pm times to 24-hour', () => {
        expect(parseMatchTime('12:00 pm')).toEqual({ hour: 12, minute: 0 });
        expect(parseMatchTime('8:00 pm')).toEqual({ hour: 20, minute: 0 });
        expect(parseMatchTime('1:00 pm')).toEqual({ hour: 13, minute: 0 });
    });

    test('parses am and midnight/noon edge cases', () => {
        expect(parseMatchTime('12:00 am')).toEqual({ hour: 0, minute: 0 });
        expect(parseMatchTime('9:30 am')).toEqual({ hour: 9, minute: 30 });
    });

    test('returns null for unparseable text', () => {
        expect(parseMatchTime('')).toBeNull();
        expect(parseMatchTime('soon')).toBeNull();
    });
});

describe('isPlaceholderTeam', () => {
    test('detects knockout bracket codes', () => {
        expect(isPlaceholderTeam('1G')).toBe(true);
        expect(isPlaceholderTeam('3AEHIJ')).toBe(true);
        expect(isPlaceholderTeam('W81')).toBe(true);
    });

    test('treats country names as determined', () => {
        expect(isPlaceholderTeam('Belgium')).toBe(false);
        expect(isPlaceholderTeam('USA')).toBe(false);
        expect(isPlaceholderTeam('Bosnia-Herzegovina')).toBe(false);
    });
});

describe('humanizeTeam', () => {
    test('expands bracket codes', () => {
        expect(humanizeTeam('W81')).toBe('Winner Match 81');
        expect(humanizeTeam('1G')).toBe('Winner Group G');
        expect(humanizeTeam('2G')).toBe('Runner-up Group G');
        expect(humanizeTeam('3AEHIJ')).toBe('3rd Place Group A/E/H/I/J');
    });

    test('passes through country names unchanged', () => {
        expect(humanizeTeam('Belgium')).toBe('Belgium');
        expect(humanizeTeam('USA ')).toBe('USA');
    });
});

describe('SeattleFwc26MatchesRipper - parseMatches', () => {
    const ripper = new SeattleFwc26MatchesRipper();

    test('extracts all six Seattle matches from the live sample', () => {
        const html = loadSample('sample-data.html');
        const results = ripper.parseMatches(html, 'https://www.seattlefwc26.org/matches');
        const events = results.filter((e): e is RipperCalendarEvent => 'date' in e);

        expect(results.length).toBe(6);
        expect(events.length).toBe(6);
        // no parse errors
        expect(results.length - events.length).toBe(0);
    });

    test('parses the opening group-stage match (Belgium vs Egypt)', () => {
        const html = loadSample('sample-data.html');
        const events = ripper.parseMatches(html, 'https://www.seattlefwc26.org/matches')
            .filter((e): e is RipperCalendarEvent => 'date' in e);

        const opener = events.find(e => e.id === 'seattle-fwc26-match-16');
        expect(opener).toBeDefined();
        expect(opener!.summary).toBe('FIFA World Cup 26: Belgium vs Egypt');
        expect(opener!.date.year()).toBe(2026);
        expect(opener!.date.monthValue()).toBe(6);
        expect(opener!.date.dayOfMonth()).toBe(15);
        expect(opener!.date.hour()).toBe(12);
        expect(opener!.date.minute()).toBe(0);
        expect(opener!.duration.toHours()).toBe(2);
        expect(opener!.location).toBe('Lumen Field, 800 Occidental Ave S, Seattle, WA 98134');
        expect(opener!.url).toBe('https://www.seattlefwc26.org/matches');
    });

    test('parses an evening kickoff (Egypt vs Iran, 8pm)', () => {
        const html = loadSample('sample-data.html');
        const events = ripper.parseMatches(html, 'https://www.seattlefwc26.org/matches')
            .filter((e): e is RipperCalendarEvent => 'date' in e);

        const evening = events.find(e => e.id === 'seattle-fwc26-match-63');
        expect(evening).toBeDefined();
        expect(evening!.summary).toBe('FIFA World Cup 26: Egypt vs Iran');
        expect(evening!.date.dayOfMonth()).toBe(26);
        expect(evening!.date.hour()).toBe(20);
    });

    test('humanizes TBD knockout matchups and flags them in the description', () => {
        const html = loadSample('sample-data.html');
        const events = ripper.parseMatches(html, 'https://www.seattlefwc26.org/matches')
            .filter((e): e is RipperCalendarEvent => 'date' in e);

        const roundOf32 = events.find(e => e.id === 'seattle-fwc26-match-82');
        expect(roundOf32).toBeDefined();
        expect(roundOf32!.summary).toBe('FIFA World Cup 26: Winner Group G vs 3rd Place Group A/E/H/I/J');
        expect(roundOf32!.description).toMatch(/Knockout-stage match/);

        const roundOf16 = events.find(e => e.id === 'seattle-fwc26-match-94');
        expect(roundOf16!.summary).toBe('FIFA World Cup 26: Winner Match 81 vs Winner Match 82');
    });

    test('gives every match a stable, unique id', () => {
        const html = loadSample('sample-data.html');
        const events = ripper.parseMatches(html, 'https://www.seattlefwc26.org/matches')
            .filter((e): e is RipperCalendarEvent => 'date' in e);
        const ids = events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain('seattle-fwc26-match-52');
    });
});
