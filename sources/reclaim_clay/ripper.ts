import { Duration, LocalDate, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, EventCost, UncertaintyError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const ITEMS_URL = "https://www.reclaimclay.com/classes-and-workshops?format=json";
const BASE_URL = "https://www.reclaimclay.com";
const LOCATION = "Reclaim Clay Collective, 800 S Weller St #201, Seattle, WA 98104";

// Store products (structuredContent._type === "StoreItem") come in a few
// productType flavors on Reclaim Clay's Squarespace store. 3 = a class or
// workshop (what we want); 4 = a gift card (not an event — skipped entirely,
// not even as a ParseError, per AGENTS.md's "intentional content filters
// belong in the caller" rule).
const WORKSHOP_PRODUCT_TYPE = 3;

// events12.com-style placeholder for the rare case where neither the
// excerpt nor a variant gives us any time at all — flagged via
// UncertaintyError rather than silently trusted. See docs/event-uncertainty.md.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
const DEFAULT_DURATION = Duration.ofHours(2);

interface SquarespaceVariant {
    attributes?: Record<string, string>;
    price?: number; // integer cents
}

interface SquarespaceStructuredContent {
    _type?: string;
    productType?: number;
    variants?: SquarespaceVariant[];
}

interface SquarespaceItem {
    urlId: string;
    title: string;
    excerpt?: string | null;
    fullUrl: string;
    structuredContent?: SquarespaceStructuredContent;
}

interface SquarespaceStoreResponse {
    items?: SquarespaceItem[];
}

// --- Time-of-day parsing -----------------------------------------------

interface TimeInfo {
    startHour: number;
    startMinute: number;
    endHour?: number;
    endMinute?: number;
}

// Covers every time format observed on Reclaim Clay listings: "10:30 AM -
// 1:30 PM", "2:00 PM - 4:00 PM", "6 - 9 PM" (bare hour, shared trailing
// meridiem), "12 - 2PM" (no space before the meridiem), and bare slot times
// like "3-4pm". A leading number's own meridiem (if present) wins; otherwise
// it inherits the trailing one.
const TIME_RANGE_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?\b/;
const SINGLE_TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)\b/;

function to24Hour(hour: number, meridiem: string | undefined): number {
    if (!meridiem) return hour;
    const isPm = /p/i.test(meridiem);
    if (isPm && hour !== 12) return hour + 12;
    if (!isPm && hour === 12) return 0;
    return hour;
}

// Public for testing. Returns null when no time-of-day is present in the
// text at all.
export function parseTimeRange(text: string): TimeInfo | null {
    const range = text.match(TIME_RANGE_RE);
    if (range) {
        const [, h1, min1, mer1, h2, min2, mer2] = range;
        const meridiem = mer1 || mer2;
        if (meridiem) {
            return {
                startHour: to24Hour(parseInt(h1, 10), mer1 || meridiem),
                startMinute: min1 ? parseInt(min1, 10) : 0,
                endHour: to24Hour(parseInt(h2, 10), mer2 || meridiem),
                endMinute: min2 ? parseInt(min2, 10) : 0,
            };
        }
    }
    const single = text.match(SINGLE_TIME_RE);
    if (single) {
        const [, h, min, mer] = single;
        return {
            startHour: to24Hour(parseInt(h, 10), mer),
            startMinute: min ? parseInt(min, 10) : 0,
        };
    }
    return null;
}

// --- Calendar-date parsing -----------------------------------------------

const MONTH_NAMES: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
};

function monthFromToken(token: string): number | undefined {
    return MONTH_NAMES[token.toLowerCase().replace(/\.$/, "")];
}

// Strip ordinal suffixes ("October 10th" -> "October 10") before matching.
const ORDINAL_RE = /(\d+)(st|nd|rd|th)\b/gi;

// A single *plural* weekday word right at the start of the string is what
// distinguishes a weekly-recurring range ("Saturdays, Nov 14 - Dec 19, ...")
// from a one-off multi-day span ("Saturday & Sunday, Oct 3 - Oct 4, ...").
const PLURAL_WEEKDAY_START_RE = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s\b/i;

// "Month D - Month D" (or "Month D - Month D" same month twice, e.g.
// "Oct 3 - Oct 4"). Deliberately requires a month word on *both* sides so it
// never collides with a bare numeric time range like "12 - 2PM" or a price
// range like "$355-$375".
const DATE_RANGE_RE = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/;

// A single "Month D" (used once no two-sided range is found).
const SINGLE_DATE_RE = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/;

// Assume the current year; if that reading would already be more than ~2
// months in the past, assume the source means next year. Mirrors
// sources/reubens_brews/ripper.ts parseDate().
export function inferYear(month: number, day: number, now: LocalDate): number {
    let year = now.year();
    let candidate: LocalDate;
    try {
        candidate = LocalDate.of(year, month, day);
    } catch {
        return year;
    }
    if (candidate.isBefore(now.minusMonths(2))) year += 1;
    return year;
}

export type ParsedDateText =
    | { kind: "weekly"; start: LocalDate; end: LocalDate; time: TimeInfo | null }
    | { kind: "range"; start: LocalDate; end: LocalDate; time: TimeInfo | null }
    | { kind: "single"; date: LocalDate; time: TimeInfo | null };

// Public for testing. Parses a plain-text date description (from an excerpt
// or a variant attribute) into one of the three shapes documented in the
// ripper design: a weekly-recurring range, a one-off multi-day range, or a
// single date. Returns null when no date could be found at all.
export function parseDateText(raw: string, now: LocalDate): ParsedDateText | null {
    const text = raw.replace(ORDINAL_RE, "$1");

    const rangeMatch = text.match(DATE_RANGE_RE);
    if (rangeMatch) {
        const startMonth = monthFromToken(rangeMatch[1]);
        const startDay = parseInt(rangeMatch[2], 10);
        const endMonth = monthFromToken(rangeMatch[3]);
        const endDay = parseInt(rangeMatch[4], 10);
        if (!startMonth || !endMonth) return null;

        const startYear = inferYear(startMonth, startDay, now);
        // The range never carries its own year for the end date; roll it
        // forward only if the end month/day would otherwise precede the
        // start (a range spanning a New Year's boundary).
        let endYear = startYear;
        if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) endYear += 1;

        let start: LocalDate;
        let end: LocalDate;
        try {
            start = LocalDate.of(startYear, startMonth, startDay);
            end = LocalDate.of(endYear, endMonth, endDay);
        } catch {
            return null;
        }

        const time = parseTimeRange(text);
        const kind = PLURAL_WEEKDAY_START_RE.test(text.trim()) ? "weekly" : "range";
        return { kind, start, end, time };
    }

    const singleMatch = text.match(SINGLE_DATE_RE);
    if (!singleMatch) return null;
    const month = monthFromToken(singleMatch[1]);
    if (!month) return null;
    const day = parseInt(singleMatch[2], 10);
    const year = inferYear(month, day, now);

    let date: LocalDate;
    try {
        date = LocalDate.of(year, month, day);
    } catch {
        return null;
    }
    return { kind: "single", date, time: parseTimeRange(text) };
}

// --- Excerpt / variant helpers -----------------------------------------

// The class date/time is usually described in the first one or two
// <strong> tags of the excerpt; the rest is body copy (which can itself
// contain numbers, e.g. "Week 1", that would otherwise confuse the date
// regexes above). Restricting to the leading <strong> tags also correctly
// yields "no date" for excerpts that open with pricing text instead
// ("Sliding scale pricing (use codes below): $355-$375-$395") — those items
// rely on variant-level dates (Case A) or bare-time variants (Case B).
export function extractExcerptDateText(excerptHtml: string): string {
    if (!excerptHtml) return "";
    const root = parse(excerptHtml);
    const strongs = root.querySelectorAll("strong").slice(0, 2);
    return decode(strongs.map(s => s.text).join(" ")).replace(/\s+/g, " ").trim();
}

function isDatesAvailableKey(key: string): boolean {
    const k = key.toLowerCase();
    return k.includes("available") && /dates?/.test(k);
}

// Distinct non-empty "Dates Available" / "Available Dates" values across all
// of an item's variants (Case A: each is an independently-purchasable
// session of the same class).
function collectVariantDateStrings(variants: SquarespaceVariant[]): string[] {
    const seen = new Set<string>();
    for (const v of variants) {
        for (const [key, value] of Object.entries(v.attributes ?? {})) {
            if (isDatesAvailableKey(key) && value && value.trim()) seen.add(value.trim());
        }
    }
    return Array.from(seen);
}

// Case B: 2+ variants offering the same day at different bare times ("3-4pm"
// .. "7-8pm") via a "Time" attribute.
function bareTimeVariants(variants: SquarespaceVariant[]): SquarespaceVariant[] {
    return variants.filter(v => typeof v.attributes?.["Time"] === "string" && v.attributes!["Time"].trim());
}

function minPriceOf(variants: SquarespaceVariant[]): EventCost | undefined {
    const prices = variants.map(v => v.price).filter((p): p is number => typeof p === "number");
    if (prices.length === 0) return undefined;
    return { min: Math.min(...prices) / 100 };
}

function dateKey(d: LocalDate): string {
    return `${d.year()}${String(d.monthValue()).padStart(2, "0")}${String(d.dayOfMonth()).padStart(2, "0")}`;
}

function timeKey(hour: number, minute: number): string {
    return `${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
}

// Builds one event (plus, when the time is unknown, its paired
// UncertaintyError) for a single calendar date.
function buildSingleEvent(
    item: SquarespaceItem,
    date: LocalDate,
    time: TimeInfo | null,
    cost: EventCost | undefined,
    idSuffix: string,
): (RipperCalendarEvent | RipperError)[] {
    const id = `reclaim-clay-${item.urlId}-${idSuffix}`;
    const hour = time?.startHour ?? DEFAULT_UNKNOWN_TIME_HOUR;
    const minute = time?.startMinute ?? DEFAULT_UNKNOWN_TIME_MINUTE;

    let duration = DEFAULT_DURATION;
    if (time?.endHour !== undefined && time.endMinute !== undefined) {
        const startTotal = hour * 60 + minute;
        const endTotal = time.endHour * 60 + time.endMinute;
        if (endTotal > startTotal) duration = Duration.ofMinutes(endTotal - startTotal);
    }

    const date_ = ZonedDateTime.of(date.year(), date.monthValue(), date.dayOfMonth(), hour, minute, 0, 0, TIMEZONE);
    const event: RipperCalendarEvent = {
        id,
        ripped: new Date(),
        date: date_,
        duration,
        summary: item.title,
        location: LOCATION,
        url: BASE_URL + item.fullUrl,
        ...(cost ? { cost } : {}),
    };

    if (time) return [event];

    const uncertainty: UncertaintyError = {
        type: "Uncertainty",
        reason: `Reclaim Clay listing for "${item.title}" did not include a start time`,
        source: "reclaim-clay",
        unknownFields: ["startTime"],
        event,
    };
    return [event, uncertainty];
}

// Cheap deterministic hash (stability, not crypto strength) used to
// disambiguate ids when two distinct source date-strings could otherwise
// expand to occurrences on the same calendar date — e.g. two different
// "Intro To Wheel" weekly variants (different instructors/series) whose
// ranges happen to touch on the same day. Hashing the raw source string
// keeps the suffix stable across builds.
function shortHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

// Expands a parsed date (weekly / range / single) into events. Shared by
// Case A (per variant date string — `extraIdSuffix` disambiguates ids when
// multiple variant strings could land on the same calendar date) and Case C
// (excerpt-only, so `extraIdSuffix` is omitted — there's only one date
// string per item).
function buildEventsFromParsedDate(
    item: SquarespaceItem,
    parsed: ParsedDateText,
    cost: EventCost | undefined,
    extraIdSuffix?: string,
): (RipperCalendarEvent | RipperError)[] {
    const suffixed = (base: string) => extraIdSuffix ? `${base}-${extraIdSuffix}` : base;

    if (parsed.kind === "weekly") {
        const results: (RipperCalendarEvent | RipperError)[] = [];
        let cursor = parsed.start;
        while (!cursor.isAfter(parsed.end)) {
            results.push(...buildSingleEvent(item, cursor, parsed.time, cost, suffixed(dateKey(cursor))));
            cursor = cursor.plusWeeks(1);
        }
        return results;
    }

    if (parsed.kind === "range") {
        const startHour = parsed.time?.startHour ?? DEFAULT_UNKNOWN_TIME_HOUR;
        const startMinute = parsed.time?.startMinute ?? DEFAULT_UNKNOWN_TIME_MINUTE;
        const endHour = parsed.time?.endHour ?? startHour;
        const endMinute = parsed.time?.endMinute ?? startMinute;

        const startZdt = ZonedDateTime.of(parsed.start.year(), parsed.start.monthValue(), parsed.start.dayOfMonth(), startHour, startMinute, 0, 0, TIMEZONE);
        const endZdt = ZonedDateTime.of(parsed.end.year(), parsed.end.monthValue(), parsed.end.dayOfMonth(), endHour, endMinute, 0, 0, TIMEZONE);
        let duration = Duration.between(startZdt, endZdt);
        if (duration.isZero() || duration.isNegative()) duration = DEFAULT_DURATION;

        const id = `reclaim-clay-${item.urlId}-${suffixed(dateKey(parsed.start))}`;
        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date: startZdt,
            duration,
            summary: item.title,
            location: LOCATION,
            url: BASE_URL + item.fullUrl,
            ...(cost ? { cost } : {}),
        };
        if (parsed.time) return [event];
        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            reason: `Reclaim Clay listing for "${item.title}" did not include a start time`,
            source: "reclaim-clay",
            unknownFields: ["startTime"],
            event,
        };
        return [event, uncertainty];
    }

    return buildSingleEvent(item, parsed.date, parsed.time, cost, suffixed(dateKey(parsed.date)));
}

// Public for testing. Parses one Squarespace store item (already filtered to
// productType === 3) into its calendar event(s). Never returns null — every
// code path is an event, an UncertaintyError, or a ParseError.
export function parseItem(item: SquarespaceItem, now: LocalDate): (RipperCalendarEvent | RipperError)[] {
    const variants = item.structuredContent?.variants ?? [];
    const variantDateStrings = collectVariantDateStrings(variants);

    // Case A: each distinct "Dates Available"/"Available Dates" value is an
    // independently-purchasable session of this same class.
    if (variantDateStrings.length > 0) {
        const results: (RipperCalendarEvent | RipperError)[] = [];
        for (const dateStr of variantDateStrings) {
            const parsed = parseDateText(dateStr, now);
            if (!parsed) {
                results.push({ type: "ParseError", reason: `Could not parse variant date "${dateStr}"`, context: item.title });
                continue;
            }
            const matchingVariants = variants.filter(v =>
                Object.entries(v.attributes ?? {}).some(([k, val]) => isDatesAvailableKey(k) && val && val.trim() === dateStr)
            );
            results.push(...buildEventsFromParsedDate(item, parsed, minPriceOf(matchingVariants), shortHash(dateStr)));
        }
        return results;
    }

    const timeVariants = bareTimeVariants(variants);

    // Case B: one shared day (from the excerpt) offered at several bare
    // time-of-day slots via a "Time" variant attribute.
    if (timeVariants.length >= 2) {
        const excerptText = extractExcerptDateText(item.excerpt ?? "");
        const parsed = excerptText ? parseDateText(excerptText, now) : null;
        if (!parsed || parsed.kind !== "single") {
            return [{
                type: "ParseError",
                reason: "Could not parse a base date from the excerpt for time-slot variants",
                context: item.title,
            }];
        }

        const results: (RipperCalendarEvent | RipperError)[] = [];
        for (const v of timeVariants) {
            const timeStr = v.attributes!["Time"].trim();
            const time = parseTimeRange(timeStr);
            if (!time) {
                results.push({ type: "ParseError", reason: `Could not parse time slot "${timeStr}"`, context: item.title });
                continue;
            }
            const idSuffix = `${dateKey(parsed.date)}-${timeKey(time.startHour, time.startMinute)}`;
            results.push(...buildSingleEvent(item, parsed.date, time, minPriceOf([v]), idSuffix));
        }
        return results;
    }

    // Case C: no usable variant dates — parse the excerpt alone.
    const excerptText = extractExcerptDateText(item.excerpt ?? "");
    const parsed = excerptText ? parseDateText(excerptText, now) : null;
    if (!parsed) {
        return [{ type: "ParseError", reason: "Could not find a date in the excerpt", context: item.title }];
    }
    return buildEventsFromParsedDate(item, parsed, minPriceOf(variants));
}

// Public for testing. Filters to workshop/class products (skipping gift
// cards etc., which aren't events) and parses each into event(s)/error(s).
export function parseItems(items: SquarespaceItem[], now: LocalDate): (RipperCalendarEvent | RipperError)[] {
    const results: (RipperCalendarEvent | RipperError)[] = [];
    for (const item of items) {
        const sc = item.structuredContent;
        if (!sc || sc._type !== "StoreItem") continue;
        if (sc.productType !== WORKSHOP_PRODUCT_TYPE) continue;
        try {
            results.push(...parseItem(item, now));
        } catch (err) {
            results.push({
                type: "ParseError",
                reason: `Failed to parse Reclaim Clay item: ${err instanceof Error ? err.message : String(err)}`,
                context: item.title,
            });
        }
    }
    return results;
}

export default class ReclaimClayRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        if (!calConfig) throw new Error("No calendars configured");

        const res = await this.fetchFn(ITEMS_URL, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
            signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
            throw new Error(`Reclaim Clay Collective error: HTTP ${res.status}`);
        }
        const json = await res.json() as SquarespaceStoreResponse;
        const now = LocalDate.now();
        const results = parseItems(json.items ?? [], now);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => "date" in e),
            errors: results.filter((e): e is RipperError => "type" in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
