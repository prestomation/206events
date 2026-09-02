import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, LocalDate, LocalTime, ZonedDateTime } from "@js-joda/core";
import {
    EventCost,
    RipperEvent,
    RipperCalendarEvent,
    UncertaintyError,
    UncertaintyField,
} from "../../lib/config/schema.js";
import { decode } from "html-entities";

// seattleartistleague.com is a WooCommerce store. Its public "Store API"
// (used by the site's own headless cart widgets, no auth required) returns
// every class as a product. There is no structured start-date field — the
// class start date lives only in the free-text product title, e.g.:
//   "Beginning Drawing WEDNESDAY EVENING begins 10.28"
//   "Beginning Pottery: One Shot Pot FRIDAY EVENING on 12.4"
//   "Beginning Wheel 1  WEDNESDAY EVENING 9.2"
// Time (and occasionally an off-site location) is embedded as free-text
// "Time:"/"Where:" bullets inside short_description, in varying wording
// ("Date:"/"Class Days:", "Teacher:"/"Instructor:") - not every product has
// a "Time:" bullet, in which case the event is published with a placeholder
// time and flagged via UncertaintyError (see docs/event-uncertainty.md).

interface WooCategory {
    name: string;
}

interface WooImage {
    src: string;
}

interface WooProduct {
    id: number;
    name: string;
    slug: string;
    permalink: string;
    short_description?: string;
    categories?: WooCategory[];
    images?: WooImage[];
    prices?: { price: string; currency_minor_unit: number };
    is_in_stock?: boolean;
}

const SOURCE_NAME = "seattle-artist-league";
const DEFAULT_VENUE_LOCATION = "Seattle Artist League, 5516 4th Ave S, Seattle, WA 98108";
// "The Brick" (5513 6th Ave S) is a separate SAL-run space at a different
// street address from the main studio above - a title mentioning it is a
// signal the default venue address may not apply to this listing.
const OFF_SITE_TITLE_MARKER = /@\s*the\s+brick\b/i;

// Categories that never carry a dated, attendable class (memberships, store
// credit) - skipped in the caller per the "filters belong in the caller, not
// the parse method" rule (AGENTS.md).
const NON_CLASS_CATEGORIES = new Set(["Membership", "Payment Due"]);

const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_DURATION = Duration.ofHours(2);
// A start date already >3 days in the past (relative to build time) is
// assumed to be next year's occurrence rather than a fabricated guess at a
// specific recurrence.
const PAST_TOLERANCE_DAYS = 3;

// The class start date is the last "M.D" token in the title (e.g. "begins
// 10.28", "on 9.2 12.4"). Course-length/week-count mentions ("8 classes",
// "4-Week", "10 Weeks") never contain a literal ".", but a session-length
// decimal ("3.5 hour workshop") does and would be misread as March 5th if
// it happened to trail the real date - excluded via the negative lookahead
// below rather than relied on to always come first in the title.
const TITLE_DATE_PATTERN = /(\d{1,2})\.(\d{1,2})(?!\d)(?!\s*hours?\b)/gi;

const TIME_TOKEN_PATTERN = /(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)/gi;
// Shorthand range where only the end time states am/pm (e.g. "6:00 – 8:30
// pm", "10:00 – 1:00 pm"). The start hour's meridiem is ambiguous from text
// alone - parseTimeRange resolves it by trying the end's meridiem first,
// then the other, keeping whichever produces a plausible span.
const TIME_RANGE_SHORTHAND = /(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)/i;

// Known label bullets seen in short_description, used only to bound where a
// field's free-text value ends (the next label starts).
const FIELD_LABELS = [
    "Date", "Time", "Class Days", "Class Length", "Course Length",
    "Teacher", "Instructor", "Where", "Materials fee", "Price",
];

function stripHtml(html: string): string {
    return decode(html.replace(/<\/?[^>]+(>|$)/g, " ").replace(/\s+/g, " ")).trim();
}

// Returns the free-text value following "<label>:" in flattened text, cut
// off at the nearest following known label (or `maxLen` characters,
// whichever comes first) so a missing/unrecognized closing boundary can
// never swallow the rest of the description.
function fieldAfterLabel(text: string, label: string, maxLen = 150): string | undefined {
    const labelMatch = text.match(new RegExp(`\\b${label}:\\s*`, "i"));
    if (!labelMatch || labelMatch.index === undefined) return undefined;
    const start = labelMatch.index + labelMatch[0].length;
    let end = Math.min(text.length, start + maxLen);
    for (const other of FIELD_LABELS) {
        if (other === label) continue;
        const otherIdx = text.indexOf(other + ":", start);
        if (otherIdx !== -1 && otherIdx < end) end = otherIdx;
    }
    const value = text.slice(start, end).trim();
    return value || undefined;
}

// LocalDate.of throws DateTimeException for a day that doesn't exist in the
// given month (e.g. Feb 30) - resolveYear lets that propagate so the caller
// can report a specific "found a date but it isn't a real calendar date"
// ParseError, distinct from "no date token found" at all.
function resolveYear(month: number, day: number, today: LocalDate): LocalDate {
    let candidate = LocalDate.of(today.year(), month, day);
    if (candidate.isBefore(today.minusDays(PAST_TOLERANCE_DAYS))) {
        candidate = candidate.plusYears(1);
    }
    return candidate;
}

// The last "M.D" token in the title, before it's checked against the
// calendar (month 1-12, day 1-31 is only a loose range check - resolveYear
// is what catches a day that doesn't exist in that month, e.g. "2.30").
function findLastDateToken(title: string): { month: number; day: number } | null {
    const matches = [...title.matchAll(TITLE_DATE_PATTERN)];
    if (matches.length === 0) return null;
    const last = matches[matches.length - 1];
    const month = parseInt(last[1]);
    const day = parseInt(last[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { month, day };
}

function toLocalTime(hourStr: string, minuteStr: string | undefined, meridiemRaw: string): LocalTime {
    let hour = parseInt(hourStr);
    const minute = minuteStr ? parseInt(minuteStr) : 0;
    const meridiem = meridiemRaw.toLowerCase().replace(/\./g, "");
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return LocalTime.of(hour, minute);
}

function parseTimeToken(match: RegExpMatchArray): LocalTime {
    return toLocalTime(match[1], match[2], match[3]);
}

// A start/end pair is only accepted when it produces a same-day, sub-12-hour
// span - long enough to rule out an accidental wraparound (e.g. reading
// "10:00" as 10pm) while still covering the rare all-day workshop.
function isPlausibleSpan(start: LocalTime, end: LocalTime): boolean {
    const duration = Duration.between(start, end);
    return !duration.isNegative() && !duration.isZero() && duration.toHours() <= 12;
}

// Returns null when no usable "Time:" range was found - the caller falls
// back to a placeholder and flags the event uncertain rather than guessing.
function parseTimeRange(description: string): { start: LocalTime; end: LocalTime } | null {
    const timeField = fieldAfterLabel(description, "Time");
    if (!timeField) return null;

    const tokens = [...timeField.matchAll(TIME_TOKEN_PATTERN)];
    if (tokens.length >= 2) {
        const start = parseTimeToken(tokens[0]);
        const end = parseTimeToken(tokens[tokens.length - 1]);
        return isPlausibleSpan(start, end) ? { start, end } : null;
    }

    // Shorthand range where only the end time states am/pm, e.g.
    // "10:00 – 1:00 pm". The start hour's meridiem is ambiguous from text
    // alone (10am, not 10pm, is what makes this span sensible) - try the
    // end's own meridiem first, then the other, and keep whichever produces
    // a plausible span rather than assuming they always match.
    const shorthand = timeField.match(TIME_RANGE_SHORTHAND);
    if (!shorthand) return null;
    const [, startHour, startMin, endHour, endMin, endMeridiem] = shorthand;
    const end = toLocalTime(endHour, endMin, endMeridiem);
    const endMeridiemNormalized = endMeridiem.toLowerCase().replace(/\./g, "");
    const otherMeridiem = endMeridiemNormalized === "am" ? "pm" : "am";
    for (const meridiem of [endMeridiemNormalized, otherMeridiem]) {
        const start = toLocalTime(startHour, startMin, meridiem);
        if (isPlausibleSpan(start, end)) return { start, end };
    }
    return null;
}

export default class SeattleArtistLeagueRipper extends JSONRipper {
    private seenIds = new Set<string>();

    public async parseEvents(jsonData: any, date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        const products = jsonData?.products ?? jsonData;
        if (!Array.isArray(products)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: expected a products array from the WooCommerce Store API",
                context: JSON.stringify(jsonData).substring(0, 100) + "...",
            }];
        }

        const zone = date.zone();
        const today = date.toLocalDate();

        for (const product of products as WooProduct[]) {
            const categories = (product.categories ?? []).map(c => c.name);
            if (categories.some(c => NON_CLASS_CATEGORIES.has(c))) continue;
            // Remote/virtual sessions aren't a physical Seattle event.
            if (/\bonline\b/i.test(product.name)) continue;
            if (this.seenIds.has(product.slug)) continue;
            this.seenIds.add(product.slug);

            try {
                const dateToken = findLastDateToken(product.name);
                if (!dateToken) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not find a start date (e.g. "begins 10.28") in title: "${product.name}"`,
                        context: product.slug,
                    });
                    continue;
                }

                let startDate: LocalDate;
                try {
                    startDate = resolveYear(dateToken.month, dateToken.day, today);
                } catch (error) {
                    events.push({
                        type: "ParseError",
                        reason: `Found date token "${dateToken.month}.${dateToken.day}" in title "${product.name}" but it is not a valid calendar date: ${error}`,
                        context: product.slug,
                    });
                    continue;
                }

                const flatDescription = product.short_description ? stripHtml(product.short_description) : "";
                const timeRange = parseTimeRange(flatDescription);
                const timeUnknown = timeRange === null;
                const startTime = timeRange?.start ?? LocalTime.of(DEFAULT_UNKNOWN_TIME_HOUR, 0);
                const duration = timeRange
                    ? Duration.between(timeRange.start, timeRange.end)
                    : DEFAULT_DURATION;

                // The bare "FREE" bullet sometimes immediately follows Where:
                // in the source's list markup with no label of its own to
                // bound the capture on - strip it off (whether trailing an
                // address or standing alone as the entire captured value)
                // rather than publishing it as part of, or in place of, the
                // location.
                const where = fieldAfterLabel(flatDescription, "Where")
                    ?.replace(/(^|\s+)FREE$/i, "")
                    .trim() || undefined;
                // "@ The Brick" (a separate SAL-run space at a different
                // street address, per its own page) sometimes appears only
                // as a title marker or free prose, with no structured
                // "Where:" bullet to capture - publish the default studio
                // address as a placeholder but flag it uncertain rather than
                // asserting it as fact.
                const locationUnknown = !where && OFF_SITE_TITLE_MARKER.test(product.name);

                const priceRaw = product.prices ? parseInt(product.prices.price, 10) : NaN;
                const minorUnit = product.prices?.currency_minor_unit ?? 2;
                const price = priceRaw / Math.pow(10, minorUnit);
                const cost: EventCost | undefined = product.is_in_stock === false
                    ? { soldOut: true }
                    : Number.isFinite(price) ? { min: price } : undefined;

                const event: RipperCalendarEvent = {
                    id: product.slug,
                    ripped: new Date(),
                    date: ZonedDateTime.of(startDate, startTime, zone),
                    duration,
                    summary: decode(product.name),
                    description: flatDescription || undefined,
                    location: where ?? DEFAULT_VENUE_LOCATION,
                    url: product.permalink,
                    imageUrl: product.images?.[0]?.src,
                    cost,
                };
                events.push(event);

                if (timeUnknown || locationUnknown) {
                    const unknownFields: UncertaintyField[] = [];
                    const gaps: string[] = [];
                    if (timeUnknown) {
                        unknownFields.push("startTime", "duration");
                        gaps.push('no "Time:" bullet');
                    }
                    if (locationUnknown) {
                        unknownFields.push("location");
                        gaps.push('a title suggesting an off-site "@ The Brick" location but no "Where:" bullet');
                    }
                    const uncertainty: UncertaintyError = {
                        type: "Uncertainty",
                        reason: `Seattle Artist League listing for "${product.name}" had ${gaps.join(" and ")}`,
                        source: SOURCE_NAME,
                        unknownFields,
                        event,
                        partialFingerprint: flatDescription.substring(0, 200),
                    };
                    events.push(uncertainty);
                }
            } catch (error) {
                // A malformed date (e.g. "2.30") throws out of LocalDate.of -
                // catch per-product so one bad title can't drop every other
                // class in the same fetch.
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse product "${product.name}": ${error}`,
                    context: product.slug,
                });
            }
        }

        return events;
    }
}
