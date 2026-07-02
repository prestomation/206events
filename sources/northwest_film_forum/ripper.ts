import { Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
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
 * /education/workshops/) into a RipperCalendarEvent. Never returns null —
 * a page with no title or no parseable start date/time (e.g. the
 * "NWFF Summer Break 2026" closure notice, or a multi-day camp expressed
 * as a date range) becomes a ParseError so the gap is visible in build
 * reporting instead of silently dropped or guessed at.
 */
export function parseDetailPage(html: string, url: string): RipperCalendarEvent | RipperError {
    const slug = slugFromUrl(url);
    if (!slug) {
        return { type: "ParseError", reason: "Could not extract a URL slug", context: url };
    }

    const title = extractTitle(html);
    if (!title) {
        return { type: "ParseError", reason: "No <h1 itemprop=\"name\"> title found", context: url };
    }

    const localDateTime = extractCleanStartDate(html) ?? extractFreeTextDateTime(html);
    if (!localDateTime) {
        return {
            type: "ParseError",
            reason: "No parseable start date/time found (no valid startDate meta and no free-text date/time block matched)",
            context: url,
        };
    }

    const date = localDateTime.atZone(TIMEZONE);
    const location = extractLocation(html);
    const duration = extractDuration(html);

    const event: RipperCalendarEvent = {
        id: `${slug}-${date.toLocalDate().toString()}`,
        ripped: new Date(),
        date,
        duration,
        summary: title,
        location: location ?? undefined,
        url,
    };
    return event;
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

            const result = parseDetailPage(html, url);
            if ("date" in result) {
                if (result.date.isBefore(now)) continue;
                events.push(result);
            } else {
                errors.push(result);
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
