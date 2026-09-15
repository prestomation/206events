import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// AI House hosts most events at its own Pier 70 space; the ripper only ever
// covers AI House's own Luma calendar, so the address is a fixed constant
// rather than resolved from each event's (sometimes RSVP-gated) geo info.
const LOCATION = "AI House, 2801 Alaskan Wy, Seattle, WA 98121";
const DEFAULT_DURATION = Duration.ofHours(1);

// Luma's Next.js pages embed the initial page-load data (including the
// calendar's upcoming events) as page state. We only ever read
// props.pageProps.initialData.data.upcoming.entries from this blob.
const NEXT_DATA_REGEX = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i;

interface LumaEvent {
    api_id?: string;
    name?: string;
    start_at?: string;
    end_at?: string;
    url?: string;
    cover_url?: string;
}

interface LumaCalendarEntry {
    api_id?: string;
    event?: LumaEvent;
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
 * Parses the __NEXT_DATA__ JSON blob and produces events. Only
 * props.pageProps.initialData.data.upcoming.entries is read.
 */
export function extractAiHouseEvents(
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

    const entries = (parsed as any)?.props?.pageProps?.initialData?.data?.upcoming?.entries;
    if (!Array.isArray(entries)) {
        return {
            events: [],
            errors: [{
                type: "ParseError",
                reason: `Expected array at props.pageProps.initialData.data.upcoming.entries but found ${typeof entries}`,
                context: undefined,
            }],
        };
    }

    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    for (const rawEntry of entries as LumaCalendarEntry[]) {
        const result = parseAiHouseEvent(rawEntry?.event, timezone);
        if ("type" in result) {
            errors.push(result);
            continue;
        }

        const { event, durationUncertain, apiId } = result;
        if (event.date.isBefore(now)) continue; // past event — filtered in the caller, not the parse method
        if (seen.has(apiId)) continue;
        seen.add(apiId);
        events.push(event);

        if (durationUncertain) {
            const unknownFields: UncertaintyField[] = ["duration"];
            errors.push({
                type: "Uncertainty",
                source: "ai-house",
                reason: `No end_at listed for the ${event.date.toLocalDate()} occurrence`,
                unknownFields,
                event,
            });
        }
    }

    return { events, errors };
}

function parseAiHouseEvent(
    raw: LumaEvent | undefined,
    timezone: ZoneId,
): { event: RipperCalendarEvent; durationUncertain: boolean; apiId: string } | RipperError {
    const title = raw?.name;
    const startAt = raw?.start_at;

    if (!raw?.api_id || !title || !startAt) {
        return {
            type: "ParseError",
            reason: "Event missing api_id, name, or start_at",
            context: raw ? JSON.stringify(raw).substring(0, 200) : "missing event object",
        };
    }

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.parse(startAt).withZoneSameInstant(timezone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid start_at "${startAt}": ${error}`, context: title };
    }

    // A missing/invalid end_at is signaled to the caller as duration
    // uncertainty (see events12's canonical pattern) rather than silently
    // publishing the DEFAULT_DURATION guess as fact.
    let duration = DEFAULT_DURATION;
    let durationUncertain = true;
    if (raw.end_at) {
        try {
            const end = ZonedDateTime.parse(raw.end_at).withZoneSameInstant(timezone);
            const diffMinutes = Duration.between(start, end).toMinutes();
            if (diffMinutes > 0) {
                duration = Duration.ofMinutes(diffMinutes);
                durationUncertain = false;
            }
        } catch {
            // Fall back to DEFAULT_DURATION; durationUncertain stays true.
        }
    }

    const id = `ai-house-${raw.api_id}`;

    const event: RipperCalendarEvent = {
        id,
        ripped: new Date(),
        date: start,
        duration,
        summary: title,
        location: LOCATION,
        url: raw.url ? `https://luma.com/${raw.url}` : undefined,
        imageUrl: raw.cover_url,
    };

    return { event, durationUncertain, apiId: raw.api_id };
}

export default class AiHouseRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`AI House returned HTTP ${res.status}`);

        const html = await res.text();
        const nextDataJson = extractNextDataJson(html);

        const calConfig = ripper.config.calendars[0];
        if (!calConfig) {
            throw new Error("AI House ripper requires at least one calendar configuration");
        }

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

        const { events, errors } = extractAiHouseEvents(nextDataJson, timezone, now);

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
