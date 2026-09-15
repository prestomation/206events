import { ChronoUnit, Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { parse } from "node-html-parser";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// DiscNW (Northwest Ultimate Association) has no ICS/API, but its event
// list is fetchable as a static AJAX HTML fragment — the same request the
// site's own JS makes to render the "Events" list/map view. It returns the
// entire future event list in one response (not paginated/day-templated),
// so this ripper implements IRipper directly with a single fetch rather
// than extending HTMLRipper (which loops per-day and would re-fetch/re-parse
// this identical full list once per lookahead day).
const BASE_URL = "https://www.discnw.org";
const AJAX_URL = `${BASE_URL}/en_us/e/embedded/0/map_size/none`;

// DiscNW's event list never includes a time of day — only a date (or date
// range). We still emit an event so it shows up on the calendar (using
// these placeholders), paired with an UncertaintyError so the
// event-uncertainty-resolver skill can fill in the real time later. See
// docs/event-uncertainty.md.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_DURATION = Duration.ofHours(2);

// Most listed items are season-long league schedules, registration
// windows, or coaching/volunteer applications spanning weeks to a year —
// not discrete events a person would attend on a specific day. Only items
// whose date span is this many days or fewer (a single day, or a short
// 1-2 day tournament/clinic) are genuine attendable events. This is
// enforced in rip(), not in parseBlock() — see "Parse Methods Must Never
// Return Null" in AGENTS.md: filtering belongs in the caller.
const MAX_EVENT_SPAN_DAYS = 1;

export interface DateRange {
    start: LocalDate;
    end: LocalDate;
}

// Parses DiscNW's "M/D/YY" or "M/D/YY - M/D/YY" date-meta text into a
// LocalDate range. The site's 2-digit year is always in the 2000s.
// Returns null for anything that doesn't match (e.g. "TBD").
export function parseDateRange(dateText: string): DateRange | null {
    const m = dateText.match(
        /(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2}))?/
    );
    if (!m) return null;

    const start = twoDigitYearDate(m[1], m[2], m[3]);
    if (!start) return null;
    const end = m[4] ? twoDigitYearDate(m[4], m[5], m[6]) : start;
    if (!end) return null;

    return { start, end };
}

function twoDigitYearDate(monthStr: string, dayStr: string, yearStr: string): LocalDate | null {
    try {
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        const year = 2000 + parseInt(yearStr, 10);
        return LocalDate.of(year, month, day);
    } catch {
        return null;
    }
}

// Collapses a DOM text run's whitespace (node-html-parser preserves the
// source's original indentation/newlines inside .text) into a single
// trimmed string.
function cleanText(raw: string | undefined): string | undefined {
    if (raw === undefined) return undefined;
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : undefined;
}

function capitalize(s: string): string {
    return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// Cheap deterministic hash; only needs stability, not crypto strength.
// Invalidates a cached uncertainty resolution if the source's date text
// for this event later changes (e.g., it gets rescheduled).
function fingerprint(title: string, dateText: string): string {
    const s = `${title}|${dateText}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

export default class DiscNWRipper implements IRipper {

    // Parses one <div class="striped-block"> event listing into an event.
    // Never returns null — a block missing an expected field (title, url,
    // date) produces a ParseError instead, per AGENTS.md's "Parse Methods
    // Must Never Return Null". Date-span filtering and dedup are the
    // caller's job (rip()), not this method's.
    public parseBlock(blockHtml: string, timezone: ZoneId): RipperEvent {
        const root = parse(blockHtml);

        // The type badge ("league", "tournament", "hat tournament", ...)
        // is always the first .badge in the badge-line; a second
        // "registering now" badge (class badge-info) may follow it.
        const badge = cleanText(root.querySelector('.badge-line .badge')?.text) ?? 'event';

        const titleLink = root.querySelector('.event-name a');
        const title = cleanText(titleLink?.text);
        const href = titleLink?.getAttribute('href');
        if (!title || !href) {
            return {
                type: "ParseError",
                reason: "Could not find event title/url",
                context: blockHtml.slice(0, 200),
            };
        }

        const id = href.split('/').filter(Boolean).pop();
        if (!id) {
            return {
                type: "ParseError",
                reason: "Could not derive a stable event id from the detail-page URL",
                context: href,
            };
        }

        // The meta <ul> lists location first (location-dot icon), then
        // date (calendar-week icon). Some listings (multi-division
        // leagues) add a third <li> of division names reusing the same
        // calendar-week icon, so we address these by position rather than
        // icon class.
        const metaItems = root.querySelectorAll('.event-meta-list li');
        const location = cleanText(metaItems[0]?.text);

        const dateText = cleanText(metaItems[1]?.text);
        if (!dateText) {
            return {
                type: "ParseError",
                reason: "Could not find event date",
                context: title,
            };
        }

        const range = parseDateRange(dateText);
        if (!range) {
            return {
                type: "ParseError",
                reason: `Could not parse event date: "${dateText}"`,
                context: title,
            };
        }

        const date = ZonedDateTime.of(
            LocalDateTime.of(
                range.start.year(), range.start.monthValue(), range.start.dayOfMonth(),
                DEFAULT_UNKNOWN_TIME_HOUR, 0,
            ),
            timezone,
        );

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration: DEFAULT_UNKNOWN_DURATION,
            summary: title,
            description: `${capitalize(badge)} — DiscNW (Northwest Ultimate Association)`,
            location,
            url: `${BASE_URL}${href}`,
        };
        return event;
    }

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const res = await fetchFn(AJAX_URL, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }
        const html = await res.text();
        const root = parse(html);
        const blocks = root.querySelectorAll('.striped-block');

        const timezone = ripper.config.calendars[0]?.timezone ?? ZoneId.of('America/Los_Angeles');
        const today = LocalDate.now();
        const seenIds = new Set<string>();

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const block of blocks) {
            const blockHtml = block.outerHTML;
            const parsed = this.parseBlock(blockHtml, timezone);
            if ('type' in parsed) {
                errors.push(parsed);
                continue;
            }

            // Date-span filter: most listings are season-long
            // leagues/registrations, not discrete attendable events — see
            // MAX_EVENT_SPAN_DAYS.
            const metaItems = parse(blockHtml).querySelectorAll('.event-meta-list li');
            const dateText = cleanText(metaItems[1]?.text) ?? '';
            const range = parseDateRange(dateText);
            if (!range) continue; // parseBlock already validated this — defensive only
            const spanDays = range.start.until(range.end, ChronoUnit.DAYS);
            if (spanDays > MAX_EVENT_SPAN_DAYS) continue;

            // Only future events.
            if (parsed.date.toLocalDate().isBefore(today)) continue;

            // Dedup by stable id (URL slugs are unique in practice, but
            // guard against an upstream duplicate listing anyway).
            if (parsed.id) {
                if (seenIds.has(parsed.id)) continue;
                seenIds.add(parsed.id);
            }

            events.push(parsed);
            errors.push({
                type: "Uncertainty",
                reason: `DiscNW listing did not include a start time (date: "${dateText}")`,
                source: "discnw",
                unknownFields: ["startTime", "duration"],
                event: parsed,
                partialFingerprint: fingerprint(parsed.summary, dateText),
            });
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
