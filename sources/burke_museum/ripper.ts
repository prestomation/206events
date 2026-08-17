import { Duration, LocalDate, LocalDateTime, DayOfWeek, TemporalAdjusters, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent, UncertaintyError } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

const LOCATION = "Burke Museum, 4300 15th Ave NE, Seattle, WA 98105";
const BASE_URL = "https://www.burkemuseum.org";

// Months for parsing date strings
const MONTHS: Record<string, number> = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
};

/**
 * Parse a time string like "5 p.m.", "10 a.m.", "10:45 a.m." into hour and minute.
 */
function parseTime(timeStr: string): { hour: number; minute: number } | null {
    // Normalize various dash/space patterns
    const normalized = timeStr.trim().toLowerCase().replace(/\./g, '');
    const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (!match) return null;
    let hour = parseInt(match[1]);
    const minute = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3];
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { hour, minute };
}

/**
 * Parse a time range like "5–8 p.m.", "10 a.m. – 5 p.m.", "10–10:45 a.m."
 * Returns start time and duration in hours.
 */
function parseTimeRange(timeStr: string): { start: { hour: number; minute: number }; durationHours: number } | null {
    // Normalize dashes and whitespace
    const normalized = timeStr.trim().replace(/\s+/g, ' ');

    // Match time ranges: "5–8 p.m.", "10 a.m. – 5 p.m.", "10–10:45 a.m."
    const rangeMatch = normalized.match(/(\d{1,2}(?::\d{2})?)\s*(?:a\.?m\.?|p\.?m\.?)?\s*[–\-—]\s*(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)/i);
    if (rangeMatch) {
        const startTimeStr = rangeMatch[1];
        const endTimeStr = rangeMatch[2];
        const endAmPm = rangeMatch[3].replace(/\./g, '').toLowerCase();

        // Check if start has its own am/pm
        const startAmPmMatch = normalized.match(/(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)\s*[–\-—]/i);
        const startAmPm = startAmPmMatch ? startAmPmMatch[2].replace(/\./g, '').toLowerCase() : endAmPm;

        const startTime = parseTime(`${startTimeStr} ${startAmPm}`);
        const endTime = parseTime(`${endTimeStr} ${endAmPm}`);

        if (startTime && endTime) {
            let durationMinutes = (endTime.hour * 60 + endTime.minute) - (startTime.hour * 60 + startTime.minute);
            if (durationMinutes < 0) durationMinutes += 24 * 60; // handles overnight ranges
            if (durationMinutes === 0) return { start: startTime, durationHours: 2 }; // fallback for equal start/end
            return { start: startTime, durationHours: durationMinutes / 60 };
        }
    }

    // Single time: "5 p.m.", "6 p.m."
    const singleTime = parseTime(normalized);
    if (singleTime) {
        return { start: singleTime, durationHours: 2 }; // default 2 hour duration
    }

    return null;
}

/**
 * Parse a date string like "Monday, February 23, 2026" into year, month, day.
 */
function parseDate(dateStr: string): { year: number; month: number; day: number } | null {
    const trimmed = dateStr.trim();

    // "DayOfWeek, Month Day, Year"
    const withWeekday = trimmed.match(/(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (withWeekday) {
        const month = MONTHS[withWeekday[1].toLowerCase()];
        if (!month) return null;
        return { year: parseInt(withWeekday[3]), month, day: parseInt(withWeekday[2]) };
    }

    // "Month Day, Year" with no weekday prefix (seen on single-date listings,
    // e.g. "September 16, 2026\n6:30 p.m."). Anchored so it doesn't swallow
    // the leading "Daily"/"Weekly" word on recurring-range listings, which
    // are handled by the dash-range fallback in parseEvents instead.
    const noWeekday = trimmed.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (noWeekday) {
        const month = MONTHS[noWeekday[1].toLowerCase()];
        if (month) {
            return { year: parseInt(noWeekday[3]), month, day: parseInt(noWeekday[2]) };
        }
    }

    return null;
}

/**
 * Parse the first date out of a multi-date class-series listing, e.g.
 * "This class series meets four times. You can register for any
 * combination of dates you'd like to attend: September 25, October 2,
 * October 9, and October 16, 2026" (Burke "Wellness Class" listings).
 * The dates are listed chronologically, so the first "Month Day" match
 * paired with the (single, shared) trailing year is the series start.
 * Returns null unless at least two dates are present, so it never
 * misfires on ordinary single-date listings (those are handled by
 * `parseDate` before this is tried).
 */
function parseFirstOfMultiDateSeries(dateStr: string): { year: number; month: number; day: number } | null {
    const monthDayPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/gi;
    const matches = [...dateStr.matchAll(monthDayPattern)];
    if (matches.length < 2) return null;

    const yearMatch = dateStr.match(/\b(\d{4})\b/);
    if (!yearMatch) return null;

    const month = MONTHS[matches[0][1].toLowerCase()];
    if (!month) return null;

    return { year: parseInt(yearMatch[1]), month, day: parseInt(matches[0][2]) };
}

export default class BurkeMuseumRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        const eventCards = html.querySelectorAll('.views-row');

        for (const card of eventCards) {
            try {
                // Extract title and URL
                const titleLink = card.querySelector('.views-field-title-1 a');
                if (!titleLink) continue;

                const title = titleLink.textContent.trim();
                const href = titleLink.getAttribute('href') || '';
                const eventUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

                // Use the URL slug as a stable ID
                const slug = href.replace(/^\/calendar\//, '').replace(/\/$/, '');
                const eventId = `burke-${slug}`;

                if (this.seenEvents.has(eventId)) continue;
                this.seenEvents.add(eventId);

                // Extract date/time text
                const dateTimeField = card.querySelector('.views-field-field-display-date-time-1');
                if (!dateTimeField) {
                    events.push({
                        type: "ParseError",
                        reason: `No date/time field found for "${title}"`,
                        context: eventId
                    });
                    continue;
                }

                const dateTimeText = dateTimeField.textContent.trim();

                // Skip events with vague/recurring dates we can't parse, and
                // postponed events with no rescheduled date yet — neither has
                // an actionable date, so a ParseError would just be noise.
                if (/monthly event|see each.*listing|event is postponed/i.test(dateTimeText)) {
                    continue;
                }

                // Synthesize Free First Thursday — the website shows it with no specific date,
                // so we generate concrete events for upcoming first Thursdays
                if (/first \w+ of each month/i.test(dateTimeText)) {
                    const timeResult = parseTimeRange(dateTimeText);
                    const fftEvents = this.synthesizeFreeFirstThursday(
                        title, eventUrl, eventId, dateTimeText, timeResult,
                        card, date
                    );
                    events.push(...fftEvents);
                    continue;
                }

                // Try to extract a specific date
                let parsedDate: { year: number; month: number; day: number } | null = null;

                // Try standard date format first: "DayOfWeek, Month Day, Year"
                parsedDate = parseDate(dateTimeText);

                // Try date range format: "Daily January 6 – March 15, 2026" - use start date
                if (!parsedDate) {
                    const rangeMatch = dateTimeText.match(/(\w+)\s+(\d{1,2})\s*[–\-—]/i);
                    const yearMatch = dateTimeText.match(/(\d{4})/);
                    if (rangeMatch && yearMatch) {
                        const month = MONTHS[rangeMatch[1].toLowerCase()];
                        if (month) {
                            parsedDate = { year: parseInt(yearMatch[1]), month, day: parseInt(rangeMatch[2]) };
                        }
                    }
                }

                // Multi-date class series: "September 25, October 2, October 9,
                // and October 16, 2026" — a recurring class listing all of its
                // session dates in one paragraph instead of a single date. Use
                // the first listed date as the event start.
                let isMultiDateSeries = false;
                if (!parsedDate) {
                    parsedDate = parseFirstOfMultiDateSeries(dateTimeText);
                    isMultiDateSeries = parsedDate !== null;
                }

                if (!parsedDate) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date from "${dateTimeText}" for "${title}"`,
                        context: eventId
                    });
                    continue;
                }

                // Parse time
                let startHour = 10; // default to 10 AM
                let startMinute = 0;
                let durationHours = 2;
                let timeGuessed = false;

                const timeResult = parseTimeRange(dateTimeText);
                if (timeResult) {
                    startHour = timeResult.start.hour;
                    startMinute = timeResult.start.minute;
                    durationHours = timeResult.durationHours;
                } else {
                    timeGuessed = true;
                }

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(parsedDate.year, parsedDate.month, parsedDate.day, startHour, startMinute),
                    ZoneId.of('America/Los_Angeles')
                );

                // Extract description
                const descField = card.querySelector('.views-field-field-teaser-text');
                const description = descField?.textContent.trim() || undefined;

                // Extract image
                const imgEl = card.querySelector('.event-calendar-teaser-image-wrapper img');
                const imgSrc = imgEl?.getAttribute('src');
                const image = imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`) : undefined;

                // Extract category badge
                const badge = card.querySelector('.red-flag');
                const category = badge?.textContent.trim() || undefined;

                // Build full description with category
                let fullDescription = '';
                if (category) {
                    fullDescription += `${category}\n`;
                }
                if (isMultiDateSeries) {
                    fullDescription += `This is a multi-date class series; the date/time shown is the first session. See the event page for the full schedule (${dateTimeText.replace(/\s+/g, ' ').trim()}).\n`;
                }
                if (description) {
                    fullDescription += description;
                }

                const event: RipperCalendarEvent = {
                    id: eventId,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofMinutes(Math.round(durationHours * 60)),
                    summary: title,
                    description: fullDescription.trim() || undefined,
                    location: LOCATION,
                    url: eventUrl,
                    imageUrl: image
                };

                events.push(event);

                if (timeGuessed) {
                    // No time found in the date/time text — both start and
                    // duration are 10 AM / 2 h placeholders.
                    const uncertainty: UncertaintyError = {
                        type: "Uncertainty",
                        reason: `No time found in "${dateTimeText}"`,
                        source: "burke_museum",
                        unknownFields: ["startTime", "duration"],
                        event,
                        partialFingerprint: simpleHash(dateTimeText),
                    };
                    events.push(uncertainty);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${errorMessage}`,
                    context: undefined
                });
            }
        }

        return events;
    }

    private synthesizeFreeFirstThursday(
        title: string,
        eventUrl: string,
        baseEventId: string,
        dateTimeText: string,
        timeResult: { start: { hour: number; minute: number }; durationHours: number } | null,
        card: HTMLElement,
        date: ZonedDateTime,
    ): RipperEvent[] {
        const events: RipperEvent[] = [];
        const startHour = timeResult?.start.hour ?? 10;
        const startMinute = timeResult?.start.minute ?? 0;
        const durationHours = timeResult?.durationHours ?? 10;

        // Extract description and image from the card
        const descField = card.querySelector('.views-field-field-teaser-text');
        const description = descField?.textContent.trim() || undefined;
        const badge = card.querySelector('.red-flag');
        const category = badge?.textContent.trim() || undefined;
        const imgEl = card.querySelector('.event-calendar-teaser-image-wrapper img');
        const imgSrc = imgEl?.getAttribute('src');
        const image = imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`) : undefined;

        let fullDescription = '';
        if (category) fullDescription += `${category}\n`;
        if (description) fullDescription += description;

        const today = date.toLocalDate();
        for (let i = 0; i < 3; i++) {
            const monthStart = today.plusMonths(i).withDayOfMonth(1);
            const firstThursday = monthStart.with(TemporalAdjusters.firstInMonth(DayOfWeek.THURSDAY));
            if (firstThursday.isBefore(today)) continue;

            const eventId = `${baseEventId}-${firstThursday.toString()}`;
            if (this.seenEvents.has(eventId)) continue;
            this.seenEvents.add(eventId);

            const eventDate = ZonedDateTime.of(
                LocalDateTime.of(firstThursday.year(), firstThursday.monthValue(), firstThursday.dayOfMonth(), startHour, startMinute),
                ZoneId.of('America/Los_Angeles')
            );

            events.push({
                id: eventId,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofMinutes(Math.round(durationHours * 60)),
                summary: title,
                description: fullDescription.trim() || undefined,
                location: LOCATION,
                url: eventUrl,
                imageUrl: image,
                cost: { min: 0 },
            });
        }

        return events;
    }
}
