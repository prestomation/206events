import { ChronoUnit, Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { parse } from "node-html-parser";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Each event's own detail page (event.url) carries a distinct og:image
// (verified live across the Turkey Bowl, HS Bx Seattle Invite, and HS Bx JV
// Jamboree listings — three different CloudFront image ids). The AJAX
// listing fetched below never includes one, so this needs a second fetch
// per event; DiscNW's own MAX_EVENT_SPAN_DAYS filter already keeps that
// event count small (single-day/short-tournament listings only).
const OG_IMAGE_PATTERN = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i;

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

// Everything parseBlock derives from one block, including the raw date
// range — kept alongside the event so rip() can apply the date-span
// filter without re-parsing the block's HTML a second time.
interface ParsedBlock {
    event: RipperEvent;
    range: DateRange | null;
    dateText: string;
}

export default class DiscNWRipper implements IRipper {

    // Parses one <div class="striped-block"> event listing into an event.
    // Never returns null — a block missing an expected field (title, url,
    // date) produces a ParseError instead, per AGENTS.md's "Parse Methods
    // Must Never Return Null". Date-span filtering and dedup are the
    // caller's job (rip()), not this method's.
    public parseBlock(blockHtml: string, timezone: ZoneId): RipperEvent {
        return this.parseBlockDetailed(blockHtml, timezone).event;
    }

    // Same parse as parseBlock, but also surfaces the raw DateRange/dateText
    // it derived along the way so rip() can apply the date-span filter
    // without a second parse(blockHtml) pass over the same HTML.
    private parseBlockDetailed(blockHtml: string, timezone: ZoneId): ParsedBlock {
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
                event: {
                    type: "ParseError",
                    reason: "Could not find event title/url",
                    context: blockHtml.slice(0, 200),
                },
                range: null,
                dateText: '',
            };
        }

        const id = href.split('/').filter(Boolean).pop();
        if (!id) {
            return {
                event: {
                    type: "ParseError",
                    reason: "Could not derive a stable event id from the detail-page URL",
                    context: href,
                },
                range: null,
                dateText: '',
            };
        }

        // The meta <ul> lists location first (location-dot icon), then
        // date (calendar-week icon). Some listings (multi-division
        // leagues) add a third <li> of division names reusing the same
        // calendar-week icon, so we address these by position rather than
        // icon class.
        const metaItems = root.querySelectorAll('.event-meta-list li');
        const location = cleanText(metaItems[0]?.text);

        const dateText = cleanText(metaItems[1]?.text) ?? '';
        if (!dateText) {
            return {
                event: {
                    type: "ParseError",
                    reason: "Could not find event date",
                    context: title,
                },
                range: null,
                dateText: '',
            };
        }

        const range = parseDateRange(dateText);
        if (!range) {
            return {
                event: {
                    type: "ParseError",
                    reason: `Could not parse event date: "${dateText}"`,
                    context: title,
                },
                range: null,
                dateText,
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
        return { event, range, dateText };
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
            const { event: parsed, range, dateText } = this.parseBlockDetailed(blockHtml, timezone);
            if ('type' in parsed) {
                errors.push(parsed);
                continue;
            }
            if (!range) continue; // parseBlockDetailed already validated this — defensive only

            // Date-span filter: most listings are season-long
            // leagues/registrations, not discrete attendable events — see
            // MAX_EVENT_SPAN_DAYS.
            const spanDays = range.start.until(range.end, ChronoUnit.DAYS);
            if (spanDays > MAX_EVENT_SPAN_DAYS) continue;

            // DiscNW is a regional (WA/OR/BC) governing body, not a
            // Seattle-only one — per AGENTS.md, sources must primarily
            // serve Seattle audiences, so drop listings located outside
            // Washington state (e.g. the recurring Corvallis, OR "G.O.A.T.s"
            // events). This still allows the occasional non-Seattle WA city
            // (SeaTac, Kirkland, ...), consistent with "a few events outside
            // city limits is OK."
            if (!/,\s*WA$/i.test(parsed.location ?? '')) continue;

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

        await this.enrichImages(events, fetchFn);

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }

    // Fetches each event's own detail page once and applies its og:image.
    // A fetch failure or a page with no og:image just leaves imageUrl unset
    // — the event falls through to the normal photoGaps queue rather than
    // getting a guessed image.
    private async enrichImages(events: RipperCalendarEvent[], fetchFn: FetchFn): Promise<void> {
        for (const event of events) {
            if (!event.url) continue;
            try {
                const res = await fetchFn(event.url);
                if (!res.ok) continue;
                const image = extractOgImage(await res.text());
                if (image) event.imageUrl = image;
            } catch {
                // Network hiccup — leave imageUrl unset; falls through to photoGaps.
            }
        }
    }
}

// Public for testing.
export function extractOgImage(html: string): string | undefined {
    return html.match(OG_IMAGE_PATTERN)?.[1];
}
