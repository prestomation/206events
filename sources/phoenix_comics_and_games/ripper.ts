import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, LocalDate, LocalTime, ZonedDateTime } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent, UncertaintyField } from "../../lib/config/schema.js";

// Phoenix Comics and Games (shop.phoenixseattle.com) is a Shopify storefront
// that sells tickets to its weekly Magic: The Gathering event nights (and
// irregular prerelease/sealed events) as products in the `events`
// collection. The collection is a rolling near-term window, not a deep
// backlog. The two weekly series encode their date in the title but never
// state a start time, e.g.:
//   "Friday Night Magic Draft - The Hobbit | September 18 ticket"
//   "Tuesday Night Draft - Chaos Draft | September 22 Ticket"
// Irregular prerelease/sealed products (e.g. "Reality Fracture Prerelease
// Flight 1") carry no date anywhere - title, body_html, or the store's own
// blog (checked during investigation) - so there is nothing to extract or
// resolve later. They're out of scope for this ripper and skipped silently
// rather than flagged as a ParseError; only a date-pattern miss on one of
// the two known recurring series below (which always carry a date) is
// treated as an actual parse failure worth surfacing. See
// docs/source-candidates/phoenix-comics-and-games.md for the investigation.

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

// "... | September 18 ticket" / "... | September 22  Ticket" - month + day
// after the pipe, no year; upstream is inconsistent about the spacing and
// capitalization of "ticket".
const DATE_PATTERN = new RegExp(`\\|\\s*(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})\\s*ticket`, "i");

// The only two products in this collection confirmed to always carry a
// parseable date (see file header). A title matching one of these but
// missing DATE_PATTERN is a real regression worth a ParseError; any other
// title missing DATE_PATTERN is an out-of-scope one-off (prerelease/sealed
// event) and skipped silently instead.
const KNOWN_SERIES_PATTERN = /friday night magic|tuesday night draft/i;

// A listing already >3 days in the past (relative to build time) is assumed
// to be next year's occurrence of the same weekly slot rather than a
// fabricated guess at a specific recurrence; matches the tolerance used by
// other title-date rippers (e.g. saltstone_ceramics).
const PAST_TOLERANCE_DAYS = 3;

// No source page (title, body_html, or the store's own blog) states a start
// time for any product in this collection - only inferred from a casual web
// search, which doesn't clear the bar to hardcode. Every event is published
// with a placeholder time/duration and flagged via UncertaintyError so
// skills/event-uncertainty-resolver can fill in the real value once a
// Phoenix-owned source confirms it.
const PLACEHOLDER_TIME = LocalTime.of(12, 0);
const PLACEHOLDER_DURATION = Duration.ofHours(2);

function resolveYear(month: number, day: number, today: LocalDate): LocalDate {
    let candidate = LocalDate.of(today.year(), month, day);
    if (candidate.isBefore(today.minusDays(PAST_TOLERANCE_DAYS))) {
        candidate = candidate.plusYears(1);
    }
    return candidate;
}

function stripHtml(html: string): string {
    return html.replace(/<\/?[^>]+(>|$)/g, " ").replace(/\s+/g, " ").trim();
}

// Cheap deterministic hash of whatever the ripper *did* parse, so a cached
// resolution is invalidated if the title changes (e.g. upstream renames the
// event or, eventually, starts stating a time itself).
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

export default class PhoenixComicsAndGamesRipper extends JSONRipper {
    private seenHandles = new Set<string>();

    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        if (!jsonData.products || !Array.isArray(jsonData.products)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing products array",
                context: JSON.stringify(jsonData).substring(0, 100) + "...",
            }];
        }

        const zone = date.zone();
        const today = date.toLocalDate();

        for (const product of jsonData.products as ShopifyProduct[]) {
            if (product.product_type !== "Special Event") continue;
            if (this.seenHandles.has(product.handle)) continue;
            this.seenHandles.add(product.handle);

            const match = product.title.match(DATE_PATTERN);
            if (!match) {
                if (KNOWN_SERIES_PATTERN.test(product.title)) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not find a "| <Month> <Day> ticket" date in title: "${product.title}"`,
                        context: product.handle,
                    });
                }
                continue;
            }

            try {
                const month = MONTHS[match[1].toLowerCase()];
                const day = parseInt(match[2], 10);
                const eventDate = resolveYear(month, day, today);

                const variant = product.variants?.[0];
                const price = variant ? parseFloat(variant.price) : NaN;
                const cost = !variant ? undefined
                    : !variant.available ? { soldOut: true as const }
                    : Number.isFinite(price) ? { min: price }
                    : undefined;

                const calendarEvent: RipperCalendarEvent = {
                    id: product.handle,
                    ripped: new Date(),
                    date: ZonedDateTime.of(eventDate, PLACEHOLDER_TIME, zone),
                    duration: PLACEHOLDER_DURATION,
                    summary: product.title,
                    description: product.body_html ? stripHtml(product.body_html) : undefined,
                    location: "Phoenix Comics and Games, 113 Broadway E, Seattle, WA 98102",
                    url: `https://shop.phoenixseattle.com/products/${product.handle}`,
                    imageUrl: product.images?.[0]?.src,
                    cost,
                };
                events.push(calendarEvent);

                const unknownFields: UncertaintyField[] = ["startTime", "duration"];
                events.push({
                    type: "Uncertainty",
                    reason: `Phoenix Comics and Games listing has no start time anywhere in the product (title: "${product.title}")`,
                    source: "phoenix-comics-and-games",
                    unknownFields,
                    event: calendarEvent,
                    partialFingerprint: simpleHash(product.title),
                });
            } catch (error) {
                // A malformed date (e.g. "February 30th") throws out of
                // LocalDate.of - catch per-product so one bad title can't
                // drop every other product in the same fetch.
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse product "${product.title}": ${error}`,
                    context: product.handle,
                });
            }
        }

        return events;
    }
}
