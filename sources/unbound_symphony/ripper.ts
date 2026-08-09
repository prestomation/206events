import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

const BASE_URL = "https://www.unboundsymphony.org";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

const MONTHS: Record<string, number> = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
};

// Unbound Symphony has no events collection/calendar platform — each event
// lives on its own hand-built Squarespace page with its own layout. Each
// known page gets a dedicated parser below rather than one generic scraper.
const EVENT_PAGES: { path: string; parse: (html: HTMLElement, url: string) => RipperEvent[] }[] = [
    { path: "/summer-popup", parse: parseSummerPopupPage },
    { path: "/summer-festival", parse: parseSummerFestivalPage },
];

// Infer the year for a month/day with no explicit year: if that date already
// passed more than a week ago this year, assume it refers to next year.
function inferYear(month: number, day: number): number | null {
    const now = LocalDate.now();
    let year = now.year();
    try {
        const candidate = LocalDate.of(year, month, day);
        if (candidate.isBefore(now.minusDays(7))) year += 1;
    } catch {
        return null;
    }
    return year;
}

// Parses "12:00–1:00 PM" style ranges where a single AM/PM suffix applies to
// both the start and end time.
function parseTimeRange(text: string): { hour: number; minute: number; durationMinutes: number } | null {
    const normalized = text.replace(/–/g, "-").trim();
    const m = normalized.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    const [, startHStr, startMStr, endHStr, endMStr, period] = m;

    const to24 = (hStr: string): number => {
        let h = parseInt(hStr, 10);
        const p = period.toLowerCase();
        if (p === "pm" && h !== 12) h += 12;
        if (p === "am" && h === 12) h = 0;
        return h;
    };

    const startHour = to24(startHStr);
    const endHour = to24(endHStr);
    const startMinute = parseInt(startMStr, 10);
    const endMinute = parseInt(endMStr, 10);
    const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (durationMinutes <= 0) return null;
    return { hour: startHour, minute: startMinute, durationMinutes };
}

// Parses https://www.unboundsymphony.org/summer-popup — the Met Tract Plaza
// Summer Sounds pop-up series. The page lists three labeled paragraphs
// ("📍 Location", "📅 Dates", "🕛 Time") shared across every date, plus one
// paragraph per date with the performers/program for that date.
export function parseSummerPopupPage(html: HTMLElement, url: string): RipperEvent[] {
    // Scope to <main> — Squarespace reuses "p.sqsrte-large" in footer/nav
    // text blocks outside the page's actual content.
    const contentRoot = html.querySelector("main") ?? html;
    const paragraphs = contentRoot.querySelectorAll("p.sqsrte-large");

    const locationPara = paragraphs.find(p => /\bLocation\b/i.test((p.text.split("\n")[0] || "")));
    const datesPara = paragraphs.find(p => /\bDates\b/i.test((p.text.split("\n")[0] || "")));
    const timePara = paragraphs.find(p => /\bTime\b/i.test((p.text.split("\n")[0] || "")));

    if (!locationPara || !datesPara) {
        return [{
            type: "ParseError",
            reason: "Could not find Location/Dates paragraphs on summer pop-up page",
            context: url,
        }];
    }

    // The location paragraph has a label line, a descriptive line ("1200
    // Fifth, Upper Plaza (outside the iconic IBM Building)"), and a street
    // address line. Geocoding the descriptive text alongside the address
    // confuses Nominatim, so use only the cleaned street address for
    // `location` and fold the descriptive line into the venue note instead.
    const locationParts = locationPara.text.split("\n");
    if (locationParts.length < 3) {
        return [{
            type: "ParseError",
            reason: `Location paragraph missing expected venue descriptor/address lines: "${locationPara.text}"`,
            context: url,
        }];
    }
    const [, venueDescriptor, addressLine] = locationParts;
    const location = addressLine
        .replace(/^Address:\s*/i, "")
        .replace(/Seattle\s+(\d{5})/i, "Seattle, WA $1");

    const datesLine = datesPara.text.split("\n")[1] || "";
    const dateMatches = [...datesLine.matchAll(/([A-Za-z]+)\s+(\d{1,2})/g)]
        .map(m => ({ monthName: m[1], month: MONTHS[m[1]], day: parseInt(m[2], 10) }))
        .filter((d): d is { monthName: string; month: number; day: number } => d.month !== undefined);

    if (dateMatches.length === 0) {
        return [{
            type: "ParseError",
            reason: `Could not parse any dates from "${datesLine}"`,
            context: url,
        }];
    }

    const timeLine = timePara?.text.split("\n")[1];
    const parsedTime = timeLine ? parseTimeRange(timeLine) : null;

    const results: RipperEvent[] = [];
    for (const { monthName, month, day } of dateMatches) {
        const year = inferYear(month, day);
        if (year === null) {
            results.push({
                type: "ParseError",
                reason: `Invalid date ${monthName} ${day} on summer pop-up page`,
                context: url,
            });
            continue;
        }

        const hour = parsedTime?.hour ?? 12;
        const minute = parsedTime?.minute ?? 0;
        const durationMinutes = parsedTime?.durationMinutes ?? 60;

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(LocalDateTime.of(year, month, day, hour, minute), TIMEZONE);
        } catch (error) {
            results.push({
                type: "ParseError",
                reason: `Invalid date for pop-up concert ${monthName} ${day} ${year}: ${error}`,
                context: url,
            });
            continue;
        }

        const programNote = paragraphs.find(p => p.text.startsWith(`${monthName} ${day} `))?.text;
        const description = [venueDescriptor, programNote].filter(Boolean).join("\n\n");

        const id = `unbound-symphony-met-tract-plaza-${date.toLocalDate().toString()}`;
        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes),
            summary: "Unbound Symphony Chamber Music",
            description: description || undefined,
            location,
            url,
            cost: { min: 0 },
        };
        results.push(event);

        if (!parsedTime) {
            const unknownFields: UncertaintyField[] = ["startTime", "duration"];
            results.push({
                type: "Uncertainty",
                reason: `Could not parse concert time from "${timeLine ?? "(missing)"}"`,
                source: "unbound_symphony",
                unknownFields,
                event,
                partialFingerprint: simpleHash(`${datesLine}|${timeLine ?? ""}`),
            });
        }
    }

    return results;
}

// Parses https://www.unboundsymphony.org/summer-festival — the annual
// multi-day Summer Orchestra Festival. The page has no ICS/API. The date
// range lives in a heading block ("... is scheduled for\n<dates>"). A second
// heading block naming the venue is published once the venue is confirmed
// (historically alongside the dates); early in the announcement cycle the
// page carries only the date-range heading and a note that further details
// (including the venue) are coming later, so the venue heading is optional
// and its absence is surfaced as a location Uncertainty rather than a
// ParseError.
export function parseSummerFestivalPage(html: HTMLElement, url: string): RipperEvent[] {
    // Scope to <main> — a bare "h2" query would also match unrelated
    // headings in the site header/footer.
    const contentRoot = html.querySelector("main") ?? html;
    const headings = contentRoot.querySelectorAll("h2");
    const scheduleHeading = headings.find(h => /is scheduled for/i.test(h.text));

    if (!scheduleHeading) {
        return [{
            type: "ParseError",
            reason: "Could not find festival schedule heading block",
            context: url,
        }];
    }

    const venueHeading = headings.find(h => h !== scheduleHeading && h.text.trim().length > 0);

    const [titlePrefixRaw, dateLine] = scheduleHeading.text.split("\n");
    const titleMatch = (titlePrefixRaw || "").match(/^(.*?)\s+is scheduled for$/i);
    const title = titleMatch ? titleMatch[1].trim() : "Unbound Symphony Summer Festival";

    const dateMatch = (dateLine || "").match(/^([A-Za-z]+)\s+(\d{1,2})-(\d{1,2}),\s*(\d{4})$/);
    if (!dateMatch) {
        return [{
            type: "ParseError",
            reason: `Could not parse festival date range from "${dateLine}"`,
            context: url,
        }];
    }
    const [, monthName, startDayStr, endDayStr, yearStr] = dateMatch;
    const month = MONTHS[monthName];
    if (!month) {
        return [{
            type: "ParseError",
            reason: `Unrecognized month "${monthName}" in festival date range`,
            context: url,
        }];
    }
    const startDay = parseInt(startDayStr, 10);
    const endDay = parseInt(endDayStr, 10);
    const year = parseInt(yearStr, 10);

    if (endDay < startDay) {
        return [{
            type: "ParseError",
            reason: `Invalid festival date range: end day ${endDay} precedes start day ${startDay}`,
            context: url,
        }];
    }

    const location = venueHeading
        ? venueHeading.text.split("\n").map(l => l.trim()).filter(Boolean).join(", ")
        : undefined;

    let date: ZonedDateTime;
    try {
        // No daily start time is published; 10am is a placeholder pending
        // resolution (flagged via UncertaintyError below).
        date = ZonedDateTime.of(LocalDateTime.of(year, month, startDay, 10, 0), TIMEZONE);
    } catch (error) {
        return [{
            type: "ParseError",
            reason: `Invalid festival start date ${monthName} ${startDay} ${year}: ${error}`,
            context: url,
        }];
    }

    const durationDays = endDay - startDay + 1;
    const id = `unbound-symphony-summer-festival-${date.toLocalDate().toString()}`;
    const event: RipperCalendarEvent = {
        id,
        ripped: new Date(),
        date,
        duration: Duration.ofDays(durationDays),
        summary: title,
        description: "Multi-day gathering of women and female-identifying orchestral musicians from the Pacific Northwest, concluding with a public performance.",
        location,
        url,
    };

    const unknownFields: UncertaintyField[] = location ? ["startTime"] : ["startTime", "location"];
    const reason = location
        ? "Festival page lists only a date range, no daily start time"
        : "Festival page lists only a date range — venue not yet announced and no daily start time";

    return [
        event,
        {
            type: "Uncertainty",
            reason,
            source: "unbound_symphony",
            unknownFields,
            event,
            partialFingerprint: simpleHash(`${dateLine}|${location ?? ""}`),
        },
    ];
}

export default class UnboundSymphonyRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const fetchFn = getFetchForConfig(ripper.config);
        const allEvents: RipperEvent[] = [];
        for (const page of EVENT_PAGES) {
            const url = `${BASE_URL}${page.path}`;
            try {
                const res = await fetchFn(url, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; CalendarRipper/1.0)" },
                });
                if (!res.ok) {
                    allEvents.push({
                        type: "ParseError",
                        reason: `HTTP ${res.status} fetching ${url}`,
                        context: page.path,
                    });
                    continue;
                }
                const html = parse(await res.text());
                allEvents.push(...page.parse(html, res.url || url));
            } catch (error) {
                allEvents.push({
                    type: "ParseError",
                    reason: `Error fetching ${url}: ${error}`,
                    context: page.path,
                });
            }
        }

        for (const cal of ripper.config.calendars) {
            calendars[cal.name].events = allEvents;
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags,
        }));
    }
}
