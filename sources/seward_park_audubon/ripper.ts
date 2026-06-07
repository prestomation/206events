import { ZonedDateTime, ZoneId, Instant, Duration } from "@js-joda/core";
import { Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export default class SewardParkAudubonRipper extends JSONRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const allEvents: RipperEvent[] = [];
        let nextUrl: string | null = `${ripper.config.url}?per_page=50&timeslot_start=gte_now`;
        let pages = 0;
        const MAX_PAGES = 20;

        while (nextUrl && pages < MAX_PAGES) {
            pages++;
            const res = await fetchFn(nextUrl);
            if (!res.ok) throw new Error(`${res.url} returned HTTP ${res.status}`);
            const json = await res.json();
            const page = await this.parseEvents(json, null as any, null);
            allEvents.push(...page);
            nextUrl = json.next ?? null;
        }

        const cal = ripper.config.calendars[0];
        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: allEvents.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: cal.tags || [],
        }];
    }

    protected async parseEvents(json: any, _date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        if (!Array.isArray(json?.data)) {
            return [{
                type: "ParseError",
                reason: "Missing data array in Mobilize response",
                context: JSON.stringify(json).substring(0, 200),
            }];
        }

        const events: RipperEvent[] = [];

        for (const event of json.data) {
            if (!Array.isArray(event.timeslots) || event.timeslots.length === 0) {
                events.push({
                    type: "ParseError",
                    reason: "Event has no timeslots",
                    context: String(event.id),
                });
                continue;
            }

            const location = buildLocation(event.location);
            const imageUrl: string | undefined = event.featured_image_url || undefined;
            const description: string | undefined = event.description || undefined;
            const timezone = event.timezone ?? "America/Los_Angeles";
            const zone = ZoneId.of(timezone);

            for (const slot of event.timeslots) {
                try {
                    const start = ZonedDateTime.ofInstant(
                        Instant.ofEpochSecond(slot.start_date),
                        zone,
                    );
                    const end = ZonedDateTime.ofInstant(
                        Instant.ofEpochSecond(slot.end_date),
                        zone,
                    );
                    const duration = Duration.ofSeconds(
                        end.toEpochSecond() - start.toEpochSecond(),
                    );

                    events.push({
                        id: `seward-park-audubon-${event.id}-${slot.id}`,
                        ripped: new Date(),
                        date: start,
                        duration,
                        summary: event.title,
                        description,
                        location,
                        url: event.browser_url,
                        imageUrl,
                    });
                } catch (err) {
                    events.push({
                        type: "ParseError",
                        reason: `Failed to parse timeslot: ${err}`,
                        context: `event=${event.id} slot=${slot.id}`,
                    });
                }
            }
        }

        return events;
    }
}

function buildLocation(loc: any): string {
    if (!loc) return "Seward Park Audubon Center, 5902 Lake Washington Blvd S, Seattle, WA 98118";
    const parts: string[] = [];
    if (loc.venue) parts.push(loc.venue);
    const lines = (loc.address_lines ?? []).filter((l: string) => l?.trim());
    parts.push(...lines);
    if (loc.locality) {
        const region = loc.region ? `, ${loc.region}` : "";
        const zip = loc.postal_code ? ` ${loc.postal_code}` : "";
        parts.push(`${loc.locality}${region}${zip}`);
    }
    return parts.join(", ");
}
