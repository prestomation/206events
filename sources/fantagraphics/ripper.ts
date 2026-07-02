import { LocalDateTime, ZoneId, ZonedDateTime, Duration, DateTimeFormatter, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, EventCost } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const API_URL = "https://blog.fantagraphics.com/wp-json/tribe/events/v1/events";
// Exact match confirmed live against the API on 2026-07-02 — this Tribe
// Events REST API is Fantagraphics' national events calendar (book-tour
// signings in many cities), so every event must be filtered down to just
// this venue name before it's published as a Seattle calendar entry.
const SEATTLE_VENUE_NAME = "Fantagraphics Bookstore and Gallery";
const DEFAULT_LOCATION = "Fantagraphics Bookstore and Gallery, 1201 S Vale St, Seattle, WA 98108";
const DEFAULT_DURATION = Duration.ofHours(3);
const PER_PAGE = 50;
const MAX_PAGES = 10;

const TRIBE_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

interface TribeImage {
    url?: string;
}

interface TribeVenue {
    venue?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
}

interface TribeEvent {
    id?: number;
    title?: string;
    description?: string;
    url?: string;
    slug?: string;
    start_date?: string;
    end_date?: string;
    timezone?: string;
    image?: TribeImage;
    cost?: string;
    venue?: TribeVenue;
}

interface TribeEventsResponse {
    events?: TribeEvent[];
    total?: number;
    total_pages?: number;
}

/**
 * Parses a Tribe Events REST API `cost` string like "$10", "$10 - $20", or
 * "Free" into an EventCost. Returns undefined for an empty/unparseable
 * string so callers omit `cost` rather than guessing a price.
 */
export function parseTribeCost(raw: string | undefined): EventCost | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    if (/^free$/i.test(trimmed)) return { min: 0 };

    const rangeMatch = trimmed.match(/\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)/);
    if (rangeMatch) {
        const min = parseFloat(rangeMatch[1]);
        const max = parseFloat(rangeMatch[2]);
        return { min, ...(max > min ? { max } : {}) };
    }

    const exactMatch = trimmed.match(/\$(\d+(?:\.\d+)?)/);
    if (exactMatch) return { min: parseFloat(exactMatch[1]) };

    return undefined;
}

/**
 * Strips HTML tags from a Tribe `description` field down to plain text.
 */
function stripHtml(html: string): string {
    return html.replace(/<\/?[^>]+(>|$)/g, "").trim();
}

/**
 * Builds a "venue, address, city, state zip" location string from a Tribe
 * venue object, falling back to the configured venue address when any
 * field is missing.
 */
export function buildLocation(venue: TribeVenue | undefined): string {
    if (!venue || !venue.address || !venue.city || !venue.state || !venue.zip) {
        return DEFAULT_LOCATION;
    }
    return `${venue.venue ?? "Fantagraphics Bookstore and Gallery"}, ${venue.address}, ${venue.city}, ${venue.state} ${venue.zip}`;
}

/**
 * Parses a single Tribe Events REST API event object (already filtered to
 * the Seattle venue) into a RipperCalendarEvent. Never returns null — an
 * unparseable event becomes a ParseError so gaps are visible in build
 * reporting instead of silently dropped.
 */
export function parseTribeEvent(raw: TribeEvent): RipperCalendarEvent | RipperError {
    const context = raw.slug ?? (raw.id !== undefined ? String(raw.id) : undefined);

    if (!raw.slug || !raw.title || !raw.start_date) {
        return { type: "ParseError", reason: "Event missing slug, title, or start_date", context: JSON.stringify(raw).slice(0, 200) };
    }

    const timezone = raw.timezone ? ZoneId.of(raw.timezone) : ZoneId.of("America/Los_Angeles");

    let startDateTime: ZonedDateTime;
    try {
        startDateTime = LocalDateTime.parse(raw.start_date, TRIBE_DATE_FORMAT).atZone(timezone);
    } catch (error) {
        return { type: "ParseError", reason: `Failed to parse start_date "${raw.start_date}": ${error}`, context };
    }

    let duration = DEFAULT_DURATION;
    if (raw.end_date) {
        try {
            const endDateTime = LocalDateTime.parse(raw.end_date, TRIBE_DATE_FORMAT).atZone(timezone);
            const seconds = startDateTime.until(endDateTime, ChronoUnit.SECONDS);
            if (seconds > 0) duration = Duration.ofSeconds(seconds);
        } catch {
            // Unparseable end_date — keep the default duration rather than failing the whole event.
        }
    }

    const summary = decode(raw.title);
    const description = raw.description ? decode(stripHtml(raw.description)) : undefined;
    const location = buildLocation(raw.venue);
    const cost = parseTribeCost(raw.cost);

    const event: RipperCalendarEvent = {
        id: raw.slug,
        ripped: new Date(),
        date: startDateTime,
        duration,
        summary,
        description,
        location,
        url: raw.url,
        ...(raw.image?.url ? { imageUrl: raw.image.url } : {}),
        ...(cost ? { cost } : {}),
    };
    return event;
}

/**
 * Fantagraphics Bookstore & Gallery (Georgetown) ripper.
 *
 * Fantagraphics runs WordPress with The Events Calendar (Tribe Events)
 * plugin, exposing a live, unauthenticated JSON REST API. That API is NOT
 * Seattle-specific — Fantagraphics is a national comics publisher and posts
 * book-tour signings from many cities (Portland, LA, NYC, ...) to the same
 * calendar, so every event is filtered down to `venue.venue ===
 * "Fantagraphics Bookstore and Gallery"` before publishing.
 */
export default class FantagraphicsRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        let events: RipperEvent[];
        try {
            events = await this.fetchAllEvents();
        } catch (error) {
            return [{
                name: calConfig.name,
                friendlyname: calConfig.friendlyname,
                events: [],
                errors: [{ type: "ParseError", reason: `Failed to fetch Fantagraphics events: ${error}`, context: API_URL }],
                tags: calConfig.tags ?? ripper.config.tags ?? [],
                parent: ripper.config,
            }];
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => "date" in e),
            errors: events.filter((e): e is RipperError => "type" in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    /**
     * Fetches every page of the Tribe Events REST API (capped at
     * min(total_pages, MAX_PAGES) to avoid looping forever on an
     * unexpected response), filters to the Seattle venue, and parses each
     * kept event. Public for testing.
     */
    public async fetchAllEvents(): Promise<RipperEvent[]> {
        const allRaw: TribeEvent[] = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages && page <= MAX_PAGES) {
            const url = `${API_URL}?per_page=${PER_PAGE}&page=${page}`;
            const res = await this.fetchFn(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; CalendarRipper/1.0)" },
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            const data = await res.json() as TribeEventsResponse;
            if (!data || !Array.isArray(data.events)) {
                throw new Error("Invalid response: missing events array");
            }
            allRaw.push(...data.events);
            totalPages = Math.min(data.total_pages ?? 1, MAX_PAGES);
            page++;
        }

        return this.parseEvents(allRaw);
    }

    /**
     * Filters raw Tribe events to the Seattle venue and parses each one.
     * Public for testing — exercised directly against sample-data.json
     * without a network call.
     */
    public parseEvents(rawEvents: TribeEvent[]): RipperEvent[] {
        const seattleEvents = rawEvents.filter(e => e.venue?.venue === SEATTLE_VENUE_NAME);
        return seattleEvents.map(parseTribeEvent);
    }
}
