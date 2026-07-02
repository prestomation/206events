import { LocalDate, LocalDateTime, ZoneId, Duration, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const BASE_URL = "https://www.cwb.org";
const VENUE_ADDRESS = "Center for Wooden Boats, 1010 Valley St, Seattle, WA 98109";

const MONTHS: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

interface TimeOfDay { hour: number; minute: number; }
interface TimeRange { start: TimeOfDay; end?: TimeOfDay; }

function to24Hour(hour12: number, minute: number, meridiem: string): TimeOfDay {
    let hour = hour12 % 12;
    if (/pm/i.test(meridiem)) hour += 12;
    return { hour, minute };
}

/**
 * Parses a time or time range out of freeform text, handling the two
 * shorthand styles CWB's pages use: "5:00 PM – 8:00 PM" (both times carry
 * their own meridiem) and "6:00–9:00 PM" (a single trailing meridiem applies
 * to both).
 */
function parseTimeRange(text: string): TimeRange | undefined {
    let m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
        return {
            start: to24Hour(parseInt(m[1], 10), parseInt(m[2], 10), m[3]),
            end: to24Hour(parseInt(m[4], 10), parseInt(m[5], 10), m[6]),
        };
    }
    m = text.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
        return {
            start: to24Hour(parseInt(m[1], 10), parseInt(m[2], 10), m[5]),
            end: to24Hour(parseInt(m[3], 10), parseInt(m[4], 10), m[5]),
        };
    }
    m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
        return { start: to24Hour(parseInt(m[1], 10), parseInt(m[2], 10), m[3]) };
    }
    return undefined;
}

interface DetailsPageOptions {
    idPrefix: string;
    summary: string;
    description: string;
    url: string;
    defaultLocation: string;
    context: string;
}

/**
 * Custom scraper for The Center for Wooden Boats (cwb.org). The site is
 * Squarespace but events aren't published through a Squarespace events
 * collection — each is a hand-authored standalone page. This ripper reads
 * a small set of known event pages directly and extracts date/time from
 * their (consistently formatted) details blocks / schedule headings.
 */
export default class CenterForWoodenBoatsRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const allEvents: RipperEvent[] = [];

        try {
            const html = await this.fetchPage(`${BASE_URL}/public-sail`);
            allEvents.push(...this.parsePublicSail(html));
        } catch (error) {
            allEvents.push({ type: "ParseError", reason: `Failed to fetch Sunday Public Sail page: ${error}`, context: "public-sail" });
        }

        try {
            const html = await this.fetchPage(`${BASE_URL}/50th`);
            allEvents.push(this.parseDetailsPageEvent(html, {
                idPrefix: "50th-anniversary-reunion",
                summary: "CWB 50th Anniversary Reunion",
                description: "A joyful evening on the waterfront celebrating 50 years of the Center for Wooden Boats — heavy appetizers, an open bar, live music, and community.",
                url: `${BASE_URL}/50th`,
                defaultLocation: VENUE_ADDRESS,
                context: "50th",
            }));
        } catch (error) {
            allEvents.push({ type: "ParseError", reason: `Failed to fetch 50th Anniversary Reunion page: ${error}`, context: "50th" });
        }

        try {
            const html = await this.fetchPage(`${BASE_URL}/dinneronthedocksw/sugartime`);
            allEvents.push(this.parseDetailsPageEvent(html, {
                idPrefix: "dinner-on-the-docks-sugartime-trio",
                summary: "Dinner on the Docks with Sugartime Trio",
                description: "A 21+ waterfront gathering celebrating CWB's 50th Anniversary season — Mediterranean buffet by Ravishing Radish Catering, drinks, and live music by Sugartime Trio. Advance reservations required.",
                url: `${BASE_URL}/dinneronthedocksw/sugartime`,
                defaultLocation: VENUE_ADDRESS,
                context: "dinner-on-the-docks",
            }));
        } catch (error) {
            allEvents.push({ type: "ParseError", reason: `Failed to fetch Dinner on the Docks page: ${error}`, context: "dinner-on-the-docks" });
        }

        try {
            const html = await this.fetchPage(`${BASE_URL}/wood-regatta`);
            allEvents.push(this.parseWoodRegatta(html));
        } catch (error) {
            allEvents.push({ type: "ParseError", reason: `Failed to fetch Norm Blanchard W.O.O.D. Regatta page: ${error}`, context: "wood-regatta" });
        }

        // Pages list the full-year schedule (including dates already past),
        // so drop past occurrences here rather than in each parse method.
        const now = LocalDate.now();
        const events = allEvents.filter(e => !("date" in e) || !e.date.toLocalDate().isBefore(now));

        for (const cal of ripper.config.calendars) {
            calendars[cal.name].events = events;
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter((e): e is RipperCalendarEvent => "date" in e),
            errors: calendars[key].events.filter((e): e is RipperError => "type" in e),
            parent: ripper.config,
            tags: calendars[key].tags,
        }));
    }

    private async fetchPage(url: string): Promise<string> {
        const res = await this.fetchFn(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; CalendarRipper/1.0)" }
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.text();
    }

    /**
     * Sunday Public Sail: a "<year> Public Sail Dates:" paragraph followed by
     * a pipe-separated "Month Day" list, e.g.
     * "April 12 | May 10 (Mother's Day) | June 14 (...) | July 26".
     */
    public parsePublicSail(html: string): RipperEvent[] {
        const root = parse(html);
        const paragraphs = root.querySelectorAll(".sqs-html-content p");
        const labelIndex = paragraphs.findIndex(p => /^\d{4}\s+Public Sail Dates:?$/i.test(p.text.trim()));
        if (labelIndex === -1 || !paragraphs[labelIndex + 1]) {
            return [{ type: "ParseError", reason: "Could not find 'Public Sail Dates' list on page", context: "public-sail" }];
        }

        const labelText = paragraphs[labelIndex].text.trim();
        const yearMatch = labelText.match(/^(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : LocalDate.now().year();

        const listText = paragraphs[labelIndex + 1].text.trim();
        const entries = listText.split("|").map(s => s.trim()).filter(Boolean);

        const events: RipperEvent[] = [];
        for (const entry of entries) {
            const m = entry.match(/^([A-Za-z]+)\s+(\d{1,2})/);
            if (!m || !(m[1] in MONTHS)) {
                events.push({ type: "ParseError", reason: `Could not parse Public Sail date entry: "${entry}"`, context: "public-sail" });
                continue;
            }
            const date = LocalDate.of(year, MONTHS[m[1]], parseInt(m[2], 10));
            const startDateTime = date.atTime(13, 0).atZone(TIMEZONE);
            const calEvent: RipperCalendarEvent = {
                id: `sunday-public-sail-${date.toString()}`,
                ripped: new Date(),
                date: startDateTime,
                duration: Duration.ofHours(4),
                summary: "Sunday Public Sail",
                description: "Free volunteer-crewed boat rides on Lake Union — sprit boats, steamboats, electric boats, schooners, ketches, yawls, and yachts. First-come, first-served sign-ups begin at 1:00 PM in front of the Wagner Education Center; boats depart between 1:15 PM and 5:00 PM.",
                location: VENUE_ADDRESS,
                url: `${BASE_URL}/public-sail`,
            };
            events.push(calEvent);
        }
        return events;
    }

    /**
     * Both the 50th Anniversary Reunion and Dinner on the Docks pages share
     * the same "details block" shape: a `<p>` whose `<strong>` children are,
     * in order, a full date ("Saturday, August 22, 2026"), a time or time
     * range, and (usually) a location — optionally followed by a
     * "Tickets: $NN" line elsewhere in the same paragraph.
     */
    public parseDetailsPageEvent(html: string, opts: DetailsPageOptions): RipperEvent {
        const root = parse(html);
        const detailsPara = root.querySelectorAll("p").find((p: HTMLElement) => {
            const strongs = p.querySelectorAll("strong");
            return strongs.length >= 2 && /^[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(strongs[0].text.trim());
        });
        if (!detailsPara) {
            return { type: "ParseError", reason: `Could not find a dated details block on the ${opts.context} page`, context: opts.context };
        }

        const lines = detailsPara.querySelectorAll("strong").map((s: HTMLElement) => s.text.trim());
        const dateMatch = lines[0].match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
        const timeRange = lines[1] ? parseTimeRange(lines[1]) : undefined;
        if (!dateMatch || !timeRange || !(dateMatch[1] in MONTHS)) {
            return { type: "ParseError", reason: `Could not parse date/time from ${opts.context} details block: ${lines.join(" | ")}`, context: opts.context };
        }

        const year = parseInt(dateMatch[3], 10);
        const month = MONTHS[dateMatch[1]];
        const day = parseInt(dateMatch[2], 10);
        const startDateTime = LocalDateTime.of(year, month, day, timeRange.start.hour, timeRange.start.minute).atZone(TIMEZONE);

        let duration = Duration.ofHours(3);
        if (timeRange.end) {
            const endDateTime = LocalDateTime.of(year, month, day, timeRange.end.hour, timeRange.end.minute).atZone(TIMEZONE);
            const seconds = startDateTime.until(endDateTime, ChronoUnit.SECONDS);
            if (seconds > 0) duration = Duration.ofSeconds(seconds);
        }

        const costLine = lines.find(l => /Tickets:/i.test(l));
        const costMatch = costLine?.match(/\$(\d+(?:\.\d{2})?)/);
        const locationLine = lines[2];

        const calEvent: RipperCalendarEvent = {
            id: `${opts.idPrefix}-${startDateTime.toLocalDate().toString()}`,
            ripped: new Date(),
            date: startDateTime,
            duration,
            summary: opts.summary,
            description: opts.description,
            location: locationLine || opts.defaultLocation,
            url: opts.url,
            ...(costMatch ? { cost: { min: parseFloat(costMatch[1]) } } : {}),
        };
        return calEvent;
    }

    /**
     * Norm Blanchard W.O.O.D. Regatta: date parsed from the page's own
     * heading ("Norm Blanchard W.O.O.D. Regatta: September 19th, 2026").
     * The registration start time is read from the first timed entry of the
     * published "Tentative Race Day Schedule" list, so a schedule change in
     * a future year is picked up automatically instead of silently going
     * stale; if that list isn't published yet ("Registration coming soon"),
     * fall back to the venue's typical 9:30 AM regatta-day start.
     */
    public parseWoodRegatta(html: string): RipperEvent {
        const root = parse(html);
        const heading = root.querySelectorAll("h2").find((h: HTMLElement) => /Norm Blanchard W\.O\.O\.D\. Regatta:/i.test(h.text));
        if (!heading) {
            return { type: "ParseError", reason: "Could not find Norm Blanchard W.O.O.D. Regatta date heading", context: "wood-regatta" };
        }

        const dateMatch = heading.text.match(/([A-Za-z]+)\s+(\d{1,2})[a-z]{0,2},\s+(\d{4})/);
        if (!dateMatch || !(dateMatch[1] in MONTHS)) {
            return { type: "ParseError", reason: `Could not parse date from heading: "${heading.text.trim()}"`, context: "wood-regatta" };
        }

        const year = parseInt(dateMatch[3], 10);
        const month = MONTHS[dateMatch[1]];
        const day = parseInt(dateMatch[2], 10);

        const scheduleHeading = root.querySelectorAll("h3").find((h: HTMLElement) => /Race Day Schedule/i.test(h.text));
        const scheduleItems = scheduleHeading?.nextElementSibling?.querySelectorAll("li").map((li: HTMLElement) => li.text.trim()) ?? [];
        let startTime: TimeOfDay | undefined;
        for (const item of scheduleItems) {
            const range = parseTimeRange(item);
            if (range) { startTime = range.start; break; }
        }
        if (!startTime) startTime = { hour: 9, minute: 30 };

        const startDateTime = LocalDateTime.of(year, month, day, startTime.hour, startTime.minute).atZone(TIMEZONE);

        const calEvent: RipperCalendarEvent = {
            id: `norm-blanchard-wood-regatta-${startDateTime.toLocalDate().toString()}`,
            ripped: new Date(),
            date: startDateTime,
            duration: Duration.ofHours(8).plusMinutes(30),
            summary: "Norm Blanchard W.O.O.D. Regatta",
            description: "The Center for Wooden Boats' annual Wooden Open & One Design regatta — a day of non-spinnaker racing on Lake Union, open to CWB members and local racers, followed by a BBQ and awards.",
            location: VENUE_ADDRESS,
            url: `${BASE_URL}/wood-regatta`,
        };
        return calEvent;
    }
}
