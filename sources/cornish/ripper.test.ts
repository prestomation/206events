import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import CornishRipper from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleData() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8'));
}

describe('CornishRipper.parseEvent', () => {
    const ripper = new CornishRipper();

    it('parses the sample event correctly', () => {
        const data = loadSampleData();
        const results = ripper.parseEvent(data.events[0]);

        expect(results).toHaveLength(1);
        const event = results[0];
        expect('date' in event).toBe(true);
        if (!('date' in event)) return;

        expect(event.summary).toBe('Softening the Blow');
        expect(event.date.toString()).toContain('2026-07-11');
        expect(event.location).toBe('9th Ave Gallery, 2014 9th Ave, Seattle, WA');
        expect(event.url).toBe('https://events.seattleu.edu/event/softening-the-blow');
        expect(event.imageUrl).toContain('localist-images');
        expect(event.cost).toEqual({ min: 0 });
        expect(event.id).toBe('cornish-53251215885546');
    });

    it('sets duration from start/end times', () => {
        const data = loadSampleData();
        const results = ripper.parseEvent(data.events[0]);

        expect(results).toHaveLength(1);
        const event = results[0];
        if (!('date' in event)) return;

        // Event runs 13:00–16:00 = 3 hours = 180 minutes
        expect(event.duration.toMinutes()).toBe(180);
    });

    it('returns ParseError when event has no instances', () => {
        const item = {
            event: {
                id: 123,
                title: 'No Instances Event',
                url: null,
                description_text: '',
                address: '123 Main St, Seattle, WA',
                location_name: '',
                free: false,
                ticket_url: null,
                ticket_cost: '',
                event_instances: [],
                photo_url: null,
                localist_url: 'https://events.seattleu.edu/event/no-instances',
            },
        };
        const results = ripper.parseEvent(item as any);
        expect(results).toHaveLength(1);
        expect('type' in results[0]).toBe(true);
        if (!('type' in results[0])) return;
        expect(results[0].type).toBe('ParseError');
    });

    it('returns ParseError for invalid start time', () => {
        const item = {
            event: {
                id: 456,
                title: 'Bad Start Time',
                url: null,
                description_text: '',
                address: '123 Main St, Seattle, WA',
                location_name: '',
                free: false,
                ticket_url: null,
                ticket_cost: '',
                event_instances: [{
                    event_instance: {
                        id: 789,
                        event_id: 456,
                        start: 'NOT-A-DATE',
                        end: null,
                        all_day: false,
                    },
                }],
                photo_url: null,
                localist_url: 'https://events.seattleu.edu/event/bad',
            },
        };
        const results = ripper.parseEvent(item as any);
        expect(results).toHaveLength(1);
        expect('type' in results[0]).toBe(true);
        if (!('type' in results[0])) return;
        expect(results[0].type).toBe('ParseError');
    });

    it('uses location_name + address when both present', () => {
        const data = loadSampleData();
        const results = ripper.parseEvent(data.events[0]);
        if (!('date' in results[0])) return;
        expect(results[0].location).toBe('9th Ave Gallery, 2014 9th Ave, Seattle, WA');
    });

    it('falls back to address when location_name is empty', () => {
        const data = loadSampleData();
        const item = JSON.parse(JSON.stringify(data.events[0]));
        item.event.location_name = '';
        const results = ripper.parseEvent(item);
        if (!('date' in results[0])) return;
        expect(results[0].location).toBe('2014 9th Ave, Seattle, WA');
    });

    it('uses instance id for events with multiple instances', () => {
        const data = loadSampleData();
        const item = JSON.parse(JSON.stringify(data.events[0]));
        item.event.event_instances.push({
            event_instance: {
                id: 99999,
                event_id: item.event.id,
                start: '2026-07-18T13:00:00-07:00',
                end: '2026-07-18T16:00:00-07:00',
                all_day: false,
            },
        });
        const results = ripper.parseEvent(item);
        expect(results).toHaveLength(2);
        const ids = results.filter(r => 'id' in r).map(r => (r as any).id as string);
        expect(ids[0]).toContain('cornish-53251215885547'); // instance id
        expect(ids[1]).toContain('cornish-99999');
    });

    it('uses default 2-hour duration when no end time', () => {
        const data = loadSampleData();
        const item = JSON.parse(JSON.stringify(data.events[0]));
        item.event.event_instances[0].event_instance.end = null;
        const results = ripper.parseEvent(item);
        if (!('date' in results[0])) return;
        expect(results[0].duration.toHours()).toBe(2);
    });

    it('does not set cost for paid events', () => {
        const data = loadSampleData();
        const item = JSON.parse(JSON.stringify(data.events[0]));
        item.event.free = false;
        const results = ripper.parseEvent(item);
        if (!('date' in results[0])) return;
        expect(results[0].cost).toBeUndefined();
    });
});
