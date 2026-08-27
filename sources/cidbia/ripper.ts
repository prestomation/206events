import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// The CIDBIA "Local Events" page (https://www.seattlechinatownid.com/local-events)
// no longer server-renders any event markup — it dropped a WordPress plugin's
// day-by-day HTML in favor of a client-side Proxi.co widget:
//   <script src="https://app.proxi.co/embed/e/<orgId>.js" defer></script>
//   <proxi-calendar data-org-id="<orgId>" ...></proxi-calendar>
// The widget itself calls a public, unauthenticated JSON API
// (`GET {apiBase}/api/public/events/<orgId>?from=<iso>&to=<iso>`) to fetch
// its data — found by reading the embed bundle's `fetchEvents()`/
// `resolveApiBase()` methods. `apiBase` resolves to the origin the embed
// script itself was loaded from (`https://app.proxi.co`), not the CIDBIA
// site, so that's what we call directly instead of scraping the widget.
// `ripper.config.url` (set in ripper.yaml) is the full API endpoint, e.g.
// https://app.proxi.co/api/public/events/66a82b2c8cb3161b7d22dc0d — org id
// included. `cover_image` paths in the response are relative to the API's
// own origin (confirmed by the embed bundle's `resolveImageUrl()`), which
// is the same origin regardless of which org's calendar is requested, so
// it's safe to hardcode here rather than thread it through from `rip()`.
const API_ORIGIN = "https://app.proxi.co";
// The API has no per-event detail page/permalink of its own — the widget
// only ever opens events in an in-page modal — so every event links back to
// the CIDBIA events page itself.
const FRIENDLY_EVENT_URL = "https://www.seattlechinatownid.com/local-events";
const DEFAULT_TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION = Duration.ofHours(2);
const LOOKAHEAD_MONTHS = 6;

interface ProxiVenue {
    id?: { $oid?: string };
    name?: string;
    primary_address?: { search?: string };
}

interface ProxiOccurrence {
    event?: ProxiEvent;
    occurrence_start?: string;
    occurrence_end?: string;
}

interface ProxiEvent {
    id?: { $oid?: string };
    name?: string;
    summary?: string;
    description?: string;
    cover_image?: string;
    start_time?: string;
    end_time?: string;
    venue_id?: { $oid?: string };
    venue_override_address?: { search?: string };
    tags?: string[];
    status?: string;
}

export default class CIDBIARipper extends JSONRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        if (!ripper.config.calendars?.length) {
            throw new Error('No calendars configured');
        }
        const calConfig = ripper.config.calendars[0];
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = calConfig.timezone ?? DEFAULT_TIMEZONE;

        // Window from the start of "today" (in the calendar's own timezone, not
        // the build runner's system clock) through a few months out. The Proxi
        // API takes an explicit [from, to) range rather than paging, and
        // returns every occurrence in range in one response (no truncation
        // observed testing a two-year window against the live org).
        const from = ZonedDateTime.now(timezone).toLocalDate().atStartOfDay(timezone);
        const to = from.plusMonths(LOOKAHEAD_MONTHS);
        const params = new URLSearchParams({
            from: from.toInstant().toString(),
            to: to.toInstant().toString(),
        });
        const url = `${ripper.config.url.href}?${params.toString()}`;

        const res = await fetchFn(url);
        if (!res.ok) {
            throw new Error(`CIDBIA (Proxi) events API returned ${res.status} ${res.statusText}`);
        }
        const jsonData = await res.json();

        const results = await this.parseEvents(jsonData, ZonedDateTime.now(timezone), calConfig.config ?? {});

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: results.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public (required by the JSONRipper abstract signature, and used directly
    // by tests). Only `date.zone()` is used, to render event times in the
    // calendar's configured timezone; `config` is unused because this source
    // has a single calendar with no per-calendar filtering, unlike
    // JSONRipper's default day-by-day template model (which doesn't fit a
    // single ranged API call, hence the overridden `rip()` above).
    public async parseEvents(jsonData: any, date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        if (!jsonData || !Array.isArray(jsonData.occurrences)) {
            return [{
                type: 'ParseError',
                reason: 'Invalid JSON structure: missing "occurrences" array — the Proxi widget API may have changed',
                context: JSON.stringify(jsonData).substring(0, 200),
            }];
        }

        const venuesById = new Map<string, ProxiVenue>();
        for (const v of (jsonData.venues ?? []) as ProxiVenue[]) {
            const oid = v?.id?.$oid;
            if (oid) venuesById.set(oid, v);
        }

        const results: RipperEvent[] = [];
        for (const occurrence of jsonData.occurrences as ProxiOccurrence[]) {
            const event = occurrence?.event;
            if (!event) {
                results.push({
                    type: 'ParseError',
                    reason: 'Occurrence missing "event" object',
                    context: JSON.stringify(occurrence).substring(0, 200),
                });
                continue;
            }
            // The public API should only ever return published events, but
            // guard defensively rather than surface a draft if that changes.
            // An intentional content filter, not a parse failure — skipped
            // before parsing, per the "parse methods never drop silently" rule.
            if (event.status && event.status !== 'published') continue;

            results.push(this.parseOccurrence(occurrence, event, venuesById, date.zone()));
        }
        return results;
    }

    private parseOccurrence(occurrence: ProxiOccurrence, event: ProxiEvent, venuesById: Map<string, ProxiVenue>, zone: ZoneId): RipperCalendarEvent | RipperError {
        const title = event.name?.trim();
        if (!title) {
            return { type: 'ParseError', reason: 'Event missing name', context: JSON.stringify(event).substring(0, 200) };
        }

        const startIso = occurrence.occurrence_start ?? event.start_time;
        if (!startIso) {
            return { type: 'ParseError', reason: 'Event missing start time', context: title };
        }

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.parse(startIso).withZoneSameInstant(zone);
        } catch (e) {
            return { type: 'ParseError', reason: `Could not parse start time "${startIso}": ${e}`, context: title };
        }

        let duration = DEFAULT_DURATION;
        const endIso = occurrence.occurrence_end ?? event.end_time;
        if (endIso) {
            try {
                const seconds = ZonedDateTime.parse(endIso).toEpochSecond() - date.toEpochSecond();
                if (seconds > 0) duration = Duration.ofSeconds(seconds);
            } catch {
                // Keep the default duration; end time is best-effort.
            }
        }

        const eventOid = event.id?.$oid;
        const id = eventOid
            ? `cidbia-${eventOid}-${this.compactTimestamp(date)}`
            : `cidbia-${this.slugify(title)}-${this.compactTimestamp(date)}`;

        const tags = Array.isArray(event.tags) ? event.tags : [];
        // The rubric's minimum is the cheapest general-admission price; the
        // source only ever tells us "Free" as a fact (never a numeric price),
        // so that's the only case worth encoding here. Anything else is left
        // unknown for the cost-resolver queue rather than guessed.
        const cost = tags.includes('Free') ? { min: 0 } : undefined;

        return {
            id,
            ripped: new Date(),
            date,
            duration,
            summary: title,
            description: event.summary || event.description || undefined,
            location: this.resolveLocation(event, venuesById),
            url: FRIENDLY_EVENT_URL,
            imageUrl: this.resolveImageUrl(event.cover_image),
            cost,
        };
    }

    private resolveLocation(event: ProxiEvent, venuesById: Map<string, ProxiVenue>): string | undefined {
        const venueOid = event.venue_id?.$oid;
        if (venueOid) {
            const venue = venuesById.get(venueOid);
            if (venue) return venue.primary_address?.search ?? venue.name;
        }
        return event.venue_override_address?.search;
    }

    private resolveImageUrl(coverImage: string | undefined): string | undefined {
        if (!coverImage) return undefined;
        if (/^(https?:|data:)/i.test(coverImage)) return coverImage;
        return `${API_ORIGIN}${coverImage.startsWith('/') ? '' : '/'}${coverImage}`;
    }

    private compactTimestamp(date: ZonedDateTime): string {
        return date.withZoneSameInstant(ZoneId.of('UTC')).toString().replace(/[^0-9]/g, '');
    }

    private slugify(text: string): string {
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
    }
}
