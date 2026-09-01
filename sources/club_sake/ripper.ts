import { ChronoUnit, Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const BASE_URL = "https://www.clubsake.com/events/list";
const MAX_PAGES = 20; // safety cap against unbounded pagination loops

const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// e.g. "Tue 01 Sep 2026 6:00PM - 8:00PM", or multi-day:
// "Sat 12 Sep 2026 8:00AM - Sun 13 Sep 2026 5:00PM" (end weekday/date group optional)
const DATE_TIME_RE = /^\w+\s+(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(?:\w+\s+(\d{1,2})\s+(\w{3})\s+(\d{4})\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

function to24Hour(hour: number, period: string): number {
    let h = hour % 12;
    if (period.toUpperCase() === 'PM') h += 12;
    return h;
}

export interface ParsedClubSakeEvent {
    id: string;
    title: string;
    url: string;
    date: ZonedDateTime;
    duration: Duration;
    location: string;
    category?: string;
}

/**
 * Parses a single `.card.card-hover` event card from the clubsake.com events
 * list. The category badge shares the anchor tag style with the title link,
 * so the title is specifically the *first* anchor inside `.flex-grow-1`
 * (document order) rather than any anchor.
 */
export function parseEventCard(card: HTMLElement, zone: ZoneId): ParsedClubSakeEvent | RipperError {
    const container = card.querySelector('.flex-grow-1');
    if (!container) {
        return { type: "ParseError", reason: "Event card missing .flex-grow-1 container", context: card.outerHTML.substring(0, 200) };
    }

    const titleAnchor = container.querySelector('a');
    const rawUrl = titleAnchor?.getAttribute('href');
    const title = titleAnchor?.textContent?.trim();
    if (!title || !rawUrl) {
        return { type: "ParseError", reason: "Event card missing title/url", context: container.innerHTML.substring(0, 200) };
    }

    const idMatch = rawUrl.match(/\/events\/(\d+)/);
    if (!idMatch) {
        return { type: "ParseError", reason: `Could not extract event id from URL: ${rawUrl}`, context: title };
    }
    const id = `club-sake-${idMatch[1]}`;

    let dateText: string | undefined;
    for (const div of container.querySelectorAll('div')) {
        const text = div.textContent?.trim();
        if (text && DATE_TIME_RE.test(text)) {
            dateText = text;
            break;
        }
    }
    if (!dateText) {
        return { type: "ParseError", reason: "Could not find date/time text on event card", context: title };
    }

    const m = dateText.match(DATE_TIME_RE)!;
    const [, dayStr, monStr, yearStr, startHStr, startMStr, startPeriod,
        endDayStr, endMonStr, endYearStr, endHStr, endMStr, endPeriod] = m;
    const month = MONTHS[monStr.toLowerCase()];
    if (!month) {
        return { type: "ParseError", reason: `Unrecognized month abbreviation: ${monStr}`, context: dateText };
    }

    const startHour = to24Hour(parseInt(startHStr, 10), startPeriod);
    const startMinute = parseInt(startMStr, 10);
    const endHour = to24Hour(parseInt(endHStr, 10), endPeriod);
    const endMinute = parseInt(endMStr, 10);

    // A multi-day card ("Sat 12 Sep 2026 8:00AM - Sun 13 Sep 2026 5:00PM")
    // carries its own end date; a same-day card falls back to the start date.
    let endMonth = month;
    let endDay = parseInt(dayStr, 10);
    let endYear = parseInt(yearStr, 10);
    if (endDayStr && endMonStr && endYearStr) {
        const parsedEndMonth = MONTHS[endMonStr.toLowerCase()];
        if (!parsedEndMonth) {
            return { type: "ParseError", reason: `Unrecognized end month abbreviation: ${endMonStr}`, context: dateText };
        }
        endMonth = parsedEndMonth;
        endDay = parseInt(endDayStr, 10);
        endYear = parseInt(endYearStr, 10);
    }

    let eventDate: ZonedDateTime;
    let eventEndDate: ZonedDateTime;
    try {
        eventDate = ZonedDateTime.of(
            LocalDateTime.of(parseInt(yearStr, 10), month, parseInt(dayStr, 10), startHour, startMinute),
            zone
        );
        eventEndDate = ZonedDateTime.of(
            LocalDateTime.of(endYear, endMonth, endDay, endHour, endMinute),
            zone
        );
    } catch (e) {
        return { type: "ParseError", reason: `Invalid date/time "${dateText}": ${e}`, context: title };
    }

    let durationMinutes = eventDate.until(eventEndDate, ChronoUnit.MINUTES);
    if (durationMinutes <= 0) durationMinutes += 24 * 60; // same-day card spanning midnight
    const duration = Duration.ofMinutes(durationMinutes);

    const location = container.querySelector('.font-size-sm')?.textContent?.trim();
    const category = container.querySelector('a.badge-primary')?.textContent?.trim();

    return {
        id,
        title,
        url: rawUrl,
        date: eventDate,
        duration,
        location: location || "Seattle SAKE Paddling Club, Seattle, WA",
        category: category || undefined,
    };
}

export default class ClubSakeRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const today = LocalDate.now(zone);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        const seen = new Set<string>();

        for (let page = 1; page <= MAX_PAGES; page++) {
            const res = await this.fetchFn(`${BASE_URL}?page=${page}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!res.ok) {
                throw Error(`${res.status} ${res.statusText}`);
            }
            const html = parse(await res.text());
            const cards = html.querySelectorAll('.card.card-hover');
            if (cards.length === 0) break; // one past the last page

            for (const card of cards) {
                const parsed = parseEventCard(card, zone);
                if ('type' in parsed) {
                    errors.push(parsed);
                    continue;
                }
                // Manually-flagged cancellations ("CANCELED - ...", "*CANCELLED*"),
                // not to be confused with the "Closed" registration badge, which
                // just means signups have closed for a session that still happens.
                if (/cancel/i.test(parsed.title)) continue;
                if (parsed.date.toLocalDate().isBefore(today)) continue;
                if (seen.has(parsed.id)) continue;
                seen.add(parsed.id);

                events.push({
                    id: parsed.id,
                    ripped: new Date(),
                    date: parsed.date,
                    duration: parsed.duration,
                    summary: parsed.title,
                    description: parsed.category,
                    location: parsed.location,
                    url: parsed.url,
                });
            }
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }
}
