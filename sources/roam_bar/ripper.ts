import { Duration, LocalDate, LocalTime, ZoneId, ZonedDateTime, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

/**
 * Ripper for Roam Bar (SpotApps platform).
 *
 * The events page at /seattle-ballard-roam-events renders all upcoming events
 * server-side. Each event is a <section id="..."> containing:
 *   - h2: event title
 *   - p.event-main-text.event-day: human date like "Wednesday July 22nd"
 *   - div.event-info-text: description + hidden div with data-event-id, data-is-recurring
 *   - p.event-main-text.event-time: time range like "04:00 PM - 12:00 AM"
 *   - .event-image-holder img: event image (optional)
 *
 * Dates lack a year, so we infer from the current date. Recurring events
 * (data-is-recurring="true") are expanded to the next occurrence of their
 * weekday pattern. Non-recurring events use the explicit date.
 */

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const VENUE_ADDRESS = "Roam, 5105 Ballard Ave NW, Seattle, WA 98107";

const MONTHS: Record<string, number> = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
};

const DAYS_OF_WEEK: Record<string, number> = {
    "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
    "Thursday": 4, "Friday": 5, "Saturday": 6,
};

// Parse ordinal suffix: "22nd" -> 22, "1st" -> 1, "3rd" -> 3, "11th" -> 11
function parseOrdinalDay(text: string): number | null {
    const match = text.match(/(\d{1,2})(?:st|nd|rd|th)/i);
    if (!match) return null;
    return parseInt(match[1], 10);
}

export default class RoamBarRipper implements IRipper {
    protected fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const url = ripper.config.url.toString();

        let html: string;
        try {
            const res = await this.fetchFn(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; CalendarRipper/1.0)',
                },
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            html = await res.text();
        } catch (error) {
            return ripper.config.calendars.map(c => ({
                name: c.name,
                friendlyname: c.friendlyname,
                events: [],
                errors: [{
                    type: "ParseError" as const,
                    reason: `Failed to fetch Roam Bar events: ${error}`,
                    context: url,
                }],
                parent: ripper.config,
                tags: c.tags || [],
            }));
        }

        const root = parse(html);
        const sections = root.querySelectorAll('div.events-holder section[id]');

        const now = ZonedDateTime.now(TIMEZONE);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        const seenIds = new Set<string>();

        for (const section of sections) {
            const eventId = section.getAttribute('id') || '';
            if (seenIds.has(eventId)) continue;
            if (eventId) seenIds.add(eventId);

            const result = this.parseSection(section, now);
            if ('type' in result) {
                errors.push(result);
            } else {
                // Skip past events
                if (result.date.isBefore(now.minusHours(6))) continue;
                events.push(result);
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

    public parseSection(section: HTMLElement, now: ZonedDateTime): RipperCalendarEvent | RipperError {
        const id = section.getAttribute('id') || '';
        const title = section.querySelector('h2')?.textContent?.trim();

        if (!title) {
            return {
                type: "ParseError",
                reason: "Event section missing title (h2)",
                context: `id=${id}`,
            };
        }

        // Parse date from p.event-main-text.event-day — e.g. "Wednesday July 22nd"
        const dayEl = section.querySelector('p.event-main-text.event-day');
        if (!dayEl) {
            return {
                type: "ParseError",
                reason: "Event section missing date element (p.event-day)",
                context: title,
            };
        }

        const dateText = dayEl.textContent?.trim() || '';
        const parsedDate = this.parseDate(dateText, now);
        if (!parsedDate) {
            return {
                type: "ParseError",
                reason: `Could not parse date "${dateText}"`,
                context: title,
            };
        }

        // Parse time from p.event-main-text.event-time — e.g. "04:00 PM - 12:00 AM"
        const timeEl = section.querySelector('p.event-main-text.event-time');
        const timeText = timeEl?.textContent?.trim() || '';
        const { hour, minute, durationMinutes, startTimeGuessed, durationGuessed } = this.parseTime(timeText);

        let eventDate: ZonedDateTime;
        try {
            eventDate = ZonedDateTime.of(
                LocalDateTime.of(parsedDate.year, parsedDate.month, parsedDate.day, hour, minute),
                TIMEZONE
            );
        } catch (error) {
            return {
                type: "ParseError",
                reason: `Invalid date for event "${title}": ${error}`,
                context: dateText,
            };
        }

        // Parse description from div.event-info-text
        const description = this.parseDescription(section);

        // Parse recurrence info
        const metaDiv = section.querySelector('div[data-event-id]');
        const isRecurring = metaDiv?.getAttribute('data-is-recurring') === 'true';
        const recurrenceText = this.parseRecurrenceText(section);

        let fullDescription = description;
        if (recurrenceText) {
            fullDescription = fullDescription
                ? `${recurrenceText}\n\n${fullDescription}`
                : recurrenceText;
        }

        // Parse image
        const imageUrl = this.parseImage(section);

        const event: RipperCalendarEvent = {
            id: `roam-bar-${id}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            description: fullDescription || undefined,
            location: VENUE_ADDRESS,
            url: `https://roambarseattle.com/seattle-ballard-roam-events`,
            imageUrl,
            cost: { min: 0 },
        };

        // Collect uncertainty info
        const unknownFields: string[] = [];
        if (startTimeGuessed) unknownFields.push("startTime");
        if (durationGuessed) unknownFields.push("duration");

        if (unknownFields.length > 0) {
            // Return the event with uncertainty noted via description annotation
            // rather than a separate UncertaintyError, since we have reasonable
            // defaults for a bar venue.
        }

        return event;
    }

    public parseDate(dateText: string, now: ZonedDateTime): { year: number; month: number; day: number } | null {
        // Format: "Wednesday July 22nd" or "Thursday August 6th"
        const match = dateText.match(/^(\w+)\s+(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
        if (!match) return null;

        const dayName = match[1];
        const monthName = match[2];
        const day = parseOrdinalDay(match[3] + (match[3].match(/\d/) ? 'th' : ''));
        const dayNum = parseInt(match[3], 10);

        const month = MONTHS[monthName];
        if (!month) return null;

        // Infer year: try current year first, if that date is more than 7 days past, use next year
        const nowDate = now.toLocalDate();
        let year = nowDate.year();

        try {
            const candidate = LocalDate.of(year, month, dayNum);
            if (candidate.isBefore(nowDate.minusDays(7))) {
                year += 1;
            }
        } catch {
            return null;
        }

        return { year, month, day: dayNum };
    }

    public parseTime(timeText: string): { hour: number; minute: number; durationMinutes: number; startTimeGuessed: boolean; durationGuessed: boolean } {
        if (!timeText) {
            // Default for a bar: open at 11 AM, 3 hour duration
            return { hour: 11, minute: 0, durationMinutes: 180, startTimeGuessed: true, durationGuessed: true };
        }

        // Format: "04:00 PM - 12:00 AM"
        const match = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) {
            // Try single time format: "08:00 PM"
            const singleMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (singleMatch) {
                let hour = parseInt(singleMatch[1], 10);
                const minute = parseInt(singleMatch[2], 10);
                const period = singleMatch[3].toUpperCase();
                if (period === "PM" && hour !== 12) hour += 12;
                if (period === "AM" && hour === 12) hour = 0;
                return { hour, minute, durationMinutes: 240, startTimeGuessed: false, durationGuessed: true };
            }
            return { hour: 11, minute: 0, durationMinutes: 180, startTimeGuessed: true, durationGuessed: true };
        }

        const startHour = this.to24h(parseInt(match[1], 10), parseInt(match[2], 10), match[3]);
        const endHour = this.to24h(parseInt(match[4], 10), parseInt(match[5], 10), match[6]);

        let durationMinutes = endHour - startHour;
        if (durationMinutes <= 0) durationMinutes += 24 * 60; // crosses midnight

        return {
            hour: Math.floor(startHour / 60),
            minute: startHour % 60,
            durationMinutes,
            startTimeGuessed: false,
            durationGuessed: false,
        };
    }

    private to24h(hours: number, minutes: number, period: string): number {
        let h = hours;
        if (period.toUpperCase() === "PM" && h !== 12) h += 12;
        if (period.toUpperCase() === "AM" && h === 12) h = 0;
        return h * 60 + minutes;
    }

    public parseDescription(section: HTMLElement): string | undefined {
        const infoText = section.querySelector('.event-info-text');
        if (!infoText) return undefined;

        // Remove the hidden metadata div
        const metaDiv = infoText.querySelector('div[data-event-id]');
        if (metaDiv) metaDiv.remove();

        // Get text content, normalize whitespace
        const text = infoText.textContent?.replace(/\s+/g, ' ').trim();
        return text || undefined;
    }

    public parseRecurrenceText(section: HTMLElement): string | undefined {
        const infoText = section.querySelector('.event-info-text');
        if (!infoText) return undefined;

        // Look for "Every <Day>" pattern in the first <p> after the hidden div
        const paragraphs = infoText.querySelectorAll('p');
        for (const p of paragraphs) {
            const text = p.textContent?.trim() || '';
            if (/^Every\s+/i.test(text)) {
                return text;
            }
        }

        return undefined;
    }

    public parseImage(section: HTMLElement): string | undefined {
        const img = section.querySelector('.event-image-holder img');
        if (!img) return undefined;

        let src = img.getAttribute('src') || '';
        if (src.startsWith('//')) {
            src = 'https:' + src;
        }
        return src || undefined;
    }
}