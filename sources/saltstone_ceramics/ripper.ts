import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { ChronoUnit, Duration, LocalDate, LocalTime, ZonedDateTime } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

// Saltstone Ceramics (saltstoneceramics.com) is a Shopify storefront. Its
// `/products.json` catalog mixes plain retail merchandise with bookable
// classes/workshops/camps (`product_type: "retail-class"`). There is no
// structured start/end field for the class schedule — it's embedded in the
// free-text product title, e.g.:
//   "Clay Curious: Sunday September 20th, 6:30pm - 8:30pm"
//   "Fall Advanced Wheel: Thursday Evenings, 6:30pm - 9:30pm, September 10th - October 29th"
//   "Kid's Clay Camp, Aug 17th - 21st, 9am - 12pm"
//   "Throwing Large Dinnerware Sets: 2 Week Intensive. August 17th - August 27th from 6:30 PM - 9:30 PM"

interface ShopifyVariant {
    price: string;
    available: boolean;
}

interface ShopifyImage {
    src: string;
}

interface ShopifyProduct {
    id: number;
    title: string;
    handle: string;
    product_type: string;
    body_html?: string;
    variants: ShopifyVariant[];
    images: ShopifyImage[];
}

const MONTHS: Record<string, number> = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sept: 9, sep: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12,
};
// Longest names first so "september" isn't cut short by an earlier "sep" alternative match.
const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const WEEKDAY_TO_ICAL: Record<string, string> = {
    monday: "MO", tuesday: "TU", wednesday: "WE", thursday: "TH",
    friday: "FR", saturday: "SA", sunday: "SU",
};
const WEEKDAY_PATTERN = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/i;

// "September 10th - October 29th" (two full month+day tokens)
const RANGE_CROSS_MONTH = new RegExp(`(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)\\s*-\\s*(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)`, "i");
// "Aug 17th - 21st" (one month token, a day range)
const RANGE_SAME_MONTH = new RegExp(`(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)\\s*-\\s*(\\d{1,2})(?:st|nd|rd|th)`, "i");
// "September 20th" (single date, no range)
const SINGLE_DATE = new RegExp(`(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)`, "i");
const TIME_PATTERN = /(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)/gi;

// A product listing already >3 days in the past (relative to build time) is
// assumed to be next year's occurrence rather than a fabricated guess at a
// specific recurrence; within the grace window it's left as this year (a
// multi-day class/camp that's already started still resolves correctly via
// its *end* date, which is what year resolution is anchored to below).
const PAST_TOLERANCE_DAYS = 3;

interface ParsedSchedule {
    start: LocalDate;
    end: LocalDate;
    startTime: LocalTime;
    endTime: LocalTime;
    weekday: string | null; // lowercase day name, e.g. "thursday"
}

function resolveYear(month: number, day: number, today: LocalDate): LocalDate {
    let candidate = LocalDate.of(today.year(), month, day);
    if (candidate.isBefore(today.minusDays(PAST_TOLERANCE_DAYS))) {
        candidate = candidate.plusYears(1);
    }
    return candidate;
}

function parseTimeToken(match: RegExpMatchArray): LocalTime {
    let hour = parseInt(match[1]);
    const minute = match[2] ? parseInt(match[2]) : 0;
    const meridiem = match[3].toLowerCase().replace(/\./g, "");
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return LocalTime.of(hour, minute);
}

function parseSchedule(title: string, today: LocalDate): ParsedSchedule | null {
    const times = [...title.matchAll(TIME_PATTERN)];
    if (times.length < 2) return null;
    const startTime = parseTimeToken(times[0]);
    const endTime = parseTimeToken(times[times.length - 1]);
    const weekdayMatch = title.match(WEEKDAY_PATTERN);
    const weekday = weekdayMatch ? weekdayMatch[1].toLowerCase() : null;

    const crossMatch = title.match(RANGE_CROSS_MONTH);
    if (crossMatch) {
        const startMonth = MONTHS[crossMatch[1].toLowerCase()];
        const startDay = parseInt(crossMatch[2]);
        const endMonth = MONTHS[crossMatch[3].toLowerCase()];
        const endDay = parseInt(crossMatch[4]);
        const end = resolveYear(endMonth, endDay, today);
        const startYear = startMonth > endMonth ? end.year() - 1 : end.year();
        const start = LocalDate.of(startYear, startMonth, startDay);
        return { start, end, startTime, endTime, weekday };
    }

    const sameMonthMatch = title.match(RANGE_SAME_MONTH);
    if (sameMonthMatch) {
        const month = MONTHS[sameMonthMatch[1].toLowerCase()];
        const startDay = parseInt(sameMonthMatch[2]);
        const endDay = parseInt(sameMonthMatch[3]);
        const end = resolveYear(month, endDay, today);
        const start = LocalDate.of(end.year(), month, startDay);
        return { start, end, startTime, endTime, weekday };
    }

    const singleMatch = title.match(SINGLE_DATE);
    if (singleMatch) {
        const month = MONTHS[singleMatch[1].toLowerCase()];
        const day = parseInt(singleMatch[2]);
        const date = resolveYear(month, day, today);
        return { start: date, end: date, startTime, endTime, weekday: null };
    }

    return null;
}

const ICAL_TO_DAY_OF_WEEK: Record<string, number> = {
    MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7,
};

// Expands a schedule into the concrete calendar dates the class actually
// meets. Each occurrence becomes its own event (rather than a single VEVENT
// with an RRULE) so every session shows its real date on the calendar.
function expandOccurrences(schedule: ParsedSchedule): LocalDate[] {
    if (schedule.start.equals(schedule.end)) return [schedule.start];

    if (schedule.weekday) {
        const targetDow = ICAL_TO_DAY_OF_WEEK[WEEKDAY_TO_ICAL[schedule.weekday]];
        const dates: LocalDate[] = [];
        for (let d = schedule.start; !d.isAfter(schedule.end); d = d.plusDays(1)) {
            if (d.dayOfWeek().value() === targetDow) dates.push(d);
        }
        return dates;
    }

    const spanDays = schedule.start.until(schedule.end, ChronoUnit.DAYS);
    const dates: LocalDate[] = [];
    for (let d = schedule.start; !d.isAfter(schedule.end); d = d.plusDays(1)) {
        // Short, contiguous span with no stated weekday (e.g. a 3-day workshop)
        // meets every calendar day, weekends included. A longer span with no
        // stated weekday (e.g. a "2 week intensive" or weekday day-camp) is
        // assumed to meet weekdays only - the pattern seen in practice.
        if (spanDays <= 6 || (d.dayOfWeek().value() >= 1 && d.dayOfWeek().value() <= 5)) {
            dates.push(d);
        }
    }
    return dates;
}

function stripHtml(html: string): string {
    return html.replace(/<\/?[^>]+(>|$)/g, " ").replace(/\s+/g, " ").trim();
}

export default class SaltstoneCeramicsRipper extends JSONRipper {
    private seenIds = new Set<string>();

    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        if (!jsonData.products || !Array.isArray(jsonData.products)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing products array",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }

        const zone = date.zone();
        const today = date.toLocalDate();

        for (const product of jsonData.products as ShopifyProduct[]) {
            if (product.product_type !== "retail-class") continue;
            if (this.seenIds.has(product.handle)) continue;
            this.seenIds.add(product.handle);

            const schedule = parseSchedule(product.title, today);
            if (!schedule) {
                events.push({
                    type: "ParseError",
                    reason: `Could not parse a date/time schedule from title: "${product.title}"`,
                    context: product.handle
                });
                continue;
            }

            const sessionDuration = Duration.between(schedule.startTime, schedule.endTime);
            if (sessionDuration.isNegative() || sessionDuration.isZero()) {
                events.push({
                    type: "ParseError",
                    reason: `Parsed end time is not after start time in title: "${product.title}"`,
                    context: product.handle
                });
                continue;
            }

            const variant = product.variants?.[0];
            const cost = variant
                ? (variant.available ? { min: parseFloat(variant.price) } : { soldOut: true as const })
                : undefined;
            const description = product.body_html ? stripHtml(product.body_html) : undefined;
            const occurrences = expandOccurrences(schedule);
            const isMultiSession = occurrences.length > 1;

            for (const occurrence of occurrences) {
                const calendarEvent: RipperCalendarEvent = {
                    // Shopify handles are already stable/unique; a multi-session
                    // class appends the occurrence date so each session gets its
                    // own id without depending on array position.
                    id: isMultiSession ? `${product.handle}-${occurrence.toString()}` : product.handle,
                    ripped: new Date(),
                    date: ZonedDateTime.of(occurrence, schedule.startTime, zone),
                    duration: sessionDuration,
                    summary: product.title,
                    description,
                    location: "Saltstone Ceramics, 2206 N 45th St, Seattle, WA 98103",
                    url: `https://saltstoneceramics.com/products/${product.handle}`,
                    imageUrl: product.images?.[0]?.src,
                    cost,
                };

                events.push(calendarEvent);
            }
        }

        return events;
    }
}
