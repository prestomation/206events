import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// The Improv Place (theimprovplace.org) is a Seattle nonprofit improv
// theater that runs its own recurring jam/workshop series at rented venues
// around the city (Langston Hughes Performing Arts Institute, Seattle
// Center Armory, etc) rather than a single fixed address, so — like
// AI House — its public calendar is a Luma page whose Next.js pages embed
// the initial event data as page state, read here via
// props.pageProps.initialData.data.upcoming.entries.
const NEXT_DATA_REGEX = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i;
const DEFAULT_DURATION = Duration.ofHours(1);
const FRIENDLY_URL = "https://theimprovplace.org/";

interface LumaGeoAddressInfo {
    full_address?: string;
    short_address?: string;
    city_state?: string;
    sublocality?: string;
    city?: string;
}

interface LumaEvent {
    api_id?: string;
    name?: string;
    start_at?: string;
    end_at?: string;
    url?: string;
    cover_url?: string;
    geo_address_info?: LumaGeoAddressInfo;
}

interface LumaCalendarEntry {
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

// Luma hides the street address behind RSVP for some series ("mode:
// obfuscated"), leaving only city/neighborhood-level text. Only
// `full_address`/`short_address` are street-level; anything less precise is
// published with the best available text (still enough for the city-wide
// geocoder to place it approximately) and flagged via the Uncertainty
// system rather than presented as a confirmed address.
function resolveLocation(geo: LumaGeoAddressInfo | undefined): { location: string; uncertain: boolean } {
    if (geo?.full_address) return { location: geo.full_address, uncertain: false };
    if (geo?.short_address) return { location: geo.short_address, uncertain: false };

    const fallback = [geo?.sublocality, geo?.city_state ?? geo?.city].filter(Boolean).join(", ");
    return { location: fallback || "Seattle, WA", uncertain: true };
}

/**
 * Parses the __NEXT_DATA__ JSON blob and produces events. Only
 * props.pageProps.initialData.data.upcoming.entries is read.
 */
export function extractImprovPlaceEvents(
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
        const result = parseImprovPlaceEvent(rawEntry?.event, timezone);
        if ("type" in result) {
            errors.push(result);
            continue;
        }

        const { event, uncertainFields, apiId } = result;
        if (event.date.isBefore(now)) continue; // past event — filtered in the caller, not the parse method
        if (seen.has(apiId)) continue;
        seen.add(apiId);
        events.push(event);

        if (uncertainFields.length > 0) {
            errors.push({
                type: "Uncertainty",
                source: "improv-place",
                reason: `Missing ${uncertainFields.join("/")} for the ${event.date.toLocalDate()} occurrence of "${event.summary}"`,
                unknownFields: uncertainFields,
                event,
            });
        }
    }

    return { events, errors };
}

function parseImprovPlaceEvent(
    raw: LumaEvent | undefined,
    timezone: ZoneId,
): { event: RipperCalendarEvent; uncertainFields: UncertaintyField[]; apiId: string } | RipperError {
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
    // uncertainty (see events12's/AI House's canonical pattern) rather than
    // silently publishing the DEFAULT_DURATION guess as fact.
    let duration = DEFAULT_DURATION;
    const uncertainFields: UncertaintyField[] = [];
    if (raw.end_at) {
        try {
            const end = ZonedDateTime.parse(raw.end_at).withZoneSameInstant(timezone);
            const diffMinutes = Duration.between(start, end).toMinutes();
            if (diffMinutes > 0) {
                duration = Duration.ofMinutes(diffMinutes);
            } else {
                uncertainFields.push("duration");
            }
        } catch {
            uncertainFields.push("duration");
        }
    } else {
        uncertainFields.push("duration");
    }

    const { location, uncertain: locationUncertain } = resolveLocation(raw.geo_address_info);
    if (locationUncertain) uncertainFields.push("location");

    const id = `improv-place-${raw.api_id}`;

    const event: RipperCalendarEvent = {
        id,
        ripped: new Date(),
        date: start,
        duration,
        summary: title,
        location,
        url: raw.url ? `https://luma.com/${raw.url}` : FRIENDLY_URL,
        imageUrl: raw.cover_url,
    };

    return { event, uncertainFields, apiId: raw.api_id };
}

export default class ImprovPlaceRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`The Improv Place returned HTTP ${res.status}`);

        const html = await res.text();
        const nextDataJson = extractNextDataJson(html);

        const calConfig = ripper.config.calendars[0];
        if (!calConfig) {
            throw new Error("Improv Place ripper requires at least one calendar configuration");
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

        const { events, errors } = extractImprovPlaceEvents(nextDataJson, timezone, now);

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
