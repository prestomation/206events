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

// Off-site locations seen in the live feed, mapped to a full address (for
// display) and, where known, coordinates. Events not listed here (i.e. the
// normal in-store case) use the venue's own LOCATION/geo. An off-site event
// with no coordinate match here still gets the venue's coords via the
// ripper-level `geo` fallback in attachEventCoords — a minor known
// imprecision the same as other venue rippers with occasional off-site
// events (see sources/book_larder/ripper.ts).
const OFFSITE_LOCATIONS: Record<string, { location: string; lat?: number; lng?: number }> = {
    "ballard branch - seattle public library": {
        location: "Ballard Branch, Seattle Public Library, 5614 22nd Ave NW, Seattle, WA 98107",
        lat: 47.6671, lng: -122.3836,
    },
    "town hall seattle": {
        location: "Town Hall Seattle, 1119 8th Ave, Seattle, WA 98101",
        lat: 47.6090, lng: -122.3299,
    },
    "virtual": { location: "Virtual" },
};

interface BookManagerEventListResponse {
    rows: BookManagerEventRow[];
}

interface BookManagerSessionResponse {
    session_id?: string;
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
        const body = new URLSearchParams({ store_id: STORE_ID, uuid: CLIENT_UUID }).toString();
        const res = await fetchFn(`${API_BASE}/session/get?_cb=${WEBSTORE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
            body,
        });
        if (!res.ok) throw new Error(`BookManager session/get returned HTTP ${res.status}`);
        const data: BookManagerSessionResponse = await res.json();
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

        const start = this.parseTime(row.start_time) ?? [0, 0];
        const startDate = ZonedDateTime.of(LocalDateTime.of(year, month, day, start[0], start[1]), TIMEZONE);

        let duration = Duration.ofHours(1);
        const end = this.parseTime(row.end_time);
        if (end) {
            const startMinutes = start[0] * 60 + start[1];
            const endMinutes = end[0] * 60 + end[1];
            if (endMinutes > startMinutes) duration = Duration.ofMinutes(endMinutes - startMinutes);
        }

        const offsite = row.location_text ? OFFSITE_LOCATIONS[row.location_text.toLowerCase().trim()] : undefined;

        const event: RipperCalendarEvent = {
            id: `charlies-queer-books-${row.id}`,
            ripped: new Date(),
            date: startDate,
            duration,
            summary: row.title,
            description: row.description ? this.stripHtml(row.description) : undefined,
            location: offsite?.location ?? LOCATION,
            url: `https://charliesqueerbooks.com/events/${row.id}`,
            imageUrl: row.image_url || undefined,
        };

        if (offsite?.lat !== undefined && offsite?.lng !== undefined) {
            event.lat = offsite.lat;
            event.lng = offsite.lng;
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
