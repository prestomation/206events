import { describe, it, expect } from 'vitest';
import { ZonedDateTime } from '@js-joda/core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '@js-joda/timezone';
import { extractSideOutTsunamiEvents } from './ripper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOW = ZonedDateTime.parse('2026-09-01T00:00:00-07:00[America/Los_Angeles]');

function loadSampleHtml(): string {
    return fs.readFileSync(path.join(__dirname, 'sample-data.html'), 'utf8');
}

describe('SideOutTsunamiRipper', () => {
    it('parses events from sample HTML with no errors', () => {
        const { events, errors } = extractSideOutTsunamiEvents(loadSampleHtml(), NOW);

        expect(errors).toHaveLength(0);
        expect(events.length).toBeGreaterThan(0);
    });

    it('parses title, date/time, url, duration, and location', () => {
        const { events } = extractSideOutTsunamiEvents(loadSampleHtml(), NOW);

        const pb101 = events.find(e => e.summary === 'Pickleball 101' && e.date.toLocalDate().toString() === '2026-09-23');
        expect(pb101).toBeDefined();
        expect(pb101!.date.toString()).toContain('2026-09-23T17:00');
        expect(pb101!.duration.toMinutes()).toBe(60);
        expect(pb101!.url).toMatch(/^https:\/\/app\.courtreserve\.com\//);
        expect(pb101!.location).toBe('Sideout Tsunami Pickleball Center, 2300 26th Ave S, Seattle, WA 98144');
    });

    it('extracts a stable id from a reservationId query param', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"Open Play","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T18:00:00-07:00","url":"https://app.courtreserve.com/online/publicbookings/16870?tab=explore&eventId=1&reservationId=555"}
        ]</script></head><body></body></html>`;

        const { events } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(1);
        expect(events[0].id).toBe('side-out-tsunami-555');
    });

    it('extracts a stable id from the alternate resId query param', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"League Night","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T19:00:00-07:00","url":"https://app.courtreserve.com/Online/Events/Details/16870/777?resId=777"}
        ]</script></head><body></body></html>`;

        const { events } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(1);
        expect(events[0].id).toBe('side-out-tsunami-777');
    });

    it('falls back to a stable name+date id when no CourtReserve id is present', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"Community Scramble","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T19:00:00-07:00"}
        ]</script></head><body></body></html>`;

        const { events: first } = extractSideOutTsunamiEvents(html, NOW);
        const { events: second } = extractSideOutTsunamiEvents(html, NOW);

        expect(first).toHaveLength(1);
        expect(first[0].id).toBe('side-out-tsunami-community-scramble-2026-09-23-1700');
        expect(second[0].id).toBe(first[0].id);
    });

    it('includes a time-slot suffix in the fallback id so same-day showings do not collide', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"Open Play","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T18:00:00-07:00"},
            {"@type":"SportsEvent","name":"Open Play","startDate":"2026-09-23T20:00:00-07:00","endDate":"2026-09-23T21:00:00-07:00"}
        ]</script></head><body></body></html>`;

        const { events } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(2);
        expect(events[0].id).toBe('side-out-tsunami-open-play-2026-09-23-1700');
        expect(events[1].id).toBe('side-out-tsunami-open-play-2026-09-23-2000');
        expect(events[0].id).not.toBe(events[1].id);
    });

    it('defaults to a 2-hour duration when endDate is missing or invalid', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"Anniversary Tournament","startDate":"2026-09-26T08:00:00-07:00","url":"https://app.courtreserve.com/Online/Events/Details/16870/1?resId=1"}
        ]</script></head><body></body></html>`;

        const { events } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(1);
        expect(events[0].duration.toHours()).toBe(2);
    });

    it('deduplicates events with the same CourtReserve reservation id', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"Dup Session","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T18:00:00-07:00","url":"https://app.courtreserve.com/online/publicbookings/16870?tab=explore&eventId=1&reservationId=999"},
            {"@type":"SportsEvent","name":"Dup Session","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T18:00:00-07:00","url":"https://app.courtreserve.com/online/publicbookings/16870?tab=explore&eventId=1&reservationId=999"}
        ]</script></head><body></body></html>`;

        const { events } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(1);
    });

    it('excludes events that start before "now"', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"Past Session","startDate":"2026-08-01T17:00:00-07:00","endDate":"2026-08-01T18:00:00-07:00","url":"https://app.courtreserve.com/Online/Events/Details/16870/1?resId=1"},
            {"@type":"SportsEvent","name":"Future Session","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T18:00:00-07:00","url":"https://app.courtreserve.com/Online/Events/Details/16870/2?resId=2"}
        ]</script></head><body></body></html>`;

        const { events } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(1);
        expect(events[0].summary).toBe('Future Session');
    });

    it('skips non-SportsEvent JSON-LD blocks (e.g. the venue location block) without emitting an error', () => {
        const html = `<html><head>
            <script type="application/ld+json">{"@type":"SportsActivityLocation","name":"Sideout Tsunami Pickleball Center"}</script>
            <script type="application/ld+json">[
                {"@type":"SportsEvent","name":"Open Play","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T18:00:00-07:00","url":"https://app.courtreserve.com/Online/Events/Details/16870/3?resId=3"}
            ]</script>
        </head><body></body></html>`;

        const { events, errors } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(1);
        expect(errors).toHaveLength(0);
    });

    it('emits a ParseError for a JSON-LD script block that fails to parse as JSON', () => {
        const html = `<html><head>
            <script type="application/ld+json">{not valid json</script>
            <script type="application/ld+json">[
                {"@type":"SportsEvent","name":"Open Play","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T18:00:00-07:00","url":"https://app.courtreserve.com/Online/Events/Details/16870/4?resId=4"}
            ]</script>
        </head><body></body></html>`;

        const { events, errors } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(1);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('Failed to parse JSON-LD');
    });

    it('emits a ParseError for a SportsEvent missing a name', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","startDate":"2026-09-23T17:00:00-07:00","endDate":"2026-09-23T18:00:00-07:00"}
        ]</script></head><body></body></html>`;

        const { events, errors } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('missing name');
    });

    it('emits a ParseError for a SportsEvent missing a startDate', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"Mystery Session","endDate":"2026-09-23T18:00:00-07:00"}
        ]</script></head><body></body></html>`;

        const { events, errors } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('missing startDate');
    });

    it('emits a ParseError for a SportsEvent with an unparseable startDate', () => {
        const html = `<html><head><script type="application/ld+json">[
            {"@type":"SportsEvent","name":"Broken Date Session","startDate":"not-a-date","endDate":"2026-09-23T18:00:00-07:00"}
        ]</script></head><body></body></html>`;

        const { events, errors } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
        expect(errors[0].reason).toContain('Could not parse startDate');
    });

    it('emits a ParseError when no JSON-LD SportsEvent entries are found', () => {
        const html = `<html><head>
            <script type="application/ld+json">{"@type":"Organization","name":"Sideout Tsunami"}</script>
        </head><body></body></html>`;

        const { events, errors } = extractSideOutTsunamiEvents(html, NOW);
        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('ParseError');
    });
});
