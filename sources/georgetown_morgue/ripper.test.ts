import { describe, expect, test } from 'vitest';
import GeorgetownMorgueRipper from './ripper.js';
import { ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
const testDate = ZonedDateTime.parse('2026-09-23T00:00:00-07:00[America/Los_Angeles]');

async function parse(data: any) {
    const events = await new GeorgetownMorgueRipper().parseEvents(data, testDate, {});
    return {
        events: events.filter(e => 'date' in e) as RipperCalendarEvent[],
        errors: events.filter(e => 'type' in e) as RipperError[],
    };
}

describe('GeorgetownMorgueRipper', () => {
    test('emits one event per open night and skips closed placeholders', async () => {
        const { events, errors } = await parse(sample);
        expect(errors).toHaveLength(0);
        const openDays = Object.values(sample.data as Record<string, any[]>)
            .filter(slots => slots.some(s => s.ticketType === 1)).length;
        expect(events).toHaveLength(openDays);
        expect(events.map(e => e.id)).not.toContain('georgetown-morgue-2026-09-27');
    });

    test('spans first slot start to last slot end in local time', async () => {
        const { events } = await parse(sample);
        const opening = events.find(e => e.id === 'georgetown-morgue-2026-09-25')!;
        expect(opening).toBeDefined();
        expect(opening.date.toLocalDate().toString()).toBe('2026-09-25');
        expect(opening.date.hour()).toBe(19);
        expect(opening.duration.toMinutes()).toBe(180);
        expect(opening.location).toContain('5000 E Marginal Way S');

        const late = events.find(e => e.id === 'georgetown-morgue-2026-10-03')!;
        expect(late.date.hour()).toBe(19);
        expect(late.duration.toMinutes()).toBe(270);
    });

    test('ids are stable and unique', async () => {
        const a = (await parse(sample)).events.map(e => e.id);
        const b = (await parse(sample)).events.map(e => e.id);
        expect(a).toEqual(b);
        expect(new Set(a).size).toBe(a.length);
    });

    test('invalid structure yields a ParseError', async () => {
        const { events, errors } = await parse({ error: true });
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
    });

    test('bad slot times yield a ParseError, not a dropped event', async () => {
        const { events, errors } = await parse({ data: { '2026-10-01': [{ ticketType: 1, startDate: 'nope', endDate: 'nope', id: 1 }] } });
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
    });
});
