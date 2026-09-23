import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import {
    IRipper,
    Ripper,
    RipperCalendar,
    RipperCalendarEvent,
    RipperError,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
// @ts-ignore — ical.js has no type declarations
import ICAL from "ical.js";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const BASE_URL = "https://www.issaquahwa.gov";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION = Duration.ofHours(1);
const CITY_FALLBACK = "Issaquah, WA";

/**
 * The City of Issaquah publishes its CivicPlus (CivicEngage) calendar as one
 * iCalendar feed per category:
 *   /common/modules/iCalendar/iCalendar.aspx?catID=<id>&feed=calendar
 * Each calendar in ripper.yaml names its category via `config.catID`.
 * Public for testing.
 */
export function feedUrl(catID: string | number): string {
    return `${BASE_URL}/common/modules/iCalendar/iCalendar.aspx?catID=${encodeURIComponent(String(catID))}&feed=calendar`;
}

/**
 * CivicPlus LOCATION values look like
 *   `<p>Issaquah Train Depot</p> - 78 1st Ave NE  Issaquah WA 98027`
 *   `Pickering Barn - 1730 10th Ave. N.W.  Issaquah WA 98027`
 *   `<p>Park Pointe</p> -   Issaquah WA 98027`
 *   ` -   Issaquah WA 98027`
 * i.e. `<venue name> - <street>  <city> <state> <zip>`, with the venue name
 * sometimes wrapped in HTML and the street sometimes blank. Normalizes this
 * into a comma-separated, geocodable string ("Issaquah Train Depot, 78 1st
 * Ave NE, Issaquah, WA 98027"). Public for testing.
 */
export function normalizeLocation(raw: string): string {
    const text = decode(raw.replace(/<[^>]*>/g, " "));
    const dash = text.indexOf(" - ");
    const venue = (dash >= 0 ? text.slice(0, dash) : "").replace(/\s+/g, " ").trim();
    let rest = (dash >= 0 ? text.slice(dash + 3) : text).trim();

    // The address part separates street from "City ST 98027" with a run of
    // two or more spaces.
    const parts = rest.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    let street = "";
    let cityLine = "";
    if (parts.length >= 2) {
        street = parts.slice(0, -1).join(" ");
        cityLine = parts[parts.length - 1];
    } else if (parts.length === 1) {
        cityLine = parts[0];
    }
    // "Issaquah WA 98027" -> "Issaquah, WA 98027"
    cityLine = cityLine.replace(/^(.*?)\s+([A-Z]{2})(\s+\d{5}(?:-\d{4})?)?$/, (_m, city, st, zip) =>
        `${city}, ${st}${zip ?? ""}`);

    const pieces = [venue, street, cityLine].map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (pieces.length === 0) return CITY_FALLBACK;
    if (!cityLine) pieces.push(CITY_FALLBACK);
    return pieces.join(", ");
}

// ical.js's toJSDate() needs each embedded VTIMEZONE registered with
// ICAL.TimezoneService; building the ZonedDateTime from the literal
// wall-clock fields against the known America/Los_Angeles zone sidesteps
// that (same approach as sources/fremont_chamber_of_commerce).
function icalTimeToLocalDateTime(t: any): LocalDateTime {
    return LocalDateTime.of(t.year, t.month, t.day, t.isDate ? 0 : t.hour, t.isDate ? 0 : t.minute, t.isDate ? 0 : (t.second ?? 0));
}

function hasExpectedTimezone(t: any): boolean {
    if (t.isDate) return true;
    const tzid: string | undefined = t.timezone;
    return tzid === undefined || tzid === TIMEZONE.toString();
}

/**
 * Parses a CivicPlus category ICS feed into events (and ParseErrors for
 * VEVENTs that can't be read). Never drops a VEVENT silently.
 * Public for testing.
 */
export function parseIcs(icsText: string, context: string): Array<RipperCalendarEvent | RipperError> {
    let comp: any;
    try {
        comp = new ICAL.Component(ICAL.parse(icsText));
    } catch (error) {
        return [{ type: "ParseError", reason: `Failed to parse ICS: ${error}`, context }];
    }

    const results: Array<RipperCalendarEvent | RipperError> = [];
    for (const vevent of comp.getAllSubcomponents("vevent")) {
        const ev = new ICAL.Event(vevent);
        const uid = String(ev.uid ?? "").trim();
        const summary = decode(String(ev.summary ?? "").trim());
        if (!summary) {
            results.push({ type: "ParseError", reason: "VEVENT missing SUMMARY", context: `${context} uid=${uid}` });
            continue;
        }
        if (!uid) {
            results.push({ type: "ParseError", reason: `VEVENT "${summary}" missing UID`, context });
            continue;
        }
        if (!ev.startDate) {
            results.push({ type: "ParseError", reason: `VEVENT "${summary}" missing DTSTART`, context: `${context} uid=${uid}` });
            continue;
        }
        if (!hasExpectedTimezone(ev.startDate) || (ev.endDate && !hasExpectedTimezone(ev.endDate))) {
            results.push({
                type: "ParseError",
                reason: `VEVENT "${summary}" has unexpected timezone (expected ${TIMEZONE.toString()})`,
                context: `${context} uid=${uid}`,
            });
            continue;
        }

        const startLdt = icalTimeToLocalDateTime(ev.startDate);
        let duration = ev.startDate.isDate ? Duration.ofHours(24) : DEFAULT_DURATION;
        if (ev.endDate) {
            const between = Duration.between(startLdt, icalTimeToLocalDateTime(ev.endDate));
            if (!between.isNegative() && !between.isZero()) duration = between;
        }

        const rawLocation = String(ev.location ?? "").trim();
        results.push({
            id: `issaquah-${uid}`,
            ripped: new Date(),
            date: startLdt.atZone(TIMEZONE),
            duration,
            summary,
            location: rawLocation ? normalizeLocation(rawLocation) : CITY_FALLBACK,
            url: `${BASE_URL}/Calendar.aspx?EID=${encodeURIComponent(uid)}`,
        });
    }
    return results;
}

export default class IssaquahRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const now = ZonedDateTime.now(TIMEZONE);
        const calendars: RipperCalendar[] = [];

        for (const cal of ripper.config.calendars) {
            const catID = (cal.config as any)?.catID;
            const events: RipperCalendarEvent[] = [];
            const errors: RipperError[] = [];

            if (catID === undefined || catID === null || catID === "") {
                errors.push({ type: "ParseError", reason: "calendar config missing catID", context: cal.name });
            } else {
                const url = feedUrl(catID);
                const res = await this.fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} fetching ${url}`);
                }
                const text = await res.text();
                for (const r of parseIcs(text, url)) {
                    if ("date" in r) {
                        // Keep events that haven't ended yet.
                        if (r.date.plus(r.duration).isAfter(now)) events.push(r);
                    } else {
                        errors.push(r);
                    }
                }
            }

            calendars.push({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events,
                errors,
                tags: cal.tags || [],
                parent: ripper.config,
            });
        }
        return calendars;
    }
}
