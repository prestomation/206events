import { LocalDateTime, Duration, ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import { decode } from "html-entities";
import {
    IRipper,
    Ripper,
    RipperCalendar,
    RipperCalendarEvent,
    RipperError,
    RipperEvent,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";

/**
 * Seattle Symphony / Benaroya Hall.
 *
 * 2026-09-27: seattlesymphony.org now permanently redirects (301) to
 * benaroyahall.org (site rebrand), and the calendar backend migrated from a
 * Sitecore GraphQL API to a plain Umbraco endpoint — confirmed live via the
 * new `/calendar` page's own Vue app source, which POSTs to
 * `/umbraco/api/performances/GetGridCalendarShows` (form-urlencoded body, no
 * API key or auth of any kind). It returns a flat JSON array of individual
 * performances (not nested by year/month/Event Page like the old GraphQL
 * response), each carrying its own upstream numeric `id`, a naive local
 * (Pacific, no UTC offset) `start` timestamp, a plain `venue` name, and an
 * `isPast` flag the site itself computes.
 *
 * The four filter fields the app always sends (`keywordId`, `genre`,
 * `seriesKeywordId`, `audienceKeywordId`, `accessibilityKeywordId`,
 * `timeSlot`) default to the string `"-1"` in the app's Vue state — sending
 * empty strings instead (a natural first guess) silently makes the endpoint
 * return an empty body, so it's worth documenting here.
 *
 * Performances are routed to one of three calendars by `venue` name (see
 * ripper.yaml `venueMatch`): the main Taper Auditorium, the Nordstrom Recital
 * Hall, and a catch-all for every other Benaroya Hall complex room (Octave 9,
 * Grand Lobby, etc.). Unlike the old Sitecore venue names, the new API's
 * `venue` field never carries a literal "Benaroya Hall" suffix to match
 * against (that only sometimes appears in the separate, much less reliable
 * `location` field, which can even name the wrong room) — so the catch-all
 * here claims whatever no specific route claims, rather than requiring its
 * own `venueMatch` text to appear in the venue name.
 */

const API_ORIGIN = "https://benaroyahall.org";
const CALENDAR_ENDPOINT = `${API_ORIGIN}/umbraco/api/performances/GetGridCalendarShows`;
const VENUE_ADDRESS = "200 University St, Seattle, WA 98101";
// Performances carry only a start time; orchestral concerts run ~2 hours.
const DEFAULT_DURATION = Duration.ofHours(2);
// The site's own default query window is "start of this month" through
// "12 months from today"; a flat day count comfortably covers that.
const LOOKAHEAD_DAYS = 400;

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

interface CalendarRoute {
    name: string;
    friendlyname: string;
    tags: string[];
    timezone: ZoneId;
    venueMatch: string;
    catchAll: boolean;
    events: RipperEvent[];
}

interface ApiPerformance {
    id: number;
    start?: string;
    title?: string;
    description?: string;
    image?: string | null;
    venue?: string;
    learnMoreUrl?: string;
    buyPageUrl?: string;
    isPast?: boolean;
    hideInSearchResults?: boolean;
}

export default class BenaroyaHallRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const routes: CalendarRoute[] = ripper.config.calendars.map((cal) => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            tags: cal.tags || [],
            timezone: cal.timezone,
            venueMatch: String(cal.config?.venueMatch ?? ""),
            catchAll: Boolean(cal.config?.catchAll),
            events: [],
        }));

        let data: ApiPerformance[];
        try {
            data = await this.fetchEvents();
        } catch (err) {
            // Surface the fetch failure on every calendar so the build report
            // shows it rather than silently emitting zero events.
            const error: RipperError = {
                type: "ParseError",
                reason: `Failed to fetch Benaroya Hall calendar feed: ${err}`,
                context: CALENDAR_ENDPOINT,
            };
            return routes.map((r) => ({
                name: r.name,
                friendlyname: r.friendlyname,
                events: [],
                errors: [error],
                parent: ripper.config,
                tags: r.tags,
            }));
        }

        const nowMs = Date.now();
        for (const perf of data) {
            this.parsePerformance(perf, routes, nowMs);
        }

        return routes.map((r) => ({
            name: r.name,
            friendlyname: r.friendlyname,
            events: r.events.filter(
                (e): e is RipperCalendarEvent => "date" in e,
            ),
            errors: r.events.filter((e): e is RipperError => "type" in e),
            parent: ripper.config,
            tags: r.tags,
        }));
    }

    private async fetchEvents(): Promise<ApiPerformance[]> {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(
            now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
        );

        // These filter fields default to "-1" (not "") in the site's own Vue
        // state — see the class doc comment above.
        const body = new URLSearchParams({
            keywordId: "-1",
            genre: "-1",
            seriesKeywordId: "-1",
            audienceKeywordId: "-1",
            accessibilityKeywordId: "-1",
            timeSlot: "-1",
            locationKeywordId: "",
            programs: "",
            query: "",
            selectedFilters: "[]",
            start: start.toISOString(),
            end: end.toISOString(),
        });

        let lastErr: unknown;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const res = await this.fetchFn(CALENDAR_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent":
                            "Mozilla/5.0 (compatible; 206events/1.0; +https://206.events)",
                    },
                    body: body.toString(),
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }
                const text = await res.text();
                if (!text) return []; // No performances in the window.
                return JSON.parse(text) as ApiPerformance[];
            } catch (err) {
                lastErr = err;
                if (attempt < MAX_RETRIES - 1) {
                    await sleep(BASE_DELAY_MS * 2 ** attempt);
                }
            }
        }
        throw lastErr;
    }

    private parsePerformance(
        perf: ApiPerformance,
        routes: CalendarRoute[],
        nowMs: number,
    ): void {
        const venueName = perf.venue ?? "";
        const route = this.routeVenue(venueName, routes);
        // Intentional content filter (no venue at all, or one that somehow
        // isn't a Benaroya Hall complex room) — skip in the caller rather
        // than emitting a parse error.
        if (!route) return;
        // Intentionally-hidden listing (the site's own search filter checks
        // this flag) — not a parse error either.
        if (perf.hideInSearchResults) return;

        const title = decode(perf.title || "").trim();
        if (!title) {
            route.events.push({
                type: "ParseError",
                reason: `Performance ${perf.id} has no title`,
                context: venueName,
            });
            return;
        }

        const raw = perf.start;
        if (!raw) {
            route.events.push({
                type: "ParseError",
                reason: `Performance "${title}" (${perf.id}) has no start time`,
                context: title,
            });
            return;
        }

        let localDateTime: LocalDateTime;
        try {
            // e.g. "2026-09-16T19:30:00.0000000" — naive local (Pacific)
            // time, no UTC offset. LocalDateTime.parse tolerates the
            // 7-digit fraction.
            localDateTime = LocalDateTime.parse(raw);
        } catch {
            route.events.push({
                type: "ParseError",
                reason: `Unparseable performance start "${raw}"`,
                context: title,
            });
            return;
        }

        const date = localDateTime.atZone(route.timezone);
        // The API's own `isPast` flag is the primary signal; the epoch
        // comparison is a defensive fallback in case that flag is ever stale.
        if (perf.isPast || date.toInstant().toEpochMilli() < nowMs) return;

        const url = perf.learnMoreUrl
            ? `${API_ORIGIN}${perf.learnMoreUrl}`
            : perf.buyPageUrl
              ? `${API_ORIGIN}${perf.buyPageUrl}`
              : undefined;
        const imageUrl = perf.image ? `${API_ORIGIN}${perf.image}` : undefined;
        const description =
            stripHtml(decode(perf.description || "")) || undefined;
        const location = `${venueName}, ${VENUE_ADDRESS}`;

        route.events.push({
            id: `benaroya-hall-${perf.id}`,
            ripped: new Date(),
            date,
            duration: DEFAULT_DURATION,
            summary: title,
            description,
            location,
            url,
            imageUrl,
            cost: { paid: true },
        });
    }

    /**
     * Route a venue name to a calendar. Specific calendars (non-catchAll)
     * win over the catch-all, which claims whatever no specific route
     * claims — see the class doc comment for why it no longer requires its
     * own `venueMatch` text to appear in the venue name.
     */
    private routeVenue(
        venueName: string,
        routes: CalendarRoute[],
    ): CalendarRoute | undefined {
        if (!venueName) return undefined;
        const specific = routes.find(
            (r) =>
                !r.catchAll && r.venueMatch && venueName.includes(r.venueMatch),
        );
        if (specific) return specific;
        return routes.find((r) => r.catchAll);
    }
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
