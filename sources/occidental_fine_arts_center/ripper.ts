import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { FetchFn, getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { extractNextFlightData, extractJsonAfterMarker, parseHoursRange } from "../../lib/config/rsc-flight.js";
import '@js-joda/timezone';

// Occidental Fine Arts Center (a Conru Art Foundation venue, like Art Love
// Salon — see sources/art_love_salon/ripper.ts) doesn't publish its own
// calendar: occidentalfinearts.org's /events page renders client-side with
// no embedded data. Its event data only surfaces through the citywide
// aggregator PublicDisplay.ART, whose /calendar page embeds a Next.js React
// Server Components ("RSC") flight payload. This ripper pulls Occidental's
// single-day events out of that payload, then fetches each event's own
// detail page (a second RSC payload) for its `hours` field, since the
// calendar payload's `start_date` is always midnight and carries no real
// start time. See docs/source-candidates/occidental-fine-arts-center.md.
const CALENDAR_URL = "https://publicdisplay.art/calendar";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const LOCATION = "Occidental Fine Arts Center, 311 1/2 Occidental Ave South, Seattle, WA 98104";
const DEFAULT_DURATION_MINUTES = 120;
const USER_AGENT = 'Mozilla/5.0 (compatible; 206events/1.0)';

// PublicDisplay.ART organization id for Occidental Fine Arts Center.
const ORG_ID = 774;

interface PublicDisplayOrg {
    id: number;
    name: string;
}

interface PublicDisplayCalendarEvent {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
    org?: PublicDisplayOrg | string;
}

interface PublicDisplayPhoto {
    big?: string;
    is_main?: number;
}

interface PublicDisplayEventDetail {
    id: number;
    name: string;
    start_date: string;
    // The API omits the field entirely for some events and returns an
    // explicit JSON null for others — both mean "no hours published".
    hours?: string | null;
    description?: string;
    photos?: PublicDisplayPhoto[];
}

export default class OccidentalFineArtsCenterRipper implements IRipper {

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(CALENDAR_URL, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) throw new Error(`PublicDisplay.ART calendar returned HTTP ${res.status}`);
        const html = await res.text();

        const candidates = this.findCandidateEvents(html);

        const now = ZonedDateTime.now(TIMEZONE);
        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (const candidate of candidates) {
            let result: RipperEvent;
            try {
                result = await this.fetchAndParseEvent(fetchFn, candidate);
            } catch (err) {
                // A single event's detail page failing unexpectedly (e.g. a
                // malformed RSC chunk) shouldn't take down every other
                // event's data for this build.
                result = {
                    type: 'ParseError',
                    reason: `Unexpected error fetching/parsing event ${candidate.id}: ${err}`,
                    context: candidate.name,
                };
            }
            if ('date' in result) {
                if (!result.date.isBefore(now)) events.push(result);
            } else {
                errors.push(result);
            }
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    /**
     * Pulls PublicDisplay.ART's `initialEvents` array out of the calendar
     * page's RSC payload and narrows it to Occidental Fine Arts Center's own
     * single-day events. Multi-day entries (e.g. an "Art & Culture Week"
     * container spanning a week) are excluded — their individual days are
     * already listed as their own events — as are events for every other
     * organization on the citywide aggregator.
     */
    // Public for testing
    findCandidateEvents(calendarHtml: string): PublicDisplayCalendarEvent[] {
        const flightData = extractNextFlightData(calendarHtml);
        const arrayText = extractJsonAfterMarker(flightData, '"initialEvents":[', '[', ']');
        if (!arrayText) return [];

        let rawEvents: PublicDisplayCalendarEvent[];
        try {
            rawEvents = JSON.parse(arrayText) as PublicDisplayCalendarEvent[];
        } catch (err) {
            // A structurally different payload than expected (the upstream
            // aggregator changed its RSC serialization) is a loud, visible
            // failure rather than a silent "0 events" — matches how every
            // other ripper in this repo surfaces an unexpected page shape.
            throw new Error(`PublicDisplay.ART calendar: could not parse initialEvents JSON: ${err}`);
        }

        return rawEvents.filter(e => {
            const org = e.org;
            const orgId = org && typeof org === 'object' ? org.id : undefined;
            if (orgId !== ORG_ID) return false;
            const startDay = (e.start_date ?? '').slice(0, 10);
            const endDay = (e.end_date ?? '').slice(0, 10);
            return startDay !== '' && startDay === endDay;
        });
    }

    // Public for testing
    async fetchAndParseEvent(fetchFn: FetchFn, candidate: PublicDisplayCalendarEvent): Promise<RipperEvent> {
        const detailUrl = `https://publicdisplay.art/event/${candidate.id}`;
        const res = await fetchFn(detailUrl, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) {
            return { type: 'ParseError', reason: `Event detail page returned HTTP ${res.status}`, context: detailUrl };
        }
        const html = await res.text();
        return this.parseEventDetail(html, candidate.id);
    }

    /**
     * Parses one event's detail page. The calendar listing's `start_date` is
     * always midnight (it carries no clock time), so the real start/end time
     * only exists on the detail page's `hours` field, e.g. "12:00 PM - 1:00 PM".
     */
    // Public for testing
    parseEventDetail(html: string, eventId: number): RipperEvent {
        const detailUrl = `https://publicdisplay.art/event/${eventId}`;
        const flightData = extractNextFlightData(html);
        const objectText = extractJsonAfterMarker(flightData, '"initialEvent":{', '{', '}');
        if (!objectText) {
            return { type: 'ParseError', reason: `No initialEvent data found on event detail page`, context: detailUrl };
        }

        let detail: PublicDisplayEventDetail;
        try {
            detail = JSON.parse(objectText);
        } catch (err) {
            return { type: 'ParseError', reason: `Could not parse event detail JSON: ${err}`, context: detailUrl };
        }

        if (!detail.name) {
            return { type: 'ParseError', reason: `Event detail JSON missing "name" field`, context: detailUrl };
        }
        const name = detail.name.trim();
        const dateStr = (detail.start_date ?? '').slice(0, 10);

        const hours = detail.hours;
        if (!hours) {
            // Explicit JSON null or a missing field — genuinely no hours
            // published anywhere on the page, as opposed to an unrecognized
            // format (handled below). Worth its own message since `hours`
            // isn't a string to quote here.
            return { type: 'ParseError', reason: `No hours published for "${name}"`, context: detailUrl };
        }

        const parsedHours = parseHoursRange(hours);
        if (!parsedHours) {
            return { type: 'ParseError', reason: `Could not parse hours "${hours}" for "${name}"`, context: detailUrl };
        }
        const { startHour, startMinute, endHour, endMinute } = parsedHours;

        const [year, month, day] = dateStr.split('-').map(n => parseInt(n, 10));
        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(LocalDateTime.of(year, month, day, startHour, startMinute), TIMEZONE);
        } catch (err) {
            return { type: 'ParseError', reason: `Invalid date "${dateStr}" for "${name}": ${err}`, context: detailUrl };
        }

        let durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        // Spans midnight (e.g. "8:00 PM - 12:00 AM"): wrap through end of day.
        if (durationMinutes < 0) durationMinutes += 24 * 60;
        // Identical start/end time ("12:00 PM - 12:00 PM") is a data error,
        // not a real 24-hour event — fall back to a sensible default instead
        // of publishing something misleading.
        if (durationMinutes === 0) durationMinutes = DEFAULT_DURATION_MINUTES;

        const mainPhoto = detail.photos?.find(p => p.is_main === 1);
        const imageUrl = mainPhoto?.big || undefined;

        const event: RipperCalendarEvent = {
            id: `occidental-fine-arts-center-${eventId}`,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes),
            summary: name,
            location: LOCATION,
            url: detailUrl,
            description: detail.description?.trim() || undefined,
            imageUrl,
        };
        return event;
    }
}
