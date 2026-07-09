import { Duration, LocalDateTime, ZonedDateTime, ZoneId, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

const BASE_URL = "https://www.discoverslu.com";
const AJAX_URL = "https://www.discoverslu.com/wp-admin/admin-ajax.php";

const MONTH_MAP: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse the "event-day" heading like "Sunday July 9, 2026" to extract the specific date.
 * Returns null if the heading cannot be parsed.
 */
function parseEventDayFull(heading: string): { year: number; month: number; day: number } | null {
    // "Weekday Month Day, Year" — e.g., "Thursday July 9, 2026"
    const match = heading.match(/\w+\s+(\w+)\s+(\d{1,2}),\s*(\d{4})/);
    if (!match) return null;
    const month = MONTH_MAP[match[1].toLowerCase()];
    if (!month) return null;
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);
    return { year, month, day };
}

/**
 * Extract the start time from the feature__meta--date field.
 * The field now shows series ranges or time ranges rather than a single datetime.
 * Handles:
 *   "July 9, 5 - 9 pm"                           — time range, end has am/pm
 *   "July 11, 9:30 - 11 am"                       — time range with minutes
 *   "Every Sat, Jun 6 - Nov 21, 10 am - 3 pm"    — both endpoints explicit am/pm
 *   "Every Mon, Feb 9 - Jul 20, 6:30 pm"          — single time at end
 *   "June 12 - August 14"                         — no time → default 10 am (guessed)
 *   "July 13-19"                                  — no time → default 10 am (guessed)
 */
export function extractTimeFromMeta(text: string): { hour: number; minute: number; timeGuessed: boolean } {
    // "H:MM am/pm - ..." or "H am/pm - ..." (start has explicit am/pm)
    const bothAmPm = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*\d{1,2}(?::\d{2})?\s*(am|pm)/i);
    if (bothAmPm) {
        let hour = parseInt(bothAmPm[1]);
        const minute = bothAmPm[2] ? parseInt(bothAmPm[2]) : 0;
        const ampm = bothAmPm[3].toLowerCase();
        if (ampm === "pm" && hour !== 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        return { hour, minute, timeGuessed: false };
    }

    // "H:MM - H am/pm" or "H - H am/pm" (only end has am/pm; infer start from end)
    const rangeEndAmPm = text.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::\d{2})?\s*(am|pm)/i);
    if (rangeEndAmPm) {
        let hour = parseInt(rangeEndAmPm[1]);
        const minute = rangeEndAmPm[2] ? parseInt(rangeEndAmPm[2]) : 0;
        const endHour = parseInt(rangeEndAmPm[3]);
        const endAmPm = rangeEndAmPm[4].toLowerCase();
        if (endAmPm === "pm") {
            if (hour === 12) {
                // 12 pm = noon, correct as-is
            } else if (hour > endHour) {
                // e.g., "11 - 1 pm": start is 11am, not 11pm — don't add 12
            } else {
                hour += 12;
            }
        } else {
            if (hour === 12) hour = 0; // 12 am = midnight
        }
        return { hour, minute, timeGuessed: false };
    }

    // Single time: "H:MM am/pm" anywhere in the string
    const singleTime = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (singleTime) {
        let hour = parseInt(singleTime[1]);
        const minute = parseInt(singleTime[2]);
        const ampm = singleTime[3].toLowerCase();
        if (ampm === "pm" && hour !== 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        return { hour, minute, timeGuessed: false };
    }

    return { hour: 10, minute: 0, timeGuessed: true };
}

/**
 * Parse events from the HTML fragment returned by the AJAX endpoint.
 * Walks children in document order, tracking the specific event date from
 * h2.event-day headings. The feature__meta--date field is used only for
 * time extraction (it now shows series ranges, not individual dates).
 */
export function parseEventsFromHtml(
    html: HTMLElement,
    seenEvents: Set<string>,
    defaultYear: number,
): RipperEvent[] {
    const events: RipperEvent[] = [];
    let currentDate: { year: number; month: number; day: number } | null = null;

    for (const node of html.childNodes) {
        const el = node as HTMLElement;
        if (!el.querySelectorAll) continue; // skip text nodes

        // Day heading container: <div class="site-width"><h2 class="event-day">...</h2></div>
        const heading = el.querySelector?.("h2.event-day");
        if (heading) {
            const parsed = parseEventDayFull(heading.textContent.trim());
            if (parsed) currentDate = parsed;
            continue;
        }

        // Event card container: <div class="site-width"><div class="grid...">...</div></div>
        const cards = el.querySelectorAll?.(".feature.full");
        if (!cards || cards.length === 0) continue;

        const dateForCards = currentDate;

        for (const card of cards) {
            try {
                const titleLink = card.querySelector("h3 a");
                if (!titleLink) continue;

                const title = titleLink.textContent.trim();
                const href = titleLink.getAttribute("href") || "";
                const eventUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

                const slug = href.includes("/events/")
                    ? href.replace(/.*\/events\//, "").replace(/\/$/, "")
                    : href.replace(/^.*\//, "").replace(/\/$/, "") || title.toLowerCase().replace(/\s+/g, "-");
                const eventId = `discover-slu-${slug}`;

                if (seenEvents.has(eventId)) continue;
                seenEvents.add(eventId);

                const metaDateEl = card.querySelector(".feature__meta--date");
                if (!metaDateEl && !dateForCards) {
                    events.push({
                        type: "ParseError",
                        reason: `No date tag found for "${title}"`,
                        context: eventId,
                    });
                    continue;
                }

                const metaDateText = metaDateEl?.textContent.trim() ?? "";
                const timeInfo = extractTimeFromMeta(metaDateText);

                let year: number;
                let month: number;
                let day: number;

                if (dateForCards) {
                    year = dateForCards.year;
                    month = dateForCards.month;
                    day = dateForCards.day;
                } else {
                    // Fallback when no preceding day heading: extract date from meta text
                    const dateFallback = metaDateText.match(/^([A-Za-z]+)\s+(\d{1,2})/);
                    if (dateFallback) {
                        const m = MONTH_MAP[dateFallback[1].toLowerCase()];
                        if (m) {
                            month = m;
                            day = parseInt(dateFallback[2]);
                            year = defaultYear;
                        } else {
                            events.push({
                                type: "ParseError",
                                reason: `Could not parse date from "${metaDateText}" for "${title}"`,
                                context: eventId,
                            });
                            continue;
                        }
                    } else {
                        events.push({
                            type: "ParseError",
                            reason: `Could not parse date from "${metaDateText}" for "${title}"`,
                            context: eventId,
                        });
                        continue;
                    }
                }

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year!, month!, day!, timeInfo.hour, timeInfo.minute),
                    ZoneId.of("America/Los_Angeles"),
                );

                const locationEl = card.querySelector(".feature__meta--location");
                const locationText = locationEl?.textContent.trim().replace(/^@\s*/, "") || undefined;
                const location = locationText ? `${locationText}, South Lake Union, Seattle, WA` : "South Lake Union, Seattle, WA";

                const imgEl = card.querySelector(".feature__image img");
                const imgSrc = imgEl?.getAttribute("src");
                const image = imgSrc ? (imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`) : undefined;

                const event: RipperCalendarEvent = {
                    id: eventId,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(2),
                    summary: title,
                    location,
                    url: eventUrl,
                    imageUrl: image,
                };

                events.push(event);

                const unknownFields: UncertaintyField[] = timeInfo.timeGuessed
                    ? ["startTime", "duration"]
                    : ["duration"];
                const uncertainty: UncertaintyError = {
                    type: "Uncertainty",
                    reason: timeInfo.timeGuessed
                        ? `Date tag had no time ("${metaDateText}")`
                        : "Discover SLU listing has a start time but no end time",
                    source: "discover_slu",
                    unknownFields,
                    event,
                    partialFingerprint: simpleHash(metaDateText),
                };
                events.push(uncertainty);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${errorMessage}`,
                    context: undefined,
                });
            }
        }
    }

    return events;
}

export default class DiscoverSLURipper implements IRipper {
    private seenEvents = new Set<string>();

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const now = LocalDateTime.now();
        const defaultYear = now.year();

        const allEvents: RipperEvent[] = [];

        const lookaheadDays = ripper.config.lookahead
            ? now.until(now.plus(ripper.config.lookahead), ChronoUnit.DAYS)
            : 30;

        const weeksNeeded = Math.ceil(lookaheadDays / 7);
        let currentDate = now;

        for (let i = 0; i < weeksNeeded; i++) {
            const dateStr = `${currentDate.year()}-${String(currentDate.monthValue()).padStart(2, "0")}-${String(currentDate.dayOfMonth()).padStart(2, "0")}`;

            try {
                const res = await fetchFn(AJAX_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: `action=get_events_ajax&start_date=${dateStr}&direction=DESC`,
                });

                if (!res.ok) {
                    allEvents.push({
                        type: "ParseError",
                        reason: `AJAX request for ${dateStr} returned HTTP ${res.status}`,
                        context: dateStr,
                    });
                    break;
                }

                const data = await res.json() as { status: string; start_date: string; events_html: string };

                if (data.status !== "pass") {
                    break;
                }

                const weekHtml = parse(data.events_html);
                const events = parseEventsFromHtml(weekHtml, this.seenEvents, currentDate.year());
                allEvents.push(...events);

                const nextDate = new Date(data.start_date);
                currentDate = LocalDateTime.of(
                    nextDate.getFullYear(),
                    nextDate.getMonth() + 1,
                    nextDate.getDate(),
                    0, 0,
                ).plusDays(7);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                allEvents.push({
                    type: "ParseError",
                    reason: `AJAX request failed for ${dateStr}: ${msg}`,
                    context: dateStr,
                });
                break;
            }
        }

        const cal = ripper.config.calendars[0];
        if (!cal) {
            throw new Error("No calendars configured for discover-slu ripper");
        }
        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: allEvents.filter(e => "type" in e) as RipperError[],
            parent: ripper.config,
            tags: cal.tags || [],
        }];
    }
}
