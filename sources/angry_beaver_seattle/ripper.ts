import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, LocalDate, LocalTime, ZonedDateTime } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent, UncertaintyField } from "../../lib/config/schema.js";

// The Angry Beaver (Greenwood) runs its event promos through SpotHopper, a
// restaurant/bar marketing platform. Its public JSON API
// (spothopperapp.com/api/spots/<spotId>/events) requires no auth and returns
// structured events with a date + local wall-clock start time + duration.

interface SpotHopperEvent {
    id: number;
    name: string;
    text?: string;
    event_date: string; // e.g. "2026-09-18T00:00:00.000+00:00" - the date portion is the intended local date
    start_time?: string; // "HH:mm" local wall-clock time, absent when all_day
    duration_minutes?: number;
    all_day: boolean;
    links?: { images?: { url: string }[] };
}

interface SpotHopperResponse {
    events: SpotHopperEvent[];
}

const VENUE_LOCATION = "The Angry Beaver, 8412 Greenwood Ave N, Seattle, WA 98103";
const VENUE_URL = "https://theangrybeaverseattle.com/events";

export default class AngryBeaverSeattleRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const data = jsonData as SpotHopperResponse;
        if (!data.events || !Array.isArray(data.events)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing events array",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }

        const zone = date.zone();
        const events: RipperEvent[] = [];

        for (const event of data.events) {
            const isoDate = event.event_date?.substring(0, 10);
            if (!isoDate) {
                events.push({
                    type: "ParseError",
                    reason: `Event ${event.id} ("${event.name}") is missing event_date`,
                    context: String(event.id)
                });
                continue;
            }

            let localDate: LocalDate;
            try {
                localDate = LocalDate.parse(isoDate);
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Could not parse event_date "${event.event_date}" for event ${event.id}: ${error}`,
                    context: String(event.id)
                });
                continue;
            }

            // SpotHopper always sends start_time on every live event we've
            // seen, but the field is optional in its schema. Rather than
            // silently publishing a guessed midnight time as fact, flag it
            // via the uncertainty system (see AGENTS.md "Event Uncertainty
            // System") so the resolver can confirm the real time.
            const timeUnknown = !event.all_day && !event.start_time;
            const startTime = event.all_day || timeUnknown
                ? LocalTime.MIDNIGHT
                : LocalTime.parse(event.start_time!);
            const duration = event.all_day
                ? Duration.ofDays(1)
                : Duration.ofMinutes(event.duration_minutes && event.duration_minutes > 0 ? event.duration_minutes : 60);

            const calendarEvent: RipperCalendarEvent = {
                id: `angry-beaver-seattle-${event.id}`,
                ripped: new Date(),
                date: ZonedDateTime.of(localDate, startTime, zone),
                duration,
                summary: event.name,
                description: event.text,
                location: VENUE_LOCATION,
                url: VENUE_URL,
                imageUrl: event.links?.images?.[0]?.url,
            };

            events.push(calendarEvent);

            if (timeUnknown) {
                const unknownFields: UncertaintyField[] = ["startTime"];
                events.push({
                    type: "Uncertainty",
                    reason: `SpotHopper event ${event.id} ("${event.name}") did not include a start_time`,
                    source: "angry-beaver-seattle",
                    unknownFields,
                    event: calendarEvent,
                });
            }
        }

        return events;
    }
}
