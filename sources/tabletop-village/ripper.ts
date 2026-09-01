import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import {
    IRipper,
    Ripper,
    RipperCalendar,
    RipperCalendarEvent,
    RipperError,
    RipperEvent,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
// @ts-ignore — ical.js has no type declarations
import ICAL from "ical.js";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const ICS_URL = "https://calendar.google.com/calendar/ical/c_lk5nf8ne5ih2qtirija6h8vbqg%40group.calendar.google.com/public/basic.ics";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION = Duration.ofHours(2);
const FALLBACK_LOCATION = "616 8th Ave S, Seattle, WA 98104";
// How far ahead to expand weekly/monthly recurring series. The feed's
// RRULEs run indefinitely (no UNTIL for the store's current lineup), so
// without a cap expansion would run forever; 6 months covers a useful
// subscription window without ballooning event count.
const LOOKAHEAD_MONTHS = 6;
// Safety cap on occurrences expanded per recurring series (weekly for 6
// months is ~26; this is a large multiple of that, not a tuned value).
const MAX_OCCURRENCES_PER_SERIES = 500;

// The store publishes its day-to-day working calendar on Google Calendar and
// embeds it on tabletopvillage.com/pages/events, but that same calendar also
// carries entries that aren't public events at Tabletop Village: posted
// store hours, closure notices, and reference dates for Pokemon Regional
// Championships the store doesn't host (held in other cities). Filtering by
// title is the only way to separate those from real programming — none of
// them carry any other distinguishing field.
const NOISE_TITLE_PATTERNS: RegExp[] = [
    /^OPEN\s+\d/i,        // "OPEN 11AM-8PM" — posted store hours. Requires a digit right
                          // after "OPEN" (a time) so a real event like "... OPEN PLAY"
                          // (the store's own convention for drop-in play, always
                          // mid-title, never leading) never collides.
    /\bCLOSED\b/i,        // "CLOSED", "STORE CLOSED", "TTV Closed for the Holiday
                          // Weekend", "Birthday Reservation: CLOSED"
    /^Birthday Reservation\b/i, // "Birthday Reservation: OPEN" — a private party booking
                          // block, not a public event; timed (not all-day), so the
                          // isInWindow() all-day guard alone wouldn't catch it.
    // Reference dates for Pokemon Regional Championships held in OTHER cities —
    // the store's own real "Regional Championship Qualifier" events are always
    // styled "RCQ" in their titles (see "MAGIC RCQ Season 5 - Round 2"), never
    // spelled out, so matching the whole word "Regional(s)" anywhere is safe:
    // "REGIONAL: Nice", "Pittsburgh Pokemon Regional", "San Antonio Regionals",
    // "Pokemon: LAIC REGIONAL CHAMPIONSHIP", "Pokemon Regional Championship: <City>".
    /\bRegionals?\b/i,
    /^@\s/,               // "@ Card Party Dallas" — staff travel reference, not a Seattle event
];

export function isNoiseTitle(rawSummary: string): boolean {
    const trimmed = rawSummary.trim();
    return NOISE_TITLE_PATTERNS.some(re => re.test(trimmed));
}

// Builds a js-joda LocalDateTime from an ical.js ICAL.Time's wall-clock
// components. See sources/fremont_chamber_of_commerce/ripper.ts for why we
// avoid ICAL.Time#toJSDate()/toUnixTime() here: those resolve a TZID against
// ICAL.TimezoneService, which requires explicitly registering each ICS's
// embedded VTIMEZONE first — skipped registration silently treats the time
// as UTC, producing a wrong instant. The wall-clock fields are unaffected by
// that lookup, so we build the ZonedDateTime ourselves against this feed's
// known America/Los_Angeles timezone instead.
function icalTimeToLocalDateTime(t: any): LocalDateTime {
    return LocalDateTime.of(t.year, t.month, t.day, t.hour, t.minute, t.second ?? 0);
}

// This feed's current (future-dated) entries all carry TZID=America/Los_Angeles;
// its oldest entries (pre-2024) use bare UTC ('Z') timestamps instead, which
// are always in the past by the time this ripper runs. Treat anything else
// as untrustworthy rather than silently misapplying an offset.
function hasExpectedTimezone(t: any): boolean {
    const tzid: string | undefined = t.timezone;
    return tzid === undefined || tzid === TIMEZONE.toString();
}

function eventUrl(): string {
    return "https://tabletopvillage.com/pages/events";
}

// Whether an occurrence's start time falls in [now, horizonEnd) and is
// expressed with a timestamp we trust (see hasExpectedTimezone) — checked by
// the caller *before* calling buildEvent, so an out-of-window or untrusted
// occurrence is never turned into an event in the first place. Public for
// testing.
export function isInWindow(startTime: any, now: ZonedDateTime, horizonEnd: ZonedDateTime): boolean {
    if (!startTime || startTime.isDate || !hasExpectedTimezone(startTime)) return false;
    let date: ZonedDateTime;
    try {
        date = icalTimeToLocalDateTime(startTime).atZone(TIMEZONE);
    } catch {
        return false;
    }
    return !date.isBefore(now) && date.isBefore(horizonEnd);
}

/**
 * Builds one RipperCalendarEvent from a resolved occurrence (a one-off
 * VEVENT, or a single expanded instance of a recurring series with any
 * RECURRENCE-ID override already applied) already confirmed by the caller
 * to be isInWindow(). Returns a ParseError rather than throwing if the start
 * time turns out not to convert cleanly. Public for testing.
 */
export function buildEvent(
    id: string,
    summary: string,
    description: string | undefined,
    location: string | undefined,
    startTime: any,
    endTime: any,
): RipperCalendarEvent | RipperError {
    const startLdt = icalTimeToLocalDateTime(startTime);
    let date: ZonedDateTime;
    try {
        date = startLdt.atZone(TIMEZONE);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid start time for "${summary}": ${error}`, context: id };
    }

    let duration = DEFAULT_DURATION;
    if (endTime && !endTime.isDate && hasExpectedTimezone(endTime)) {
        const endLdt = icalTimeToLocalDateTime(endTime);
        const between = Duration.between(startLdt, endLdt);
        if (!between.isNegative() && !between.isZero()) duration = between;
    }

    return {
        id,
        ripped: new Date(),
        date,
        duration,
        summary: decode(summary.trim()),
        description: description && description.trim().length > 0 ? decode(description.trim()) : undefined,
        location: location && location.trim().length > 0 ? decode(location.trim()) : FALLBACK_LOCATION,
        url: eventUrl(),
    };
}

/**
 * Parses the store's Google Calendar ICS export into events, filtering out
 * non-event noise (store hours, closures, out-of-town reference dates —
 * see NOISE_TITLE_PATTERNS) and expanding recurring series up to
 * LOOKAHEAD_MONTHS ahead, honoring RECURRENCE-ID overrides and EXDATEs.
 * Never returns null; unparseable content becomes a ParseError. Public for
 * testing.
 */
export function parseIcsEvents(icsText: string, now: ZonedDateTime): RipperEvent[] {
    let comp: any;
    try {
        const jcalData = ICAL.parse(icsText);
        comp = new ICAL.Component(jcalData);
    } catch (error) {
        return [{ type: "ParseError", reason: `Failed to parse ICS: ${error}`, context: undefined }];
    }

    const horizonEnd = now.plusMonths(LOOKAHEAD_MONTHS);
    const vevents = comp.getAllSubcomponents("vevent");

    // A recurring series' master (no RECURRENCE-ID) and any per-occurrence
    // exception overrides (RECURRENCE-ID) share one UID — group them so
    // overrides get applied to the right occurrence instead of expanding
    // the master's un-overridden RRULE.
    const byUid = new Map<string, any[]>();
    for (const vevent of vevents) {
        const uid = vevent.getFirstPropertyValue("uid");
        if (!uid) continue;
        if (!byUid.has(uid)) byUid.set(uid, []);
        byUid.get(uid)!.push(vevent);
    }

    const results: RipperEvent[] = [];

    for (const [uid, comps] of byUid) {
        const master = comps.find(c => !c.getFirstPropertyValue("recurrence-id"));
        if (!master) continue; // an override with no master in this export; nothing to anchor it to

        const exceptions = comps.filter(c => c.getFirstPropertyValue("recurrence-id"));

        let icalEvent: any;
        try {
            icalEvent = exceptions.length > 0 ? new ICAL.Event(master, { exceptions }) : new ICAL.Event(master);
        } catch (error) {
            results.push({ type: "ParseError", reason: `Failed to read event: ${error}`, context: uid });
            continue;
        }

        const rawSummary: string = icalEvent.summary || "";
        if (!rawSummary.trim()) continue; // no title to show; nothing useful to publish
        if (isNoiseTitle(rawSummary)) continue;
        const masterStatus: string | null = master.getFirstPropertyValue?.("status") ?? null;
        if (masterStatus && masterStatus.toUpperCase() === "CANCELLED") continue;

        if (!icalEvent.isRecurring()) {
            if (isInWindow(icalEvent.startDate, now, horizonEnd)) {
                results.push(buildEvent(
                    `${uid}`, rawSummary, icalEvent.description, icalEvent.location,
                    icalEvent.startDate, icalEvent.endDate,
                ));
            }
            continue;
        }

        let iterator: any;
        try {
            iterator = icalEvent.iterator();
        } catch (error) {
            results.push({ type: "ParseError", reason: `Failed to expand recurrence for "${rawSummary}": ${error}`, context: uid });
            continue;
        }

        let next: any;
        let count = 0;
        while (count < MAX_OCCURRENCES_PER_SERIES && (next = iterator.next())) {
            count++;
            let occurrence: any;
            try {
                occurrence = icalEvent.getOccurrenceDetails(next);
            } catch {
                continue;
            }
            const item = occurrence.item;
            // RFC 5545 allows cancelling a single occurrence of a recurring
            // series via a RECURRENCE-ID override with STATUS:CANCELLED,
            // distinct from an EXDATE-based deletion (which ical.js's
            // iterator already omits automatically). Skip it — publishing a
            // cancelled instance as a real event would tell someone to show
            // up to something that isn't happening.
            const occStatus: string | null = item.component?.getFirstPropertyValue?.("status") ?? null;
            if (occStatus && occStatus.toUpperCase() === "CANCELLED") continue;

            const occSummary: string = item.summary || rawSummary;
            if (isNoiseTitle(occSummary)) continue; // an override could rename an occurrence to a noise title

            const occId = `${uid}-${icalTimeToLocalDateTime(next).toLocalDate().toString()}`;
            if (isInWindow(occurrence.startDate, now, horizonEnd)) {
                results.push(buildEvent(
                    occId, occSummary, item.description, item.location,
                    occurrence.startDate, occurrence.endDate,
                ));
            }

            // `next` is the series' own scheduled time (unaffected by an
            // override's time shift) and comes out in increasing order, so
            // once it's past the horizon nothing later in this series can be
            // in range either — safe to stop regardless of how this specific
            // occurrence was resolved above.
            if (!next.isDate && hasExpectedTimezone(next)) {
                const seriesDate = icalTimeToLocalDateTime(next).atZone(TIMEZONE);
                if (!seriesDate.isBefore(horizonEnd)) break;
            }
        }
    }

    return results;
}

/**
 * Tabletop Village ripper.
 *
 * Reads the store's own public Google Calendar (embedded on
 * tabletopvillage.com/pages/events) rather than scraping the Shopify
 * storefront's "Tournament" product collection: the calendar is the store's
 * ground-truth schedule, while the Shopify product pages are static blurb
 * text that goes stale (two tournaments' listed times collided when tried
 * as a source). The calendar doubles as the store's internal working
 * calendar, so non-event noise (store hours, closures, out-of-town
 * reference dates) is filtered by title — see NOISE_TITLE_PATTERNS.
 */
export default class TabletopVillageRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error("No calendars configured for tabletop-village ripper");
        }
        const calConfig = ripper.config.calendars[0];
        const now = ZonedDateTime.now(TIMEZONE);

        let icsText: string;
        try {
            const res = await this.fetchFn(ICS_URL, { headers: { "User-Agent": USER_AGENT } });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} fetching ${ICS_URL}`);
            }
            icsText = await res.text();
        } catch (error) {
            throw new Error(`Failed to fetch Tabletop Village calendar: ${error}`);
        }

        const parsed = parseIcsEvents(icsText, now);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        for (const result of parsed) {
            if ("date" in result) events.push(result);
            else errors.push(result);
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
}
