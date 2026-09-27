import { describe, it, expect } from 'vitest';
import SEAtodayRipper from './ripper.js';
import { RipperCalendarEvent, UncertaintyError } from '../../lib/config/schema.js';
import { LocalDate, ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';

const timezone = ZoneRegion.of('America/Los_Angeles');

// Generate a UTC date string within the lookahead window (days from today)
function futureUTC(daysFromNow: number, hour: number): string {
    const date = LocalDate.now().plusDays(daysFromNow);
    return `${date}T${String(hour).padStart(2, '0')}:00:00Z`;
}

function makeEvent(overrides: Record<string, any> = {}): any {
    return {
        PId: 1000,
        Name: 'Test Event',
        Description: '<p>A test event</p>',
        StartUTC: futureUTC(1, 20),
        EndUTC: futureUTC(1, 22),
        Venue: 'Test Venue',
        Address: '123 Main St',
        CityState: 'Seattle, WA',
        Tags: [2, 5],
        LargeImg: 'https://example.com/img.jpg',
        ...overrides
    };
}

describe('SEAtodayRipper', () => {
    const ripper = new SEAtodayRipper();
    const baseUrl = 'https://seatoday.6amcity.com/events';

    it('should parse events from sample data', () => {
        const sampleData = [
            makeEvent({ PId: 1, Name: 'Art Walk' }),
            makeEvent({ PId: 2, Name: 'Food Festival', StartUTC: futureUTC(2, 18) }),
            makeEvent({ PId: 3, Name: 'Concert Night', StartUTC: futureUTC(3, 2) }),
        ];

        const events = ripper.parseEvents(sampleData, timezone, baseUrl);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(3);
        expect(calEvents[0].summary).toBe('Art Walk');
        expect(calEvents[1].summary).toBe('Food Festival');
        expect(calEvents[2].summary).toBe('Concert Night');

        for (const event of calEvents) {
            expect(event.date).toBeDefined();
            expect(event.duration).toBeDefined();
            expect(event.location).toContain('Seattle');
        }
    });

    it('should filter by tags when filterTags config is provided', () => {
        const sampleData = [
            makeEvent({ PId: 1, Name: 'Art Event', Tags: [2, 3] }),
            makeEvent({ PId: 2, Name: 'Food Event', Tags: [12] }),
            makeEvent({ PId: 3, Name: 'Sports Event', Tags: [6] }),
        ];

        const config = { filterTags: [12] };
        const events = ripper.parseEvents(sampleData, timezone, baseUrl, config);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].summary).toBe('Food Event');
    });

    it('should extract geo parameters from portal settings', () => {
        const mockJs = `var cSparkLocals = {"slug":"SEAT","ppid":9228,"siteUrl":"https://portal.cityspark.com/","baseUrl":"https://seatoday.6amcity.com/events/","lat":47.6062095,"lng":-122.3320708,"distance":20};const x = 1;`;

        // extractCSparkLocals is private, but we can test it via the class prototype
        const settings = (ripper as any).extractCSparkLocals(mockJs);

        expect(settings.slug).toBe('SEAT');
        expect(settings.ppid).toBe(9228);
        expect(settings.lat).toBeCloseTo(47.606, 2);
        expect(settings.lng).toBeCloseTo(-122.332, 2);
        expect(settings.distance).toBe(20);
    });

    it('should strip HTML from descriptions', () => {
        const sampleData = [
            makeEvent({ PId: 1, Description: '<p>Hello &amp; <strong>world</strong></p>' }),
        ];

        const events = ripper.parseEvents(sampleData, timezone, baseUrl);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].description).toBe('Hello & world');
    });

    it('should handle events with missing optional fields', () => {
        const sampleData = [
            makeEvent({
                PId: 1,
                Description: undefined,
                Venue: undefined,
                Address: undefined,
                LargeImg: undefined,
                MediumImg: undefined,
                SmallImg: undefined,
            }),
        ];

        const events = ripper.parseEvents(sampleData, timezone, baseUrl);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents).toHaveLength(1);
        expect(calEvents[0].summary).toBe('Test Event');
        expect(calEvents[0].description).toBeUndefined();
        expect(calEvents[0].location).toBeUndefined();
        expect(calEvents[0].imageUrl).toBeUndefined();
    });

    // Regression test for GitHub issue #1623: CitySpark's Venue field was
    // wrong for a Seattle Public Library exhibit, so the site geocoded the
    // event to an unrelated address. The description carries a separate
    // "Location Link:" value that should be trusted instead when it
    // conflicts with Venue.
    it('should fall back to the description\'s Location Link when Venue is missing', () => {
        const sampleData = [
            makeEvent({
                PId: 1,
                Venue: undefined,
                Address: undefined,
                Description: '<p>Story time.</p>\n\nLocation Link:\n\nBallard Branch\n\nRoom Location: Story Room',
            }),
        ];

        const events = ripper.parseEvents(sampleData, timezone, baseUrl);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];

        expect(calEvents[0].location).toBe('Ballard Branch, Seattle, WA');
    });

    it('should flag a location conflict when Venue disagrees with the Location Link, without discarding Venue', () => {
        const sampleData = [
            makeEvent({
                PId: 18572479,
                Venue: 'Northwest Worklofts (Commons)',
                Address: undefined,
                Description: 'Sunday details.\n\nLocation Link:\n\nCentral Library\n\nRoom Location: Level 8 - Gallery',
            }),
        ];

        const events = ripper.parseEvents(sampleData, timezone, baseUrl);
        const calEvents = events.filter(e => 'date' in e) as RipperCalendarEvent[];
        const uncertainties = events.filter(e => 'type' in e && e.type === 'Uncertainty') as UncertaintyError[];

        // Venue-derived location is still published as the placeholder value
        // (never silently overwritten with a guess)...
        expect(calEvents[0].location).toBe('Northwest Worklofts (Commons), Seattle, WA');
        // ...but the conflict is flagged for the uncertainty resolver, along
        // with the pre-existing cost gap (Free/Price/IsTicketed all unset).
        expect(uncertainties).toHaveLength(1);
        expect(uncertainties[0].unknownFields).toEqual(['cost', 'location']);
        expect(uncertainties[0].reason).toContain('Northwest Worklofts (Commons)');
        expect(uncertainties[0].reason).toContain('Central Library');
    });

    it('should not flag a conflict when the Location Link is consistent with Venue', () => {
        const sampleData = [
            makeEvent({
                PId: 1,
                Venue: 'Central Library',
                Address: undefined,
                Description: 'Details.\n\nLocation Link:\n\nCentral Library\n\nRoom Location: Level 8',
            }),
        ];

        const events = ripper.parseEvents(sampleData, timezone, baseUrl);
        const uncertainties = events.filter(e => 'type' in e && e.type === 'Uncertainty') as UncertaintyError[];

        expect(uncertainties).toHaveLength(1);
        expect(uncertainties[0].unknownFields).toEqual(['cost']);
    });

    it('should compute a deterministic cost-only fingerprint unaffected by the location field', () => {
        // Two events with identical PId/Free/Price/IsTicketed but different
        // Venue/description text must produce the same fingerprint, proving
        // the location check does not perturb the pre-existing cost-only
        // fingerprint format that 800+ committed cache entries rely on.
        const sampleData = [
            makeEvent({ PId: 42, Venue: 'Venue A', Description: '<p>No location link here.</p>' }),
            makeEvent({ PId: 42, Venue: 'Venue B', Description: '<p>Also no location link.</p>' }),
        ];

        const events = ripper.parseEvents(sampleData, timezone, baseUrl);
        const uncertainties = events.filter(e => 'type' in e && e.type === 'Uncertainty') as UncertaintyError[];

        expect(uncertainties).toHaveLength(2);
        expect(uncertainties[0].unknownFields).toEqual(['cost']);
        expect(uncertainties[1].unknownFields).toEqual(['cost']);
        expect(uncertainties[0].partialFingerprint).toBe(uncertainties[1].partialFingerprint);
    });
});
