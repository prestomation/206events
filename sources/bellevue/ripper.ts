import { DayOfWeek, Duration, LocalDate, LocalDateTime, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import {
    IRipper,
    Ripper,
    RipperCalendar,
    RipperCalendarEvent,
    RipperError,
    RipperEvent,
    UncertaintyError,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const BASE_URL = "https://bellevuewa.gov";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const MAX_PAGES = 10;
// Placeholder for listings with a date but no time. Paired with an
// UncertaintyError so the event-uncertainty-resolver skill can fill it in.
const PLACEHOLDER_TIME = LocalTime.of(12, 0);
const PLACEHOLDER_DURATION = Duration.ofHours(2);

const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const WEEKDAYS: Record<string, DayOfWeek> = {
    monday: DayOfWeek.MONDAY, tuesday: DayOfWeek.TUESDAY, wednesday: DayOfWeek.WEDNESDAY,
    thursday: DayOfWeek.THURSDAY, friday: DayOfWeek.FRIDAY, saturday: DayOfWeek.SATURDAY,
    sunday: DayOfWeek.SUNDAY,
};

// Office-closure notices share the community-events category but aren't
// events anyone attends.
const CLOSURE_RE = /^city hall closed\b/i;

export function listingUrl(category: string, page: number): string {
    return `${BASE_URL}/calendar?cat=${encodeURIComponent(category)}&page=${page}`;
}

/**
 * The listing shows dates without a year ("October 03 Saturday"). Picks the
 * year (this year, next year, or last year) whose calendar puts that
 * month/day on the stated weekday, preferring the one nearest `today`.
 * Returns null when no candidate year matches. Public for testing.
 */
export function inferDate(month: number, day: number, weekday: DayOfWeek, today: LocalDate): LocalDate | null {
    const candidates: LocalDate[] = [];
    for (const y of [today.year(), today.year() + 1, today.year() - 1]) {
        try {
            const d = LocalDate.of(y, month, day);
            if (d.dayOfWeek().equals(weekday)) candidates.push(d);
        } catch {
            // Feb 29 in a non-leap year — not a candidate.
        }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) =>
        Math.abs(a.toEpochDay() - today.toEpochDay()) - Math.abs(b.toEpochDay() - today.toEpochDay()));
    return candidates[0];
}

function parseClock(s: string): LocalTime | null {
    const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = m[3].toUpperCase() === "PM";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return LocalTime.of(h, min);
}

export interface ParsedWhen {
    date: LocalDate;
    start: LocalTime | null;   // null → all day or unknown
    duration: Duration | null;
    allDay: boolean;
}

/**
 * Parses the listing's "full-date" text, e.g.
 *   "September 26 Saturday 10:00AM - 5:00PM"
 *   "November 11 Wednesday All day"
 *   "October 24 Saturday"               (no time given)
 * Public for testing.
 */
export function parseWhen(text: string, today: LocalDate): ParsedWhen | string {
    const t = text.replace(/\s+/g, " ").trim();
    const m = t.match(/^([A-Za-z]+) (\d{1,2}) ([A-Za-z]+)(?: (.*))?$/);
    if (!m) return `Unrecognized date "${t}"`;
    const month = MONTHS[m[1].toLowerCase()];
    const weekday = WEEKDAYS[m[3].toLowerCase()];
    if (!month || !weekday) return `Unrecognized month/weekday in "${t}"`;
    const date = inferDate(month, parseInt(m[2], 10), weekday, today);
    if (!date) return `No year puts ${m[1]} ${m[2]} on a ${m[3]} ("${t}")`;

    const rest = (m[4] ?? "").trim();
    if (!rest) return { date, start: null, duration: null, allDay: false };
    if (/^all day$/i.test(rest)) return { date, start: null, duration: Duration.ofHours(24), allDay: true };

    const range = rest.match(/^(\d{1,2}:\d{2}\s*[AP]M)(?:\s*-\s*(\d{1,2}:\d{2}\s*[AP]M))?$/i);
    if (!range) return `Unrecognized time "${rest}" in "${t}"`;
    const start = parseClock(range[1]);
    if (!start) return `Unrecognized start time "${range[1]}"`;
    let duration: Duration | null = null;
    if (range[2]) {
        const end = parseClock(range[2]);
        if (!end) return `Unrecognized end time "${range[2]}"`;
        let mins = Duration.between(start, end).toMinutes();
        if (mins <= 0) mins += 24 * 60;
        duration = Duration.ofMinutes(mins);
    }
    return { date, start, duration: duration ?? Duration.ofHours(1), allDay: false };
}

/**
 * Normalizes the listing's address ("Downtown Park, 10201 NE 4th St") so it
 * geocodes in Bellevue rather than wherever Nominatim guesses: appends
 * "Bellevue, WA" unless the text already names a WA city. Public for testing.
 */
export function normalizeAddress(raw: string): string {
    const text = decode(raw).replace(/\s+/g, " ").trim().replace(/,\s*$/, "");
    if (!text) return "Bellevue, WA";
    if (/\bWA\b|Washington/i.test(text)) return text;
    return `${text}, Bellevue, WA`;
}

export interface ListingItem {
    slug: string;
    title: string;
    when: string;
    address: string;
    summary?: string;
}

/** Extracts the event cards from one listing page. Public for testing. */
export function extractItems(html: string): ListingItem[] {
    const root = parse(html);
    const items: ListingItem[] = [];
    for (const card of root.querySelectorAll(".views-row .event-info")) {
        const link = card.querySelector("h3 a");
        const href = link?.getAttribute("href") ?? "";
        const slug = href.replace(/^.*\/events\//, "").replace(/[/?#].*$/, "");
        const fullDate = card.querySelector(".full-date");
        const addressEl = fullDate?.querySelector(".address");
        // The date text is the full-date div's own text before the address.
        const when = fullDate ? textBefore(fullDate, ".address-wrapper") : "";
        items.push({
            slug,
            title: decode(link?.text ?? "").replace(/\s+/g, " ").trim(),
            when,
            address: addressEl ? addressEl.text : "",
            summary: card.querySelector(".summary")?.text.replace(/\s+/g, " ").trim() || undefined,
        });
    }
    return items;
}

function textBefore(el: HTMLElement, selector: string): string {
    const clone = parse(el.innerHTML);
    for (const n of clone.querySelectorAll(selector)) n.remove();
    return decode(clone.text).replace(/\s+/g, " ").trim();
}

/**
 * Turns a listing card into an event (plus an UncertaintyError when the
 * card gives a date but no time) or a ParseError. Public for testing.
 */
export function parseItem(item: ListingItem, today: LocalDate): RipperEvent[] {
    if (!item.slug || !item.title) {
        return [{ type: "ParseError", reason: "Event card missing link or title", context: item.title || item.slug }];
    }
    const when = parseWhen(item.when, today);
    if (typeof when === "string") {
        return [{ type: "ParseError", reason: when, context: item.slug }];
    }

    const timeUnknown = !when.allDay && when.start === null;
    const start = when.start ?? (when.allDay ? LocalTime.MIDNIGHT : PLACEHOLDER_TIME);
    const duration = when.duration ?? PLACEHOLDER_DURATION;

    const event: RipperCalendarEvent = {
        id: `bellevue-${item.slug}-${when.date.toString()}`,
        ripped: new Date(),
        date: ZonedDateTime.of(LocalDateTime.of(when.date, start), TIMEZONE),
        duration,
        summary: item.title,
        description: item.summary,
        location: normalizeAddress(item.address),
        url: `${BASE_URL}/events/${item.slug}`,
    };
    if (!timeUnknown) return [event];

    const uncertainty: UncertaintyError = {
        type: "Uncertainty",
        reason: `City of Bellevue listing gave no start time (raw: "${item.when}")`,
        source: "bellevue",
        unknownFields: ["startTime", "duration"],
        event,
        partialFingerprint: `${item.slug}|${item.when}`,
    };
    return [event, uncertainty];
}

export default class BellevueRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const now = ZonedDateTime.now(TIMEZONE);
        const today = now.toLocalDate();
        const calendars: RipperCalendar[] = [];

        for (const cal of ripper.config.calendars) {
            const category = String((cal.config as any)?.category ?? "");
            const events: RipperCalendarEvent[] = [];
            const errors: RipperError[] = [];
            if (!category) {
                errors.push({ type: "ParseError", reason: "calendar config missing category", context: cal.name });
            }

            const seen = new Set<string>();
            for (let page = 0; category && page < MAX_PAGES; page++) {
                const url = listingUrl(category, page);
                const res = await this.fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
                if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
                const items = extractItems(await res.text());
                if (items.length === 0) break;

                for (const item of items) {
                    if (CLOSURE_RE.test(item.title)) continue;
                    const results = parseItem(item, today);
                    const ev = results.find((r): r is RipperCalendarEvent => "date" in r);
                    // The same event can appear twice in the listing (and
                    // across page boundaries); keep the first copy only.
                    if (ev) {
                        if (seen.has(ev.id!)) continue;
                        seen.add(ev.id!);
                    }
                    for (const r of results) {
                        if ("date" in r) {
                            if (r.date.plus(r.duration).isAfter(now)) events.push(r);
                        } else {
                            errors.push(r);
                        }
                    }
                }
            }

            // Keep only uncertainty errors whose event survived the
            // dedup/past filters.
            const keptIds = new Set(events.map(e => e.id));
            calendars.push({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events,
                errors: errors.filter(e => e.type !== "Uncertainty" || keptIds.has(e.event.id)),
                tags: cal.tags || [],
                parent: ripper.config,
            });
        }
        return calendars;
    }
}
