import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime, DateTimeFormatter } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

// Charlie's Queer Books runs its event calendar through BookManager (a
// third-party bookstore POS/CMS whose storefront is a client-rendered React
// SPA), not a public REST API meant for scraping. The site's own JS bundle
// calls these same endpoints: `store/getSettings` resolves the public
// webstore identifier to an internal numeric store id, `session/get` mints a
// short-lived session token (no login involved — same call an anonymous
// browser tab makes), and `event/v2/list` returns the dated event list for
// that store/session.
const API_BASE = "https://api.bookmanager.com/customer";
// Public webstore identifier, visible in the site's own asset URLs
// (cdn1.bookmanager.com/i/9932925/...). Equivalent to an Eventbrite
// organizerId — an identifier, not a credential.
const WEBSTORE_NAME = "9932925";
// Resolved once via store/getSettings; stable metadata, not a session-scoped
// value, so it's hardcoded rather than re-fetched on every run.
const STORE_ID = "1188985";
// BookManager's session/get accepts any client-generated uuid (it's a
// tracking value, not an auth credential) — fixed so the fetch cache sees a
// stable request body across runs within its TTL window.
const CLIENT_UUID = "206events-0000-0000-0000-000000000000";
const LOCATION = "Charlie's Queer Books, 465 N 36th St, Seattle, WA 98103";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";

interface BookManagerEventRow {
    id: number;
    title: string;
    description?: string;
    date: string;        // YYYYMMDD, store-local
    start_time?: string; // HH:MM:SS, store-local
    end_time?: string;
    all_day?: boolean;
    image_url?: string;
    // Most events are in-store ("Charlie's"); a few are hosted off-site
    // (e.g. "Town Hall Seattle") or "Virtual" — see OFFSITE_LOCATIONS.
    location_text?: string;
}

// The normal case: `location_text` is "Charlie's" (in-store).
const IN_STORE_LOCATION_TEXT = "charlie's";

// Known off-site locations seen in the live feed, mapped to a full address
// and coordinates. An off-site event NOT listed here still publishes its
// real (uncoordinated) `location_text` rather than falling back to the
// store's address — mirroring sources/book_larder/ripper.ts, which always
// shows the true off-site location and only degrades the lat/lng lookup
// gracefully when the venue isn't recognized.
const OFFSITE_LOCATIONS: Record<string, { location: string; lat: number; lng: number }> = {
    "ballard branch - seattle public library": {
        location: "Ballard Branch, Seattle Public Library, 5614 22nd Ave NW, Seattle, WA 98107",
        lat: 47.6671, lng: -122.3836,
    },
    "town hall seattle": {
        location: "Town Hall Seattle, 1119 8th Ave, Seattle, WA 98101",
        lat: 47.6090, lng: -122.3299,
    },
};

interface BookManagerEventListResponse {
    rows: BookManagerEventRow[];
    error?: string;
}

interface BookManagerSessionResponse {
    session_id?: string;
    error?: string;
}

export default class CharliesQueerBooksRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        const sessionId = await this.getSessionId(fetchFn);
        const rows = await this.fetchEvents(fetchFn, sessionId);

        for (const row of rows) {
            const result = this.parseRow(row);
            if ('date' in result) events.push(result);
            else errors.push(result);
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

    private async getSessionId(fetchFn: FetchFn): Promise<string> {
        // `today` is otherwise unused by session/get, but including it in the
        // body makes the fetch-cache key change daily (see keyFor in
        // lib/fetch-cache.ts) instead of the default 7-day TTL — this session
        // token likely doesn't live that long, so a session minted on day 1
        // shouldn't still be replayed into a live event/v2/list call on day 6.
        const today = ZonedDateTime.now(TIMEZONE).format(DATE_FMT);
        const body = new URLSearchParams({ store_id: STORE_ID, uuid: CLIENT_UUID, today }).toString();
        const res = await fetchFn(`${API_BASE}/session/get?_cb=${WEBSTORE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
            body,
        });
        if (!res.ok) throw new Error(`BookManager session/get returned HTTP ${res.status}`);
        const data: BookManagerSessionResponse = await res.json();
        if (data.error) throw new Error(`BookManager session/get returned error: ${data.error}`);
        if (!data.session_id) throw new Error('BookManager session/get response missing session_id');
        return data.session_id;
    }

    private async fetchEvents(fetchFn: FetchFn, sessionId: string): Promise<BookManagerEventRow[]> {
        // The API returns whatever is currently upcoming regardless of `from`
        // (verified against the live endpoint); pass today's date anyway since
        // that's what the site's own client sends.
        const from = ZonedDateTime.now(TIMEZONE).format(DATE_FMT);
        const body = new URLSearchParams({
            store_id: STORE_ID,
            uuid: CLIENT_UUID,
            session_id: sessionId,
            from,
        }).toString();
        const res = await fetchFn(`${API_BASE}/event/v2/list?_cb=${WEBSTORE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
            body,
        });
        if (!res.ok) throw new Error(`BookManager event/v2/list returned HTTP ${res.status}`);
        const data: BookManagerEventListResponse = await res.json();
        if (data.error) throw new Error(`BookManager event/v2/list returned error: ${data.error}`);
        return data.rows ?? [];
    }

    // Public for testing
    parseRow(row: BookManagerEventRow): RipperEvent {
        const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(row.date ?? '');
        if (!dateMatch) {
            return { type: 'ParseError', reason: `Unparseable date "${row.date}"`, context: row.title };
        }
        const year = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10);
        const day = parseInt(dateMatch[3], 10);
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return { type: 'ParseError', reason: `Invalid date values: "${row.date}"`, context: row.title };
        }

        const start = this.parseTime(row.start_time) ?? [0, 0];
        let startDate: ZonedDateTime;
        try {
            startDate = ZonedDateTime.of(LocalDateTime.of(year, month, day, start[0], start[1]), TIMEZONE);
        } catch (err) {
            return { type: 'ParseError', reason: `Invalid date "${row.date}": ${err}`, context: row.title };
        }

        let duration = Duration.ofHours(1);
        const end = this.parseTime(row.end_time);
        if (end) {
            const startMinutes = start[0] * 60 + start[1];
            const endMinutes = end[0] * 60 + end[1];
            if (endMinutes > startMinutes) duration = Duration.ofMinutes(endMinutes - startMinutes);
        }

        // In-store (the common case) uses the venue's own address. An
        // off-site location either resolves to a known full address+coords
        // (OFFSITE_LOCATIONS) or, if unrecognized, publishes its raw
        // location_text as-is rather than mislabeling it as the store.
        const locationKey = row.location_text?.toLowerCase().trim();
        let location = LOCATION;
        let coords: { lat: number; lng: number } | undefined;
        if (locationKey && locationKey !== IN_STORE_LOCATION_TEXT) {
            const known = OFFSITE_LOCATIONS[locationKey];
            location = known?.location ?? row.location_text!;
            coords = known;
        }

        const event: RipperCalendarEvent = {
            id: `charlies-queer-books-${row.id}`,
            ripped: new Date(),
            date: startDate,
            duration,
            summary: row.title,
            description: row.description ? this.stripHtml(row.description) : undefined,
            location,
            url: `https://charliesqueerbooks.com/events/${row.id}`,
            imageUrl: row.image_url || undefined,
        };

        if (coords) {
            event.lat = coords.lat;
            event.lng = coords.lng;
            event.geocodeSource = 'ripper';
        }

        return event;
    }

    private parseTime(time?: string): [number, number] | null {
        if (!time) return null;
        const match = /^(\d{1,2}):(\d{2})/.exec(time);
        if (!match) return null;
        return [parseInt(match[1], 10), parseInt(match[2], 10)];
    }

    // Public for testing
    stripHtml(html: string): string {
        return parse(html).textContent.replace(/\s+/g, ' ').trim();
    }
}
