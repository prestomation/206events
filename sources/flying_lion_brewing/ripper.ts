import { ZoneId, ZonedDateTime, Duration, LocalDate, LocalTime, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const EVENTS_URL = "https://flyinglionbrewing.com/events.html";
const LOCATION = "Flying Lion Brewing, 5041 Rainier Ave S, Seattle, WA 98118";
const DEFAULT_DURATION_HOURS = 2;

// Month abbreviation -> month number (1-based)
const MONTH_MAP: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4,
    May: 5, June: 6, July: 7, August: 8,
    September: 9, October: 10, November: 11, December: 12,
};

function parseTime(timeStr: string): LocalTime | null {
    // Parses "6:00 PM" or "7:30 AM" into a LocalTime
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return LocalTime.of(hour, minute);
}

function parseDate(dateStr: string): LocalDate | null {
    // Parses "May 18, 2026" into a LocalDate
    const m = dateStr.trim().match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!m) return null;
    const month = MONTH_MAP[m[1]];
    if (!month) return null;
    try {
        return LocalDate.of(parseInt(m[3], 10), month, parseInt(m[2], 10));
    } catch {
        return null;
    }
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default class FlyingLionBrewingRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        let html: string;
        try {
            const res = await this.fetchFn(EVENTS_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            html = await res.text();
        } catch (error) {
            return ripper.config.calendars.map(c => ({
                name: c.name,
                friendlyname: c.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason: `Failed to fetch page: ${error}`, context: EVENTS_URL }],
                parent: ripper.config,
                tags: c.tags || [],
            }));
        }

        const events = this.parseEvents(html, now, timezone);

        return ripper.config.calendars.map(c => ({
            name: c.name,
            friendlyname: c.friendlyname,
            events: events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: c.tags || [],
        }));
    }

    public parseEvents(html: string, now: ZonedDateTime, timezone: ZoneId): RipperEvent[] {
        const root = parse(html);
        const events: RipperEvent[] = [];

        const eventDivs = root.querySelectorAll('div.event');

        for (const div of eventDivs) {
            try {
                const titleEl = div.querySelector('p > strong');
                const title = titleEl?.textContent?.trim();
                if (!title) continue;

                // First p.date-location contains "Date: [date]|[time range]"
                const dateLocEl = div.querySelector('p.date-location');
                if (!dateLocEl) continue;

                // Extract raw text from the date-location paragraph (before nested tags)
                const rawText = dateLocEl.text;

                // Parse "Date: May 18, 2026|6:00 PM - 6:00 PM"
                const dateMatch = rawText.match(/Date:\s*([A-Za-z]+ \d{1,2}, \d{4})/);
                if (!dateMatch) continue;
                const localDate = parseDate(dateMatch[1]);
                if (!localDate) continue;

                const timeEl = div.querySelector('span.date-time');
                const timeRange = timeEl?.textContent?.trim() ?? "";
                // "7:30 PM - 9:00 PM" or "6:00 PM - 6:00 PM"
                const timeParts = timeRange.split('-').map(t => t.trim());
                const startTime = parseTime(timeParts[0] ?? "");
                if (!startTime) continue;

                const startDt = ZonedDateTime.of(
                    LocalDateTime.of(localDate, startTime),
                    timezone
                );

                if (startDt.isBefore(now)) continue;

                let duration = Duration.ofHours(DEFAULT_DURATION_HOURS);
                if (timeParts.length === 2) {
                    const endTime = parseTime(timeParts[1]);
                    if (endTime && !endTime.equals(startTime)) {
                        let durationMinutes = endTime.toSecondOfDay() / 60 - startTime.toSecondOfDay() / 60;
                        if (durationMinutes <= 0) durationMinutes += 24 * 60; // crosses midnight
                        duration = Duration.ofMinutes(durationMinutes);
                    }
                }

                // Collect description from non-date-location paragraphs
                const descParagraphs = div.querySelectorAll('p:not(.date-location)');
                const descParts = descParagraphs
                    .map(p => p.textContent.trim())
                    .filter(t => t && !t.startsWith('Date:'));
                // Skip the first paragraph if it's just the title
                const descText = descParts.filter(t => t !== title).join('\n').trim();

                const dateSlug = localDate.toString(); // yyyy-MM-dd
                const id = `flying-lion-${slugify(title)}-${dateSlug}`;

                events.push({
                    id,
                    ripped: new Date(),
                    date: startDt,
                    duration,
                    summary: title,
                    description: descText || undefined,
                    location: LOCATION,
                    url: EVENTS_URL,
                });
            } catch (err) {
                events.push({
                    type: "ParseError" as const,
                    reason: `Failed to parse event: ${err}`,
                    context: "div.event",
                });
            }
        }

        return events;
    }
}
