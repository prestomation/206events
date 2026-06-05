import { describe, it, expect } from 'vitest';
import { ZoneId } from '@js-joda/core';
import '@js-joda/timezone';
import { InstagramRipper } from './instagram.js';
import { InstagramCache, InstagramCacheEntry } from '../instagram-cache.js';
import { RipperCalendarEvent, RipperError, Ripper, RipperConfig, UncertaintyError } from './schema.js';

const tz = ZoneId.of('America/Los_Angeles');

// InstagramRipper reads instagram-cache.json from disk; subclass it to inject a
// fixture cache so tests never touch the filesystem or the network.
class FixtureInstagramRipper extends InstagramRipper {
    constructor(private fixture: InstagramCache) {
        super();
    }
    protected async loadCache(): Promise<InstagramCache> {
        return this.fixture;
    }
}

function cache(entries: Record<string, InstagramCacheEntry>): InstagramCache {
    return { version: 1, entries };
}

// Build a minimal Ripper wrapper for a single-calendar `instagram` source.
function makeRipper(username: string, extraConfig: Record<string, unknown> = {}): Ripper {
    const config = {
        name: 'instagram_test',
        description: 'Test',
        url: new URL('https://www.instagram.com/test/'),
        friendlyLink: 'https://www.instagram.com/test/',
        disabled: false,
        proxy: false as const,
        needsBrowser: false,
        expectEmpty: false,
        geo: null,
        calendars: [
            {
                name: 'main',
                friendlyname: 'Test IG',
                timezone: tz,
                tags: ['Trivia'],
                config: { username, ...extraConfig },
            },
        ],
    } as unknown as RipperConfig;
    return { config, ripperImpl: new InstagramRipper() };
}

const FULL_EVENT: InstagramCacheEntry = {
    isEvent: true,
    title: 'Trivia Night at The Pub',
    date: '2026-06-12',
    startTime: '19:30',
    durationSeconds: 7200,
    location: '123 Main St, Seattle, WA 98101',
    description: 'Weekly pub trivia',
    imageUrl: 'https://example.com/flyer.jpg',
    permalink: 'https://www.instagram.com/p/ABC123/',
    postFingerprint: 'fp-abc',
    readAt: '2026-06-05',
    source: 'agent',
};

describe('InstagramRipper.toEvents', () => {
    const ripper = new InstagramRipper();

    it('turns a fully-resolved entry into one event with a stable id', () => {
        const out = ripper.toEvents('triviahost', 'ABC123', FULL_EVENT, tz, undefined, 2, 'instagram_test', 'main');
        const events = out.filter(e => 'date' in e) as RipperCalendarEvent[];
        const errors = out.filter(e => 'type' in e) as RipperError[];

        expect(events.length).toBe(1);
        expect(errors.length).toBe(0);
        const ev = events[0];
        expect(ev.id).toBe('triviahost-ABC123');
        expect(ev.summary).toBe('Trivia Night at The Pub');
        expect(ev.date.hour()).toBe(19);
        expect(ev.date.minute()).toBe(30);
        expect(ev.date.zone()).toEqual(tz);
        expect(ev.duration.seconds()).toBe(7200);
        expect(ev.location).toBe('123 Main St, Seattle, WA 98101');
        expect(ev.url).toBe('https://www.instagram.com/p/ABC123/');
        expect(ev.imageUrl).toBe('https://example.com/flyer.jpg');
    });

    it('emits an UncertaintyError for a missing start time and uses a placeholder', () => {
        const entry: InstagramCacheEntry = { ...FULL_EVENT, startTime: undefined };
        const out = ripper.toEvents('triviahost', 'NOTIME', entry, tz, undefined, 2, 'instagram_test', 'main');
        const events = out.filter(e => 'date' in e) as RipperCalendarEvent[];
        const uncertainties = out.filter(e => (e as RipperError).type === 'Uncertainty') as UncertaintyError[];

        expect(events.length).toBe(1);
        expect(events[0].date.hour()).toBe(12); // placeholder noon
        expect(uncertainties.length).toBe(1);
        expect(uncertainties[0].unknownFields).toContain('startTime');
        expect(uncertainties[0].event.id).toBe(events[0].id);
        expect(uncertainties[0].partialFingerprint).toBe('fp-abc');
    });

    it('flags location uncertain only when neither the entry nor a default provides one', () => {
        const entry: InstagramCacheEntry = { ...FULL_EVENT, location: undefined };

        const noDefault = ripper.toEvents('h', 'P1', entry, tz, undefined, 2, 's', 'main');
        const u1 = noDefault.filter(e => (e as RipperError).type === 'Uncertainty') as UncertaintyError[];
        expect(u1[0].unknownFields).toContain('location');

        const withDefault = ripper.toEvents('h', 'P2', entry, tz, '456 Default Ave, Seattle, WA', 2, 's', 'main');
        const ev = withDefault.filter(e => 'date' in e)[0] as RipperCalendarEvent;
        const u2 = withDefault.filter(e => (e as RipperError).type === 'Uncertainty') as UncertaintyError[];
        expect(ev.location).toBe('456 Default Ave, Seattle, WA');
        expect(u2.length).toBe(0);
    });

    it('falls back to defaultDurationHours when durationSeconds is absent', () => {
        const entry: InstagramCacheEntry = { ...FULL_EVENT, durationSeconds: undefined };
        const out = ripper.toEvents('h', 'P', entry, tz, undefined, 3, 's', 'main');
        const ev = out.filter(e => 'date' in e)[0] as RipperCalendarEvent;
        expect(ev.duration.toHours()).toBe(3);
    });

    it('skips non-events and undated entries', () => {
        const notEvent: InstagramCacheEntry = { isEvent: false, reason: 'promo', readAt: '2026-06-05', source: 'agent' };
        const undated: InstagramCacheEntry = { isEvent: true, title: 'Someday', readAt: '2026-06-05', source: 'agent' };
        expect(ripper.toEvents('h', 'P1', notEvent, tz, undefined, 2, 's', 'main')).toEqual([]);
        expect(ripper.toEvents('h', 'P2', undated, tz, undefined, 2, 's', 'main')).toEqual([]);
    });

    it('returns a ParseError (never null) for malformed entries', () => {
        const noTitle: InstagramCacheEntry = { isEvent: true, date: '2026-06-12', readAt: '2026-06-05', source: 'agent' };
        const badDate: InstagramCacheEntry = { ...FULL_EVENT, date: 'next Tuesday' };

        const r1 = ripper.toEvents('h', 'P1', noTitle, tz, undefined, 2, 's', 'main');
        const r2 = ripper.toEvents('h', 'P2', badDate, tz, undefined, 2, 's', 'main');
        expect((r1[0] as RipperError).type).toBe('ParseError');
        expect((r2[0] as RipperError).type).toBe('ParseError');
    });
});

describe('InstagramRipper.rip', () => {
    it('selects only the calendar username and splits events from errors', async () => {
        const ripper = new FixtureInstagramRipper(cache({
            'triviahost:ABC123': FULL_EVENT,
            'triviahost:PROMO': { isEvent: false, reason: 'announcement', readAt: '2026-06-05', source: 'agent' },
            'someoneelse:ZZZ': { ...FULL_EVENT, title: 'Other account event' },
        }));
        const r = makeRipper('triviahost');
        r.ripperImpl = ripper;
        const calendars = await ripper.rip(r);

        expect(calendars.length).toBe(1);
        expect(calendars[0].events.length).toBe(1);
        expect(calendars[0].events[0].summary).toBe('Trivia Night at The Pub');
        expect(calendars[0].errors.length).toBe(0);
    });

    it('reports a ParseError when username config is missing', async () => {
        const ripper = new FixtureInstagramRipper(cache({}));
        const r = makeRipper('unused');
        // Strip the username to simulate a misconfigured calendar.
        (r.config.calendars[0].config as Record<string, unknown>).username = undefined;
        r.ripperImpl = ripper;
        const calendars = await ripper.rip(r);
        expect(calendars[0].events.length).toBe(0);
        expect(calendars[0].errors[0].type).toBe('ParseError');
    });
});
