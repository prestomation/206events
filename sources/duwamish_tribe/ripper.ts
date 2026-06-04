import { Duration, Instant, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Month names for building the pagination query parameter (?month=June-2026)
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

// How many additional months beyond the current one to fetch
const FUTURE_MONTHS = 5;

export interface DuwamishApiItem {
    id: string;
    title: string;
    startDate: number;
    endDate?: number;
    urlId?: string;
    fullUrl?: string;
    assetUrl?: string;
    location?: {
        addressTitle?: string;
        addressLine1?: string;
        addressLine2?: string;
    };
}

// Squarespace exposes a per-event image in `assetUrl`. Accept only absolute
// http(s) URLs that point at a real image file (have an image extension);
// the bare `static1.squarespace.com/static/.../<hash>/` placeholder URLs end
// in a slash with no filename and are not genuine event flyers.
export function extractAssetImageUrl(assetUrl: string | undefined): string | undefined {
    if (!assetUrl) return undefined;
    const raw = assetUrl.trim();
    if (!/^https?:\/\//i.test(raw)) return undefined;
    // Strip query/hash before checking the extension.
    const path = raw.split(/[?#]/)[0];
    if (!/\.(jpe?g|png|gif|webp|avif)$/i.test(path)) return undefined;
    return raw;
}

export interface DuwamishApiResponse {
    items?: DuwamishApiItem[];
    pagination?: {
        nextPage?: string;
    };
}

// Format the event's location string from its location object.
function formatLocation(location: DuwamishApiItem["location"]): string {
    if (!location) {
        return "Duwamish Longhouse & Cultural Center, 4705 West Marginal Way SW, Seattle, WA 98106";
    }
    const parts = [
        location.addressTitle,
        location.addressLine1,
        location.addressLine2,
    ].filter(Boolean);
    return parts.length > 0
        ? parts.join(", ")
        : "Duwamish Longhouse & Cultural Center, 4705 West Marginal Way SW, Seattle, WA 98106";
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function parseItem(
    item: DuwamishApiItem,
    now: ZonedDateTime,
    zone: ZoneId,
): RipperCalendarEvent | ParseError {
    const title = item.title.trim().replace(/\s*\(copy\)\s*$/i, "").trim();

    if (!title) {
        return {
            type: "ParseError",
            reason: "Empty event title after cleanup",
            context: item.id,
        };
    }

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.ofInstant(Instant.ofEpochMilli(item.startDate), zone);
    } catch {
        return {
            type: "ParseError",
            reason: `Invalid startDate: ${item.startDate}`,
            context: title,
        };
    }

    let duration: Duration;
    if (item.endDate && item.endDate > item.startDate) {
        const diffMs = item.endDate - item.startDate;
        const diffHours = diffMs / 3_600_000;
        // Cap at 12 h — avoids all-day "closed" blocks inflating the duration
        duration = Duration.ofMinutes(Math.round(Math.min(diffHours, 12) * 60));
    } else {
        duration = Duration.ofHours(1);
    }

    const url = item.fullUrl
        ? `https://www.duwamishtribe.org${item.fullUrl}`
        : "https://www.duwamishtribe.org/events-1";

    const dateStr = start.toLocalDate().toString();
    const id = `duwamish-${dateStr}-${slugify(title)}`;

    return {
        id,
        ripped: new Date(),
        date: start,
        duration,
        summary: title,
        location: formatLocation(item.location),
        url,
        imageUrl: extractAssetImageUrl(item.assetUrl),
    };
}

export async function fetchDuwamishEvents(
    baseUrl: URL,
    fetchFn: FetchFn,
    now: ZonedDateTime,
    zone: ZoneId,
): Promise<{ events: RipperCalendarEvent[]; errors: ParseError[] }> {
    const events: RipperCalendarEvent[] = [];
    const errors: ParseError[] = [];
    const nowMs = now.toInstant().toEpochMilli();

    for (let offset = 0; offset <= FUTURE_MONTHS; offset++) {
        const targetDate = now.plusMonths(offset);
        const monthYear = `${MONTH_NAMES[targetDate.monthValue() - 1]}-${targetDate.year()}`;

        const url = new URL(baseUrl.href);
        url.searchParams.set("format", "json");
        if (offset > 0) {
            url.searchParams.set("month", monthYear);
        }

        let resp: Response;
        try {
            resp = await fetchFn(url.toString(), {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
            });
        } catch (err) {
            errors.push({
                type: "ParseError",
                reason: `Network error fetching ${monthYear}: ${err}`,
                context: url.toString(),
            });
            break;
        }

        if (!resp.ok) {
            errors.push({
                type: "ParseError",
                reason: `HTTP ${resp.status} fetching ${monthYear}`,
                context: url.toString(),
            });
            break;
        }

        const data = (await resp.json()) as DuwamishApiResponse;
        const items = data.items ?? [];

        for (const item of items) {
            // Skip private events and past events
            if (/private/i.test(item.title)) continue;
            if (item.startDate < nowMs) continue;

            const result = parseItem(item, now, zone);
            if ("date" in result) {
                events.push(result);
            } else {
                errors.push(result);
            }
        }
    }

    return { events, errors };
}

export default class DuwamishTribeRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        if (!calConfig) {
            throw new Error("No calendars configured for duwamish_tribe ripper");
        }
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const { events, errors } = await fetchDuwamishEvents(
            ripper.config.url,
            this.fetchFn,
            now,
            zone,
        );

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
