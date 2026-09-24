import { Duration, LocalDate, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, EventCost } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const ITEMS_URL = "https://vortexpottery.com/pottery-classes-seattle-washington?format=json";
const BASE_URL = "https://vortexpottery.com";
const LOCATION = "Vortex Pottery, 517 Aloha St, Seattle, WA 98109";

// Vortex Pottery's Squarespace store lists each weekly class slot (Mondays,
// Tuesdays, ...) as a single StoreItem that the studio edits in place every
// term — the same product urlId carries a new title/excerpt/price each time
// a new 6-week session is scheduled. productType 3 is a real class/workshop
// (as opposed to a gift card or other non-event product type).
const CLASS_PRODUCT_TYPE = 3;

interface SquarespaceVariant {
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

// The excerpt's first heading is always "<Weekday>s - <Month> <D> to <Month>
// <D>, <YYYY>" (sometimes split across two <strong> tags inside that one
// heading, e.g. "<strong>Wednesdays</strong> - <strong>November 4 to
// December 9, 2026</strong>" — extracting the heading's full text handles
// both shapes identically).
const HEADING_DATE_RANGE_RE =
    /^([A-Za-z]+)s\s*-\s*([A-Za-z]+)\s+(\d{1,2})\s+to\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/;

const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// The title always carries the class's time-of-day range as "H to H am/pm",
// "H am/pm to H am/pm", or "H To H am/pm" (case varies) — a single trailing
// meridiem is shared with the leading hour when the leading hour has none of
// its own, e.g. "6 to 9 pm" -> 6pm-9pm.
const TITLE_TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*to\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

interface TimeRange {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
}

function to24Hour(hour: number, isPm: boolean): number {
    if (isPm && hour !== 12) return hour + 12;
    if (!isPm && hour === 12) return 0;
    return hour;
}

// Public for testing.
export function parseTitleTimeRange(title: string): TimeRange | null {
    const m = TITLE_TIME_RE.exec(title);
    if (!m) return null;
    const [, h1, min1, mer1, h2, min2, mer2] = m;
    const startHour24 = parseInt(h1, 10);
    const startMinute = min1 ? parseInt(min1, 10) : 0;
    const endHour = to24Hour(parseInt(h2, 10), mer2.toLowerCase() === "pm");
    const endMinute = min2 ? parseInt(min2, 10) : 0;

    // When the leading hour has no meridiem of its own, inherit the
    // trailing one ("6 to 9 pm" -> 6pm). But blindly inheriting can invert
    // a cross-noon range with no explicit leading meridiem ("10 to 1 pm"
    // read as 10pm-1pm instead of the intended 10am-1pm) — these listings
    // are always same-day forward ranges, so if inheriting the trailing
    // meridiem would put the start at or after the end, the leading hour
    // must have meant the other meridiem instead.
    const inheritedIsPm = (mer1 ?? mer2).toLowerCase() === "pm";
    let startHour = to24Hour(startHour24, inheritedIsPm);
    if (!mer1 && startHour * 60 + startMinute >= endHour * 60 + endMinute) {
        startHour = to24Hour(startHour24, !inheritedIsPm);
    }

    return { startHour, startMinute, endHour, endMinute };
}

interface DateRange {
    start: LocalDate;
    end: LocalDate;
}

// Shared by extractHeadingDateRange and extractWorkshopHeading: finds the
// excerpt's first <h3> and returns its decoded, whitespace-normalized text,
// or null if there's no heading at all.
function getFirstHeadingText(excerptHtml: string): string | null {
    if (!excerptHtml) return null;
    const root = parse(excerptHtml);
    const heading = root.querySelector("h3");
    if (!heading) return null;
    return decode(heading.text).replace(/\s+/g, " ").trim();
}

// Extracts the "<Weekday>s - <Month> D to <Month> D, YYYY" shape from
// already-extracted heading text into a concrete weekly date range. The
// stated year trails the *end* date; the start date's year is the same
// unless the start month falls after the end month, which means the range
// crosses a year boundary (e.g. "December 15 to January 19, 2027") and the
// start is really in the preceding year.
function parseWeeklyRangeFromHeadingText(text: string): DateRange | null {
    const m = HEADING_DATE_RANGE_RE.exec(text);
    if (!m) return null;
    const [, , startMonthName, startDay, endMonthName, endDay, yearStr] = m;
    const startMonth = MONTH_NAMES[startMonthName.toLowerCase()];
    const endMonth = MONTH_NAMES[endMonthName.toLowerCase()];
    if (!startMonth || !endMonth) return null;

    const endYear = parseInt(yearStr, 10);
    const startYear = startMonth > endMonth ? endYear - 1 : endYear;
    try {
        const start = LocalDate.of(startYear, startMonth, parseInt(startDay, 10));
        const end = LocalDate.of(endYear, endMonth, parseInt(endDay, 10));
        if (end.isBefore(start)) return null;
        return { start, end };
    } catch {
        return null;
    }
}

// Public for testing. Extracts an excerpt's weekly date range directly from
// its raw HTML — parseItem instead calls getFirstHeadingText once and reuses
// the extracted text for both this shape and the workshop shape below, so
// this wrapper (and extractWorkshopHeading's) only re-parses the HTML when
// called on their own, e.g. from a test.
export function extractHeadingDateRange(excerptHtml: string): DateRange | null {
    const text = getFirstHeadingText(excerptHtml);
    return text ? parseWeeklyRangeFromHeadingText(text) : null;
}

// A one-off guest workshop (as opposed to a recurring weekly class) carries
// an explicit two-day list plus its own time range in the same heading,
// e.g. "October 10 & 11, 2026 | Saturday & Sunday | 9.30 AM - 4 PM" — unlike
// the weekly classes, the title has no time range at all, so the heading is
// the only source of both. Minutes may use a period instead of a colon
// ("9.30"). Only the two-day "D1 & D2" shape (every guest workshop seen so
// far is a single weekend) is supported; a longer or cross-month list falls
// through to extractHeadingDateRange's caller's "could not find a weekly
// date range" error rather than guessing.
const WORKSHOP_HEADING_RE =
    /^([A-Za-z]+)\s+(\d{1,2})\s*&\s*(\d{1,2}),\s*(\d{4})\s*\|[^|]*\|\s*(\d{1,2})(?:[.:](\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?:[.:](\d{2}))?\s*(AM|PM)\s*$/i;

interface WorkshopDates {
    dates: LocalDate[];
    time: TimeRange;
}

function parseWorkshopFromHeadingText(text: string): WorkshopDates | null {
    const m = WORKSHOP_HEADING_RE.exec(text);
    if (!m) return null;
    const [, monthName, day1Str, day2Str, yearStr, h1, min1, mer1, h2, min2, mer2] = m;
    const month = MONTH_NAMES[monthName.toLowerCase()];
    if (!month) return null;
    const year = parseInt(yearStr, 10);

    let dates: LocalDate[];
    try {
        dates = [
            LocalDate.of(year, month, parseInt(day1Str, 10)),
            LocalDate.of(year, month, parseInt(day2Str, 10)),
        ];
    } catch {
        return null;
    }

    const time: TimeRange = {
        startHour: to24Hour(parseInt(h1, 10), mer1.toLowerCase() === "pm"),
        startMinute: min1 ? parseInt(min1, 10) : 0,
        endHour: to24Hour(parseInt(h2, 10), mer2.toLowerCase() === "pm"),
        endMinute: min2 ? parseInt(min2, 10) : 0,
    };
    return { dates, time };
}

// Public for testing. See the note on extractHeadingDateRange above about
// why parseItem doesn't call this directly.
export function extractWorkshopHeading(excerptHtml: string): WorkshopDates | null {
    const text = getFirstHeadingText(excerptHtml);
    return text ? parseWorkshopFromHeadingText(text) : null;
}

function minPriceOf(variants: SquarespaceVariant[]): EventCost | undefined {
    const prices = variants.map(v => v.price).filter((p): p is number => typeof p === "number");
    if (prices.length === 0) return undefined;
    return { min: Math.min(...prices) / 100 };
}

function dateKey(d: LocalDate): string {
    return `${d.year()}${String(d.monthValue()).padStart(2, "0")}${String(d.dayOfMonth()).padStart(2, "0")}`;
}

// Builds a single event for `date`, sharing the fields common to both the
// weekly-class and one-off-workshop shapes.
function buildEvent(item: SquarespaceItem, date: LocalDate, time: TimeRange, cost: EventCost | undefined): RipperCalendarEvent {
    const startTotal = time.startHour * 60 + time.startMinute;
    const endTotal = time.endHour * 60 + time.endMinute;
    const duration = endTotal > startTotal ? Duration.ofMinutes(endTotal - startTotal) : Duration.ofHours(3);
    return {
        id: `vortex-pottery-${item.urlId}-${dateKey(date)}`,
        ripped: new Date(),
        date: ZonedDateTime.of(date.year(), date.monthValue(), date.dayOfMonth(), time.startHour, time.startMinute, 0, 0, TIMEZONE),
        duration,
        summary: item.title,
        location: LOCATION,
        url: BASE_URL + item.fullUrl,
        ...(cost ? { cost } : {}),
    };
}

// Public for testing. Never returns null — every code path is an event or a
// ParseError (per AGENTS.md's "parse methods must never return null" rule).
export function parseItem(item: SquarespaceItem): (RipperCalendarEvent | RipperError)[] {
    const cost = minPriceOf(item.structuredContent?.variants ?? []);
    // Extracted once and reused below — both shapes read the same excerpt
    // heading, and parsing the HTML twice per item would be wasted work.
    const headingText = getFirstHeadingText(item.excerpt ?? "");

    // The common shape: a recurring weekly class, whose weekday cadence and
    // date range live in the heading and whose time-of-day lives in the title.
    const range = headingText ? parseWeeklyRangeFromHeadingText(headingText) : null;
    if (range) {
        const time = parseTitleTimeRange(item.title);
        if (!time) {
            return [{ type: "ParseError", reason: "Could not find a time range in the title", context: item.title }];
        }
        const results: RipperCalendarEvent[] = [];
        let cursor = range.start;
        while (!cursor.isAfter(range.end)) {
            results.push(buildEvent(item, cursor, time, cost));
            cursor = cursor.plusWeeks(1);
        }
        return results;
    }

    // A one-off guest workshop: an explicit two-day list plus its own time
    // range, both from the heading — the title has no time of day at all.
    const workshop = headingText ? parseWorkshopFromHeadingText(headingText) : null;
    if (workshop) {
        return workshop.dates.map(date => buildEvent(item, date, workshop.time, cost));
    }

    return [{ type: "ParseError", reason: "Could not find a weekly date range in the excerpt heading", context: item.title }];
}

// Public for testing. Filters to class products (skipping gift cards etc.)
// and parses each into event(s)/error(s).
export function parseItems(items: SquarespaceItem[]): (RipperCalendarEvent | RipperError)[] {
    const results: (RipperCalendarEvent | RipperError)[] = [];
    for (const item of items) {
        const sc = item.structuredContent;
        if (!sc || sc._type !== "StoreItem") continue;
        if (sc.productType !== CLASS_PRODUCT_TYPE) continue;
        try {
            results.push(...parseItem(item));
        } catch (err) {
            results.push({
                type: "ParseError",
                reason: `Failed to parse Vortex Pottery item: ${err instanceof Error ? err.message : String(err)}`,
                context: item.title,
            });
        }
    }
    return results;
}

export default class VortexPotteryRipper implements IRipper {
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
            throw new Error(`Vortex Pottery error: HTTP ${res.status}`);
        }
        const json = await res.json() as SquarespaceStoreResponse;
        const results = parseItems(json.items ?? []);

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
