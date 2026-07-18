import { Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const BASE_URL = "https://nwfilmforum.org";
const DAY_ENDPOINT = `${BASE_URL}/wp-json/nwff/v1/html/calendar/day`;
// The static /calendar/ page only server-renders a rolling ~1 week window
// regardless of query params, so discovery walks the day-by-day REST
// endpoint instead. ~70 days covers roughly the next two-plus months of
// programming without an unbounded request count.
const DISCOVERY_WINDOW_DAYS = 70;
const DEFAULT_DURATION = Duration.ofHours(2);
const TIMEZONE = ZoneId.of("America/Los_Angeles");

// Some /education/workshops/ pages (multi-day camps) give a *date* for each
// day of the camp via a `CourseInstance` per day, but never a time of day —
// the source simply doesn't publish a start time in machine-readable form.
// Rather than guess a real time, we emit the event with these placeholders
// and pair it with an UncertaintyError (same pattern as sources/events12),
// so the event-uncertainty-resolver skill can fill in the real time later.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

interface DayFragmentResponse {
    html?: string;
}

/**
 * Extracts unique `nwfilmforum.org` detail-page URLs from a single day's
 * calendar fragment HTML, excluding WordPress asset/API URLs
 * (`/wp-content/`, `/wp-json/`). Public for testing.
 */
export function extractDetailUrls(fragmentHtml: string): string[] {
    const urls = new Set<string>();
    const re = /href="(https:\/\/nwfilmforum\.org\/[^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fragmentHtml)) !== null) {
        const url = decode(m[1]);
        if (url.includes("/wp-content/") || url.includes("/wp-json/")) continue;
        urls.add(url);
    }
    return [...urls];
}

/** Last non-empty path segment of a detail-page URL, used as the id/slug. Public for testing. */
export function slugFromUrl(url: string): string | null {
    try {
        const segments = new URL(url).pathname.split("/").filter(Boolean);
        return segments.length ? segments[segments.length - 1] : null;
    } catch {
        return null;
    }
}

/** Extracts the `<h1 itemprop="name">` title, reliable across /films/, /events/, and /education/workshops/. Public for testing. */
export function extractTitle(html: string): string | null {
    const m = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/);
    if (!m) return null;
    const text = decode(m[1].replace(/<[^>]+>/g, "")).trim();
    return text.length ? text : null;
}

/**
 * Extracts a *valid* `itemprop="startDate"` meta content as a LocalDateTime.
 * On /films/ pages this is a real ISO local datetime
 * (`2026-07-10T19:00:00`). On /events/ and some /education/workshops/ pages
 * the field is broken — either the literal string `"T"` or a date with no
 * time part (`"2026-07-27T"`) — both of which fail the strict regex here
 * and correctly fall through to free-text parsing (or ParseError) rather
 * than being misread as midnight. Public for testing.
 */
export function extractCleanStartDate(html: string): LocalDateTime | null {
    const re = /itemprop="startDate" content="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const content = m[1];
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(content)) continue;
        const normalized = content.length === 16 ? `${content}:00` : content;
        try {
            return LocalDateTime.parse(normalized);
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Falls back to the free-text date/time block used on /events/ and
 * /education/workshops/ pages, e.g.:
 *   "Friday, July 22nd, 2026<br />6:30pm doors<br />7:00pm showtime!"
 * Prefers the "showtime" time over "doors" when both are present; uses
 * whichever single time is present otherwise. Only handles a single
 * concrete date (not date ranges like "July 27-31, 2026" used by
 * multi-day camps) — those correctly fall through to a ParseError rather
 * than guessing which day/time to represent. Public for testing.
 */
export function extractFreeTextDateTime(html: string): LocalDateTime | null {
    const dateRe = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})/;
    const dateMatch = html.match(dateRe);
    if (!dateMatch) return null;

    const monthIdx = MONTHS.indexOf(dateMatch[1]);
    if (monthIdx === -1) return null;
    const day = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);

    let date: LocalDate;
    try {
        date = LocalDate.of(year, monthIdx + 1, day);
    } catch {
        return null;
    }

    const idx = html.indexOf(dateMatch[0]);
    const windowText = html.slice(idx, idx + 500);
    const timeRe = /(\d{1,2}):(\d{2})\s*(am|pm)([^0-9<]{0,25})/gi;
    let tm: RegExpExecArray | null;
    let showtime: [number, number] | null = null;
    let doors: [number, number] | null = null;
    let first: [number, number] | null = null;
    while ((tm = timeRe.exec(windowText)) !== null) {
        let hour = Number(tm[1]);
        const minute = Number(tm[2]);
        const ampm = tm[3].toLowerCase();
        if (ampm === "pm" && hour !== 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        const t: [number, number] = [hour, minute];
        if (!first) first = t;
        const context = tm[4].toLowerCase();
        if (context.includes("showtime")) showtime = t;
        else if (context.includes("doors") && !doors) doors = t;
    }

    const chosen = showtime ?? doors ?? first;
    if (!chosen) return null;
    return date.atTime(chosen[0], chosen[1]);
}

/**
 * Extracts every *date-only* `itemprop="startDate"` value (content is
 * exactly `YYYY-MM-DDT` — a real date with no time component), as used by
 * multi-day camp pages under /education/workshops/ where each day of the
 * camp gets its own `CourseInstance` block but the source never publishes
 * a time of day. Returns the dates in the order they appear (typically
 * chronological). Public for testing.
 */
export function extractDateOnlyStartDates(html: string): LocalDate[] {
    const re = /itemprop="startDate" content="(\d{4}-\d{2}-\d{2})T"/g;
    const dates: LocalDate[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        try {
            dates.push(LocalDate.parse(m[1]));
        } catch {
            continue;
        }
    }
    return dates;
}

// Pick the year for a (month, day) pair: use the soonest occurrence whose
// date is not before today. Returns null when the (month, day) is not a
// real calendar date in either year (e.g. Feb 30).
function inferYear(month: number, day: number, now: ZonedDateTime): number | null {
    try {
        const today = now.toLocalDate();
        const thisYear = LocalDate.of(now.year(), month, day);
        return thisYear.isBefore(today) ? now.year() + 1 : now.year();
    } catch {
        return null;
    }
}

const ABBR_MONTHS: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/**
 * Extracts every date from a "multi-date pass" listing, e.g. a double
 * feature where one ticket admits to any of several screenings:
 *   "Sun Aug 23: All Day", "Fri Aug 28: All Day", "Sat Aug 29: All Day"
 * Used on /events/ pages whose `itemprop="startDate"` is the broken "T"
 * placeholder and which have no single free-text date/time block (the
 * dates are typically non-contiguous, unlike the workshop camp case).
 * The listing carries no year, so it's inferred relative to `now`. Public
 * for testing.
 */
export function extractAllDayDates(html: string, now: ZonedDateTime): LocalDate[] {
    const re = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2}):\s*All Day/g;
    const dates: LocalDate[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const month = ABBR_MONTHS[m[1]];
        if (!month) continue;
        const day = Number(m[2]);
        const year = inferYear(month, day, now);
        if (year === null) continue;
        try {
            dates.push(LocalDate.of(year, month, day));
        } catch {
            continue;
        }
    }
    return dates;
}

/**
 * Extracts the ticket/registration URL from the nearest schema.org
 * `itemprop="offers"` block. A missing or empty offers URL is the
 * generic signal this site uses for informational, non-attendable pages
 * (e.g. the "NWFF Summer Break 2026" closure notice, which has an empty
 * `content=""`) as opposed to real screenings/events/workshops, which
 * always link to an Eventive or JotForm registration URL. Public for
 * testing.
 */
export function extractOffersUrl(html: string): string | null {
    const m = html.match(/itemprop="offers"[^>]*>[\s\S]{0,300}?itemprop="url" content="([^"]*)"/);
    if (!m) return null;
    const url = decode(m[1]).trim();
    return url.length ? url : null;
}

/**
 * Extracts "Venue Name, Address" from the nearest schema.org `location`
 * block (MovieTheater on /films/, Place elsewhere) — shape is otherwise
 * identical between prefixes. Public for testing.
 */
export function extractLocation(html: string): string | null {
    const m = html.match(/itemprop="location"[^>]*>[\s\S]{0,400}?itemprop="name" content="([^"]*)"[\s\S]{0,400}?itemprop="address" content="([^"]*)"/);
    if (!m) return null;
    const name = decode(m[1]).trim();
    const address = decode(m[2]).trim();
    if (!name && !address) return null;
    return [name, address].filter(Boolean).join(", ");
}

/** Extracts a `PT##M` schema.org duration when present (reliable on /films/); defaults otherwise. Public for testing. */
export function extractDuration(html: string): Duration {
    const m = html.match(/itemprop="duration" content="(PT[0-9A-Za-z]+)"/);
    if (!m) return DEFAULT_DURATION;
    try {
        const d = Duration.parse(m[1]);
        return d.seconds() > 0 ? d : DEFAULT_DURATION;
    } catch {
        return DEFAULT_DURATION;
    }
}

/**
 * Parses a single NWFF detail page (any of /films/, /events/,
 * /education/workshops/) into zero, one, or two results:
 *   - `[]` — an informational, non-attendable page (no title, or no
 *     ticket/registration URL and no date signal at all — e.g. the
 *     "NWFF Summer Break 2026" closure notice). Not a parse gap: there is
 *     no event here to report.
 *   - `[event]` — a normal event with a known date and time.
 *   - `[event, uncertainty]` — a real, ticketed event whose *date* is
 *     known (from date-only `startDate` metas) but whose time of day
 *     isn't published anywhere on the page (multi-day camps under
 *     /education/workshops/). `event` carries placeholder start
 *     time/duration and `uncertainty` flags them for the
 *     event-uncertainty-resolver skill, per docs/event-uncertainty.md —
 *     never silently guessed as fact.
 *   - `[event, uncertainty, event, uncertainty, ...]` — a multi-date pass
 *     (e.g. a double feature screening on several non-contiguous days)
 *     whose dates come from an "All Day" listing rather than schema.org
 *     metadata. One event per listed date, each paired with an
 *     UncertaintyError since no time of day is published.
 *   - `[error]` — a ticketed/registerable page whose date genuinely could
 *     not be extracted by any strategy; a real gap worth surfacing.
 * Never returns null and never drops a real event without a trace.
 */
export function parseDetailPage(
    html: string,
    url: string,
    now: ZonedDateTime = ZonedDateTime.now(TIMEZONE),
): (RipperCalendarEvent | RipperError)[] {
    const slug = slugFromUrl(url);
    if (!slug) {
        return [{ type: "ParseError", reason: "Could not extract a URL slug", context: url }];
    }

    const title = extractTitle(html);
    if (!title) {
        return [];
    }

    const offersUrl = extractOffersUrl(html);
    const location = extractLocation(html);

    const localDateTime = extractCleanStartDate(html) ?? extractFreeTextDateTime(html);
    if (localDateTime) {
        const date = localDateTime.atZone(TIMEZONE);
        const event: RipperCalendarEvent = {
            id: `${slug}-${date.toLocalDate().toString()}`,
            ripped: new Date(),
            date,
            duration: extractDuration(html),
            summary: title,
            location: location ?? undefined,
            url,
        };
        return [event];
    }

    const dateOnlyDates = extractDateOnlyStartDates(html);
    if (dateOnlyDates.length > 0) {
        const startDate = dateOnlyDates.reduce((min, d) => (d.isBefore(min) ? d : min), dateOnlyDates[0]);
        const endDate = dateOnlyDates.reduce((max, d) => (d.isAfter(max) ? d : max), dateOnlyDates[0]);
        const spanDays = Duration.between(startDate.atStartOfDay(), endDate.atStartOfDay()).toDays() + 1;
        const date = startDate.atTime(DEFAULT_UNKNOWN_TIME_HOUR, DEFAULT_UNKNOWN_TIME_MINUTE).atZone(TIMEZONE);
        const event: RipperCalendarEvent = {
            id: `${slug}-${startDate.toString()}`,
            ripped: new Date(),
            date,
            duration: Duration.ofDays(spanDays),
            summary: title,
            location: location ?? undefined,
            url,
        };
        const unknownFields: UncertaintyField[] = ["startTime", "duration"];
        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            reason: `NWFF workshop page gives a date for each day of the camp (${startDate.toString()} to ${endDate.toString()}) but no time of day anywhere on the page`,
            source: "northwest-film-forum",
            unknownFields,
            event,
        };
        return [event, uncertainty];
    }

    const allDayDates = extractAllDayDates(html, now);
    if (allDayDates.length > 0) {
        const results: (RipperCalendarEvent | RipperError)[] = [];
        for (const d of allDayDates) {
            const date = d.atTime(DEFAULT_UNKNOWN_TIME_HOUR, DEFAULT_UNKNOWN_TIME_MINUTE).atZone(TIMEZONE);
            const event: RipperCalendarEvent = {
                id: `${slug}-${d.toString()}`,
                ripped: new Date(),
                date,
                duration: DEFAULT_DURATION,
                summary: title,
                location: location ?? undefined,
                url,
            };
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: `NWFF multi-date pass lists ${d.toString()} as "All Day" with no specific showtime published`,
                source: "northwest-film-forum",
                unknownFields: ["startTime"],
                event,
            };
            results.push(event, uncertainty);
        }
        return results;
    }

    if (!offersUrl) {
        // No ticket/registration link and no date signal at all — an
        // informational page (closure notice, etc.), not real programming.
        return [];
    }

    return [{
        type: "ParseError",
        reason: "No parseable start date/time found (no valid startDate meta, no date-only startDate metas, and no free-text date/time block matched) despite a ticket/registration URL being present",
        context: url,
    }];
}

/**
 * Northwest Film Forum (Capitol Hill arthouse cinema / film-education
 * nonprofit) ripper.
 *
 * NWFF runs WordPress with a custom `nwff/v1` REST namespace rather than
 * Tribe Events. The public /calendar/ page only server-renders a rolling
 * ~1-week window no matter what query params are passed, so discovery
 * instead walks `GET /wp-json/nwff/v1/html/calendar/day?date=YYYY-MM-DD`
 * over the next ~70 days, collecting the (deduplicated) set of detail-page
 * URLs referenced across every day's fragment — a multi-day series repeats
 * the same URL across several days. Each unique detail page is then fetched
 * once and parsed via parseDetailPage.
 */
export default class NorthwestFilmForumRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error("No calendars configured for northwest-film-forum ripper");
        }
        const calConfig = ripper.config.calendars[0];
        const now = ZonedDateTime.now(TIMEZONE);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        const { urls: detailUrls, dayErrors } = await this.discoverDetailUrls();
        errors.push(...dayErrors);

        for (const url of detailUrls) {
            let html: string;
            try {
                const res = await this.fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
                if (!res.ok) {
                    errors.push({ type: "ParseError", reason: `HTTP ${res.status} fetching detail page`, context: url });
                    continue;
                }
                html = await res.text();
            } catch (error) {
                // Isolate per-page fetch failures so one bad page doesn't discard
                // events already parsed from earlier pages in this loop.
                errors.push({ type: "ParseError", reason: `Failed to fetch detail page: ${error}`, context: url });
                continue;
            }

            for (const result of parseDetailPage(html, url, now)) {
                if ("date" in result) {
                    if (result.date.isBefore(now)) continue;
                    events.push(result);
                } else {
                    errors.push(result);
                }
            }
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    /**
     * Walks the day-by-day calendar endpoint over DISCOVERY_WINDOW_DAYS
     * starting today, returning the deduplicated set of detail-page URLs
     * found across all days. A failure fetching a single day is isolated
     * (recorded as a non-fatal ParseError) rather than aborting discovery —
     * most events surface across several consecutive days' fragments, so
     * losing one day rarely loses an event outright. Public for testing.
     */
    public async discoverDetailUrls(): Promise<{ urls: string[]; dayErrors: RipperError[] }> {
        const urls = new Set<string>();
        const dayErrors: RipperError[] = [];
        const today = ZonedDateTime.now(TIMEZONE).toLocalDate();

        for (let i = 0; i < DISCOVERY_WINDOW_DAYS; i++) {
            const date = today.plusDays(i).toString();
            const dayUrl = `${DAY_ENDPOINT}?date=${date}`;
            try {
                const res = await this.fetchFn(dayUrl, { headers: { "User-Agent": USER_AGENT } });
                if (!res.ok) {
                    dayErrors.push({ type: "ParseError", reason: `HTTP ${res.status} fetching day fragment`, context: dayUrl });
                    continue;
                }
                const data = await res.json() as DayFragmentResponse;
                if (!data.html) continue;
                for (const url of extractDetailUrls(data.html)) urls.add(url);
            } catch (error) {
                dayErrors.push({ type: "ParseError", reason: `Failed to fetch day fragment: ${error}`, context: dayUrl });
            }
        }

        return { urls: [...urls], dayErrors };
    }
}
