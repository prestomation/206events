import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZoneId, ZonedDateTime, LocalDateTime } from '@js-joda/core';
import '@js-joda/timezone';
import { processData, LOCATION, EVENTS_URL, SpektrixEvent, SpektrixInstance } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACIFIC = ZoneId.of('America/Los_Angeles');

function loadSampleData(): { events: SpektrixEvent[]; instances: SpektrixInstance[] } {
    const raw = fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8');
    return JSON.parse(raw);
}

// Fixed "now" so tests don't depend on the actual current time:
// May 1 2026 noon PT — before every public instance in the sample
// (Albiani May 10, Brett Dennen Jun 10, PianoFête Jul 8-10) and after the
// past Jackrabbit session (Feb 4).
const NOW = ZonedDateTime.of(LocalDateTime.of(2026, 5, 1, 12, 0), PACIFIC);

describe('processData', () => {
    const sample = loadSampleData();

    it('returns upcoming public events', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        expect(events.length).toBeGreaterThan(0);
    });

    it('filters out Jackrabbit class/camp events', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        const classEvents = events.filter(e => e.summary.toLowerCase().includes('ballet'));
        expect(classEvents).toHaveLength(0);
    });

    it('filters out past events', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        for (const event of events) {
            expect(event.date.isAfter(NOW)).toBe(true);
        }
    });

    it('emits one event per instance (multi-night runs expand)', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        const piano = events.filter(e => e.summary === '2026 PianoFête');
        expect(piano).toHaveLength(3);
    });

    it('uses event duration in minutes, defaulting to 120 when zero', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);

        const brett = events.find(e => e.summary === 'Brett Dennen: Art is Life');
        expect(brett).toBeDefined();
        expect(brett!.duration.toMinutes()).toBe(90);

        // Albiani Art Talks has duration 0 in the source -> default applied.
        const talk = events.find(e => e.summary === 'Albiani Art Talks');
        expect(talk).toBeDefined();
        expect(talk!.duration.toMinutes()).toBe(120);
    });

    it('carries description and image through when present', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        const brett = events.find(e => e.summary === 'Brett Dennen: Art is Life');
        expect(brett!.description).toBeTruthy();

        const piano = events.find(e => e.summary === '2026 PianoFête');
        expect(piano!.imageUrl).toBeTruthy();
    });

    it('deduplicates the same event at the same time', () => {
        // Duplicate the Brett Dennen instance (same event id + start, new instance id).
        const brettInst = sample.instances.find(i => i.start === '2026-06-10T19:30:00')!;
        const withDupe: SpektrixInstance[] = [
            ...sample.instances,
            { ...brettInst, id: 'INST_DUPE_BRETT' },
        ];
        const { events } = processData(sample.events, withDupe, NOW, PACIFIC);
        const brett = events.filter(e => e.summary === 'Brett Dennen: Art is Life');
        expect(brett).toHaveLength(1);
    });

    it('filters out cancelled instances', () => {
        const brettInst = sample.instances.find(i => i.start === '2026-06-10T19:30:00')!;
        const withCancelled: SpektrixInstance[] = [
            { ...brettInst, id: 'INST_CANCELLED', start: '2026-06-12T19:30:00', cancelled: true },
            ...sample.instances,
        ];
        const { events } = processData(sample.events, withCancelled, NOW, PACIFIC);
        const onTwelfth = events.filter(e =>
            e.date.monthValue() === 6 && e.date.dayOfMonth() === 12
        );
        expect(onTwelfth).toHaveLength(0);
    });

    it('uses the fixed venue location and events URL', () => {
        const { events } = processData(sample.events, sample.instances, NOW, PACIFIC);
        for (const event of events) {
            expect(event.location).toBe(LOCATION);
            expect(event.url).toBe(EVENTS_URL);
        }
    });

    it('produces stable, deterministic ids derived from the instance id', () => {
        const a = processData(sample.events, sample.instances, NOW, PACIFIC).events;
        const b = processData(sample.events, sample.instances, NOW, PACIFIC).events;
        expect(a.map(e => e.id)).toEqual(b.map(e => e.id));
        for (const e of a) expect(e.id).toMatch(/^vashon-/);
    });

    it('reports a ParseError for malformed datetime strings', () => {
        const badInstances: SpektrixInstance[] = [{
            id: 'BAD_INST',
            event: { id: sample.events[0].id },
            start: 'not-a-date',
            cancelled: false,
        }];
        const { errors } = processData(sample.events, badInstances, NOW, PACIFIC);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });
});
