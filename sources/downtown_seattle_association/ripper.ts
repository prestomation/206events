import { LocalDateTime, ZonedDateTime, Duration, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export default class DowntownSeattleRipper extends JSONRipper {
    // Override rip() to fetch per-calendar with server-side venue filtering and pagination.
    // The base class fetches a single URL for all calendars and relies on client-side
    // filtering — but the Tribe Events API paginates, so events not in the first page
    // (e.g. Pioneer Park) were silently dropped.
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const startDate = LocalDateTime.now().toLocalDate().toString();
        const results: RipperCalendar[] = [];

        for (const cal of ripper.config.calendars) {
            const allEvents: RipperEvent[] = [];
            const venueId = (cal.config as any)?.venue_id;
            let page = 1;
            let totalPages = 1;

            while (page <= totalPages) {
                const params = new URLSearchParams({
                    start_date: startDate,
                    per_page: "50",
                    page: String(page),
                    ...(venueId ? { venue: String(venueId) } : {}),
                });
                const url = `${ripper.config.url}?${params}`;
                const res = await fetchFn(url);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

                const jsonData = await res.json();
                totalPages = jsonData.total_pages ?? 1;

                const pageEvents = await this.parseEvents(
                    jsonData,
                    ZonedDateTime.of(LocalDateTime.now(), cal.timezone),
                    cal.config,
                );
                allEvents.push(...pageEvents);
                page++;
            }

            results.push({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: allEvents.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
                errors: allEvents.filter(e => "type" in e).map(e => e as RipperError),
                parent: ripper.config,
                tags: cal.tags || [],
            });
        }

        return results;
    }

    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        if (!jsonData.events || !Array.isArray(jsonData.events)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing events array",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }

        // Client-side venue filter — applied when the response may contain mixed venues
        // (e.g. direct parseEvents calls in tests). In production, rip() pre-filters
        // via ?venue= query parameter so this is normally a no-op.
        let rawEvents = jsonData.events;
        if (config?.venue_id) {
            const targetId = parseInt(config.venue_id);
            rawEvents = rawEvents.filter((event: any) => {
                const venue = this.getVenue(event);
                return venue && venue.id === targetId;
            });
        }

        const events: RipperEvent[] = [];
        for (const event of rawEvents) {
            try {
                const startDetails = event.start_date_details;
                const eventZone = event.timezone || date.zone().toString();

                const eventLocalDateTime = LocalDateTime.of(
                    parseInt(startDetails.year),
                    parseInt(startDetails.month),
                    parseInt(startDetails.day),
                    parseInt(startDetails.hour),
                    parseInt(startDetails.minutes),
                    parseInt(startDetails.seconds)
                );
                const eventDate = eventLocalDateTime.atZone(ZoneId.of(eventZone));

                const endDetails = event.end_date_details;
                const endLocalDateTime = LocalDateTime.of(
                    parseInt(endDetails.year),
                    parseInt(endDetails.month),
                    parseInt(endDetails.day),
                    parseInt(endDetails.hour),
                    parseInt(endDetails.minutes),
                    parseInt(endDetails.seconds)
                );
                const durationSeconds =
                    endLocalDateTime.atZone(ZoneId.of(eventZone)).toEpochSecond() -
                    eventLocalDateTime.atZone(ZoneId.of(eventZone)).toEpochSecond();
                const duration = Duration.ofSeconds(durationSeconds);

                const venueObj = this.getVenue(event);
                const location = venueObj
                    ? `${venueObj.venue}, ${venueObj.address}, ${venueObj.city}, ${venueObj.stateprovince} ${venueObj.zip}`
                    : undefined;

                let description = event.description ? this.stripHtml(event.description) : undefined;
                let imageUrl: string | undefined;
                if (event.image?.url) {
                    imageUrl = event.image.url.startsWith("http")
                        ? event.image.url
                        : `https://downtownseattle.org${event.image.url}`;
                    description = description ? `${description}\n\nEvent image: ${imageUrl}` : `Event image: ${imageUrl}`;
                }

                events.push({
                    id: event.id.toString(),
                    ripped: new Date(),
                    date: eventDate,
                    duration,
                    summary: event.title,
                    description,
                    location,
                    url: event.url,
                    imageUrl: imageUrl,
                });
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: JSON.stringify(event).substring(0, 100) + "..."
                });
            }
        }
        return events;
    }

    private getVenue(event: any): any | null {
        if (!event.venue) return null;
        if (Array.isArray(event.venue)) return event.venue[0] ?? null;
        return event.venue;
    }

    private stripHtml(html: string): string {
        return html.replace(/<\/?[^>]+(>|$)/g, "");
    }
}
