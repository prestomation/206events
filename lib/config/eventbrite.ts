import { Duration, LocalDateTime, ZoneId, ChronoUnit } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError } from "./schema.js";
import { getFetchForConfig, FetchFn } from "./proxy-fetch.js";
import '@js-joda/timezone';

const MAX_PAGES = 100;

// Deterministic hash for partialFingerprint. We only need stability, not
// crypto strength — the value invalidates cache entries when source content
// changes (e.g. upstream finally publishes an end time).
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * Shared ripper for organizers that use the Eventbrite ticketing platform.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with:
 *   - organizerId: the Eventbrite organizer ID (e.g. "30672130426")
 *   - defaultLocation: fallback address when no venue is provided
 *   - defaultDurationHours: (optional) fallback duration in hours when no end time is provided (default: 2)
 */
export class EventbriteRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const token = process.env.EVENTBRITE_TOKEN;
        if (!token || token.length < 20) {
            const reason = !token
                ? "EVENTBRITE_TOKEN environment variable is not set"
                : "EVENTBRITE_TOKEN appears to be invalid (too short)";
            return ripper.config.calendars.map(cal => ({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason, context: cal.name }],
                parent: ripper.config,
                tags: cal.tags || [],
            }));
        }

        const fetchFn = getFetchForConfig(ripper.config);
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const organizerId = cal.config?.organizerId as string | undefined;
            const defaultLocation = cal.config?.defaultLocation as string | undefined ?? '';
            const defaultDurationHours = (cal.config?.defaultDurationHours as number | undefined) ?? 2;

            if (!organizerId) {
                calendars[cal.name].events = [{
                    type: "ParseError",
                    reason: "Missing required config field: organizerId",
                    context: cal.name
                }];
                continue;
            }

            try {
                const rawEvents = await this.fetchAllEvents(organizerId, token, fetchFn);
                calendars[cal.name].events = this.parseEvents(rawEvents, cal.timezone, defaultLocation, defaultDurationHours, ripper.config.name, cal.name);
            } catch (error) {
                calendars[cal.name].events = [{
                    type: "ParseError",
                    reason: `Failed to fetch Eventbrite events for organizer ${organizerId}: ${error}`,
                    context: cal.name
                }];
            }
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags
        }));
    }

    public async fetchAllEvents(organizerId: string, token: string, fetchFn: FetchFn = fetch): Promise<any[]> {
        const events: any[] = [];
        let page = 1;

        while (page <= MAX_PAGES) {
            const url = `https://www.eventbriteapi.com/v3/organizers/${organizerId}/events/?status=live&expand=venue,ticket_availability&page=${page}`;

            const res = await fetchFn(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                throw new Error(`Eventbrite API error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();

            if (!data.events || !Array.isArray(data.events)) {
                break;
            }

            events.push(...data.events);

            if (!data.pagination?.has_more_items) {
                break;
            }

            page++;
        }

        return events;
    }

    public parseEvents(events: any[], timezone: ZoneId, defaultLocation: string, defaultDurationHours: number = 2, source: string = '', calendarName?: string): RipperEvent[] {
        const results: RipperEvent[] = [];
        const seenIds = new Set<string>();

        for (const event of events) {
            try {
                const id = event.id?.toString() ?? 'unknown';
                if (seenIds.has(id)) continue;
                seenIds.add(id);

                const name = event.name?.text;
                if (!name) {
                    results.push({
                        type: "ParseError",
                        reason: "Event has no name",
                        context: id
                    });
                    continue;
                }

                const startLocal = event.start?.local;
                if (!startLocal) {
                    results.push({
                        type: "ParseError",
                        reason: `No start time for event "${name}"`,
                        context: id
                    });
                    continue;
                }

                // Parse start datetime: "2026-03-10T19:00:00"
                const startDt = LocalDateTime.parse(startLocal);
                const eventZoneStr = event.start?.timezone;
                const eventZone = eventZoneStr ? ZoneId.of(eventZoneStr) : timezone;
                const startDate = startDt.atZone(eventZone);

                // Calculate duration from end time, fall back to defaultDurationHours.
                // When the source omits the end time we publish a placeholder
                // duration but pair it with an UncertaintyError so the resolver
                // can fill in the real duration on a later build.
                let duration = Duration.ofHours(defaultDurationHours);
                let durationUncertain = false;
                const endLocal = event.end?.local;
                if (endLocal) {
                    const endDt = LocalDateTime.parse(endLocal);
                    const endDate = endDt.atZone(eventZone);
                    const seconds = startDate.until(endDate, ChronoUnit.SECONDS);
                    if (seconds > 0) {
                        duration = Duration.ofSeconds(seconds);
                    } else {
                        durationUncertain = true;
                    }
                } else {
                    durationUncertain = true;
                }

                // Format location from venue, fall back to defaultLocation
                let location = defaultLocation;
                if (event.venue) {
                    const v = event.venue;
                    const parts = [
                        v.name,
                        v.address?.address_1,
                        v.address?.city,
                        v.address?.region,
                        v.address?.postal_code
                    ].filter(Boolean);
                    if (parts.length > 0) {
                        location = parts.join(', ');
                    }
                }

                // Eventbrite serves a per-event image as `logo`. Prefer the
                // full-resolution `original.url`; fall back to the cropped
                // thumbnail `url`. Either is a stable public evbuc CDN URL.
                const imageUrl = event.logo?.original?.url ?? event.logo?.url ?? undefined;

                // `is_free` is always present on the events API. For paid
                // events the ticket_availability expansion (when the API
                // returns it) gives the face-value price range; without it
                // we still know the event isn't free.
                let cost: EventCost | undefined;
                if (event.is_free === true) {
                    cost = { min: 0 };
                } else if (event.is_free === false) {
                    const minRaw = event.ticket_availability?.minimum_ticket_price?.major_value;
                    const maxRaw = event.ticket_availability?.maximum_ticket_price?.major_value;
                    const min = minRaw != null ? Number(minRaw) : NaN;
                    const max = maxRaw != null ? Number(maxRaw) : NaN;
                    if (Number.isFinite(min) && min >= 0) {
                        cost = { min, ...(Number.isFinite(max) && max > min ? { max } : {}) };
                    } else {
                        cost = { paid: true };
                    }
                }

                const calEvent: RipperCalendarEvent = {
                    id,
                    ripped: new Date(),
                    date: startDate,
                    duration,
                    summary: name,
                    description: event.description?.text || undefined,
                    location,
                    url: event.url,
                    imageUrl,
                    ...(cost ? { cost } : {}),
                };

                results.push(calEvent);

                if (durationUncertain) {
                    const uncertainty: UncertaintyError = {
                        type: "Uncertainty",
                        reason: "Eventbrite listing did not include an end time",
                        source,
                        calendar: calendarName,
                        unknownFields: ["duration"],
                        event: calEvent,
                        partialFingerprint: simpleHash(`${startLocal}|${endLocal ?? ''}`),
                    };
                    results.push(uncertainty);
                }
            } catch (error) {
                results.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: event.id?.toString() ?? 'unknown'
                });
            }
        }

        return results;
    }
}
