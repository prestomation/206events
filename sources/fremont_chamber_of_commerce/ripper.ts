import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import {
    IRipper,
    Ripper,
    RipperCalendar,
    RipperCalendarEvent,
    RipperError,
    RipperEvent,
    UncertaintyError,
    UncertaintyField,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
// @ts-ignore — ical.js has no type declarations
import ICAL from "ical.js";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const BASE_URL = "https://business.fremont.com";
const LISTING_URL = `${BASE_URL}/calendar`;
const ICAL_BASE_URL = `${BASE_URL}/calendar/ICal`;
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION = Duration.ofHours(1);

// The GrowthZone/ChamberMaster calendar this ripper reads never publishes a
// street address for some listings (e.g. an outdoor walk whose meeting spot
// is only described in prose inside the event description). Rather than
// guess a plausible-looking address — which would publish a guess as a fact
// — the event still gets a neighborhood-level placeholder so it geocodes to
// somewhere sane, paired with an UncertaintyError so the
// event-uncertainty-resolver skill can look up the real venue later. See
// docs/event-uncertainty.md.
const FALLBACK_LOCATION = "Fremont, Seattle, WA";

/**
 * Extracts the unique set of event slugs referenced on the Fremont Chamber
 * "Event Calendar" listing page, from links shaped
 * `https://business.fremont.com/calendar/Details/<slug>?sourceTypeId=Website`.
 * The slug embeds GrowthZone's own numeric event id (e.g.
 * `apda-nw-optimism-walk-1867802`), so it doubles as a stable upstream id —
 * see AGENTS.md "Ripper Design: Stable Event IDs". Public for testing.
 */
export function extractDetailSlugs(html: string): string[] {
    const slugs = new Set<string>();
    const re = /calendar\/Details\/([a-zA-Z0-9-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        slugs.add(m[1]);
    }
    return [...slugs];
}

// Builds a js-joda LocalDateTime from an ical.js ICAL.Time's wall-clock
// components. ical.js's own toJSDate()/toUnixTime() resolve a TZID against
// ICAL.TimezoneService, which requires explicitly registering each ICS's
// embedded VTIMEZONE — skipping that silently treats the time as "floating"
// (i.e. UTC), producing a wrong instant. The year/month/day/hour/minute
// fields on ICAL.Time are unaffected by that lookup — they're always the
// literal wall-clock value from DTSTART/DTEND — so building the
// ZonedDateTime ourselves against the calendar's known America/Los_Angeles
// timezone sidesteps the issue entirely. Public for testing.
function icalTimeToLocalDateTime(t: any): LocalDateTime {
    return LocalDateTime.of(t.year, t.month, t.day, t.hour, t.minute, t.second ?? 0);
}

// icalTimeToLocalDateTime trusts that a DTSTART/DTEND's wall-clock fields
// are already in TIMEZONE — true for every sample seen from this
// single-org, single-timezone GrowthZone feed (TZID=America/Los_Angeles),
// or a "floating" value with no TZID at all (ICAL.Time#timezone is then
// undefined). Reject anything else (a `Z`-suffixed UTC timestamp, or an
// explicit different TZID) rather than silently misapplying the wrong
// offset — a wrong instant published as fact is exactly what the
// uncertainty system exists to prevent. Public for testing.
function hasExpectedTimezone(t: any): boolean {
    const tzid: string | undefined = t.timezone;
    return tzid === undefined || tzid === TIMEZONE.toString();
}

// Cheap deterministic hash; we only need stability, not crypto strength.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * Parses a single per-event GrowthZone ICS document (fetched from
 * `/calendar/ICal/<slug>.ics`) into zero, one, or two results:
 *   - `[event]` — a normal event with a known date, duration, and location.
 *   - `[event, uncertainty]` — a real event whose date/time is known but
 *     whose ICS `LOCATION` field was blank (common for outdoor
 *     walks/meetups that only describe a meeting spot in prose). `event`
 *     carries the neighborhood-level FALLBACK_LOCATION placeholder and
 *     `uncertainty` flags it for the event-uncertainty-resolver skill.
 *   - `[error]` — the ICS could not be parsed, had no VEVENT, or was
 *     missing SUMMARY/DTSTART.
 * Never returns null/undefined and never silently drops a real event.
 * Public for testing.
 */
export function parseEventIcs(icsText: string, slug: string): RipperEvent[] {
    let comp: any;
    try {
        const jcalData = ICAL.parse(icsText);
        comp = new ICAL.Component(jcalData);
    } catch (error) {
        return [{ type: "ParseError", reason: `Failed to parse ICS: ${error}`, context: slug }];
    }

    const vevent = comp.getFirstSubcomponent("vevent");
    if (!vevent) {
        return [{ type: "ParseError", reason: "ICS contained no VEVENT", context: slug }];
    }

    const icalEvent = new ICAL.Event(vevent);

    const rawSummary: string = (icalEvent.summary || "").trim();
    if (!rawSummary) {
        return [{ type: "ParseError", reason: "ICS VEVENT missing SUMMARY", context: slug }];
    }
    const summary = decode(rawSummary);

    if (!icalEvent.startDate) {
        return [{ type: "ParseError", reason: "ICS VEVENT missing DTSTART", context: slug }];
    }
    if (!hasExpectedTimezone(icalEvent.startDate)) {
        return [{
            type: "ParseError",
            reason: `DTSTART for "${summary}" has unexpected timezone "${icalEvent.startDate.timezone}" (expected ${TIMEZONE.toString()} or floating)`,
            context: slug,
        }];
    }
    const startLdt = icalTimeToLocalDateTime(icalEvent.startDate);
    let date: ZonedDateTime;
    try {
        date = startLdt.atZone(TIMEZONE);
    } catch (error) {
        return [{ type: "ParseError", reason: `Invalid DTSTART for "${summary}": ${error}`, context: slug }];
    }

    let duration = DEFAULT_DURATION;
    if (icalEvent.endDate && !hasExpectedTimezone(icalEvent.endDate)) {
        return [{
            type: "ParseError",
            reason: `DTEND for "${summary}" has unexpected timezone "${icalEvent.endDate.timezone}" (expected ${TIMEZONE.toString()} or floating)`,
            context: slug,
        }];
    }
    if (icalEvent.endDate) {
        const endLdt = icalTimeToLocalDateTime(icalEvent.endDate);
        const between = Duration.between(startLdt, endLdt);
        if (!between.isNegative() && !between.isZero()) duration = between;
    }

    const rawLocation = (icalEvent.location || "").trim();
    const rawDescription = (icalEvent.description || "").trim();

    const event: RipperCalendarEvent = {
        id: slug,
        ripped: new Date(),
        date,
        duration,
        summary,
        description: rawDescription.length > 0 ? decode(rawDescription) : undefined,
        location: rawLocation.length > 0 ? decode(rawLocation) : FALLBACK_LOCATION,
        url: `${LISTING_URL}/Details/${slug}`,
    };

    if (rawLocation.length > 0) {
        return [event];
    }

    const unknownFields: UncertaintyField[] = ["location"];
    const uncertainty: UncertaintyError = {
        type: "Uncertainty",
        reason: `Fremont Chamber ICS for "${summary}" (${slug}) has a blank LOCATION field`,
        source: "fremont-chamber-of-commerce",
        unknownFields,
        event,
        partialFingerprint: simpleHash(`${summary}|${date.toLocalDate().toString()}`),
    };
    return [event, uncertainty];
}

/**
 * Fremont Chamber of Commerce ripper.
 *
 * Reads the GrowthZone/ChamberMaster "Fremont Event Calendar" at
 * business.fremont.com/calendar, which by default server-renders only
 * upcoming events (no query params needed). The listing page carries
 * schema.org/Event microdata cards but not a machine-readable location, so
 * discovery collects the set of event-detail slugs from the listing and
 * fetches each event's dedicated GrowthZone ICS export
 * (`/calendar/ICal/<slug>.ics`) for the authoritative date/time/location.
 */
export default class FremontChamberOfCommerceRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error("No calendars configured for fremont-chamber-of-commerce ripper");
        }
        const calConfig = ripper.config.calendars[0];
        const now = ZonedDateTime.now(TIMEZONE);

        let listingHtml: string;
        try {
            const res = await this.fetchFn(LISTING_URL, { headers: { "User-Agent": USER_AGENT } });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} fetching ${LISTING_URL}`);
            }
            listingHtml = await res.text();
        } catch (error) {
            throw new Error(`Failed to fetch Fremont Chamber calendar listing: ${error}`);
        }

        const slugs = extractDetailSlugs(listingHtml);

        const allEvents: RipperCalendarEvent[] = [];
        const allErrors: RipperError[] = [];

        for (const slug of slugs) {
            const icsUrl = `${ICAL_BASE_URL}/${slug}.ics`;
            let icsText: string;
            try {
                const res = await this.fetchFn(icsUrl, { headers: { "User-Agent": USER_AGENT } });
                if (!res.ok) {
                    allErrors.push({ type: "ParseError", reason: `HTTP ${res.status} fetching event ICS`, context: icsUrl });
                    continue;
                }
                icsText = await res.text();
            } catch (error) {
                // Isolate per-event fetch failures so one bad ICS doesn't
                // discard events already parsed from earlier slugs.
                allErrors.push({ type: "ParseError", reason: `Failed to fetch event ICS: ${error}`, context: icsUrl });
                continue;
            }

            for (const result of parseEventIcs(icsText, slug)) {
                if ("date" in result) allEvents.push(result);
                else allErrors.push(result);
            }
        }

        // Drop past events, and any Uncertainty error paired with a
        // now-dropped event, in one pass — mirrors sources/events12's rip().
        const events = allEvents.filter(e => !e.date.isBefore(now));
        const keptIds = new Set(events.map(e => e.id));
        const errors = allErrors.filter(err => err.type !== "Uncertainty" || keptIds.has(err.event.id));

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
