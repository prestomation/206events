import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export const LOCATION = "Vashon Center for the Arts, 19600 Vashon Hwy SW, Vashon, WA 98070";
export const EVENTS_URL = "https://vashoncenterforthearts.org/events/";
const BASE_URL = "https://system.spektrix.com/vashoncenter/api/v3";

// Public performances frequently have a real duration (90/120/180), but
// some (gallery talks, openings) come through with duration 0. Fall back
// to a sensible default rather than emitting a zero-length event.
const DEFAULT_DURATION_MINUTES = 120;

export interface SpektrixEvent {
    id: string;
    name: string;
    duration: number; // minutes; 0 for some events (e.g. gallery talks)
    firstInstanceDateTime: string;
    lastInstanceDateTime: string;
    description?: string;
    imageUrl?: string;
    // VCA runs its dance school / summer camps through Spektrix too. Those
    // entries are flagged Jackrabbit and number in the hundreds of class
    // sessions — we filter them out so the calendar only carries public
    // performances, exhibitions, and screenings.
    attribute_Jackrabbit?: boolean;
}

export interface SpektrixInstance {
    id: string;
    event: { id: string };
    start: string; // local datetime, e.g. "2026-06-10T19:30:00"
    startUtc?: string;
    cancelled: boolean;
    isOnSale?: boolean;
}

/**
 * Convert Spektrix events + instances into calendar events.
 * Exported for unit testing.
 */
export function processData(
    allEvents: SpektrixEvent[],
    allInstances: SpektrixInstance[],
    now: ZonedDateTime,
    zone: ZoneId,
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    // Keep only public-facing events, dropping Jackrabbit class/camp records.
    const publicEvents = new Map<string, SpektrixEvent>(
        allEvents
            .filter(e => e.attribute_Jackrabbit !== true)
            .map(e => [e.id, e])
    );

    const errors: RipperError[] = [];
    const events: RipperCalendarEvent[] = [];
    // Deduplicate by (eventId, startTime) in case the same performance appears
    // across multiple plan variants with different instance IDs.
    const seen = new Set<string>();

    for (const inst of allInstances) {
        const event = publicEvents.get(inst.event.id);
        if (!event) continue;
        if (inst.cancelled) continue;

        const dedupeKey = `${inst.event.id}|${inst.start}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        let eventDate: ZonedDateTime;
        try {
            eventDate = ZonedDateTime.of(LocalDateTime.parse(inst.start), zone);
        } catch {
            errors.push({
                type: 'ParseError',
                reason: `Invalid datetime: ${inst.start}`,
                context: event.name,
            });
            continue;
        }

        if (eventDate.isBefore(now)) continue;

        const minutes = event.duration > 0 ? event.duration : DEFAULT_DURATION_MINUTES;

        const calendarEvent: RipperCalendarEvent = {
            id: `vashon-${inst.id}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(minutes),
            summary: event.name,
            location: LOCATION,
            url: EVENTS_URL,
        };
        if (event.description) calendarEvent.description = event.description;
        if (event.imageUrl) calendarEvent.imageUrl = event.imageUrl;

        events.push(calendarEvent);
    }

    return { events, errors };
}

export default class VashonCenterForTheArtsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error('vashon-center-for-the-arts: ripper.yaml must define at least one calendar');
        }
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' };

        const [eventsRes, instancesRes] = await Promise.all([
            fetchFn(`${BASE_URL}/events`, { headers }),
            fetchFn(`${BASE_URL}/instances?cancelled=false`, { headers }),
        ]);

        if (!eventsRes.ok) throw new Error(`Spektrix events API returned ${eventsRes.status}`);
        if (!instancesRes.ok) throw new Error(`Spektrix instances API returned ${instancesRes.status}`);

        const allEvents: SpektrixEvent[] = await eventsRes.json();
        const allInstances: SpektrixInstance[] = await instancesRes.json();

        const { events, errors } = processData(allEvents, allInstances, now, zone);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
