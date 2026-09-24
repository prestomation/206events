import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { hasUnnegatedMatch } from "../../lib/config/cost-text.js";
import "@js-joda/timezone";

/**
 * Seattle's Child family events calendar (https://www.seattleschild.com/calendar/).
 *
 * The site runs the "Event Calendar Pro" WordPress plugin, which exposes no
 * public feed. The listing pages (/calendar/, /calendar/page/N/) carry one
 * <article class="event-listing"> per event; each event's detail page embeds
 * a schema.org Event JSON-LD block with a start/end datetime and a full
 * postal address. We:
 *
 *   1. walk the listing pages and collect one-off (non-recurring) events —
 *      recurring listings only describe their pattern in prose ("occurs
 *      weekly, on Mondays, Tuesday") with a season-long date range, so their
 *      individual dates can't be reconstructed reliably;
 *   2. fetch each one-off event's detail page and parse its JSON-LD;
 *   3. keep only events whose address is in Seattle (the calendar covers the
 *      whole Puget Sound region), and only single-day events (multi-week
 *      exhibitions/"harvest season" spans are not point-in-time events).
 */

const BASE_URL = "https://www.seattleschild.com";
const LISTING_URL = `${BASE_URL}/calendar/`;
const MAX_PAGES = 25;
const TZ = ZoneId.of("America/Los_Angeles");
const MAX_EVENT_HOURS = 24;

// Fallback for events with no `isAccessibleForFree` in the JSON-LD but an
// explicit "free" claim in the title/description (verified live 2026-09-24,
// e.g. title "Free Wooden Boat Story Time at SLU", description "Free Wooden
// Boat Storytime at South Lake Union! Join Sue Kimpton..."). `\bfree\b`
// alone (no "admission"/"event" qualifier needed) is safe here because
// hasUnnegatedMatch still guards against a negated claim, and Seattle's
// Child listing prose reliably means "free to attend" whenever it says the
// word at all — never "freedom", "free-range", etc. (word-boundary safe).
const FREE_TEXT_RE = /\bfree\b/gi;

export interface ListingEntry {
    url: string;
    title: string;
    recurring: boolean;
}

export interface JsonLdEvent {
    "@type"?: string;
    name?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    image?: string[] | string;
    isAccessibleForFree?: boolean;
    location?: {
        name?: string | boolean;
        address?: {
            streetAddress?: string;
            addressLocality?: string;
            addressRegion?: string;
            postalCode?: string;
        };
    } | boolean;
}

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/** Parse the listing page into entries; `recurring` marks prose-pattern listings. */
export function parseListing(html: string): ListingEntry[] {
    const root = parse(html);
    const entries: ListingEntry[] = [];
    for (const article of root.querySelectorAll("article.event-listing")) {
        const link = article.querySelector(".wp-event-title a");
        const href = link?.getAttribute("href");
        if (!link || !href) continue;
        entries.push({
            url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
            title: decode(link.textContent.trim()),
            recurring: article.querySelector(".recurrence") !== null,
        });
    }
    return entries;
}

/**
 * The detail page's own "Cost" field — a separate, structured element
 * outside the JSON-LD (`<div class="event-cost">...<h2>Cost</h2><p>Free</p>`
 * or `<p>Fee</p>`), verified live 2026-09-24. Only ever "Free" or "Fee" (a
 * flag, not an amount), so a "Fee" event still needs its dollar figure
 * resolved separately — but at least distinguishes free from paid instead of
 * leaving every unflagged event equally uncertain.
 */
export function extractCostField(html: string): "free" | "fee" | undefined {
    const m = html.match(/<div class="event-cost">[\s\S]{0,300}?<p>(Free|Fee)<\/p>/i);
    if (!m) return undefined;
    return m[1].toLowerCase() as "free" | "fee";
}

/** Return the schema.org Event JSON-LD object embedded in a detail page, if any. */
export function extractJsonLdEvent(html: string): JsonLdEvent | null {
    const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        try {
            const data = JSON.parse(m[1]);
            if (data && typeof data === "object" && !Array.isArray(data) && data["@type"] === "Event") {
                return data as JsonLdEvent;
            }
        } catch {
            // Malformed/unrelated block — keep looking.
        }
    }
    return null;
}

/**
 * Parse "2026-10-18 01:00 PM" (or a date with a blank time, "2026-12-12 ").
 * Returns null when the date part itself is unparseable.
 */
export function parseLdDateTime(s: string | undefined): { dt: LocalDateTime; hasTime: boolean } | null {
    if (!s) return null;
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i);
    if (!m) return null;
    const [, y, mo, d, hh, mm, ap] = m;
    if (!hh) return { dt: LocalDateTime.of(+y, +mo, +d, 0, 0), hasTime: false };
    let hour = parseInt(hh, 10) % 12;
    if (ap.toUpperCase() === "PM") hour += 12;
    return { dt: LocalDateTime.of(+y, +mo, +d, hour, parseInt(mm, 10)), hasTime: true };
}

/** True when the JSON-LD address is in the city of Seattle. */
export function isSeattleEvent(ev: JsonLdEvent): boolean {
    if (!ev.location || typeof ev.location !== "object") return false;
    return (ev.location.address?.addressLocality ?? "").trim().toLowerCase() === "seattle";
}

/** True when the event spans more than a day (season-long runs, exhibitions). */
export function isMultiDaySpan(ev: JsonLdEvent): boolean {
    const start = parseLdDateTime(ev.startDate);
    const end = parseLdDateTime(ev.endDate);
    if (!start || !end) return false;
    return Duration.between(start.dt, end.dt).toHours() > MAX_EVENT_HOURS;
}

function slugFromUrl(url: string): string {
    return url.replace(/\/+$/, "").split("/").pop() || url;
}

function buildLocation(ev: JsonLdEvent): string | undefined {
    if (!ev.location || typeof ev.location !== "object") return undefined;
    const name = typeof ev.location.name === "string" ? decode(ev.location.name).trim() : "";
    const addr = ev.location.address;
    const street = addr?.streetAddress ? decode(addr.streetAddress).trim().replace(/,\s*Seattle\s*$/i, "") : "";
    const city = addr?.addressLocality?.trim() || "Seattle";
    const region = addr?.addressRegion?.trim() || "WA";
    const parts = [name, street, city].filter(Boolean);
    let loc = parts.join(", ");
    loc += `, ${region}`;
    if (addr?.postalCode) loc += ` ${addr.postalCode.trim()}`;
    return loc;
}

/**
 * Convert a detail-page JSON-LD Event into a calendar event (plus an
 * UncertaintyError when the start time is missing). Seattle/single-day
 * filtering happens in the caller.
 */
/**
 * Combines every cost signal available for one event, in priority order:
 *
 * 1. `isAccessibleForFree === false` — an explicit, structured "not free"
 *    claim from the source's own JSON-LD. Wins over everything else: even a
 *    same-page "Free" in the separate Cost field could be a stale/
 *    inconsistent CMS value, and a "free" substring in the description
 *    (e.g. "free parking") is a plain text-match false-positive risk. It
 *    does NOT discard a corroborating costField === "fee", though — that
 *    signal agrees ("not free"), so it still upgrades the result from an
 *    unknown gap to a confirmed { paid: true }.
 * 2. `isAccessibleForFree === true` or the page's own Cost field says
 *    "free" — both are structured, source-provided signals.
 * 3. An unnegated "free" claim in the title/description text — lower
 *    confidence than 1-2, but still the venue's own words.
 * 4. The page's own Cost field says "fee" — confirms paid, amount unknown.
 * 5. No signal at all — leave the cost gap for a human to resolve.
 */
export function resolveCost(
    isAccessibleForFree: boolean | undefined, costField: "free" | "fee" | undefined,
    title: string, description: string | undefined,
): EventCost | undefined {
    if (isAccessibleForFree === false) return costField === "fee" ? { paid: true } : undefined;
    if (isAccessibleForFree === true || costField === "free") return { min: 0 };
    if (hasUnnegatedMatch([title, description].filter(Boolean).join(" "), FREE_TEXT_RE)) return { min: 0 };
    if (costField === "fee") return { paid: true };
    return undefined;
}

export function parseDetailEvent(ev: JsonLdEvent, pageUrl: string, costField?: "free" | "fee"): (RipperCalendarEvent | RipperError)[] {
    const title = decode(ev.name ?? "").trim();
    if (!title) {
        return [{ type: "ParseError", reason: "Event JSON-LD has no name", context: pageUrl }];
    }
    const start = parseLdDateTime(ev.startDate);
    if (!start) {
        return [{ type: "ParseError", reason: `Unparseable startDate "${ev.startDate}" for "${title}"`, context: pageUrl }];
    }
    const end = parseLdDateTime(ev.endDate);

    // Unknown start time: publish at a clearly-flagged placeholder (10am)
    // and signal it through the uncertainty system instead of guessing.
    const startDt = start.hasTime ? start.dt : start.dt.withHour(10);
    let duration = Duration.ofHours(2);
    if (start.hasTime && end?.hasTime) {
        const d = Duration.between(start.dt, end.dt);
        if (!d.isNegative() && !d.isZero()) duration = d;
    }

    const image = Array.isArray(ev.image) ? ev.image[0] : ev.image;
    const description = ev.description ? decode(ev.description).trim() : undefined;
    const dateKey = start.dt.toLocalDate().toString();
    // isAccessibleForFree: false is an explicit, structured "this is not
    // free" signal from the source — it must win over a lower-confidence
    // text match (e.g. a "free parking" mention in the description
    // shouldn't override it and mark the event free).
    const cost = resolveCost(ev.isAccessibleForFree, costField, title, description);

    const event: RipperCalendarEvent = {
        id: `seattles-child-${slugFromUrl(pageUrl)}-${dateKey}`,
        ripped: new Date(),
        date: ZonedDateTime.of(startDt, TZ),
        duration,
        summary: title,
        description,
        location: buildLocation(ev),
        url: pageUrl,
        imageUrl: image || undefined,
        ...(cost !== undefined ? { cost } : {}),
    };

    const results: (RipperCalendarEvent | RipperError)[] = [event];
    if (!start.hasTime) {
        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            reason: `Seattle's Child listing has a date but no start time ("${ev.startDate}")`,
            source: "seattles-child",
            unknownFields: ["startTime", "duration"],
            event,
            partialFingerprint: simpleHash(`${ev.startDate}|${ev.endDate}`),
        };
        results.push(uncertainty);
    }
    return results;
}

export default class SeattlesChildRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    private async fetchText(url: string): Promise<string> {
        const res = await this.fetchFn(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" } });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.text();
    }

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        // 1. Walk listing pages.
        const entries = new Map<string, ListingEntry>();
        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = page === 1 ? LISTING_URL : `${LISTING_URL}page/${page}/`;
            let html: string;
            try {
                html = await this.fetchText(url);
            } catch (e) {
                // Page 1 failing is a real error; a 404 past the last page is the end.
                if (page === 1) {
                    errors.push({ type: "ParseError", reason: `Listing fetch failed: ${e instanceof Error ? e.message : String(e)}`, context: url });
                }
                break;
            }
            const pageEntries = parseListing(html);
            if (pageEntries.length === 0) break;
            for (const entry of pageEntries) {
                if (!entries.has(entry.url)) entries.set(entry.url, entry);
            }
        }

        // 2. Fetch detail pages for one-off events.
        const seenIds = new Set<string>();
        for (const entry of entries.values()) {
            if (entry.recurring) continue; // prose-only recurrence pattern; see header
            let html: string;
            try {
                html = await this.fetchText(entry.url);
            } catch (e) {
                errors.push({ type: "ParseError", reason: `Detail fetch failed for "${entry.title}": ${e instanceof Error ? e.message : String(e)}`, context: entry.url });
                continue;
            }
            const ld = extractJsonLdEvent(html);
            if (!ld) {
                errors.push({ type: "ParseError", reason: `No Event JSON-LD on detail page for "${entry.title}"`, context: entry.url });
                continue;
            }
            // Intentional content filters: region-wide calendar, keep Seattle
            // single-day events only.
            if (!isSeattleEvent(ld) || isMultiDaySpan(ld)) continue;

            const results = parseDetailEvent(ld, entry.url, extractCostField(html));
            const primary = results[0];
            if ("date" in primary && primary.id) {
                if (seenIds.has(primary.id)) continue;
                seenIds.add(primary.id);
            }
            for (const result of results) {
                if ("date" in result) events.push(result);
                else errors.push(result);
            }
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }
}
