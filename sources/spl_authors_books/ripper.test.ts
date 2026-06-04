import { describe, it, expect, vi } from 'vitest';
import SPLAuthorsRipper from './ripper.js';
import { RipperCalendarEvent } from '../../lib/config/schema.js';
import { ZoneId, Period } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData(): any[] {
    const dataPath = path.join(__dirname, 'sample-data.json');
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: 'spl-authors-books',
            description: 'Seattle Public Library',
            url: new URL('https://www.trumba.com/calendars/kalendaro.json?filterview=ProgramAuthorsBooks'),
            friendlyLink: 'https://www.spl.org/programs-and-services/authors-and-books/authors-and-books-calendar',
            tags: ['Books', 'Education'],
            lookahead: Period.ofYears(1),
            geo: null,
            disabled: false,
            proxy: false,
            needsBrowser: false,
            expectEmpty: false,
            calendars: [{
                name: 'authors-books',
                friendlyname: 'SPL — Authors & Books',
                timezone: ZoneId.of('America/Los_Angeles'),
            }],
            ...overrides,
        },
    } as any;
}

describe('SPLAuthorsRipper', () => {
    describe('rip()', () => {
        it('fetches and parses events from sample data', async () => {
            const sampleData = loadSampleData();
            const ripper = new SPLAuthorsRipper();

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(sampleData),
            }));

            const result = await ripper.rip(makeRipper());

            expect(result).toHaveLength(1);
            const cal = result[0];
            expect(cal.name).toBe('authors-books');
            expect(cal.events.length).toBeGreaterThan(0);

            vi.unstubAllGlobals();
        });

        it('filters out cancelled events', async () => {
            const sampleData = loadSampleData();
            const cancelledCount = sampleData.filter((e: any) => e.canceled).length;
            const ripper = new SPLAuthorsRipper();

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(sampleData),
            }));

            const result = await ripper.rip(makeRipper());
            const totalEvents = result.reduce((sum, c) => sum + c.events.length + c.errors.length, 0);
            expect(totalEvents).toBe(sampleData.length - cancelledCount);

            vi.unstubAllGlobals();
        });

        it('generates stable IDs for events', async () => {
            const sampleData = loadSampleData();
            const ripper = new SPLAuthorsRipper();

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(sampleData),
            }));

            const result = await ripper.rip(makeRipper());
            const events = result[0].events as RipperCalendarEvent[];
            const ids = events.map(e => e.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);

            for (const id of ids) {
                expect(id).toMatch(/^spl-\d+$/);
            }

            vi.unstubAllGlobals();
        });

        it('throws on HTTP error', async () => {
            const ripper = new SPLAuthorsRipper();

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
            }));

            await expect(ripper.rip(makeRipper())).rejects.toThrow('HTTP 503');

            vi.unstubAllGlobals();
        });

        it('throws when API returns non-array', async () => {
            const ripper = new SPLAuthorsRipper();

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ error: 'bad' }),
            }));

            await expect(ripper.rip(makeRipper())).rejects.toThrow('non-array');

            vi.unstubAllGlobals();
        });

        it('includes weeks param derived from lookahead', async () => {
            const ripper = new SPLAuthorsRipper();
            let capturedUrl = '';

            vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
                capturedUrl = url;
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }));

            await ripper.rip(makeRipper());
            // P1Y = 365 days = ceil(365/7) = 53 weeks
            expect(capturedUrl).toMatch(/[?&]weeks=\d+/);

            vi.unstubAllGlobals();
        });
    });

    describe('sample data coverage', () => {
        it('parses all non-cancelled events from sample data', async () => {
            const sampleData = loadSampleData();
            const ripper = new SPLAuthorsRipper();

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(sampleData),
            }));

            const result = await ripper.rip(makeRipper());
            const { events, errors } = result[0];

            expect(errors.length).toBe(0);
            expect(events.length).toBeGreaterThanOrEqual(40);

            for (const event of events) {
                expect(event.summary).toBeTruthy();
                expect(event.date).toBeDefined();
            }

            vi.unstubAllGlobals();
        });

        it('populates per-event imageUrl from the Trumba eventImage', async () => {
            const sampleData = loadSampleData();
            const ripper = new SPLAuthorsRipper();

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(sampleData),
            }));

            const result = await ripper.rip(makeRipper());
            const events = result[0].events as RipperCalendarEvent[];

            const withImage = events.filter(e => e.imageUrl);
            expect(withImage.length).toBeGreaterThan(0);
            for (const e of withImage) {
                expect(e.imageUrl).toMatch(/^https:\/\/www\.trumba\.com\/i\//);
            }

            vi.unstubAllGlobals();
        });
    });
});
