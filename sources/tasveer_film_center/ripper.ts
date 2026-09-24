import { Duration, Instant, ZonedDateTime, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

/**
 * Tasveer Film Center runs on the Indy Systems cinema platform. The public
 * site is a client-side app backed by a same-origin GraphQL endpoint that
 * scopes every request by `site-id` / `circuit-id` headers (the values are
 * baked into the site's public JS bundle — they are not credentials).
 *
 * `showingsForDate` with no `date` argument returns every upcoming public
 * showing in a single response.
 */
const SITE_ORIGIN = "https://filmcenter.tasveer.org";
const GRAPHQL_URL = `${SITE_ORIGIN}/graphql`;
const SITE_ID = "262";
const CIRCUIT_ID = "138";
const IMAGE_BASE = "https://indy-systems.imgix.net";
const LOCATION = "Tasveer Film Center, 4812 Rainier Ave S, Seattle, WA 98118";
const DEFAULT_DURATION_MINUTES = 120;

export const SHOWINGS_QUERY = `{ showingsForDate { data { id time published private screen { name } movie { id name urlSlug duration synopsis posterImage } } } }`;

export interface IndyShowing {
    id: string;
    time: string;
    published?: boolean | null;
    private?: boolean | null;
    screen?: { name?: string | null } | null;
    movie?: {
        id: string;
        name?: string | null;
        urlSlug?: string | null;
        duration?: number | null;
        synopsis?: string | null;
        posterImage?: string | null;
    } | null;
}

function htmlToText(html: string): string {
    return decode(
        html
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|div|li)>/gi, "\n")
            .replace(/<[^>]+>/g, "")
    )
        .replace(/ /g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n\n")
        .trim();
}

export function parseShowing(showing: IndyShowing, timezone: ZoneId): RipperCalendarEvent | RipperError {
    const movie = showing.movie;
    const title = movie?.name?.trim();
    if (!title) {
        return { type: "ParseError", reason: "Showing has no movie title", context: `showing ${showing.id}` };
    }

    let date: ZonedDateTime;
    try {
        date = ZonedDateTime.ofInstant(Instant.parse(showing.time), timezone);
    } catch {
        return { type: "ParseError", reason: `Invalid showing time: ${showing.time}`, context: title };
    }

    const minutes = movie?.duration && movie.duration > 0 && movie.duration <= 8 * 60
        ? movie.duration
        : DEFAULT_DURATION_MINUTES;

    const synopsis = movie?.synopsis ? htmlToText(movie.synopsis) : "";
    const screen = showing.screen?.name?.trim();
    const description = [synopsis, screen ? `Screen: ${screen}` : ""].filter(Boolean).join("\n\n");

    // Tasveer's GraphQL API does not expose ticket prices; all public showings are paid.
    const cost: EventCost = { paid: true };

    return {
        id: `tasveer-${showing.id}`,
        ripped: new Date(),
        date,
        duration: Duration.ofMinutes(minutes),
        summary: title,
        description: description || undefined,
        location: LOCATION,
        url: movie?.urlSlug ? `${SITE_ORIGIN}/movie/${movie.urlSlug}` : `${SITE_ORIGIN}/home`,
        imageUrl: movie?.posterImage ? `${IMAGE_BASE}/${movie.posterImage}?w=800&auto=format` : undefined,
        cost,
    };
}

export function parseShowings(json: unknown, timezone: ZoneId, now: ZonedDateTime): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];

    const root = json as { data?: { showingsForDate?: { data?: IndyShowing[] } }; errors?: unknown; error?: { message?: string } };
    const showings = root?.data?.showingsForDate?.data;
    if (!Array.isArray(showings)) {
        const msg = root?.error?.message ?? (root?.errors ? JSON.stringify(root.errors).substring(0, 300) : "missing data.showingsForDate.data");
        errors.push({ type: "ParseError", reason: `Unexpected GraphQL response: ${msg}`, context: GRAPHQL_URL });
        return { events, errors };
    }

    const seen = new Set<string>();
    for (const showing of showings) {
        if (!showing?.id || seen.has(showing.id)) continue;
        seen.add(showing.id);
        // Private rentals and unpublished showings aren't public events.
        if (showing.private === true || showing.published === false) continue;

        const result = parseShowing(showing, timezone);
        if ("date" in result) {
            if (result.date.isBefore(now)) continue;
            events.push(result);
        } else {
            errors.push(result);
        }
    }
    return { events, errors };
}

export default class TasveerFilmCenterRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const timezone = calConfig.timezone;

        const res = await fetchFn(GRAPHQL_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)",
                "site-id": SITE_ID,
                "circuit-id": CIRCUIT_ID,
                "client-type": "consumer",
            },
            body: JSON.stringify({ query: SHOWINGS_QUERY }),
        });
        if (!res.ok) throw new Error(`Tasveer GraphQL returned HTTP ${res.status}`);

        const json = await res.json();
        const { events, errors } = parseShowings(json, timezone, ZonedDateTime.now(timezone));

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
