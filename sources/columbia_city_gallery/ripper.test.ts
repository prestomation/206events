import { describe, expect, test } from 'vitest';
import ColumbiacityGalleryRipper from './ripper.js';
import { ZonedDateTime, Duration } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RipperCalendarEvent } from '../../lib/config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Columbia City Gallery Ripper', () => {
    test('parses events from sample JSON', async () => {
        const jsonData = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
        );
        const ripper = new ColumbiacityGalleryRipper();
        const date = ZonedDateTime.parse('2026-05-26T00:00:00-07:00[America/Los_Angeles]');

        const events = await ripper.parseEvents(jsonData, date, {});

        expect(events.length).toBe(jsonData.events.length);
        expect(events.filter(e => 'date' in e).length).toBe(jsonData.events.length);
    });

    test('parses timed event correctly (Portrait Life Drawing Session)', async () => {
        const jsonData = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
        );
        const ripper = new ColumbiacityGalleryRipper();
        const date = ZonedDateTime.parse('2026-05-26T00:00:00-07:00[America/Los_Angeles]');

        const events = await ripper.parseEvents(jsonData, date, {});
        const timedEvent = events.find(
            e => 'summary' in e && (e as RipperCalendarEvent).summary === 'Portrait Life Drawing Session'
        ) as RipperCalendarEvent;

        expect(timedEvent).toBeDefined();
        expect(timedEvent.id).toBe('columbia-city-gallery-9430');
        expect(timedEvent.date.hour()).toBe(18);
        expect(timedEvent.date.minute()).toBe(0);
        // 2.5 hour duration
        expect(timedEvent.duration.toMinutes()).toBe(150);
        expect(timedEvent.location).toContain('4864 Rainier Ave S');
        expect(timedEvent.url).toContain('columbiacitygallery.com');
    });

    test('parses all-day exhibition correctly (Rooted Here)', async () => {
        const jsonData = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
        );
        const ripper = new ColumbiacityGalleryRipper();
        const date = ZonedDateTime.parse('2026-05-26T00:00:00-07:00[America/Los_Angeles]');

        const events = await ripper.parseEvents(jsonData, date, {});
        const exhibition = events.find(
            e => 'summary' in e && (e as RipperCalendarEvent).summary === 'Rooted Here: Artists from the SEEDArts Studios'
        ) as RipperCalendarEvent;

        expect(exhibition).toBeDefined();
        expect(exhibition.id).toBe('columbia-city-gallery-9276');
        expect(exhibition.date.year()).toBe(2026);
        expect(exhibition.date.monthValue()).toBe(6);
        expect(exhibition.date.dayOfMonth()).toBe(3);
        // Multi-day exhibition: June 3 – July 12
        expect(exhibition.duration.toDays()).toBeGreaterThan(30);
    });

    test('strips HTML from description', async () => {
        const jsonData = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
        );
        const ripper = new ColumbiacityGalleryRipper();
        const date = ZonedDateTime.parse('2026-05-26T00:00:00-07:00[America/Los_Angeles]');

        const events = await ripper.parseEvents(jsonData, date, {});
        const timedEvent = events.find(
            e => 'summary' in e && (e as RipperCalendarEvent).summary === 'Portrait Life Drawing Session'
        ) as RipperCalendarEvent;

        expect(timedEvent.description).toBeDefined();
        expect(timedEvent.description).not.toContain('<p>');
        expect(timedEvent.description).not.toContain('</p>');
    });

    test('returns ParseError for invalid JSON', async () => {
        const ripper = new ColumbiacityGalleryRipper();
        const date = ZonedDateTime.parse('2026-05-26T00:00:00-07:00[America/Los_Angeles]');

        const events = await ripper.parseEvents({}, date, {});

        expect(events.length).toBe(1);
        expect('type' in events[0]).toBe(true);
        expect((events[0] as any).type).toBe('ParseError');
    });

    test('returns ParseError for event missing date details', async () => {
        const ripper = new ColumbiacityGalleryRipper();
        const date = ZonedDateTime.parse('2026-05-26T00:00:00-07:00[America/Los_Angeles]');

        const events = await ripper.parseEvents({ events: [{ id: 1, title: 'Bad Event' }] }, date, {});

        expect(events.length).toBe(1);
        expect('type' in events[0]).toBe(true);
        expect((events[0] as any).type).toBe('ParseError');
        expect((events[0] as any).reason).toContain('Missing date details');
    });

    test('uses timezone from date parameter', async () => {
        const jsonData = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
        );
        const ripper = new ColumbiacityGalleryRipper();
        const date = ZonedDateTime.parse('2026-05-26T00:00:00-07:00[America/Los_Angeles]');

        const events = await ripper.parseEvents(jsonData, date, {});
        const timedEvent = events.find(
            e => 'summary' in e && (e as RipperCalendarEvent).summary === 'Portrait Life Drawing Session'
        ) as RipperCalendarEvent;

        expect(timedEvent.date.zone().toString()).toBe('America/Los_Angeles');
    });
});
