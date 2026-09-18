import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { FetchFn, getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Art Love Salon and its parent Conru Foundation don't publish their own
// calendar (see docs/source-candidates/art-love-salon.md) — their event data
// only surfaces through the citywide aggregator PublicDisplay.ART, whose
// /calendar page embeds a Next.js React Server Components ("RSC") flight
// payload rather than a conventional API or DOM-rendered listing. This
// ripper pulls the two organizations' single-day events out of that
// payload, then fetches each event's own detail page (a second RSC payload)
// for its `hours` field, since the calendar payload's `start_date` is always
// midnight and carries no real start time.
const CALENDAR_URL = "https://publicdisplay.art/calendar";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const LOCATION = "Art Love Salon, 110 Union St, Seattle, WA 98121";
const DEFAULT_DURATION_MINUTES = 120;
const USER_AGENT = 'Mozilla/5.0 (compatible; 206events/1.0)';

// PublicDisplay.ART organization ids for Art Love Salon and its parent Conru
// Foundation (both operate out of the same 110 Union St address, one
// programming operation split across two organization records upstream).
const ORG_IDS = new Set([462, 1]);

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

interface PublicDisplayEventDetail {
    id: number;
    name: string;
    start_date: string;
    hours?: string;
    description?: string;
}

/**
 * Concatenates every `self.__next_f.push([1,"..."])` chunk on the page into
 * one string. Next.js streams RSC payload text across many script tags in
 * document order; each chunk's payload is a JS string literal (JSON-escaped
 * closely enough that `JSON.parse` of a re-quoted chunk reliably unescapes
 * it) that must be concatenated before any embedded JSON can be located.
 */
export function extractNextFlightData(html: string): string {
    const chunkRegex = /__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
    let full = '';
    let match: RegExpExecArray | null;
    while ((match = chunkRegex.exec(html)) !== null) {
        full += JSON.parse(`"${match[1]}"`);
    }
    return full;
}

/**
 * Finds `marker` (e.g. `"initialEvents":[`) in `full` and returns the
 * balanced-bracket JSON substring starting at the marker's own open
 * bracket/brace, ignoring brackets inside quoted strings. The RSC payload
 * has no stable overall structure to parse (it's a mix of React element
 * trees and raw data), so this locates just the one embedded JSON value we
 * need rather than attempting to parse the whole payload.
 */
export function extractJsonAfterMarker(full: string, marker: string, open: string, close: string): string | undefined {
    const markerIndex = full.indexOf(marker);
    if (markerIndex === -1) return undefined;
    const start = markerIndex + marker.length - 1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < full.length; i++) {
        const c = full[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') inString = false;
            continue;
        }
        if (c === '"') inString = true;
        else if (c === open) depth++;
        else if (c === close) {
            depth--;
            if (depth === 0) { end = i + 1; break; }
        }
    }
    if (end === -1) return undefined;
    return full.slice(start, end);
}

export default class ArtLoveSalonRipper implements IRipper {

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
            const result = await this.fetchAndParseEvent(fetchFn, candidate);
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
     * page's RSC payload and narrows it to Art Love Salon / Conru
     * Foundation's own single-day events. Multi-day entries (e.g. an
     * "Art & Culture Week" container spanning a week) are excluded — their
     * individual days are already listed as their own events — as are
     * events for every other organization on the citywide aggregator.
     */
    // Public for testing
    findCandidateEvents(calendarHtml: string): PublicDisplayCalendarEvent[] {
        const flightData = extractNextFlightData(calendarHtml);
        const arrayText = extractJsonAfterMarker(flightData, '"initialEvents":[', '[', ']');
        if (!arrayText) return [];
        const rawEvents = JSON.parse(arrayText) as PublicDisplayCalendarEvent[];

        return rawEvents.filter(e => {
            const org = e.org;
            const orgId = org && typeof org === 'object' ? org.id : undefined;
            if (orgId === undefined || !ORG_IDS.has(orgId)) return false;
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

        const name = detail.name.trim();
        const dateStr = (detail.start_date ?? '').slice(0, 10);

        const hours = detail.hours;
        const timeMatch = hours?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!timeMatch) {
            return { type: 'ParseError', reason: `Could not parse hours "${hours}" for "${name}"`, context: detailUrl };
        }

        const startHour = this.to24Hour(timeMatch[1], timeMatch[3]);
        const startMinute = parseInt(timeMatch[2], 10);
        const endHour = this.to24Hour(timeMatch[4], timeMatch[6]);
        const endMinute = parseInt(timeMatch[5], 10);

        const [year, month, day] = dateStr.split('-').map(n => parseInt(n, 10));
        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(LocalDateTime.of(year, month, day, startHour, startMinute), TIMEZONE);
        } catch (err) {
            return { type: 'ParseError', reason: `Invalid date "${dateStr}" for "${name}": ${err}`, context: detailUrl };
        }

        let durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        // Spans midnight (e.g. "8:00 PM - 12:00 AM"): wrap through end of day.
        if (durationMinutes <= 0) durationMinutes += 24 * 60;

        const event: RipperCalendarEvent = {
            id: `art-love-salon-${eventId}`,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes || DEFAULT_DURATION_MINUTES),
            summary: name,
            location: LOCATION,
            url: detailUrl,
            description: detail.description?.trim() || undefined,
        };
        return event;
    }

    // Public for testing
    to24Hour(hourStr: string, ampm: string): number {
        const hour = parseInt(hourStr, 10) % 12;
        return ampm.toUpperCase() === 'PM' ? hour + 12 : hour;
    }
}
