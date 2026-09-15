import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, EventCost, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decodeEntities } from "../../lib/text-normalize.js";
import '@js-joda/timezone';

// Seattle Book Club (seattlebookclub.com) is a Shopify-based bookstore/events
// org that runs reading socials, author talks, and book clubs at rotating
// Seattle venues (Backyard Bagel, Figurehead Brewing, Hotel Sorrento, etc).
// Its client-rendered calendar widget is a Shopify app ("Evey Events") that
// calls a public, unauthenticated JSON API directly:
//   GET https://api.eveyevents.com/production-v2/storefront/calendar
//       ?shop=<domain>&startDate=...&endDate=...&currentDate=...&lang=en
// found by reading the widget's inline FullCalendar `events` fetch call.
//
// The response's top-level `events` array is the *raw* product/listing data
// (unfiltered, and for `date_type: "recurring"` items carries only the
// original series' stale start date). The `schedule` array is what the
// widget actually renders: `currentDate` filters it to occurrences on or
// after that date, and recurring items are expanded into one entry per
// occurrence — but only within the queried `startDate`/`endDate` window
// (confirmed live: a September-only window never expands the "Books and
// Bagels" recurring listing's October occurrence). So, like Seattle Blues
// Dance Collective's monthly-window API, this needs a several-month loop
// over `schedule`, deduped on (source product id, occurrence start).
const LOOKAHEAD_MONTHS = 6;
const DEFAULT_TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION = Duration.ofHours(1);
const FRIENDLY_URL = "https://www.seattlebookclub.com/";

interface EveyScheduleSourceData {
    id?: number;
    location?: string;
    image_url?: string;
    min_price?: number;
    max_price?: number;
    description?: string;
}

interface EveyScheduleItem {
    title?: string;
    start?: string;
    end?: string;
    url?: string;
    source_data?: EveyScheduleSourceData;
}

function parseCost(sourceData: EveyScheduleSourceData | undefined): EventCost | undefined {
    const min = sourceData?.min_price;
    const max = sourceData?.max_price;
    if (min == null) return undefined;
    return max != null && max > min ? { min, max } : { min };
}

export function parseEvent(
    raw: EveyScheduleItem,
    timezone: ZoneId,
): { event: RipperCalendarEvent; durationUncertain: boolean } | RipperError {
    const title = raw.title?.trim();
    const sourceId = raw.source_data?.id;

    if (!title) {
        return { type: "ParseError", reason: "Event missing title", context: JSON.stringify(raw).slice(0, 200) };
    }
    if (sourceId == null) {
        return { type: "ParseError", reason: "Event missing source_data.id", context: title };
    }
    if (!raw.start) {
        return { type: "ParseError", reason: "Event missing start date", context: title };
    }

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.parse(raw.start).withZoneSameInstant(timezone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid start "${raw.start}": ${error}`, context: title };
    }

    // A missing/invalid `end` is signaled to the caller as duration
    // uncertainty (see events12's / ai_house's canonical pattern) rather
    // than silently publishing DEFAULT_DURATION as fact.
    let duration = DEFAULT_DURATION;
    let durationUncertain = true;
    if (raw.end) {
        try {
            const end = ZonedDateTime.parse(raw.end).withZoneSameInstant(timezone);
            const minutes = Duration.between(start, end).toMinutes();
            if (minutes > 0) {
                duration = Duration.ofMinutes(minutes);
                durationUncertain = false;
            }
        } catch {
            // Fall back to DEFAULT_DURATION; durationUncertain stays true.
        }
    }

    const location = raw.source_data?.location?.trim();
    // Same-product listings can recur same-day at different times (e.g. a
    // "5pm and 8pm" showing); the local date alone would collapse both into
    // one id, so the occurrence's own timestamp (already unique per the
    // caller's dedup key) disambiguates them — a deterministic slot suffix
    // derived from source content, per the Stable Event IDs rule.
    const slot = `${String(start.hour()).padStart(2, "0")}${String(start.minute()).padStart(2, "0")}`;

    const event: RipperCalendarEvent = {
        id: `seattle-book-club-${sourceId}-${start.toLocalDate().toString()}-${slot}`,
        ripped: new Date(),
        date: start,
        duration,
        summary: decodeEntities(title),
        description: raw.source_data?.description ? decodeEntities(raw.source_data.description) : undefined,
        location: location ? `${location}, Seattle, WA` : undefined,
        url: raw.url || FRIENDLY_URL,
        imageUrl: raw.source_data?.image_url || undefined,
        cost: parseCost(raw.source_data),
    };

    return { event, durationUncertain };
}

export default class SeattleBookClubRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calConfig = ripper.config.calendars?.[0];
        if (!calConfig) {
            throw new Error("Seattle Book Club ripper requires at least one calendar configuration");
        }
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = calConfig.timezone ?? DEFAULT_TIMEZONE;
        const now = ZonedDateTime.now(timezone);
        const today = now.toLocalDate();

        const uniqueRaw: EveyScheduleItem[] = [];
        const seenRawKeys = new Set<string>();

        for (let i = 0; i < LOOKAHEAD_MONTHS; i++) {
            const monthStart = today.plusMonths(i).withDayOfMonth(1);
            const monthEnd = monthStart.plusMonths(1).minusDays(1);

            const url = new URL(ripper.config.url.href);
            url.searchParams.set("startDate", monthStart.toString());
            url.searchParams.set("endDate", monthEnd.toString());
            url.searchParams.set("currentDate", today.toString());
            url.searchParams.set("lang", "en");

            const res = await fetchFn(url.toString());
            if (!res.ok) {
                // Like Seattle Blues Dance Collective: only the first (current)
                // month must succeed. A later month failing shouldn't fail the
                // whole ripper — overlapping one-time events were likely
                // already captured by an earlier or later month's window.
                if (i === 0) throw new Error(`Seattle Book Club events API returned ${res.status} ${res.statusText}`);
                continue;
            }

            const jsonData = await res.json();
            const scheduleItems: EveyScheduleItem[] = Array.isArray(jsonData?.schedule) ? jsonData.schedule : [];

            for (const raw of scheduleItems) {
                const key = `${raw.source_data?.id ?? raw.title}-${raw.start}`;
                if (seenRawKeys.has(key)) continue;
                seenRawKeys.add(key);
                uniqueRaw.push(raw);
            }
        }

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        for (const raw of uniqueRaw) {
            const result = parseEvent(raw, timezone);
            if ("type" in result) {
                errors.push(result);
                continue;
            }
            const { event, durationUncertain } = result;
            if (event.date.isBefore(now)) continue; // past event — filtered in the caller, not the parse method
            events.push(event);

            if (durationUncertain) {
                const unknownFields: UncertaintyField[] = ["duration"];
                errors.push({
                    type: "Uncertainty",
                    source: "seattle-book-club",
                    reason: `No valid end time listed for the ${event.date.toLocalDate()} occurrence of "${event.summary}"`,
                    unknownFields,
                    event,
                });
            }
        }

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
