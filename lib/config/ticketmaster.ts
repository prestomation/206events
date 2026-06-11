import { ZonedDateTime, Duration, LocalDateTime, LocalDate, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "./schema.js";
import { getFetchForConfig, FetchFn } from "./proxy-fetch.js";
import { CITY } from "./city.js";
import '@js-joda/timezone';

const PAGE_SIZE = 200;
const LOOKAHEAD_MONTHS = 3;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * Shared ripper for venues that use the Ticketmaster Discovery API v2.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with:
 *   - venueId: the Ticketmaster Discovery API venue ID (e.g. "KovZpZAFkvEA")
 *   - venueName: display name used as location fallback
 *   - venueAddress: full address used as location fallback
 *
 * Requires the TICKETMASTER_API_KEY environment variable.
 */
export class TicketmasterRipper implements IRipper {
    private seenEvents = new Set<string>();
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const apiKey = process.env.TICKETMASTER_API_KEY;
        if (!apiKey) {
            return ripper.config.calendars.map(cal => ({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason: "TICKETMASTER_API_KEY environment variable is not set", context: cal.name }],
                parent: ripper.config,
                tags: cal.tags || [],
            }));
        }

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            const venueId = cal.config?.venueId as string | undefined;
            if (!venueId) continue;

            const rawEvents = await this.fetchVenueEvents(apiKey, venueId);
            const parsed = this.parseEvents(rawEvents, cal.timezone, cal.config, ripper.config.name, cal.name);
            calendars[cal.name].events = parsed;
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

    private async fetchVenueEvents(apiKey: string, venueId: string): Promise<any[]> {
        const allEvents: any[] = [];
        let page = 0;

        const startDate = LocalDate.now().toString() + "T00:00:00Z";
        const endDate = LocalDate.now().plusMonths(LOOKAHEAD_MONTHS).toString() + "T23:59:59Z";

        while (true) {
            const url = `https://app.ticketmaster.com/discovery/v2/events.json?venueId=${venueId}&startDateTime=${startDate}&endDateTime=${endDate}&size=${PAGE_SIZE}&page=${page}&apikey=${apiKey}`;

            const res = await this.fetchWithRetry(url);
            if (!res.ok) {
                throw new Error(`Ticketmaster API error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            const events = data._embedded?.events || [];
            allEvents.push(...events);

            const totalPages = data.page?.totalPages || 0;
            page++;
            if (page >= totalPages || page * PAGE_SIZE >= 1000) break;
        }

        return allEvents;
    }

    private async fetchWithRetry(url: string): Promise<Response> {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const res = await this.fetchFn(url);
            if (res.status !== 429 || attempt === MAX_RETRIES) {
                return res;
            }
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error("unreachable");
    }

    public parseEvents(eventsData: any[], timezone: any, config: any, source: string = '', calendarName?: string): RipperEvent[] {
        const events: RipperEvent[] = [];

        for (const event of eventsData) {
            try {
                const eventId = event.id;
                if (!eventId || !event.name) continue;

                if (this.seenEvents.has(eventId)) continue;
                this.seenEvents.add(eventId);

                const status = event.dates?.status?.code;
                if (status === 'cancelled' || status === 'canceled') continue;

                const parseResult = this.parseDateWithUncertainty(event.dates, timezone);
                if (!parseResult) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date for event: ${event.name}`,
                        context: JSON.stringify(event.dates?.start).substring(0, 200)
                    });
                    continue;
                }
                const { date, startTimeUnknown } = parseResult;

                const venue = event._embedded?.venues?.[0];
                let location = config?.venueName || '';
                if (venue?.address?.line1) {
                    location = `${venue.name || config?.venueName}, ${venue.address.line1}, ${venue.city?.name || CITY.city.name}, ${venue.state?.stateCode || CITY.city.state}`;
                } else if (config?.venueAddress) {
                    location = `${config.venueName}, ${config.venueAddress}`;
                }

                const descParts: string[] = [];
                if (event.info) descParts.push(event.info);
                if (event.pleaseNote) descParts.push(event.pleaseNote);
                let cost: EventCost | undefined;
                if (event.priceRanges?.length) {
                    const range = event.priceRanges[0];
                    if (range.min != null && range.max != null) {
                        descParts.push(`Price: $${range.min} - $${range.max}`);
                    }
                    if (range.min != null) {
                        if (range.min === 0 && range.max > 0) {
                            // A $0 minimum alongside a real maximum is junk
                            // data (hidden platinum/resale rows), not a free
                            // ticket — Ticketmaster events are never free.
                            cost = { paid: true };
                        } else {
                            cost = {
                                min: range.min,
                                ...(range.max != null && range.max > range.min ? { max: range.max } : {}),
                            };
                        }
                    }
                }
                if (status === 'postponed') descParts.push('POSTPONED');
                if (status === 'rescheduled') descParts.push('RESCHEDULED');

                const calEvent: RipperCalendarEvent = {
                    id: `tm-${eventId}`,
                    ripped: new Date(),
                    date: date,
                    duration: Duration.ofHours(2),
                    summary: event.name,
                    description: descParts.length > 0 ? descParts.join('\n') : undefined,
                    location: location || undefined,
                    url: event.url || undefined,
                    imageUrl: this.getBestImage(event.images),
                    ...(cost ? { cost } : {}),
                };

                events.push(calEvent);

                // The Ticketmaster Discovery API never returns an end time,
                // so duration is always the 2-hour placeholder above. Flag
                // every event as duration-uncertain. When the start time was
                // also missing (localDate only) we add startTime to the
                // unknown fields too.
                const unknownFields: UncertaintyField[] = startTimeUnknown
                    ? ["startTime", "duration"]
                    : ["duration"];
                const start = event.dates?.start ?? {};
                const fingerprint = simpleHash(
                    `${start.localDate ?? ''}|${start.localTime ?? ''}|${start.dateTime ?? ''}`
                );
                const uncertainty: UncertaintyError = {
                    type: "Uncertainty",
                    reason: startTimeUnknown
                        ? "Ticketmaster listing has date only (no start time); duration also unavailable from API"
                        : "Ticketmaster API does not expose event duration",
                    source,
                    calendar: calendarName,
                    unknownFields,
                    event: calEvent,
                    partialFingerprint: fingerprint,
                };
                events.push(uncertainty);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse Ticketmaster event: ${error}`,
                    context: JSON.stringify(event).substring(0, 200)
                });
            }
        }

        return events;
    }

    private parseDateWithUncertainty(dates: any, timezone: any): { date: ZonedDateTime; startTimeUnknown: boolean } | null {
        if (!dates?.start) return null;

        const start = dates.start;

        if (start.localDate && start.localTime) {
            const dt = LocalDateTime.parse(`${start.localDate}T${start.localTime}`);
            return { date: ZonedDateTime.of(dt, timezone), startTimeUnknown: false };
        }

        if (start.dateTime) {
            try {
                const instant = ZonedDateTime.parse(start.dateTime).toInstant();
                return { date: ZonedDateTime.ofInstant(instant, timezone), startTimeUnknown: false };
            } catch {
                return null;
            }
        }

        if (start.localDate) {
            // Source has only a date — we publish a 19:30 placeholder and
            // flag the start time as uncertain via UncertaintyError.
            const dt = LocalDateTime.parse(`${start.localDate}T19:30:00`);
            return { date: ZonedDateTime.of(dt, timezone), startTimeUnknown: true };
        }

        return null;
    }

    private getBestImage(images: any[]): string | undefined {
        if (!images?.length) return undefined;

        const preferred = images.find((i: any) => i.ratio === '16_9' && i.width >= 640);
        if (preferred) return preferred.url;

        return images[0]?.url;
    }
}
