import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const LOCATION = "The Collective Seattle, 400 Dexter Ave N, Seattle, WA 98109";
const DEFAULT_DURATION = Duration.ofHours(2);
const DESCRIPTION_MAX_LENGTH = 500;

// Meetup's Next.js pages embed the full Apollo GraphQL cache as page state.
// We only ever read the Event:* and Venue:* entries from this cache — the
// rest (Member, Group, Photo, session/auth keys) is not relevant to us and
// must never be logged or copied into fixtures.
const NEXT_DATA_REGEX = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i;

interface NewTechSeattleVenue {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
}

interface NewTechSeattleEvent {
    id?: string;
    title?: string;
    dateTime?: string;
    endTime?: string;
    eventUrl?: string;
    description?: string;
    venue?: { __ref?: string };
}

/**
 * Extracts the raw __NEXT_DATA__ JSON string from the page's HTML.
 * Returns undefined if the script tag is missing entirely.
 */
export function extractNextDataJson(html: string): string | undefined {
    const match = html.match(NEXT_DATA_REGEX);
    return match ? match[1] : undefined;
}

/**
 * Parses the __NEXT_DATA__ JSON blob and produces events. Only keys prefixed
 * `Event:`/`Venue:` in `props.pageProps.__APOLLO_STATE__` are read.
 */
export function extractNewTechSeattleEvents(
    nextDataJson: string,
    timezone: ZoneId,
    now: ZonedDateTime = ZonedDateTime.now(timezone),
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(nextDataJson);
    } catch (error) {
        return {
            events: [],
            errors: [{ type: "ParseError", reason: `Failed to parse __NEXT_DATA__ JSON: ${error}`, context: undefined }],
        };
    }

    const apolloState = (parsed as any)?.props?.pageProps?.__APOLLO_STATE__;
    if (!apolloState || typeof apolloState !== "object") {
        return {
            events: [],
            errors: [{
                type: "ParseError",
                reason: `Expected object at props.pageProps.__APOLLO_STATE__ but found ${typeof apolloState}`,
                context: undefined,
            }],
        };
    }

    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    for (const [key, raw] of Object.entries(apolloState)) {
        if (!key.startsWith("Event:")) continue;

        const result = parseNewTechSeattleEvent(raw as NewTechSeattleEvent, timezone);
        if ("date" in result) {
            if (result.date.isBefore(now)) continue; // past event — filtered in the caller, not the parse method
            if (result.id && seen.has(result.id)) continue;
            if (result.id) seen.add(result.id);
            events.push(result);
        } else {
            errors.push(result);
        }
    }

    return { events, errors };
}

function parseNewTechSeattleEvent(
    raw: NewTechSeattleEvent,
    timezone: ZoneId,
): RipperCalendarEvent | RipperError {
    const title = raw.title;
    const dateTime = raw.dateTime;

    if (!title || !dateTime) {
        return {
            type: "ParseError",
            reason: "Event missing title or dateTime",
            context: JSON.stringify(raw).substring(0, 200),
        };
    }

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.parse(dateTime).withZoneSameInstant(timezone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid dateTime "${dateTime}": ${error}`, context: title };
    }

    let duration = DEFAULT_DURATION;
    if (raw.endTime) {
        try {
            const end = ZonedDateTime.parse(raw.endTime).withZoneSameInstant(timezone);
            const diffMinutes = Duration.between(start, end).toMinutes();
            if (diffMinutes > 0) duration = Duration.ofMinutes(diffMinutes);
        } catch {
            // Fall back to DEFAULT_DURATION.
        }
    }

    const id = `new-tech-seattle-${start.toLocalDate().toString()}`;

    return {
        id,
        ripped: new Date(),
        date: start,
        duration,
        summary: decode(title),
        description: raw.description ? decode(raw.description).replace(/​/g, "").substring(0, DESCRIPTION_MAX_LENGTH) : undefined,
        location: LOCATION,
        url: raw.eventUrl,
    };
}

export default class NewTechSeattleRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`New Tech Seattle returned HTTP ${res.status}`);

        const html = await res.text();
        const nextDataJson = extractNextDataJson(html);

        const calConfig = ripper.config.calendars[0];

        if (!nextDataJson) {
            return [{
                name: calConfig.name,
                friendlyname: calConfig.friendlyname,
                events: [],
                errors: [{ type: "ParseError", reason: "__NEXT_DATA__ script tag not found on page", context: undefined }],
                tags: calConfig.tags ?? ripper.config.tags ?? [],
                parent: ripper.config,
            }];
        }

        const { events, errors } = extractNewTechSeattleEvents(nextDataJson, timezone, now);

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
