import { LocalDateTime, ZonedDateTime, Duration } from "@js-joda/core";
import { Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export default class ColumbiacityGalleryRipper extends JSONRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const startDate = LocalDateTime.now().toLocalDate().toString();
        const allEvents: RipperEvent[] = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            const params = new URLSearchParams({
                start_date: startDate,
                per_page: "50",
                page: String(page),
            });
            const res = await fetchFn(`${ripper.config.url}?${params}`);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

            const jsonData = await res.json();
            totalPages = Math.max(1, parseInt(jsonData.total_pages) || 1);

            const cal = ripper.config.calendars[0];
            const pageEvents = await this.parseEvents(
                jsonData,
                ZonedDateTime.of(LocalDateTime.now(), cal.timezone),
                cal.config,
            );
            allEvents.push(...pageEvents);
            page++;
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

    protected async parseEvents(jsonData: any, date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        if (!jsonData.events || !Array.isArray(jsonData.events)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing events array",
                context: JSON.stringify(jsonData).substring(0, 100) + "...",
            }];
        }

        const zone = date.zone();
        const events: RipperEvent[] = [];

        for (const event of jsonData.events) {
            try {
                const startDetails = event.start_date_details;
                const endDetails = event.end_date_details;
                if (!startDetails || !endDetails) {
                    events.push({
                        type: "ParseError",
                        reason: "Missing date details",
                        context: JSON.stringify(event).substring(0, 100) + "...",
                    });
                    continue;
                }
                const startLocal = LocalDateTime.of(
                    parseInt(startDetails.year),
                    parseInt(startDetails.month),
                    parseInt(startDetails.day),
                    parseInt(startDetails.hour),
                    parseInt(startDetails.minutes),
                    parseInt(startDetails.seconds),
                );
                const eventDate = startLocal.atZone(zone);

                const endLocal = LocalDateTime.of(
                    parseInt(endDetails.year),
                    parseInt(endDetails.month),
                    parseInt(endDetails.day),
                    parseInt(endDetails.hour),
                    parseInt(endDetails.minutes),
                    parseInt(endDetails.seconds),
                );
                const durationSeconds =
                    endLocal.atZone(zone).toEpochSecond() -
                    startLocal.atZone(zone).toEpochSecond();
                const duration = Duration.ofSeconds(Math.max(0, durationSeconds));

                const description = event.description ? stripHtml(event.description) : undefined;
                const imageUrl: string | undefined = event.image?.url || undefined;

                events.push({
                    id: `columbia-city-gallery-${event.id}`,
                    ripped: new Date(),
                    date: eventDate,
                    duration,
                    summary: event.title,
                    description,
                    location: "Columbia City Gallery, 4864 Rainier Ave S, Seattle, WA 98118",
                    url: event.url,
                    imageUrl: imageUrl,
                });
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: JSON.stringify(event).substring(0, 100) + "...",
                });
            }
        }
        return events;
    }
}

function stripHtml(html: string): string {
    return html.replace(/<\/?[^>]+(>|$)/g, "").trim();
}
