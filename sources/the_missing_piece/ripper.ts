import { LocalDateTime, ZonedDateTime, Duration, ZoneId } from "@js-joda/core";
import { decode } from "html-entities";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// The Missing Piece runs WordPress with The Events Calendar (Tribe Events)
// plugin, exposing a paginated JSON REST API at
// /wp-json/tribe/events/v1/events. Single fixed venue, so unlike
// downtown_seattle_association there's no venue filtering — just page
// through until total_pages is exhausted.
export default class TheMissingPieceRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];
        const allEvents: RipperEvent[] = [];

        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
            const params = new URLSearchParams({ per_page: "50", page: String(page) });
            const url = `${ripper.config.url}?${params}`;
            const res = await fetchFn(url);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

            const jsonData = await res.json();
            totalPages = jsonData.total_pages ?? 1;

            allEvents.push(...this.parseEvents(jsonData, ZonedDateTime.of(LocalDateTime.now(), cal.timezone)));
            page++;
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: allEvents.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: cal.tags || [],
        }];
    }

    public parseEvents(jsonData: any, date: ZonedDateTime): RipperEvent[] {
        if (!jsonData.events || !Array.isArray(jsonData.events)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing events array",
                context: JSON.stringify(jsonData).substring(0, 100) + "...",
            }];
        }

        const events: RipperEvent[] = [];
        for (const event of jsonData.events) {
            events.push(this.parseEvent(event, date));
        }
        return events;
    }

    private parseEvent(event: any, date: ZonedDateTime): RipperCalendarEvent | RipperError {
        try {
            const eventZone = event.timezone || date.zone().toString();
            const start = event.start_date_details;
            const eventDate = LocalDateTime.of(
                parseInt(start.year),
                parseInt(start.month),
                parseInt(start.day),
                parseInt(start.hour),
                parseInt(start.minutes),
                parseInt(start.seconds),
            ).atZone(ZoneId.of(eventZone));

            const end = event.end_date_details;
            const endDate = LocalDateTime.of(
                parseInt(end.year),
                parseInt(end.month),
                parseInt(end.day),
                parseInt(end.hour),
                parseInt(end.minutes),
                parseInt(end.seconds),
            ).atZone(ZoneId.of(eventZone));
            const duration = Duration.ofSeconds(endDate.toEpochSecond() - eventDate.toEpochSecond());

            const venue = event.venue;
            const location = venue
                ? `${venue.venue}, ${venue.address}, ${venue.city}, ${venue.stateprovince} ${venue.zip}`
                : undefined;

            return {
                id: event.id.toString(),
                ripped: new Date(),
                date: eventDate,
                duration,
                summary: decode(this.stripHtml(event.title)),
                description: event.description ? decode(this.stripHtml(event.description)) : undefined,
                location,
                url: event.url,
                imageUrl: event.image ? event.image.url : undefined,
                cost: this.parseCost(event.cost_details),
            };
        } catch (error) {
            return {
                type: "ParseError",
                reason: `Failed to parse event: ${error}`,
                context: JSON.stringify(event).substring(0, 100) + "...",
            };
        }
    }

    private parseCost(costDetails: any): EventCost | undefined {
        const values: string[] = costDetails?.values ?? [];
        if (values.length === 0) return undefined;
        if (values.length === 1) return { min: parseFloat(values[0]) };
        return { min: parseFloat(values[0]), max: parseFloat(values[1]) };
    }

    private stripHtml(html: string): string {
        return html.replace(/<\/?[^>]+(>|$)/g, "").trim();
    }
}
