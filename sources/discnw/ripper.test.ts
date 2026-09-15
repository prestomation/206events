import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ZoneRegion } from '@js-joda/core';
import '@js-joda/timezone';
import DiscNWRipper, { parseDateRange } from './ripper.js';
import { Ripper, RipperCalendarEvent, RipperError } from '../../lib/config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const timezone = ZoneRegion.of('America/Los_Angeles');

// Real fixture markup captured from the live AJAX fragment
// (https://www.discnw.org/en_us/e/embedded/0/map_size/none) on 2026-09-15 —
// see sample-data.html for the full response these were extracted from.

// A genuine single-day attendable event (span 0 days).
const FRIZ_FEST_BLOCK = `<div class="px-1 py-2 striped-block ">
    <div class="row-fluid-always ">
        <div class="span2 text-center">
            <a href="/en_us/e/2026-fall-friz-fest-hat-tournament">
                <img alt="Screenshot" src="https://d36m266ykvepgv.cloudfront.net/uploads/media/fUD47AkoMw/s-60-60/screenshot.png" />
            </a>
        </div>
        <div class="span10">
            <div class="badge-line">
                <span class="badge">hat tournament</span> <span class="badge badge-info">registering now</span>
            </div>
            <a class="pull-right small btn" href="/en_us/e/2026-fall-friz-fest-hat-tournament/register?new=1"><span class="btn-label">Register</span></a>
            <h4 class="subtitled event-name">
                <a data-content-no-ajax="1" class="plain-link" href="/en_us/e/2026-fall-friz-fest-hat-tournament" data-content-safe="1">2026 Fall Friz Fest Hat Tournament</a>
            </h4>
            <ul class="flat-list event-meta-list meta">
                <li><svg class="svg-icon location-dot"></svg> Seattle, WA <span class="iti-flag us"></span></li>
                <li><svg class="svg-icon calendar-week"></svg> 10/18/26</li>
            </ul>
        </div>
    </div>
</div>`;

// A genuine short (2-day) tournament (span 1 day) — should be kept.
const SEATTLE_INVITE_BLOCK = `<div class="px-1 py-2 striped-block ">
    <div class="row-fluid-always ">
        <div class="span2 text-center">
            <a href="/en_us/e/2026-fall-hs-bx-seattle-invite">
                <img alt="Invite" src="https://d36m266ykvepgv.cloudfront.net/uploads/media/v0aJP5QewU/s-60-60/discnw-invite.png" />
            </a>
        </div>
        <div class="span10">
            <div class="badge-line">
                <span class="badge">tournament</span> <span class="badge badge-info">registering now</span>
            </div>
            <a class="pull-right small btn" href="/en_us/e/2026-fall-hs-bx-seattle-invite/register?new=1"><span class="btn-label">Register</span></a>
            <h4 class="subtitled event-name">
                <a data-content-no-ajax="1" class="plain-link" href="/en_us/e/2026-fall-hs-bx-seattle-invite" data-content-safe="1">2026 Fall HS Bx Seattle Invite</a>
            </h4>
            <ul class="flat-list event-meta-list meta">
                <li><svg class="svg-icon location-dot"></svg> SeaTac, WA <span class="iti-flag us"></span></li>
                <li><svg class="svg-icon calendar-week"></svg> 10/3/26 - 10/4/26</li>
            </ul>
        </div>
    </div>
</div>`;

// A season-long league — should be filtered out by the date-span rule, but
// still parses cleanly (not a ParseError).
const LONG_LEAGUE_BLOCK = `<div class="px-1 py-2 striped-block ">
    <div class="row-fluid-always ">
        <div class="span2 text-center">
            <a href="/en_us/e/2026-fall-mixed-hat-league">
                <img alt="Fall Hat League" src="https://d36m266ykvepgv.cloudfront.net/uploads/media/hau7UvD2RH/s-60-60/fall-hat-league.png" />
            </a>
        </div>
        <div class="span10">
            <div class="badge-line">
                <span class="badge">league</span>
            </div>
            <h4 class="subtitled event-name">
                <a data-content-no-ajax="1" class="plain-link" href="/en_us/e/2026-fall-mixed-hat-league" data-content-safe="1">2026 Fall Mixed Hat League</a>
            </h4>
            <ul class="flat-list event-meta-list meta">
                <li><svg class="svg-icon location-dot"></svg> Seattle, WA <span class="iti-flag us"></span></li>
                <li><svg class="svg-icon calendar-week"></svg> 9/4/26 - 11/13/26</li>
            </ul>
        </div>
    </div>
</div>`;

// A registration/application window spanning a full year — the extreme
// case of the same filtering rule.
const ELIGIBILITY_REVIEW_BLOCK = `<div class="px-1 py-2 striped-block ">
    <div class="row-fluid-always ">
        <div class="span2 text-center">
            <a href="/en_us/e/application-for-eligibility-review-2026-to-2027">
                <img alt="Logo" src="https://d36m266ykvepgv.cloudfront.net/uploads/media/Udw8Aa4Cya/s-100-43/logo.png" />
            </a>
        </div>
        <div class="span10">
            <div class="badge-line">
                <span class="badge">other</span> <span class="badge badge-info">registering now</span>
            </div>
            <h4 class="subtitled event-name">
                <a data-content-no-ajax="1" class="plain-link" href="/en_us/e/application-for-eligibility-review-2026-to-2027" data-content-safe="1">Application for Eligibility Review - 2026 to 2027</a>
            </h4>
            <ul class="flat-list event-meta-list meta">
                <li><svg class="svg-icon location-dot"></svg> Seattle, WA <span class="iti-flag us"></span></li>
                <li><svg class="svg-icon calendar-week"></svg> 6/1/26 - 5/31/27</li>
            </ul>
        </div>
    </div>
</div>`;

// A malformed listing — no title link and no date — should never crash and
// should never be silently dropped, only turned into a ParseError.
const MALFORMED_BLOCK = `<div class="px-1 py-2 striped-block ">
    <div class="row-fluid-always ">
        <div class="span10">
            <div class="badge-line"><span class="badge">other</span></div>
        </div>
    </div>
</div>`;

function futureDateStr(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const yy = String(d.getFullYear()).slice(-2);
    return `${d.getMonth() + 1}/${d.getDate()}/${yy}`;
}

function makeBlock(opts: { href: string; title: string; location: string; dateText: string; badge?: string }): string {
    return `<div class="px-1 py-2 striped-block ">
        <div class="row-fluid-always ">
            <div class="span10">
                <div class="badge-line"><span class="badge">${opts.badge ?? 'clinic'}</span></div>
                <h4 class="subtitled event-name">
                    <a class="plain-link" href="${opts.href}" data-content-safe="1">${opts.title}</a>
                </h4>
                <ul class="flat-list event-meta-list meta">
                    <li><svg class="svg-icon location-dot"></svg> ${opts.location}</li>
                    <li><svg class="svg-icon calendar-week"></svg> ${opts.dateText}</li>
                </ul>
            </div>
        </div>
    </div>`;
}

function mockRipper(tags: string[] = ['Sports']): Ripper {
    return {
        config: {
            name: 'discnw',
            url: new URL('https://www.discnw.org/en_us/e'),
            proxy: false,
            calendars: [
                {
                    name: 'discnw',
                    friendlyname: 'DiscNW Ultimate Frisbee Events',
                    timezone,
                    tags,
                },
            ],
        } as any,
    } as Ripper;
}

describe('parseDateRange', () => {
    it('parses a single date', () => {
        const range = parseDateRange('10/18/26');
        expect(range).not.toBeNull();
        expect(range!.start.toString()).toBe('2026-10-18');
        expect(range!.end.toString()).toBe('2026-10-18');
    });

    it('parses a date range', () => {
        const range = parseDateRange('9/4/26 - 11/13/26');
        expect(range).not.toBeNull();
        expect(range!.start.toString()).toBe('2026-09-04');
        expect(range!.end.toString()).toBe('2026-11-13');
    });

    it('returns null for unparseable text', () => {
        expect(parseDateRange('TBD')).toBeNull();
        expect(parseDateRange('')).toBeNull();
    });
});

describe('DiscNWRipper.parseBlock', () => {
    const ripper = new DiscNWRipper();

    it('parses a real single-day event block into a correct event', () => {
        const result = ripper.parseBlock(FRIZ_FEST_BLOCK, timezone);
        expect('type' in result).toBe(false);
        const event = result as RipperCalendarEvent;

        expect(event.id).toBe('2026-fall-friz-fest-hat-tournament');
        expect(event.summary).toBe('2026 Fall Friz Fest Hat Tournament');
        expect(event.url).toBe('https://www.discnw.org/en_us/e/2026-fall-friz-fest-hat-tournament');
        expect(event.location).toBe('Seattle, WA');
        expect(event.date.toLocalDate().toString()).toBe('2026-10-18');
        expect(event.date.hour()).toBe(12);
        expect(event.duration.toHours()).toBe(2);
        expect(event.description).toContain('DiscNW (Northwest Ultimate Association)');
    });

    it('parses a 2-day tournament block, using the start date', () => {
        const result = ripper.parseBlock(SEATTLE_INVITE_BLOCK, timezone);
        expect('type' in result).toBe(false);
        const event = result as RipperCalendarEvent;

        expect(event.id).toBe('2026-fall-hs-bx-seattle-invite');
        expect(event.location).toBe('SeaTac, WA');
        expect(event.date.toLocalDate().toString()).toBe('2026-10-03');
    });

    it('parses a long-range league block without error (filtering is the caller\'s job)', () => {
        const result = ripper.parseBlock(LONG_LEAGUE_BLOCK, timezone);
        expect('type' in result).toBe(false);
        expect((result as RipperCalendarEvent).date.toLocalDate().toString()).toBe('2026-09-04');
    });

    it('returns a ParseError, not null or a crash, for a block missing title/date', () => {
        const result = ripper.parseBlock(MALFORMED_BLOCK, timezone);
        expect(result).not.toBeNull();
        expect('type' in result).toBe(true);
        expect((result as RipperError).type).toBe('ParseError');
    });
});

describe('DiscNWRipper.rip', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('keeps short (<=1 day span) events, drops long league/registration ranges, and pairs kept events with an UncertaintyError for the missing start time', async () => {
        const shortBlock = makeBlock({
            href: '/en_us/e/2026-fall-gx-ms-youth-clinic',
            title: '2026 Fall Gx MS Youth Clinic',
            location: 'Seattle, WA',
            dateText: futureDateStr(10),
            badge: 'clinic',
        });
        const longBlock = makeBlock({
            href: '/en_us/e/2026-fall-mixed-hat-league',
            title: '2026 Fall Mixed Hat League',
            location: 'Seattle, WA',
            dateText: `${futureDateStr(5)} - ${futureDateStr(70)}`,
            badge: 'league',
        });
        const html = `<div class="striped-blocks">${shortBlock}${longBlock}${ELIGIBILITY_REVIEW_BLOCK.replace(/6\/1\/26/, futureDateStr(5)).replace(/5\/31\/27/, futureDateStr(400))}</div>`;

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(html),
        }));

        const calendars = await new DiscNWRipper().rip(mockRipper());
        expect(calendars).toHaveLength(1);
        const cal = calendars[0];

        expect(cal.events).toHaveLength(1);
        expect(cal.events[0].summary).toBe('2026 Fall Gx MS Youth Clinic');

        const uncertainty = cal.errors.find(e => e.type === 'Uncertainty');
        expect(uncertainty).toBeDefined();
        expect((uncertainty as any).unknownFields).toEqual(['startTime', 'duration']);
        expect((uncertainty as any).event.id).toBe('2026-fall-gx-ms-youth-clinic');
        expect((uncertainty as any).source).toBe('discnw');
    });

    it('reports a ParseError for a malformed block instead of silently dropping it', async () => {
        const html = `<div class="striped-blocks">${MALFORMED_BLOCK}</div>`;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(html),
        }));

        const calendars = await new DiscNWRipper().rip(mockRipper());
        const cal = calendars[0];

        expect(cal.events).toHaveLength(0);
        expect(cal.errors).toHaveLength(1);
        expect(cal.errors[0].type).toBe('ParseError');
    });

    it('drops a short-span event located outside Washington state', async () => {
        // DiscNW is a regional (WA/OR/BC) governing body, not Seattle-only —
        // per AGENTS.md a source must primarily serve Seattle audiences, so
        // an otherwise-genuine one-day event outside WA (e.g. a Corvallis, OR
        // clinic) must still be excluded even though its date span is short.
        const outOfStateBlock = makeBlock({
            href: '/en_us/e/2026-corvallis-one-day-clinic',
            title: '2026 Corvallis One-Day Clinic',
            location: 'Corvallis, OR',
            dateText: futureDateStr(10),
            badge: 'clinic',
        });
        const html = `<div class="striped-blocks">${outOfStateBlock}</div>`;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(html),
        }));

        const calendars = await new DiscNWRipper().rip(mockRipper());
        expect(calendars[0].events).toHaveLength(0);
        expect(calendars[0].errors).toHaveLength(0);
    });

    it('dedups events sharing the same detail-page URL', async () => {
        const block = makeBlock({
            href: '/en_us/e/2026-turkey-bowl',
            title: '2026 Turkey Bowl',
            location: 'Seattle, WA',
            dateText: futureDateStr(20),
            badge: 'hat tournament',
        });
        const html = `<div class="striped-blocks">${block}${block}</div>`;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(html),
        }));

        const calendars = await new DiscNWRipper().rip(mockRipper());
        expect(calendars[0].events).toHaveLength(1);
    });

    it('throws on a non-ok response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' }));
        await expect(new DiscNWRipper().rip(mockRipper())).rejects.toThrow(/500/);
    });

    it('parses the real captured AJAX fragment end-to-end', async () => {
        // sample-data.html is the real response captured live from
        // https://www.discnw.org/en_us/e/embedded/0/map_size/none on
        // 2026-09-15 (see that file's header comment). This exercises the
        // real markup shape — including the 3-<li> "multi-division league"
        // blocks the position-based (not icon-based) meta parsing exists to
        // handle — rather than only the hand-trimmed fixtures above.
        const html = readFileSync(join(__dirname, 'sample-data.html'), 'utf-8');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(html),
        }));

        const calendars = await new DiscNWRipper().rip(mockRipper());
        const cal = calendars[0];

        // No ParseErrors — every block in the real fragment should parse
        // cleanly (whether or not it survives the span/state filters).
        expect(cal.errors.filter(e => e.type === 'ParseError')).toHaveLength(0);

        // The long-running league/registration/practice listings must be
        // filtered out...
        const summaries = cal.events.map(e => e.summary);
        expect(summaries).not.toContain('2026 Fall Mixed Hat League');
        expect(summaries).not.toContain('Application for Eligibility Review - 2026 to 2027');
        expect(summaries).not.toContain('2026 Corvallis G.O.A.T.s Fall Fling'); // out-of-state too

        // ...while genuine short single/multi-day events survive.
        expect(summaries).toContain('2026 Fall Friz Fest Hat Tournament');
        expect(summaries.length).toBeGreaterThan(0);

        // Every surviving event is located in Washington state.
        for (const event of cal.events) {
            expect(event.location).toMatch(/,\s*WA$/i);
        }

        // Every kept event is paired with an Uncertainty error for the
        // missing start time.
        const uncertainEventIds = new Set(
            cal.errors.filter(e => e.type === 'Uncertainty').map(e => (e as any).event.id)
        );
        for (const event of cal.events) {
            expect(uncertainEventIds.has(event.id)).toBe(true);
        }
    });
});
