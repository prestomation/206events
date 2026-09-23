import { Duration, OffsetDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import { parse } from "node-html-parser";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";

const LOCATION = "Sideout Tsunami Pickleball Center, 2300 26th Ave S, Seattle, WA 98144";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION = Duration.ofHours(2);

// The /events page server-renders one or more <script type="application/ld+json">
// blocks. Most of the page carries a single SportsEvent[] array (the bookable
// classes/leagues/tournaments), alongside unrelated SportsActivityLocation and
// BreadcrumbList blocks we skip.
interface SideOutTsunamiJsonLdEvent {
    "@type"?: string;
    name?: string;
    startDate?: string;
    endDate?: string;
    url?: string;
}

export function extractSideOutTsunamiEvents(
    html: string,
    now: ZonedDateTime = ZonedDateTime.now(TIMEZONE),
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    const root = parse(html);
    const scripts = root.querySelectorAll('script[type="application/ld+json"]');

    const candidates: SideOutTsunamiJsonLdEvent[] = [];
    for (const script of scripts) {
        let data: unknown;
        try {
            data = JSON.parse(script.rawText);
        } catch (error) {
            errors.push({ type: "ParseError", reason: `Failed to parse JSON-LD: ${error}`, context: script.rawText.substring(0, 200) });
            continue;
        }
        if (Array.isArray(data)) candidates.push(...(data as SideOutTsunamiJsonLdEvent[]));
        else candidates.push(data as SideOutTsunamiJsonLdEvent);
    }

    const sportsEvents = candidates.filter(c => c["@type"] === "SportsEvent");
    if (sportsEvents.length === 0) {
        errors.push({ type: "ParseError", reason: "No JSON-LD SportsEvent entries found on the events page", context: undefined });
        return { events, errors };
    }

    for (const data of sportsEvents) {
        if (!data.name) {
            errors.push({ type: "ParseError", reason: "JSON-LD SportsEvent missing name", context: JSON.stringify(data).substring(0, 200) });
            continue;
        }
        if (!data.startDate) {
            errors.push({ type: "ParseError", reason: "JSON-LD SportsEvent missing startDate", context: data.name });
            continue;
        }

        let date: ZonedDateTime;
        try {
            date = OffsetDateTime.parse(data.startDate).atZoneSameInstant(TIMEZONE);
        } catch (error) {
            errors.push({ type: "ParseError", reason: `Could not parse startDate "${data.startDate}": ${error}`, context: data.name });
            continue;
        }
        if (date.isBefore(now)) continue;

        let duration = DEFAULT_DURATION;
        if (data.endDate) {
            try {
                const end = OffsetDateTime.parse(data.endDate).atZoneSameInstant(TIMEZONE);
                const minutes = Duration.between(date, end).toMinutes();
                if (minutes > 0) duration = Duration.ofMinutes(minutes);
            } catch {
                // Keep the default duration; a bad endDate isn't worth failing the event over.
            }
        }

        const id = extractEventId(data.url, data.name, date);
        if (seen.has(id)) continue;
        seen.add(id);

        events.push({
            id,
            ripped: new Date(),
            date,
            duration,
            summary: decode(data.name),
            location: LOCATION,
            url: data.url || undefined,
        });
    }

    return { events, errors };
}

function extractEventId(url: string | undefined, name: string, date: ZonedDateTime): string {
    // CourtReserve booking links carry a per-occurrence id, either
    // "?...&reservationId=123" or "?resId=123" depending on the link shape.
    const match = url?.match(/(?:reservationId|resId)=(\d+)/);
    if (match) return `side-out-tsunami-${match[1]}`;
    // No CourtReserve id found: fall back to a stable hash of name + date + time
    // slot (multiple sessions of the same class often run same-day) so ids
    // don't change between builds and don't collide across showings (see
    // AGENTS.md "Ripper Design: Stable Event IDs").
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const slot = date.hour().toString().padStart(2, "0") + date.minute().toString().padStart(2, "0");
    return `side-out-tsunami-${slug}-${date.toLocalDate().toString()}-${slot}`;
}

// The /events page's SportsEvent JSON-LD is populated by a server-side call
// to CourtReserve during Sideout Tsunami's own Next.js render; that call
// occasionally fails to complete in time and the page renders with only the
// SportsActivityLocation/BreadcrumbList blocks (HTTP 200, no error, just an
// empty events section). Observed directly on GitHub Actions' own network
// path, not just this sandbox's — so it's retried here rather than trusted
// on the first attempt.
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

export default class SideOutTsunamiRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const now = ZonedDateTime.now(TIMEZONE);

        let events: RipperCalendarEvent[] = [];
        let errors: RipperError[] = [];

        for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
            const res = await fetchFn(ripper.config.url.toString(), {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
            });
            if (!res.ok) throw new Error(`Sideout Tsunami returned HTTP ${res.status}`);

            const html = await res.text();
            const parsed = extractSideOutTsunamiEvents(html, now);
            events = parsed.events;
            errors = parsed.errors;

            // A genuine parse failure (malformed JSON-LD) isn't the transient
            // render gap this retry targets — no point retrying it.
            const hasParseFailure = errors.some(e => e.type === "ParseError" && e.reason.startsWith("Failed to parse JSON-LD"));
            if (events.length > 0 || hasParseFailure || attempt === MAX_FETCH_ATTEMPTS) break;

            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }

        const calConfig = ripper.config.calendars[0];
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
