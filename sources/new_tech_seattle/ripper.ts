import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

// The Collective Seattle is a coworking space that hosts many unrelated
// event series; this ripper only ever covers New Tech Seattle's own
// meetup, so the address is a fixed constant rather than resolved from
// the per-event `venue.__ref` (the venue is never expected to change).
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

    for (const [key, rawEntry] of Object.entries(apolloState)) {
        if (!key.startsWith("Event:")) continue;
        const raw = rawEntry as NewTechSeattleEvent;

        const result = parseNewTechSeattleEvent(raw, timezone);
        if ("type" in result) {
            errors.push(result);
            continue;
        }

        const { event, durationUncertain } = result;
        if (event.date.isBefore(now)) continue; // past event — filtered in the caller, not the parse method
        // Dedup on Meetup's own numeric event id (not the derived date-based
        // RipperCalendarEvent.id) so two distinct events landing on the same
        // calendar day are never mistaken for a refetch of the same event.
        if (seen.has(raw.id!)) continue;
        seen.add(raw.id!);
        events.push(event);

        if (durationUncertain) {
            const unknownFields: UncertaintyField[] = ["duration"];
            errors.push({
                type: "Uncertainty",
                source: "new-tech-seattle",
                reason: `No endTime listed for the ${event.date.toLocalDate()} occurrence`,
                unknownFields,
                event,
            });
        }
    }

    return { events, errors };
}

function parseNewTechSeattleEvent(
    raw: NewTechSeattleEvent,
    timezone: ZoneId,
): { event: RipperCalendarEvent; durationUncertain: boolean } | RipperError {
    const title = raw.title;
    const dateTime = raw.dateTime;

    if (!raw.id || !title || !dateTime) {
        return {
            type: "ParseError",
            reason: "Event missing id, title, or dateTime",
            context: JSON.stringify(raw).substring(0, 200),
        };
    }

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.parse(dateTime).withZoneSameInstant(timezone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid dateTime "${dateTime}": ${error}`, context: title };
    }

    // A missing/invalid endTime is signaled to the caller as duration
    // uncertainty (see events12's canonical pattern) rather than silently
    // publishing the DEFAULT_DURATION guess as fact.
    let duration = DEFAULT_DURATION;
    let durationUncertain = true;
    if (raw.endTime) {
        try {
            const end = ZonedDateTime.parse(raw.endTime).withZoneSameInstant(timezone);
            const diffMinutes = Duration.between(start, end).toMinutes();
            if (diffMinutes > 0) {
                duration = Duration.ofMinutes(diffMinutes);
                durationUncertain = false;
            }
        } catch {
            // Fall back to DEFAULT_DURATION; durationUncertain stays true.
        }
    }

    const id = `new-tech-seattle-${raw.id}`;

    const event: RipperCalendarEvent = {
        id,
        ripped: new Date(),
        date: start,
        duration,
        summary: decode(title),
        description: raw.description ? decode(raw.description).replace(/​/g, "").substring(0, DESCRIPTION_MAX_LENGTH) : undefined,
        location: LOCATION,
        url: raw.eventUrl,
    };

    return { event, durationUncertain };
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
