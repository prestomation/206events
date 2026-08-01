import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const LOCATION = "Photographic Center Northwest, 900 12th Ave, Seattle, WA 98122";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION_MINUTES = 120;
// Placeholder hour used only when no time at all could be found near the
// date (rare — e.g. a headline date with the actual time buried further
// down in the body). The event still publishes so it appears on the
// calendar, paired with a startTime UncertaintyError instead of quietly
// presenting the placeholder as fact.
const DEFAULT_START_HOUR = 18;

// The events custom post type (EventON's `ajde_events`) accumulates years of
// history with no reliable "future only" filter or event-date sort exposed
// via the REST API — only the WP post creation/modification date, which the
// default `order=desc` uses. In practice PCNW creates/edits an event's post
// shortly before it happens, so the most-recently-touched posts skew toward
// upcoming events. Fetching the first PAGES_TO_FETCH pages (most-recently
// modified first) reliably surfaces the events happening in the next several
// months without paging through the full multi-year history; a genuinely
// future event whose post hasn't been touched in a long time could fall
// outside this window, but that hasn't been observed in practice.
const PAGE_SIZE = 100;
const PAGES_TO_FETCH = 2;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

interface PCNWEventPost {
    id: number;
    link: string;
    title: { rendered: string };
    content: { rendered: string };
    _embedded?: { 'wp:featuredmedia'?: { source_url?: string }[] };
}

interface ParsedDate {
    month: number;
    day: number;
    year: number;
    hour: number;
    minute: number;
    endHour?: number;
    endMinute?: number;
    // A time (start, no confirmed end) was found near the date.
    timeConfident: boolean;
    // A start-end range was found, so the duration is a real value, not a guess.
    durationConfident: boolean;
}

// Public for testing
export function stripHtml(html: string): string {
    return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Public for testing
export function parseEventDate(text: string): ParsedDate | null {
    const monthNames = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');
    const dateRe = new RegExp(`(${monthNames})\\s+(\\d{1,2})`, 'i');
    const dateMatch = text.match(dateRe);
    if (!dateMatch || dateMatch.index === undefined) return null;

    const monthIdx = MONTHS.findIndex(m => m === dateMatch[1].toLowerCase());
    if (monthIdx === -1) return null;
    const month = monthIdx + 1;
    const day = parseInt(dateMatch[2], 10);

    const afterDate = text.slice(dateMatch.index + dateMatch[0].length);
    // The year always terminates the date clause (a single date, a
    // "Day - Day" range, or a "Day, Day & Day" list), so it can be a fair
    // distance from the first month/day we matched.
    const yearWindow = afterDate.slice(0, 60);
    const yearMatch = yearWindow.match(/\b(20\d{2})\b/);
    if (!yearMatch || yearMatch.index === undefined) return null;
    const year = parseInt(yearMatch[1], 10);

    const timeWindow = afterDate.slice(yearMatch.index + yearMatch[0].length, yearMatch.index + yearMatch[0].length + 300);

    const rangeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-‐‑‒–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
    const rangeMatch = timeWindow.match(rangeRe);
    const singleRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
    const singleMatch = timeWindow.match(singleRe);

    let hour = DEFAULT_START_HOUR;
    let minute = 0;
    let endHour: number | undefined;
    let endMinute: number | undefined;
    let timeConfident = false;
    let durationConfident = false;

    if (rangeMatch) {
        hour = parseInt(rangeMatch[1], 10);
        minute = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
        const startAmPm = rangeMatch[3]?.toLowerCase();
        endHour = parseInt(rangeMatch[4], 10);
        endMinute = rangeMatch[5] ? parseInt(rangeMatch[5], 10) : 0;
        const endAmPm = rangeMatch[6].toLowerCase();

        if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
        else if (endAmPm === 'am' && endHour === 12) endHour = 0;

        if (startAmPm === 'pm' && hour !== 12) hour += 12;
        else if (startAmPm === 'am' && hour === 12) hour = 0;
        else if (!startAmPm && endAmPm === 'pm' && hour < 12 && hour < (endHour > 12 ? endHour - 12 : endHour)) {
            hour += 12;
        }
        timeConfident = true;
        durationConfident = true;
    } else if (singleMatch) {
        hour = parseInt(singleMatch[1], 10);
        minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
        const ampm = singleMatch[3].toLowerCase();
        if (ampm === 'pm' && hour !== 12) hour += 12;
        else if (ampm === 'am' && hour === 12) hour = 0;
        timeConfident = true;
    }

    return { month, day, year, hour, minute, endHour, endMinute, timeConfident, durationConfident };
}

// Public for testing
export function parseCost(text: string): EventCost | undefined {
    const dollarMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
    if (dollarMatch) return { min: parseFloat(dollarMatch[1]) };
    if (/\bfree\b/i.test(text)) return { min: 0 };
    return undefined;
}

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

// Public for testing
export function parseEventPost(post: PCNWEventPost, now: ZonedDateTime): RipperEvent[] {
    const plainText = stripHtml(post.content.rendered);
    const parsed = parseEventDate(plainText);

    if (!parsed) {
        return [{
            type: 'ParseError',
            reason: 'No parseable date found in event body',
            context: decode(post.title.rendered),
        }];
    }

    const eventDate = ZonedDateTime.of(
        LocalDateTime.of(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute),
        TIMEZONE
    );

    // Posts accumulate for years with no future-only filter available server
    // side (see PAGES_TO_FETCH above) — silently drop past occurrences here.
    if (eventDate.isBefore(now)) return [];

    let durationMinutes = DEFAULT_DURATION_MINUTES;
    if (parsed.durationConfident && parsed.endHour !== undefined) {
        const end = parsed.endHour * 60 + (parsed.endMinute ?? 0);
        const start = parsed.hour * 60 + parsed.minute;
        if (end > start) durationMinutes = end - start;
    }

    const imageUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || undefined;

    const event: RipperCalendarEvent = {
        id: `pcnw-${post.id}`,
        ripped: new Date(),
        date: eventDate,
        duration: Duration.ofMinutes(durationMinutes),
        summary: decode(post.title.rendered),
        description: plainText || undefined,
        location: LOCATION,
        url: post.link,
        imageUrl,
        cost: parseCost(plainText),
    };

    const out: RipperEvent[] = [event];

    const unknownFields: UncertaintyField[] = !parsed.timeConfident
        ? ['startTime', 'duration']
        : !parsed.durationConfident
            ? ['duration']
            : [];

    if (unknownFields.length > 0) {
        const uncertainty: UncertaintyError = {
            type: 'Uncertainty',
            reason: !parsed.timeConfident
                ? `PCNW listing for "${event.summary}" had a date but no start time`
                : `PCNW listing for "${event.summary}" had a start time but no end time`,
            source: 'pcnw',
            unknownFields,
            event,
            partialFingerprint: simpleHash(plainText),
        };
        out.push(uncertainty);
    }

    return out;
}

export default class PCNWRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn: FetchFn = getFetchForConfig(ripper.config);
        const baseUrl = ripper.config.url.toString();
        const now = ZonedDateTime.now(TIMEZONE);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        const seen = new Set<string>();

        for (let page = 1; page <= PAGES_TO_FETCH; page++) {
            const url = `${baseUrl}?per_page=${PAGE_SIZE}&page=${page}&_embed=1`;
            const res = await fetchFn(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!res.ok) {
                errors.push({
                    type: 'ParseError',
                    reason: `PCNW events API page ${page} returned HTTP ${res.status}`,
                    context: url,
                });
                break;
            }

            const posts: PCNWEventPost[] = await res.json();
            if (posts.length === 0) break;

            for (const post of posts) {
                const title = decode(post.title.rendered);
                // "CLOSED: ..." posts are holiday-closure notices, not events.
                if (/^closed:/i.test(title)) continue;

                const id = `pcnw-${post.id}`;
                if (seen.has(id)) continue;
                seen.add(id);

                try {
                    const results = parseEventPost(post, now);
                    for (const r of results) {
                        if ('date' in r) events.push(r);
                        else errors.push(r);
                    }
                } catch (err) {
                    errors.push({
                        type: 'ParseError',
                        reason: `Failed to parse event ${post.id}: ${err}`,
                        context: title,
                    });
                }
            }
        }

        const cal = ripper.config.calendars[0];
        if (!cal) {
            throw new Error("No calendars configured for pcnw ripper");
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            tags: cal.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
