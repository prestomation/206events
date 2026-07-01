import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const LOCATION = "Sea Monster Lounge, 2202 N 45th St, Seattle, WA 98103";
const DEFAULT_DURATION = Duration.ofHours(2);

// The Wix warmup data blob is a full-page JSON payload embedded by the site's
// SSR. We only ever read the events array at this fixed path — sibling keys
// (siteSettings, owner, instance, members, ...) can carry internal Wix auth
// tokens and must never be read, logged, or copied into fixtures.
const EVENTS_APP_ID = "140603ad-af8d-84a5-2c80-a0f60cb47351";
const EVENTS_WIDGET_ID = "widgetcomp-kxpbo2ev";

// Matches the wix-warmup-data <script type="application/json" id="..."> tag
// regardless of attribute order.
const WARMUP_SCRIPT_REGEX = /<script\b(?=[^>]*\btype=["']application\/json["'])(?=[^>]*\bid=["']wix-warmup-data["'])[^>]*>([\s\S]*?)<\/script>/i;

interface SeaMonsterEvent {
    id?: string;
    location?: {
        name?: string;
        address?: string;
    };
    scheduling?: {
        config?: {
            startDate?: string;
            endDate?: string;
        };
    };
    title?: string;
    description?: string;
    mainImage?: {
        url?: string;
    };
    slug?: string;
}

/**
 * Extracts the raw wix-warmup-data JSON string from the page's HTML.
 * Returns undefined if the script tag is missing entirely.
 */
export function extractWarmupDataJson(html: string): string | undefined {
    const match = html.match(WARMUP_SCRIPT_REGEX);
    return match ? match[1] : undefined;
}

/**
 * Parses the wix-warmup-data JSON blob and produces events. Only the
 * `appsWarmupData[EVENTS_APP_ID][EVENTS_WIDGET_ID].events.events` array is
 * read; every other key in the parsed object is ignored.
 */
export function extractSeaMonsterEvents(
    warmupDataJson: string,
    timezone: ZoneId,
    now: ZonedDateTime = ZonedDateTime.now(timezone),
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    let parsed: unknown;
    try {
        parsed = JSON.parse(warmupDataJson);
    } catch (error) {
        return {
            events: [],
            errors: [{ type: "ParseError", reason: `Failed to parse wix-warmup-data JSON: ${error}`, context: undefined }],
        };
    }

    const rawEvents = (parsed as any)?.appsWarmupData?.[EVENTS_APP_ID]?.[EVENTS_WIDGET_ID]?.events?.events;
    if (!Array.isArray(rawEvents)) {
        return {
            events: [],
            errors: [{
                type: "ParseError",
                reason: `Expected array at appsWarmupData["${EVENTS_APP_ID}"]["${EVENTS_WIDGET_ID}"].events.events but found ${typeof rawEvents}`,
                context: undefined,
            }],
        };
    }

    for (const raw of rawEvents as SeaMonsterEvent[]) {
        const result = parseSeaMonsterEvent(raw, timezone);
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

function parseSeaMonsterEvent(
    raw: SeaMonsterEvent,
    timezone: ZoneId,
): RipperCalendarEvent | RipperError {
    const title = raw.title;
    const startDate = raw.scheduling?.config?.startDate;
    const slug = raw.slug;

    if (!title || !startDate || !slug) {
        return {
            type: "ParseError",
            reason: "Event missing title, scheduling.config.startDate, or slug",
            context: JSON.stringify(raw).substring(0, 200),
        };
    }

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.parse(startDate).withZoneSameInstant(timezone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid startDate "${startDate}": ${error}`, context: title };
    }

    let duration = DEFAULT_DURATION;
    const endDate = raw.scheduling?.config?.endDate;
    if (endDate) {
        try {
            const end = ZonedDateTime.parse(endDate).withZoneSameInstant(timezone);
            const diffMinutes = Duration.between(start, end).toMinutes();
            if (diffMinutes > 0) duration = Duration.ofMinutes(diffMinutes);
        } catch {
            // Fall back to DEFAULT_DURATION.
        }
    }

    const id = `sea-monster-lounge-${slug}-${start.toLocalDate().toString()}`;

    return {
        id,
        ripped: new Date(),
        date: start,
        duration,
        summary: decode(title),
        description: raw.description ? decode(raw.description) : undefined,
        location: LOCATION,
        imageUrl: raw.mainImage?.url || undefined,
    };
}

export default class SeaMonsterLoungeRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`Sea Monster Lounge returned HTTP ${res.status}`);

        const html = await res.text();
        const warmupDataJson = extractWarmupDataJson(html);

        const calConfig = ripper.config.calendars[0];

        if (!warmupDataJson) {
            return [{
                name: calConfig.name,
                friendlyname: calConfig.friendlyname,
                events: [],
                errors: [{ type: "ParseError", reason: "wix-warmup-data script tag not found on page", context: undefined }],
                tags: calConfig.tags ?? ripper.config.tags ?? [],
                parent: ripper.config,
            }];
        }

        const { events, errors } = extractSeaMonsterEvents(warmupDataJson, timezone, now);

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
