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
    const sharedMeridiem = mer2.toLowerCase();
    const startIsPm = (mer1 ?? mer2).toLowerCase() === "pm";
    return {
        startHour: to24Hour(parseInt(h1, 10), startIsPm),
        startMinute: min1 ? parseInt(min1, 10) : 0,
        endHour: to24Hour(parseInt(h2, 10), sharedMeridiem === "pm"),
        endMinute: min2 ? parseInt(min2, 10) : 0,
    };
}

interface DateRange {
    start: LocalDate;
    end: LocalDate;
}

// Public for testing. Extracts the "<Weekday>s - <Month> D to <Month> D,
// YYYY" heading text into a concrete weekly date range. The heading names an
// explicit year, so there's no "infer the year" ambiguity here.
export function extractHeadingDateRange(excerptHtml: string): DateRange | null {
    if (!excerptHtml) return null;
    const root = parse(excerptHtml);
    const heading = root.querySelector("h3");
    if (!heading) return null;
    const text = decode(heading.text).replace(/\s+/g, " ").trim();

    const m = HEADING_DATE_RANGE_RE.exec(text);
    if (!m) return null;
    const [, , startMonthName, startDay, endMonthName, endDay, yearStr] = m;
    const startMonth = MONTH_NAMES[startMonthName.toLowerCase()];
    const endMonth = MONTH_NAMES[endMonthName.toLowerCase()];
    if (!startMonth || !endMonth) return null;

    const year = parseInt(yearStr, 10);
    try {
        return {
            start: LocalDate.of(year, startMonth, parseInt(startDay, 10)),
            end: LocalDate.of(year, endMonth, parseInt(endDay, 10)),
        };
    } catch {
        return null;
    }
}

function minPriceOf(variants: SquarespaceVariant[]): EventCost | undefined {
    const prices = variants.map(v => v.price).filter((p): p is number => typeof p === "number");
    if (prices.length === 0) return undefined;
    return { min: Math.min(...prices) / 100 };
}

function dateKey(d: LocalDate): string {
    return `${d.year()}${String(d.monthValue()).padStart(2, "0")}${String(d.dayOfMonth()).padStart(2, "0")}`;
}

// Public for testing. Never returns null — every code path is an event or a
// ParseError (per AGENTS.md's "parse methods must never return null" rule).
export function parseItem(item: SquarespaceItem): (RipperCalendarEvent | RipperError)[] {
    const range = extractHeadingDateRange(item.excerpt ?? "");
    if (!range) {
        return [{ type: "ParseError", reason: "Could not find a weekly date range in the excerpt heading", context: item.title }];
    }
    const time = parseTitleTimeRange(item.title);
    if (!time) {
        return [{ type: "ParseError", reason: "Could not find a time range in the title", context: item.title }];
    }

    const startTotal = time.startHour * 60 + time.startMinute;
    const endTotal = time.endHour * 60 + time.endMinute;
    const duration = endTotal > startTotal ? Duration.ofMinutes(endTotal - startTotal) : Duration.ofHours(3);
    const cost = minPriceOf(item.structuredContent?.variants ?? []);

    const results: (RipperCalendarEvent | RipperError)[] = [];
    let cursor = range.start;
    while (!cursor.isAfter(range.end)) {
        const date = ZonedDateTime.of(cursor.year(), cursor.monthValue(), cursor.dayOfMonth(), time.startHour, time.startMinute, 0, 0, TIMEZONE);
        results.push({
            id: `vortex-pottery-${item.urlId}-${dateKey(cursor)}`,
            ripped: new Date(),
            date,
            duration,
            summary: item.title,
            location: LOCATION,
            url: BASE_URL + item.fullUrl,
            ...(cost ? { cost } : {}),
        });
        cursor = cursor.plusWeeks(1);
    }
    return results;
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
