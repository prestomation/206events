import { LocalDate, Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import {
    IRipper,
    Ripper,
    RipperCalendar,
    RipperCalendarEvent,
    RipperError,
    RipperEvent,
    UncertaintyError,
    UncertaintyField,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const LISTING_URL = "https://www.thecraftmap.com/fairs/washington/seattle";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

// The Craft Map never publishes a start time (its JSON-LD `startDate` is a
// bare date, e.g. "2026-08-28") — only the odd listing embeds a time in its
// own title text (e.g. "The Market Experience (9:30 AM)"). Rather than guess
// a plausible-looking time, every event gets this noon placeholder paired
// with an UncertaintyError so the event-uncertainty-resolver skill can look
// up the real time later. See docs/event-uncertainty.md.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
// Craft fairs/markets typically run a half-day; used whenever the JSON-LD
// doesn't resolve to a longer explicit span.
const DEFAULT_DURATION = Duration.ofHours(3);

// A handful of listings leave their venue unresolved (both the place name
// and street address are the literal string "TBA"). Treated the same as a
// blank location: placeholder + Uncertainty, never a guess.
const FALLBACK_LOCATION = "Seattle, WA";

function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

function extractJsonLdBlocks(html: string): any[] {
    const blocks: any[] = [];
    const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        try {
            blocks.push(JSON.parse(m[1]));
        } catch {
            // Skip malformed blocks — a real ItemList/Event block that fails
            // to parse is surfaced by the caller finding nothing usable.
        }
    }
    return blocks;
}

/**
 * Extracts the per-fair detail page URLs from the "Upcoming Craft Fairs in
 * Seattle, WA" JSON-LD `ItemList` embedded in the listing page. Public for
 * testing.
 */
export function extractListingUrls(html: string): string[] {
    const urls = new Set<string>();
    for (const block of extractJsonLdBlocks(html)) {
        if (block["@type"] !== "ItemList" || !Array.isArray(block.itemListElement)) continue;
        for (const item of block.itemListElement) {
            if (typeof item.url === "string") urls.add(item.url);
        }
    }
    return [...urls];
}

/**
 * Extracts a stable id from a fair detail URL, e.g.
 * "https://www.thecraftmap.com/fair/panda-fest-seattle-2026-seattle-wa" ->
 * "panda-fest-seattle-2026-seattle-wa". Public for testing.
 */
export function extractFairSlug(url: string): string {
    const match = url.match(/\/fair\/([^/?#]+)/);
    return match ? match[1] : url;
}

function isUnresolvedLocation(streetAddress: string | undefined, name: string | undefined): boolean {
    const normalize = (s: string | undefined) => (s ?? "").trim().toLowerCase();
    return normalize(streetAddress) === "tba" || normalize(streetAddress) === "" || normalize(name) === "tba";
}

/**
 * Parses the JSON-LD `Event` block on a single fair detail page into an
 * event (plus an Uncertainty pairing for any placeholder fields). Never
 * returns null — a page with no usable Event block produces a ParseError.
 * Public for testing.
 */
export function parseFairDetail(html: string, url: string): RipperEvent[] {
    const slug = extractFairSlug(url);
    let item: any;
    for (const block of extractJsonLdBlocks(html)) {
        if (block["@type"] === "Event") {
            item = block;
            break;
        }
    }
    if (!item) {
        return [{ type: "ParseError", reason: "No JSON-LD Event block found on fair detail page", context: url }];
    }
    if (!item.name || !item.startDate) {
        return [{ type: "ParseError", reason: "JSON-LD Event missing name or startDate", context: url }];
    }

    let startDate: LocalDate;
    try {
        startDate = LocalDate.parse(String(item.startDate).slice(0, 10));
    } catch (error) {
        return [{ type: "ParseError", reason: `Could not parse startDate: ${item.startDate}`, context: url }];
    }

    const summary = decode(item.name);
    const description = typeof item.description === "string" ? decode(item.description) : undefined;

    const place = item.location ?? {};
    const address = place.address ?? {};
    const unresolvedLocation = isUnresolvedLocation(address.streetAddress, place.name);
    const location = unresolvedLocation
        ? FALLBACK_LOCATION
        : decode([place.name, address.streetAddress, address.addressLocality, address.addressRegion]
            .filter((part) => typeof part === "string" && part.trim().length > 0)
            .join(", "));

    const date = ZonedDateTime.of(
        startDate.atTime(DEFAULT_UNKNOWN_TIME_HOUR, DEFAULT_UNKNOWN_TIME_MINUTE),
        TIMEZONE
    );

    const event: RipperCalendarEvent = {
        id: `${slug}-${startDate.toString()}`,
        ripped: new Date(),
        date,
        duration: DEFAULT_DURATION,
        summary,
        description,
        location,
        url: typeof item.url === "string" ? item.url : url,
    };

    const unknownFields: UncertaintyField[] = ["startTime", "duration"];
    if (unresolvedLocation) unknownFields.push("location");

    const uncertainty: UncertaintyError = {
        type: "Uncertainty",
        reason: unresolvedLocation
            ? `The Craft Map listing for "${summary}" has no explicit time and an unresolved (TBA) venue`
            : `The Craft Map listing for "${summary}" has no explicit start time`,
        source: "craft-map-seattle",
        unknownFields,
        event,
        partialFingerprint: simpleHash(`${summary}|${startDate.toString()}|${location}`),
    };

    return [event, uncertainty];
}

/**
 * The Craft Map — Seattle Craft Fairs.
 *
 * Reads the "Upcoming Craft Fairs in Seattle, WA" directory listing, which
 * carries a JSON-LD `ItemList` of fair detail-page URLs but no dates. Each
 * detail page in turn carries a JSON-LD `Event` block with the date,
 * description, and venue, but never a start time — see DEFAULT_UNKNOWN_TIME_HOUR.
 */
export default class CraftMapSeattleRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error("No calendars configured for craft-map-seattle ripper");
        }
        const calConfig = ripper.config.calendars[0];
        const now = ZonedDateTime.now(TIMEZONE);

        let listingHtml: string;
        try {
            const res = await this.fetchFn(LISTING_URL, { headers: { "User-Agent": USER_AGENT } });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} fetching ${LISTING_URL}`);
            }
            listingHtml = await res.text();
        } catch (error) {
            throw new Error(`Failed to fetch The Craft Map Seattle listing: ${error}`);
        }

        const urls = extractListingUrls(listingHtml);

        const allEvents: RipperCalendarEvent[] = [];
        const allErrors: RipperError[] = [];

        for (const url of urls) {
            let detailHtml: string;
            try {
                const res = await this.fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
                if (!res.ok) {
                    allErrors.push({ type: "ParseError", reason: `HTTP ${res.status} fetching fair detail page`, context: url });
                    continue;
                }
                detailHtml = await res.text();
            } catch (error) {
                // Isolate per-fair fetch failures so one bad page doesn't
                // discard events already parsed from earlier fairs.
                allErrors.push({ type: "ParseError", reason: `Failed to fetch fair detail page: ${error}`, context: url });
                continue;
            }

            for (const result of parseFairDetail(detailHtml, url)) {
                if ("date" in result) allEvents.push(result);
                else allErrors.push(result);
            }
        }

        // Drop past events, and any Uncertainty error paired with a
        // now-dropped event, in one pass — mirrors sources/events12's rip().
        const events = allEvents.filter(e => !e.date.isBefore(now));
        const keptIds = new Set(events.map(e => e.id));
        const errors = allErrors.filter(err => err.type !== "Uncertainty" || keptIds.has(err.event.id));

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
