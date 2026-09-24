import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { hasUnnegatedMatch } from "../../lib/config/cost-text.js";
import '@js-joda/timezone';
import { createHash } from "crypto";

const BASE_URL = "https://foundercal.com";
const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const DEFAULT_DURATION = Duration.ofHours(2);
const MAX_DESCRIPTION = 600;

// Each card on a foundercal city page is an anchor like
//   <a href="/events/<slug>" class="card group" data-type="meetup" data-start="2026-09-25T01:00:00.000Z" ...>
// The card only carries title/start/venue name; the full details (end time,
// street address, registration link) live in the event page's JSON-LD.
const CARD_REGEX = /<a\s+href="(\/events\/[^"?#]+)"\s+class="card[^"]*"[^>]*?\bdata-start="([^"]+)"/g;
const JSON_LD_REGEX = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

export interface ListingEntry {
    path: string;
    start: string;
}

/** Extracts the event cards (path + ISO start) from a foundercal city page. */
export function extractListing(html: string): ListingEntry[] {
    const out: ListingEntry[] = [];
    const seen = new Set<string>();
    for (const m of html.matchAll(CARD_REGEX)) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        out.push({ path: m[1], start: m[2] });
    }
    return out;
}

interface JsonLdPlace {
    "@type"?: string;
    name?: string;
    address?: string | { streetAddress?: string; addressLocality?: string };
}

export interface JsonLdEvent {
    "@type"?: string;
    name?: string;
    startDate?: string;
    endDate?: string;
    url?: string;
    "@id"?: string;
    image?: string;
    description?: string;
    eventAttendanceMode?: string;
    eventStatus?: string;
    isAccessibleForFree?: boolean;
    location?: JsonLdPlace | JsonLdPlace[];
    organizer?: { name?: string };
    offers?: { price?: string; priceCurrency?: string };
}

const FREE_TITLE_RE = /\bfree\b/gi;

/**
 * Foundercal re-publishes each source (Luma, Meetup, Eventbrite...) event's
 * own price as a schema.org Offer with a single `price` string (verified
 * live 2026-09-24 against a Luma event whose own page separately confirmed
 * a $55-$75 sliding range — foundercal's `offers.price` carried "55.00",
 * the minimum, matching the rubric's "cheapest general-admission" exactly).
 *
 * `isAccessibleForFree` is source-provided but not fully reliable: one live
 * event titled "Free Coworking Wednesdays @ SURF Incubator" carries
 * `isAccessibleForFree: false` anyway (verified 2026-09-24) — so an
 * unnegated "free" in the title, which the organizer chose to put there
 * themselves, is checked and trusted ahead of a bare `false` with no
 * corroborating price. `isAccessibleForFree: false` alongside an `offers`
 * price, or with no free-titled contradiction, still resolves to
 * `{ paid: true }` rather than being left an unknown gap forever.
 */
export function parseCost(ev: JsonLdEvent): { min: number } | { paid: true } | undefined {
    const price = ev.offers?.price ? parseFloat(ev.offers.price) : undefined;
    if (price !== undefined && !isNaN(price)) return { min: price };
    if (ev.isAccessibleForFree === true) return { min: 0 };
    if (ev.isAccessibleForFree === false) {
        return hasUnnegatedMatch(ev.name ?? "", FREE_TITLE_RE) ? undefined : { paid: true };
    }
    return undefined;
}

/** Returns the schema.org Event object embedded in an event page, if any. */
export function extractJsonLdEvent(html: string): JsonLdEvent | undefined {
    for (const m of html.matchAll(JSON_LD_REGEX)) {
        try {
            const parsed = JSON.parse(m[1]);
            const candidates = Array.isArray(parsed) ? parsed : [parsed];
            const ev = candidates.find(c => c && c["@type"] === "Event");
            if (ev) return ev as JsonLdEvent;
        } catch {
            // Malformed block — keep looking at the others.
        }
    }
    return undefined;
}

/** True when the event is explicitly online-only (no physical attendance). */
export function isOnlineOnly(ev: JsonLdEvent): boolean {
    return (ev.eventAttendanceMode ?? "").endsWith("OnlineEventAttendanceMode");
}

/** True when the event is marked cancelled upstream. */
export function isCancelled(ev: JsonLdEvent): boolean {
    return (ev.eventStatus ?? "").endsWith("EventCancelled");
}

// A place whose only information is the city name (RSVP-gated addresses on
// Luma surface as just "Seattle") can't be placed on a map.
const CITY_ONLY = /^(seattle|seattle,?\s*wa(,?\s*usa)?|citywide.*)$/i;

export function locationFromPlace(place: JsonLdPlace | JsonLdPlace[] | undefined): string | undefined {
    const p = Array.isArray(place) ? place[0] : place;
    if (!p || typeof p !== "object") return undefined;
    const name = (p.name ?? "").trim();
    const street = (typeof p.address === "string" ? p.address : p.address?.streetAddress ?? "").trim();
    if (street && !CITY_ONLY.test(street)) {
        if (!name || CITY_ONLY.test(name) || street.toLowerCase().startsWith(name.toLowerCase())) return street;
        return `${name}, ${street}`;
    }
    if (name && !CITY_ONLY.test(name)) return name;
    return undefined;
}

function slugFromPath(path: string): string {
    return path.replace(/^\/events\//, "").replace(/\/+$/, "");
}

function truncate(text: string, max: number): string {
    const t = text.trim();
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export interface ParsedEvent {
    event: RipperCalendarEvent;
    unknownFields: UncertaintyField[];
    fingerprint: string;
}

/**
 * Converts a foundercal event page's JSON-LD Event into a calendar event.
 * Never returns null: a page without a usable Event yields a ParseError.
 */
export function parseEventPage(
    ev: JsonLdEvent | undefined,
    path: string,
    timezone: ZoneId,
): ParsedEvent | RipperError {
    const pageUrl = `${BASE_URL}${path}`;
    if (!ev || !ev.name || !ev.startDate) {
        return { type: "ParseError", reason: "Event page has no JSON-LD Event with name and startDate", context: pageUrl };
    }

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.parse(ev.startDate).withZoneSameInstant(timezone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid startDate "${ev.startDate}": ${error}`, context: pageUrl };
    }

    const unknownFields: UncertaintyField[] = [];
    let duration = DEFAULT_DURATION;
    let haveEnd = false;
    if (ev.endDate) {
        try {
            const end = ZonedDateTime.parse(ev.endDate).withZoneSameInstant(timezone);
            const minutes = Duration.between(start, end).toMinutes();
            if (minutes > 0) {
                duration = Duration.ofMinutes(minutes);
                haveEnd = true;
            }
        } catch {
            // fall through: duration flagged as uncertain below
        }
    }
    if (!haveEnd) unknownFields.push("duration");

    const location = locationFromPlace(ev.location);
    if (!location) unknownFields.push("location");

    const descParts: string[] = [];
    if (ev.description) descParts.push(truncate(ev.description, MAX_DESCRIPTION));
    if (ev.organizer?.name) descParts.push(`Organizer: ${ev.organizer.name}`);
    descParts.push(`Listed on foundercal: ${pageUrl}`);

    const cost = parseCost(ev);
    const event: RipperCalendarEvent = {
        id: `foundercal-${slugFromPath(path)}`,
        ripped: new Date(),
        date: start,
        duration,
        summary: ev.name.trim(),
        description: descParts.join("\n\n"),
        location,
        url: ev.url || pageUrl,
        imageUrl: ev.image,
        ...(cost !== undefined ? { cost } : {}),
    };

    // Changes when upstream adds an end time or a street address, which
    // invalidates any cached resolution for this event.
    const fingerprint = createHash("sha256")
        .update(JSON.stringify([ev.startDate, ev.endDate ?? null, location ?? null]))
        .digest("hex").slice(0, 16);

    return { event, unknownFields, fingerprint };
}

export default class FoundercalRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        if (!calConfig) throw new Error("foundercal ripper requires a calendar configuration");
        const timezone = calConfig.timezone ?? ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const listingHtml = await this.fetchText(fetchFn, ripper.config.url.toString());
        const listing = extractListing(listingHtml);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        if (listing.length === 0) {
            errors.push({ type: "ParseError", reason: "No event cards found on foundercal city page", context: ripper.config.url.toString() });
        }

        const seen = new Set<string>();
        for (const entry of listing) {
            // Skip cards that have already started (cheap pre-filter before fetching the page).
            const cardStart = Date.parse(entry.start);
            if (!Number.isNaN(cardStart) && cardStart < now.toInstant().toEpochMilli()) continue;

            let html: string;
            try {
                html = await this.fetchText(fetchFn, `${BASE_URL}${entry.path}`);
            } catch (error) {
                errors.push({ type: "ParseError", reason: `Failed to fetch event page: ${error}`, context: `${BASE_URL}${entry.path}` });
                continue;
            }

            const ld = extractJsonLdEvent(html);
            // Intentional filters: online-only and cancelled events aren't Seattle happenings.
            if (ld && (isOnlineOnly(ld) || isCancelled(ld))) continue;

            const result = parseEventPage(ld, entry.path, timezone);
            if ("type" in result) {
                errors.push(result);
                continue;
            }
            const { event, unknownFields, fingerprint } = result;
            if (event.date.isBefore(now)) continue;
            if (seen.has(event.id!)) continue;
            seen.add(event.id!);
            events.push(event);

            if (unknownFields.length > 0) {
                errors.push({
                    type: "Uncertainty",
                    source: ripper.config.name,
                    reason: `foundercal listing lacks ${unknownFields.join(" and ")} for ${event.date.toLocalDate()}`,
                    unknownFields,
                    event,
                    partialFingerprint: fingerprint,
                });
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

    private async fetchText(fetchFn: FetchFn, url: string): Promise<string> {
        const res = await fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) throw new Error(`foundercal returned HTTP ${res.status} for ${url}`);
        return res.text();
    }
}
