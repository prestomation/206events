import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// WTIA (Washington Technology Industry Association) runs a "WTIA &
// Community Events" calendar on Luma that mixes its own programming with
// events submitted by other Seattle-area tech orgs (a real aggregator, not
// just WTIA's own events) — like AI House and The Improv Place, the page is
// a Next.js app whose initial event data is embedded as page state, read
// here via props.pageProps.initialData.data.upcoming.entries.
const NEXT_DATA_REGEX = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i;
const DEFAULT_DURATION = Duration.ofHours(1);
const DEFAULT_LOCATION = "Seattle, WA";
const FRIENDLY_URL = "https://www.washingtontechnology.org/events/";

interface LumaGeoAddressInfo {
    full_address?: string;
    short_address?: string;
    city_state?: string;
    sublocality?: string;
    city?: string;
}

interface LumaEvent {
    // Present on Luma-native events hosted directly on this calendar
    // ("independent" event_type). Externally-submitted community events
    // (an org's own event elsewhere, linked into this calendar) have no
    // event-level api_id at all — only the wrapping calendar entry does
    // (LumaCalendarEntry.api_id below) — and carry `duration_interval` /
    // `host` instead of `end_at`.
    api_id?: string;
    name?: string;
    start_at?: string;
    end_at?: string;
    duration_interval?: string;
    url?: string;
    cover_url?: string;
    location_type?: string;
    geo_address_info?: LumaGeoAddressInfo;
}

interface LumaCalendarEntry {
    // Stable per-entry id on every entry, native or externally-submitted —
    // used as the identity fallback when `event.api_id` is absent.
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

// Externally-submitted entries report their length as an ISO-8601 duration
// string (e.g. "P0Y0M0DT3H0M0S") rather than an end_at timestamp. js-joda's
// Duration.parse rejects the Y/M(onth) components even when zero, so this
// hand-rolls the same subset PT-style parsing already does.
const ISO_DURATION_REGEX = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

export function parseIsoDurationMinutes(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const match = ISO_DURATION_REGEX.exec(raw);
    if (!match) return undefined;

    const [, years, months, days, hours, minutes, seconds] = match;
    // A nonzero year/month component has never been observed in practice for
    // this calendar's event lengths. Approximating one (365-day years,
    // 30-day months) would publish a guessed multi-week/month duration as
    // fact — exactly what the Event Uncertainty System exists to prevent —
    // so treat it as unparseable instead and let the caller fall through to
    // the standard duration-uncertainty flow.
    if (Number(years ?? 0) > 0 || Number(months ?? 0) > 0) return undefined;

    const totalMinutes =
        Number(days ?? 0) * 24 * 60 +
        Number(hours ?? 0) * 60 +
        Number(minutes ?? 0) +
        Number(seconds ?? 0) / 60;

    return totalMinutes > 0 ? totalMinutes : undefined;
}

// Zoom-hosted entries have no physical address at all — "Virtual" is a
// confirmed fact for those, not a guess, so it's never flagged uncertain.
// Other events resolve like AI House/Improv Place: full/short street
// address when Luma exposes one, otherwise the best available city-level
// text flagged uncertain rather than presented as a confirmed address.
function resolveLocation(raw: LumaEvent): { location: string; uncertain: boolean } {
    if (raw.location_type === "zoom") return { location: "Virtual", uncertain: false };

    const geo = raw.geo_address_info;
    if (geo?.full_address) return { location: geo.full_address, uncertain: false };
    if (geo?.short_address) return { location: geo.short_address, uncertain: false };

    const fallback = [geo?.sublocality, geo?.city_state ?? geo?.city].filter(Boolean).join(", ");
    return { location: fallback || DEFAULT_LOCATION, uncertain: true };
}

// Independent Luma events use a short slug resolved against luma.com;
// externally-organized community events (the aggregator part of this
// calendar) already carry their own full ticketing URL.
function resolveUrl(url: string | undefined): string {
    if (!url) return FRIENDLY_URL;
    return /^https?:\/\//i.test(url) ? url : `https://luma.com/${url}`;
}

/**
 * Parses the __NEXT_DATA__ JSON blob and produces events. Only
 * props.pageProps.initialData.data.upcoming.entries is read.
 */
export function extractWtiaCommunityEvents(
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
        const result = parseWtiaCommunityEvent(rawEntry, timezone);
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
                source: "wtia-community-events",
                reason: `Missing ${uncertainFields.join("/")} for the ${event.date.toLocalDate()} occurrence of "${event.summary}"`,
                unknownFields: uncertainFields,
                event,
            });
        }
    }

    return { events, errors };
}

function parseWtiaCommunityEvent(
    rawEntry: LumaCalendarEntry | undefined,
    timezone: ZoneId,
): { event: RipperCalendarEvent; uncertainFields: UncertaintyField[]; apiId: string } | RipperError {
    const raw = rawEntry?.event;
    const title = raw?.name;
    const startAt = raw?.start_at;
    // Luma-native events carry their own api_id; externally-submitted
    // community events don't, so fall back to the wrapping entry's id
    // (stable per calendar entry either way).
    const apiId = raw?.api_id ?? rawEntry?.api_id;

    if (!apiId || !title || !startAt) {
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
    // silently publishing the DEFAULT_DURATION guess as fact. Externally-
    // submitted entries have no end_at at all — fall back to their
    // duration_interval before giving up.
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
        const intervalMinutes = parseIsoDurationMinutes(raw.duration_interval);
        if (intervalMinutes !== undefined) {
            duration = Duration.ofMinutes(Math.round(intervalMinutes));
        } else {
            uncertainFields.push("duration");
        }
    }

    const { location, uncertain: locationUncertain } = resolveLocation(raw);
    if (locationUncertain) uncertainFields.push("location");

    const id = `wtia-community-events-${apiId}`;

    const event: RipperCalendarEvent = {
        id,
        ripped: new Date(),
        date: start,
        duration,
        summary: title,
        location,
        url: resolveUrl(raw.url),
        imageUrl: raw.cover_url,
    };

    return { event, uncertainFields, apiId };
}

export default class WtiaCommunityEventsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`WTIA & Community Events returned HTTP ${res.status}`);

        const html = await res.text();
        const nextDataJson = extractNextDataJson(html);

        const calConfig = ripper.config.calendars[0];
        if (!calConfig) {
            throw new Error("WTIA Community Events ripper requires at least one calendar configuration");
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

        const { events, errors } = extractWtiaCommunityEvents(nextDataJson, timezone, now);

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
