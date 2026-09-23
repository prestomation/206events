import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, Instant, ZonedDateTime } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

// Georgetown Morgue (Seattle Haunts) sells tickets through fearticket.com,
// which runs on the hytix.com platform. The ticketing SPA reads open nights
// from the public, unauthenticated endpoint
//   https://api2.hytix.com/v2/public/events/<eventId>/dates
// which returns `data` keyed by local date (YYYY-MM-DD). Each open night holds
// a list of 15-minute entry time slots (ticketType 1) with UTC start/end
// instants. Closed nights appear as a single placeholder entry
// (ticketType 2) spanning the whole season, which we skip.
//
// We emit one event per open night, from the first entry slot's start to
// the last entry slot's end.

interface HytixSlot {
    ticketType: number;
    startDate: string; // ISO UTC instant
    endDate: string;   // ISO UTC instant
    id: number;
    label?: string;
}

interface HytixDatesResponse {
    data?: Record<string, HytixSlot[]>;
}

const OPEN_SLOT_TYPE = 1;
const VENUE_LOCATION = "Georgetown Morgue, 5000 E Marginal Way S, Seattle, WA 98134";
const VENUE_URL = "https://seattlehaunts.com/schedule-and-events/";
const TICKETS_URL = "https://seattlehaunts.fearticket.com/";

export default class GeorgetownMorgueRipper extends JSONRipper {
    public async parseEvents(jsonData: any, date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        const data = (jsonData as HytixDatesResponse)?.data;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return [{
                type: "ParseError",
                reason: "Invalid hytix dates response: missing data object",
                context: JSON.stringify(jsonData).substring(0, 100),
            }];
        }

        const zone = date.zone();
        const events: RipperEvent[] = [];

        for (const [day, slots] of Object.entries(data)) {
            if (!Array.isArray(slots)) {
                events.push({
                    type: "ParseError",
                    reason: `Slots for ${day} are not an array`,
                    context: day,
                });
                continue;
            }
            const open = slots.filter(s => s && s.ticketType === OPEN_SLOT_TYPE);
            // Closed nights carry only the season-long placeholder slot.
            if (open.length === 0) continue;

            const event = this.parseNight(day, open, zone);
            events.push(event);
        }

        return events;
    }

    private parseNight(day: string, open: HytixSlot[], zone: any): RipperCalendarEvent | RipperEvent {
        let start: Instant | undefined;
        let end: Instant | undefined;
        try {
            for (const slot of open) {
                const s = Instant.parse(slot.startDate);
                const e = Instant.parse(slot.endDate);
                if (!start || s.isBefore(start)) start = s;
                if (!end || e.isAfter(end)) end = e;
            }
        } catch (error) {
            return {
                type: "ParseError",
                reason: `Could not parse slot times for ${day}: ${error}`,
                context: day,
            };
        }
        if (!start || !end || !end.isAfter(start)) {
            return {
                type: "ParseError",
                reason: `Invalid slot time range for ${day}`,
                context: day,
            };
        }

        return {
            id: `georgetown-morgue-${day}`,
            ripped: new Date(),
            date: ZonedDateTime.ofInstant(start, zone),
            duration: Duration.between(start, end),
            summary: "Georgetown Morgue Haunted House",
            description: `Seattle's haunted house attraction in Georgetown. Timed entry; tickets: ${TICKETS_URL}`,
            location: VENUE_LOCATION,
            url: VENUE_URL,
        };
    }
}
