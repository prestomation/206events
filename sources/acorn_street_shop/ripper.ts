import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
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

// A class's onclick link (events.htm?...&eventId=N) 302s to a Rain POS
// "product" page (/module/class/<id>/<slug>) whose *widget* renders
// client-side (Angular-style `{{...}}` bindings — no time/price visible in
// the raw response), but the same page also embeds a server-rendered
// `var event_data = JSON.stringify({...})` blob carrying every upcoming
// section (date, time range, price) for that class product. Verified live
// across 8 distinct class titles (Beginning Knitting 101, Intermediate
// Knitting, Advanced Beginner Workshop, Introduction to Portuguese
// Knitting, Introduction to Felted Repair and Darning, Fundamentals of
// Hand Embroidery, Swiss Darning, The Stacktangle Scarf) — every one
// carries a "price" (plain USD integer string, no decimals/ranges seen)
// and per-section "time" as "H:MMam - H:MMpm".
//
// A *free* recurring event (Knit Night!, vendor pop-ups, Stitch n Bitch)
// uses a different, non-commerce "Event Details" template (When/Where/
// Details rows) that never carries this blob — there's no product to
// price, so its absence is itself the free/no-cost signal (see rip()).
const EVENT_DATA_MARKER = "var event_data = JSON.stringify(";

export interface AcornEventSection {
    event_id: string;
    time: string; // "2:30pm - 4:30pm"
}

export interface AcornEventDataGroup {
    price: string; // plain USD integer string, e.g. "80"
    sections: AcornEventSection[];
}

// Extracts the class-product page's embedded `event_data` blob (see
// EVENT_DATA_MARKER above). Returns null when the marker isn't present at
// all (the "Event Details"/free template) or the JSON can't be parsed
// (malformed/unexpected markup — degrade to "unknown", never throw).
export function extractEventDataBlob(html: string): Record<string, AcornEventDataGroup> | null {
    const idx = html.indexOf(EVENT_DATA_MARKER);
    if (idx === -1) return null;

    const start = idx + EVENT_DATA_MARKER.length;
    let depth = 0;
    let i = start;
    for (; i < html.length; i++) {
        const c = html[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    if (depth !== 0) return null; // Unbalanced — bail rather than slice garbage.

    try {
        return JSON.parse(html.slice(start, i));
    } catch {
        return null;
    }
}

// Converts the class-product page's "2:30pm - 4:30pm" section time into the
// " to "-separated form TIME_PATTERN (and parseCalendarEntry) already
// understand, so the fetched detail data reuses the exact same, already
// tested time-range math instead of a second parallel implementation.
export function normalizeDetailTime(time: string): string {
    return time.replace(/\s*-\s*/, ' to ').trim();
}

// What rip() learned about one eventId from its detail page, keyed by the
// occurrence's own event_id. `free` means the page was the non-commerce
// "Event Details" template (no event_data blob at all — see
// EVENT_DATA_MARKER above), which never carries a price.
export interface AcornDetailInfo {
    time?: string;   // raw "H:MMam - H:MMpm" from a matched section, if any
    price?: string;
    free?: boolean;
}

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
        // Cost isn't known from the raw month-view entry alone — rip()
        // fills it in afterwards from the class-product page's event_data
        // blob (see extractEventDataBlob), or leaves it unset so
        // buildCostGaps (lib/discovery.ts) queues it for the cost-resolver
        // when the detail fetch didn't resolve a price. No imageUrl either:
        // the month-view carries none, and unlike a venue-wide "no photos
        // exist" case (skipEventPhotos), individual class detail pages DO
        // carry distinct per-event photos (verified live: og:image differs
        // per class) — fetching them here would multiply live requests
        // per build for a field that's cosmetic rather than core data, so
        // that backfill is left to the normal photoGaps queue /
        // photo-resolver skill instead.
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

        // Enrich with detail-page data (exact end time + price) so most
        // events need neither a duration-uncertainty nor a cost-gap entry.
        // One fetch per distinct eventId, deduped further by every sibling
        // event_id a class-product page's event_data blob resolves in the
        // same request (see extractEventDataBlob) — a handful of distinct
        // class titles plus one fetch per free-template recurring event,
        // not one fetch per calendar occurrence.
        const detailByEventId = new Map<string, AcornDetailInfo>();
        const attemptedEventIds = new Set<string>();

        for (const entry of entries) {
            if (isPrivateBooking(entry.title)) continue;
            if (attemptedEventIds.has(entry.eventId)) continue;
            attemptedEventIds.add(entry.eventId);

            try {
                const res = await fetchFn(entry.detailUrl, { headers: REQUEST_HEADERS });
                if (!res.ok) continue;

                const detailHtml = await res.text();
                const blob = extractEventDataBlob(detailHtml);
                if (blob) {
                    for (const group of Object.values(blob)) {
                        for (const section of group.sections) {
                            detailByEventId.set(section.event_id, { time: section.time, price: group.price });
                            attemptedEventIds.add(section.event_id);
                        }
                    }
                } else {
                    // No event_data blob at all → the non-commerce "Event
                    // Details" template, which never carries a price.
                    detailByEventId.set(entry.eventId, { free: true });
                }
            } catch {
                // Network hiccup — leave this eventId undetermined; the
                // existing uncertainty/cost-gap flow below still applies.
            }
        }

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const entry of entries) {
            // Privacy filter belongs in the caller, not the parse method
            // (AGENTS.md: "Parse Methods Must Never Return Null").
            if (isPrivateBooking(entry.title)) continue;

            const detail = detailByEventId.get(entry.eventId);
            // A matched section's own time range is authoritative for this
            // specific occurrence — reuse it in place of the month-view's
            // start-only text so parseCalendarEntry computes an exact
            // duration instead of defaulting to one hour.
            const parseEntry = detail?.time ? { ...entry, timeRaw: normalizeDetailTime(detail.time) } : entry;

            const result = parseCalendarEntry(parseEntry, zone);
            if (!('date' in result)) {
                errors.push(result);
                continue;
            }
            if (result.date.isBefore(now)) continue; // Past event — intentional skip

            if (detail?.free) {
                result.cost = { min: 0 };
            } else if (detail?.price !== undefined) {
                const priceNum = Number(detail.price);
                if (!Number.isNaN(priceNum)) result.cost = { min: priceNum };
            }

            events.push(result);

            // No "to <end time>" in the (possibly detail-enriched) time text
            // means duration still defaulted (see parseCalendarEntry), and
            // no cost was resolved above — flag whichever is still unknown
            // per docs/event-uncertainty.md rather than silently guessing.
            // The fingerprint always hashes the raw month-view entry (never
            // parseEntry) so it stays stable regardless of what the detail
            // fetch did or didn't find.
            const unknownFields: UncertaintyField[] = [];
            const reasons: string[] = [];
            if (!/\bto\b/i.test(parseEntry.timeRaw)) {
                unknownFields.push("duration");
                reasons.push(`Listing gave only a start time ("${entry.timeRaw}"), no end time — duration defaulted to 1 hour`);
            }
            if (result.cost === undefined) {
                unknownFields.push("cost");
                reasons.push("No admission price found on the source or detail page");
            }
            if (unknownFields.length > 0) {
                const uncertainty: UncertaintyError = {
                    type: "Uncertainty",
                    reason: reasons.join("; "),
                    source: "acorn-street-shop",
                    unknownFields,
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
