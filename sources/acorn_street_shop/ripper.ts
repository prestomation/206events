import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { ZonedDateTime, LocalDateTime, Duration, ZoneId } from "@js-joda/core";
import { decode } from "html-entities";
import '@js-joda/timezone';

// Acorn Street Shop runs its class calendar through Rain POS's "events
// module" — a server-rendered month-grid (no JS needed). The month view is
// requested with a NUMERIC month (1-12); a 3-letter abbreviation (as this
// module's own day-detail links use, e.g. "month=Sep") is silently ignored
// by the *month-view* endpoint and it falls back to rendering the current
// month instead. Verified live: `month=10` renders true October data (day 1
// lands on a Thursday, correct for Oct 2026), while `month=Oct` and
// `month=October` both quietly re-render September (the then-current month).
// See buildMonthUrl() below.

const VENUE_LOCATION = "Acorn Street Shop, 2818 NE 55th St, Seattle, WA 98105";

// Current month plus this many more, mirroring
// sources/queen_anne_book_company/ripper.ts's MONTHS_AHEAD pattern.
const MONTHS_AHEAD = 3;

const DEFAULT_DURATION = Duration.ofHours(1);

const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)',
};

// Each calEvent's own onclick carries the abbreviated month name the *day
// detail* endpoint expects (distinct from the numeric month the *month-view*
// endpoint above requires) — map it back to a numeric month for date math.
const MONTH_ABBR: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const ONCLICK_FIELDS_PATTERN = /year=(\d{4})&month=([A-Za-z]{3})&day=(\d{1,2})&eventId=(\d+)/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})\s*(am|pm)(?:\s+to\s+(\d{1,2}):(\d{2})\s*(am|pm))?$/i;

// Builds one month's request URL, preserving whatever query params are
// already on the configured base URL (e.g. pageComponentId) and setting
// numeric year/month — see the MUST-BE-NUMERIC note above.
export function buildMonthUrl(baseUrl: string, year: number, month: number): string {
    const url = new URL(baseUrl);
    url.searchParams.set('year', String(year));
    url.searchParams.set('month', String(month));
    return url.toString();
}

export interface AcornCalendarEntry {
    eventId: string;
    year: number;
    month: number;  // 1-12
    day: number;
    timeRaw: string;
    title: string;
    detailUrl: string;
}

// Rain POS's own markup fronts a "Private" one-on-one lesson booking (which
// sometimes carries a real customer name, e.g. "Private Class with Gregory"
// or "Classroom reserved for Mary & Tyler") the same as any public class.
// These are never real public events, and publishing one is a privacy
// problem — filtering belongs in the caller (see "Parse Methods Must Never
// Return Null" in AGENTS.md), not here.
export function isPrivateBooking(title: string): boolean {
    return /^private\b/i.test(title) || /reserved for/i.test(title);
}

// Extracts every `.calEvent` block on a rendered month-view page. One page
// can (and does) also render empty padding cells for the leading/trailing
// days of adjacent months — verified live those padding cells never carry
// their own `.calEvent` entries, so no cross-month de-dup is needed here;
// the caller still de-dupes defensively across month fetches.
//
// Each event's own onclick handler (`location='...&year=Y&month=Mon&day=D&
// eventId=N';`) carries its full date + id directly, which is more direct
// than reading the day number back off the enclosing `.calDayNum` link (and
// avoids needing to track which `.calCell` a `.calEvent` div is nested
// inside at all).
export function extractCalendarEntries(html: HTMLElement): AcornCalendarEntry[] {
    const entries: AcornCalendarEntry[] = [];

    for (const div of html.querySelectorAll('.calEvent')) {
        const onclick = div.getAttribute('onclick') ?? '';
        const urlMatch = onclick.match(/location='([^']+)'/);
        const detailUrl = urlMatch?.[1];
        const fields = detailUrl?.match(ONCLICK_FIELDS_PATTERN);
        if (!detailUrl || !fields) continue; // Malformed/unexpected markup — skip defensively.

        const [, yearStr, monthAbbr, dayStr, eventId] = fields;
        const month = MONTH_ABBR[monthAbbr];
        if (!month) continue;

        // `<b>TIME</b><br>TITLE` — TITLE may be followed by a decorative
        // `<img>`/`<div class="clearfix">` (contribute no text) or nothing.
        // `.text` concatenates all descendant text nodes in document order,
        // so removing the `<b>` element's own text from the front leaves
        // just the title text (see module tests for the exact live markup).
        const timeEl = div.querySelector('b');
        const timeRaw = timeEl?.text.trim() ?? '';
        const title = decode(div.text.replace(timeEl?.text ?? '', '')).replace(/\s+/g, ' ').trim();
        if (!title) continue;

        entries.push({
            eventId,
            year: parseInt(yearStr, 10),
            month,
            day: parseInt(dayStr, 10),
            timeRaw,
            title,
            detailUrl,
        });
    }

    return entries;
}

export function parseCalendarEntry(entry: AcornCalendarEntry, zone: ZoneId): RipperEvent {
    const timeMatch = entry.timeRaw.match(TIME_PATTERN);
    if (!timeMatch) {
        return { type: "ParseError", reason: `Unrecognized time text: "${entry.timeRaw}"`, context: entry.title };
    }

    const [, sh, sm, sMeridiem, eh, em, eMeridiem] = timeMatch;
    const startHour = to24Hour(parseInt(sh, 10), sMeridiem);
    const startMinute = parseInt(sm, 10);

    let date: ZonedDateTime;
    try {
        date = ZonedDateTime.of(
            LocalDateTime.of(entry.year, entry.month, entry.day, startHour, startMinute),
            zone
        );
    } catch (err) {
        return { type: "ParseError", reason: `Invalid event date "${entry.year}-${entry.month}-${entry.day} ${entry.timeRaw}": ${err}`, context: entry.title };
    }

    let duration = DEFAULT_DURATION;
    if (eh !== undefined) {
        const endHour = to24Hour(parseInt(eh, 10), eMeridiem);
        const endMinute = parseInt(em, 10);
        const rangeMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        // A stated end time at/before the start isn't trustworthy as a real
        // range (not observed live, but guard rather than publish a
        // negative/zero duration) — fall back to the default.
        if (rangeMinutes > 0) duration = Duration.ofMinutes(rangeMinutes);
    }

    const event: RipperCalendarEvent = {
        id: `acorn-street-${entry.eventId}-${date.toLocalDate().toString()}`,
        ripped: new Date(),
        date,
        duration,
        summary: entry.title,
        location: VENUE_LOCATION,
        url: entry.detailUrl,
        // No admission price is present in the static month-view HTML (or
        // the class detail page — it's rendered client-side); leave unset
        // so buildCostGaps (lib/discovery.ts) queues it for the
        // cost-resolver rather than guessing. No imageUrl either: the
        // month-view carries none, and unlike a venue-wide "no photos
        // exist" case (skipEventPhotos), individual class detail pages DO
        // carry distinct per-event photos (verified live: og:image differs
        // per class) — fetching them here would multiply live requests
        // per build, so that backfill is left to the normal photoGaps
        // queue / photo-resolver skill instead.
    };

    return event;
}

function to24Hour(hour: number, meridiem: string): number {
    const mer = meridiem.toLowerCase();
    if (mer === 'pm' && hour !== 12) return hour + 12;
    if (mer === 'am' && hour === 12) return 0;
    return hour;
}

// Deterministic hash of whatever the entry's own time text was, so the
// uncertainty-cache entry invalidates if the source later adds an end time.
function fingerprint(entry: AcornCalendarEntry): string {
    const material = `acorn-street-shop|${entry.eventId}|${entry.year}-${entry.month}-${entry.day}|${entry.timeRaw}`;
    let h = 5381;
    for (let i = 0; i < material.length; i++) {
        h = ((h << 5) + h + material.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16);
}

export default class AcornStreetShopRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const entries: AcornCalendarEntry[] = [];
        const seenKeys = new Set<string>();

        for (let i = 0; i < MONTHS_AHEAD; i++) {
            const monthDate = now.toLocalDate().plusMonths(i);
            const url = buildMonthUrl(ripper.config.url.toString(), monthDate.year(), monthDate.monthValue());

            const res = await fetchFn(url, { headers: REQUEST_HEADERS });
            if (!res.ok) {
                // The current month must succeed; a later month failing
                // (transient error) shouldn't fail the whole ripper.
                if (i === 0) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                continue;
            }

            const html = parseHtml(await res.text());
            for (const entry of extractCalendarEntries(html)) {
                const key = `${entry.eventId}-${entry.year}-${entry.month}-${entry.day}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                entries.push(entry);
            }
        }

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const entry of entries) {
            // Privacy filter belongs in the caller, not the parse method
            // (AGENTS.md: "Parse Methods Must Never Return Null").
            if (isPrivateBooking(entry.title)) continue;

            const result = parseCalendarEntry(entry, zone);
            if (!('date' in result)) {
                errors.push(result);
                continue;
            }
            if (result.date.isBefore(now)) continue; // Past event — intentional skip

            events.push(result);

            // No "to <end time>" in the raw listing text means we defaulted
            // the duration (see parseCalendarEntry) — flag it per
            // docs/event-uncertainty.md rather than silently guessing.
            if (!/\bto\b/i.test(entry.timeRaw)) {
                const uncertainty: UncertaintyError = {
                    type: "Uncertainty",
                    reason: `Listing gave only a start time ("${entry.timeRaw}"), no end time — duration defaulted to 1 hour`,
                    source: "acorn-street-shop",
                    unknownFields: ["duration"],
                    event: result,
                    partialFingerprint: fingerprint(entry),
                };
                errors.push(uncertainty);
            }
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }
}
