import { ZonedDateTime, Duration, Instant, ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
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
 * The seattlesymphony.org calendar is a Sitecore JSS app. Its concert data is
 * served by a public, read-only Sitecore GraphQL endpoint (the `sc_apikey`
 * below is a public client key embedded in the site's own JS bundle — it gates
 * anonymous read access to published content only, not writes or private data,
 * which is why it is committed here).
 *
 * Event content lives as `Event Page` items under
 * `/sitecore/content/Shared Content/Events/<YYYY>/<MM>/<slug>` (the folder is
 * the content-authoring month, NOT the performance month, so it cannot be used
 * to filter by date). Each Event Page has child `Performance` items carrying a
 * `Date` (ISO basic UTC, e.g. `20260920T010000Z`) and a `Venue` lookup. One
 * deep nested query returns every event + performance in a single request.
 *
 * Performances are routed to one of three calendars by the resolved venue name
 * (see ripper.yaml `venueMatch`): the main Taper Auditorium, the Nordstrom
 * Recital Hall, and a catch-all for the remaining Benaroya Hall rooms
 * (Octave 9, Grand Lobby, etc.). Performances at off-site venues (the
 * Symphony's occasional community concerts at schools, parks, etc.) are not
 * Benaroya Hall events and are skipped.
 */

const GRAPHQL_ENDPOINT =
    "https://www.seattlesymphony.org/sitecore/api/graph/items/web";
// Public, read-only Sitecore Item Service key, extracted from the site's
// published appjs.js bundle. This is NOT a secret: it is served to every
// browser visitor and can be read from any network tab; it gates anonymous
// read access to published content only, never writes or private data. A
// runnable ripper needs it, which is why it is committed. If it ever rotates,
// re-read it from the bundle (search appjs.js for `items/web?sc_apikey=`).
const SC_APIKEY = "382CF404-7810-4680-9FFC-C648DE4050AE";

const EVENTS_ROOT = "/sitecore/content/Shared Content/Events";
const SITE_ORIGIN = "https://www.seattlesymphony.org";
const VENUE_ADDRESS = "200 University St, Seattle, WA 98101";
// Performances carry only a start time; orchestral concerts run ~2 hours.
const DEFAULT_DURATION = Duration.ofHours(2);

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

const EVENTS_QUERY = `query Events($root: String!) {
  item(path: $root) {
    children {            # year buckets
      children {          # month buckets
        children {        # Event Page items
          name
          url
          eventName: field(name: "Event Name") { value }
          mainTitle: field(name: "Main Title") { value }
          image: field(name: "Main Image") { value }
          venue: field(name: "Venue") {
            ... on LookupField {
              targetItem {
                venueName: field(name: "Venue Name") { value }
              }
            }
          }
          children {       # Performance items
            template { name }
            date: field(name: "Date") { value }
          }
        }
      }
    }
  }
}`;

interface CalendarRoute {
    name: string;
    friendlyname: string;
    tags: string[];
    timezone: ZoneId;
    venueMatch: string;
    catchAll: boolean;
    events: RipperEvent[];
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

        let data: any;
        try {
            data = await this.fetchEvents();
        } catch (err) {
            // Surface the fetch failure on every calendar so the build report
            // shows it rather than silently emitting zero events.
            const error: RipperError = {
                type: "ParseError",
                reason: `Failed to fetch Seattle Symphony GraphQL feed: ${err}`,
                context: GRAPHQL_ENDPOINT,
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
        for (const ev of this.iterateEventPages(data)) {
            this.parseEventPage(ev, routes, nowMs);
        }

        return routes.map((r) => ({
            name: r.name,
            friendlyname: r.friendlyname,
            events: r.events
                .filter((e): e is RipperCalendarEvent => "date" in e),
            errors: r.events.filter((e): e is RipperError => "type" in e),
            parent: ripper.config,
            tags: r.tags,
        }));
    }

    private async fetchEvents(): Promise<any> {
        const url = `${GRAPHQL_ENDPOINT}?sc_apikey=${SC_APIKEY}`;
        const body = JSON.stringify({
            query: EVENTS_QUERY,
            variables: { root: EVENTS_ROOT },
        });

        let lastErr: unknown;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const res = await this.fetchFn(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent":
                            "Mozilla/5.0 (compatible; 206events/1.0; +https://206.events)",
                    },
                    body,
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }
                const json: any = await res.json();
                if (json.errors) {
                    throw new Error(
                        `GraphQL errors: ${JSON.stringify(json.errors).slice(0, 300)}`,
                    );
                }
                return json.data;
            } catch (err) {
                lastErr = err;
                if (attempt < MAX_RETRIES - 1) {
                    await sleep(BASE_DELAY_MS * 2 ** attempt);
                }
            }
        }
        throw lastErr;
    }

    /** Walk year -> month -> Event Page, yielding each Event Page node. */
    private *iterateEventPages(data: any): Generator<any> {
        const root = data?.item;
        for (const year of root?.children ?? []) {
            for (const month of year?.children ?? []) {
                for (const ev of month?.children ?? []) {
                    yield ev;
                }
            }
        }
    }

    private parseEventPage(
        ev: any,
        routes: CalendarRoute[],
        nowMs: number,
    ): void {
        const venueName: string =
            ev?.venue?.targetItem?.venueName?.value ?? "";
        const route = this.routeVenue(venueName, routes);
        // Intentional content filter (off-site, non-Benaroya venues) — skip in
        // the caller rather than emitting a parse error.
        if (!route) return;

        const title: string =
            ev?.eventName?.value || ev?.mainTitle?.value || ev?.name || "";
        const url = ev?.url ? `${SITE_ORIGIN}${ev.url}` : undefined;
        const imageUrl = mediaUrl(ev?.image?.value);
        const location = `${venueName}, ${VENUE_ADDRESS}`;

        const performances = (ev?.children ?? []).filter(
            (c: any) => c?.template?.name === "Performance",
        );

        for (const perf of performances) {
            const raw: string | undefined = perf?.date?.value;
            if (!raw) continue; // Performance with no date set — not yet scheduled.

            const instant = parseSitecoreInstant(raw);
            if (!instant) {
                route.events.push({
                    type: "ParseError",
                    reason: `Unparseable performance date "${raw}"`,
                    context: `${title} (${ev?.name})`,
                });
                continue;
            }
            if (instant.toEpochMilli() < nowMs) continue; // past performance

            const date = ZonedDateTime.ofInstant(instant, route.timezone);
            route.events.push({
                id: `benaroya-hall-${ev?.name}-${raw.replace(/[^0-9]/g, "")}`,
                ripped: new Date(),
                date,
                duration: DEFAULT_DURATION,
                summary: title,
                location,
                url,
                imageUrl,
            });
        }
    }

    /**
     * Route a venue name to a calendar. Specific calendars (non-catchAll) win
     * over the catch-all, so "S. Mark Taper Foundation Auditorium - Benaroya
     * Hall" routes to Taper even though it also contains "Benaroya Hall".
     */
    private routeVenue(
        venueName: string,
        routes: CalendarRoute[],
    ): CalendarRoute | undefined {
        const specific = routes.find(
            (r) =>
                !r.catchAll &&
                r.venueMatch &&
                venueName.includes(r.venueMatch),
        );
        if (specific) return specific;
        return routes.find(
            (r) =>
                r.catchAll && r.venueMatch && venueName.includes(r.venueMatch),
        );
    }
}

/**
 * Parse a Sitecore ISO-basic UTC timestamp ("20260920T010000Z") into an
 * Instant. Falls back to extended-ISO parsing for any other shape.
 */
function parseSitecoreInstant(raw: string): Instant | null {
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const iso = m
        ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`
        : raw;
    try {
        return Instant.parse(iso);
    } catch {
        return null;
    }
}

/** Convert a Sitecore `<image mediaid="{GUID}" />` field into a media URL. */
function mediaUrl(imageField: string | undefined): string | undefined {
    if (!imageField) return undefined;
    const m = imageField.match(/mediaid="\{([0-9A-Fa-f-]+)\}"/);
    if (!m) return undefined;
    const id = m[1].replace(/-/g, "").toUpperCase();
    return `${SITE_ORIGIN}/-/media/${id}.ashx`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
