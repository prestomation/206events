import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, ZonedDateTime, Instant, ZoneId } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

// Pacific Place uses MallMaverick (the Taubman/property-manager platform).
// The events endpoint returns a flat JSON array — no pagination, no date
// parameters — so a single fetch yields the full upcoming-events list.
// Events with no end date (Snail Mail Sunday, Daily Happy Hours) are
// "ongoing forever" recurring entries with no concrete next occurrence
// and are filtered out.
export default class PacificPlaceRipper extends JSONRipper {
    private seenIds = new Set<string>();

    public async parseEvents(jsonData: any, date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        if (!Array.isArray(jsonData)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: expected top-level array of events",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }

        const zone = date.zone();

        for (const event of jsonData) {
            const eventId = event?.id?.toString();
            if (!eventId || this.seenIds.has(eventId)) continue;
            this.seenIds.add(eventId);

            if (event.status && event.status !== "active") continue;

            // Skip "ongoing forever" listings — they have no concrete end and
            // a start_date far in the past. The ICS calendar is for dated
            // events; these are mall-store happy hours / weekly specials.
            if (!event.end_date || event.no_end_date === true) continue;

            if (!event.start_date) {
                events.push({
                    type: "ParseError",
                    reason: `Event ${eventId} missing start_date`,
                    context: JSON.stringify(event).substring(0, 200) + "..."
                });
                continue;
            }

            try {
                const startInstant = Instant.parse(event.start_date);
                const endInstant = Instant.parse(event.end_date);

                const startDate = startInstant.atZone(ZoneId.of(zone.toString()));
                const durationSeconds = endInstant.epochSecond() - startInstant.epochSecond();

                if (durationSeconds <= 0) {
                    events.push({
                        type: "ParseError",
                        reason: `Event ${eventId} has non-positive duration (end before start)`,
                        context: `start=${event.start_date} end=${event.end_date}`
                    });
                    continue;
                }

                const duration = Duration.ofSeconds(durationSeconds);

                const description = this.buildDescription(event);
                const eventUrl = this.cleanUrl(event.url) || `https://pacificplaceseattle.com${event.path ?? ""}`;
                const location = this.buildLocation(event);

                const calendarEvent: RipperCalendarEvent = {
                    id: eventId,
                    ripped: new Date(),
                    date: startDate,
                    duration,
                    summary: event.name?.trim() || "Untitled event",
                    description,
                    location,
                    url: eventUrl,
                    imageUrl: event.image_url || undefined
                };

                events.push(calendarEvent);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event ${eventId}: ${error}`,
                    context: JSON.stringify(event).substring(0, 200) + "..."
                });
            }
        }

        return events;
    }

    private buildDescription(event: any): string | undefined {
        const parts: string[] = [];

        const plain = event.plain_text_description?.trim();
        if (plain) parts.push(plain);

        const eventable = event.eventable;
        if (eventable?.type === "Store" && eventable?.name) {
            parts.push(`At ${eventable.name.trim()}`);
        }

        return parts.length > 0 ? parts.join("\n\n") : undefined;
    }

    private buildLocation(event: any): string {
        const base = "Pacific Place, 600 Pine St, Seattle, WA 98101";
        const eventable = event.eventable;
        if (eventable?.type === "Store" && eventable?.name) {
            return `${eventable.name.trim()} @ ${base}`;
        }
        return base;
    }

    // MallMaverick URLs sometimes have a double slash between origin and path.
    private cleanUrl(url: string | undefined): string | undefined {
        if (!url) return undefined;
        return url.replace(/([^:])\/\//g, "$1/");
    }
}
