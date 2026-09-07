import { ChronoUnit, Duration, LocalDate, LocalDateTime, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from "node-html-parser";

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const LOCATION = "The Watershed Pub & Kitchen, 10104 3rd Ave NE, Seattle, WA 98125";
const BASE_URL = "https://www.watershedpub.com";

// A one-time-event card carrying a multi-month "date range" (e.g. a
// seasonal special running June through September) isn't a discrete,
// bookable event a reader would put on a calendar — it's ongoing venue
// copy. Anything longer than this is treated as a promo and skipped
// rather than published as one giant event.
const MAX_EVENT_SPAN_DAYS = 14;

const MONTHS: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const DATE_RE = /([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/g;
const TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)/gi;

function parseDate(match: RegExpMatchArray): LocalDate | undefined {
    const month = MONTHS[match[1]];
    if (!month) return undefined;
    return LocalDate.of(parseInt(match[3]), month, parseInt(match[2]));
}

function parseTime(match: RegExpMatchArray): LocalTime {
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return LocalTime.of(hour, minute);
}

export type BlurbDateResult =
    | { kind: "skip" }
    | { kind: "error"; reason: string }
    | { kind: "ok"; date: ZonedDateTime; duration: Duration };

/**
 * The site's "blurb-date" text follows one of a handful of shapes:
 *   ""                                              -> perpetually-recurring blurb, no occurrence to publish
 *   "Nov 26, 2026"                                   -> closure/hours notice, no time given
 *   "Dec 24, 2026 - Jan 01, 2027"                     -> closure/hours notice, no time given
 *   "Sep 23, 2026 @ 6:00 PM"                          -> single start, no end
 *   "Sep 20, 2026 @ 4:00 PM - 8:00 PM"                -> single day, start/end time
 *   "Sep 04, 2026 @ 11:00 AM - Sep 10, 2026 @ 10:00 PM" -> multi-day, start/end date+time
 * The presence of "@" is what separates a real, timed event from an
 * untimed closure/hours notice or a months-long seasonal promo (those
 * also lack "@" or, when they do have one on each date, span far too
 * long to be a single occurrence - see MAX_EVENT_SPAN_DAYS).
 */
export function parseBlurbDate(text: string): BlurbDateResult {
    const trimmed = text.trim();
    if (!trimmed || !trimmed.includes("@")) return { kind: "skip" };

    const dates = [...trimmed.matchAll(DATE_RE)];
    const times = [...trimmed.matchAll(TIME_RE)];
    if (dates.length === 0) return { kind: "error", reason: `No date found in "${trimmed}"` };

    const startDate = parseDate(dates[0]);
    if (!startDate) return { kind: "error", reason: `Unrecognized month in "${trimmed}"` };

    if (dates.length === 1 && times.length === 1) {
        const start = ZonedDateTime.of(LocalDateTime.of(startDate, parseTime(times[0])), TIMEZONE);
        return { kind: "ok", date: start, duration: Duration.ofHours(2) };
    }

    if (dates.length === 1 && times.length === 2) {
        const startTime = parseTime(times[0]);
        let endTime = parseTime(times[1]);
        const start = ZonedDateTime.of(LocalDateTime.of(startDate, startTime), TIMEZONE);
        let seconds = startTime.toSecondOfDay() < endTime.toSecondOfDay()
            ? endTime.toSecondOfDay() - startTime.toSecondOfDay()
            : endTime.toSecondOfDay() - startTime.toSecondOfDay() + 24 * 3600;
        return { kind: "ok", date: start, duration: Duration.ofSeconds(seconds) };
    }

    if (dates.length === 2 && times.length === 2) {
        const endDate = parseDate(dates[1]);
        if (!endDate) return { kind: "error", reason: `Unrecognized month in "${trimmed}"` };
        const start = ZonedDateTime.of(LocalDateTime.of(startDate, parseTime(times[0])), TIMEZONE);
        const end = ZonedDateTime.of(LocalDateTime.of(endDate, parseTime(times[1])), TIMEZONE);
        const seconds = start.until(end, ChronoUnit.SECONDS);
        if (seconds <= 0) return { kind: "error", reason: `End before start in "${trimmed}"` };
        if (seconds > MAX_EVENT_SPAN_DAYS * 24 * 3600) return { kind: "skip" };
        return { kind: "ok", date: start, duration: Duration.ofSeconds(seconds) };
    }

    return { kind: "error", reason: `Unrecognized date format "${trimmed}"` };
}

export default class WatershedPubRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const results: RipperEvent[] = [];
        const cards = html.querySelectorAll(".section.events");

        for (const card of cards) {
            const slug = card.getAttribute("id");
            if (!slug) continue;
            if (this.seenEvents.has(slug)) continue;

            const titleEl = card.querySelector("h2");
            const title = titleEl?.textContent.trim();
            if (!title) continue;

            const dateEl = card.querySelector(".blurb-date");
            const parsed = parseBlurbDate(dateEl?.textContent || "");
            if (parsed.kind === "skip") continue;

            if (parsed.kind === "error") {
                this.seenEvents.add(slug);
                results.push({ type: "ParseError", reason: parsed.reason, context: title });
                continue;
            }

            const blurbEl = card.querySelector(".blurb");
            const paragraphs = blurbEl?.querySelectorAll("p").map(p => p.textContent.trim()).filter(Boolean) || [];
            const description = paragraphs.length ? paragraphs.join("\n\n") : blurbEl?.textContent.trim() || undefined;
            const imageUrl = card.querySelector("img")?.getAttribute("src");

            const event: RipperCalendarEvent = {
                id: `watershed-pub-${slug}-${parsed.date.toLocalDate()}`,
                ripped: new Date(),
                date: parsed.date,
                duration: parsed.duration,
                summary: title,
                description,
                location: LOCATION,
                url: `${BASE_URL}/events#${slug}`,
                imageUrl,
            };

            this.seenEvents.add(slug);
            results.push(event);
        }

        return results;
    }
}
