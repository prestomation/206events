import { ZonedDateTime, LocalDate, LocalTime, Duration, ZoneId } from "@js-joda/core";
import { IRipper, ParseError, Ripper, RipperCalendar, RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import "@js-joda/timezone";

const BASE_URL = "https://www.soundtransit.org";

interface STEvent {
    days_type: "single" | "multi";
    title: string;
    body: string;
    start_date: string;  // e.g. "June 11, 2026"
    end_date: string;    // e.g. "June 11, 2026"
    start_time: string;  // e.g. "1:30 p.m."
    end_time: string;    // e.g. "4:00 p.m."
    url: string;         // relative path
    event_cancelled: string;  // "0" or "1"
    id: string;
}

interface STResponse {
    event_count: number;
    total_rows: number;
    groups: Record<string, {
        group: string;
        level: number;
        rows: Record<string, {
            group: string;
            level: number;
            rows: Record<string, {
                group: string;
                level: number;
                rows: STEvent[];
            }>;
        }>;
    }>;
}

// Parse time strings like "1:30 p.m.", "12:00 p.m.", "9:00 a.m."
export function parseTime(timeStr: string): LocalTime | null {
    const m = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const isPM = /p\.m\./i.test(m[3]);
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    try {
        return LocalTime.of(hour, minute);
    } catch {
        return null;
    }
}

// Parse date strings like "June 11, 2026"
export function parseDate(dateStr: string): LocalDate | null {
    const MONTHS: Record<string, number> = {
        January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
        July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
    };
    const m = dateStr.trim().match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!m) return null;
    const month = MONTHS[m[1]];
    if (!month) return null;
    try {
        return LocalDate.of(parseInt(m[3], 10), month, parseInt(m[2], 10));
    } catch {
        return null;
    }
}

function extractEvents(data: STResponse): STEvent[] {
    const events: STEvent[] = [];
    for (const month of Object.values(data.groups)) {
        for (const day of Object.values(month.rows)) {
            for (const typeGroup of Object.values(day.rows)) {
                events.push(...typeGroup.rows);
            }
        }
    }
    return events;
}

export default class SoundTransitRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];
        const tz = cal.timezone;

        const allEvents: STEvent[] = [];
        let page = 0;
        let totalRows = Infinity;

        while (allEvents.length < totalRows) {
            const url = `${ripper.config.url.origin}${ripper.config.url.pathname}?page=${page}`;
            const res = await fetchFn(url);
            if (!res.ok) throw new Error(`Sound Transit API returned ${res.status} ${res.statusText}`);
            const data: STResponse = await res.json();
            totalRows = data.total_rows;
            const batch = extractEvents(data);
            if (batch.length === 0) break;
            allEvents.push(...batch);
            page++;
        }

        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        for (const ev of allEvents) {
            if (ev.event_cancelled === "1") continue;
            if (seen.has(ev.id)) continue;
            seen.add(ev.id);

            const result = this.parseEvent(ev, tz);
            events.push(result);
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: events.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: events.filter(e => "type" in e).map(e => e as any),
            tags: ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    parseEvent(ev: STEvent, tz: ZoneId): RipperEvent {
        const date = parseDate(ev.start_date);
        if (!date) {
            return {
                type: "ParseError",
                reason: `Could not parse start_date: "${ev.start_date}"`,
                context: ev.title,
            } as ParseError;
        }

        const startTime = parseTime(ev.start_time) ?? LocalTime.of(12, 0);
        const endTime = parseTime(ev.end_time);

        const zonedStart = ZonedDateTime.of(date, startTime, tz);

        let duration: Duration;
        if (endTime) {
            const endMinutes = endTime.hour() * 60 + endTime.minute();
            const startMinutes = startTime.hour() * 60 + startTime.minute();
            const diffMinutes = endMinutes > startMinutes
                ? endMinutes - startMinutes
                : 24 * 60 - startMinutes + endMinutes;
            duration = Duration.ofMinutes(diffMinutes);
        } else {
            duration = Duration.ofHours(2);
        }

        const description = ev.body
            ? ev.body.replace(/&nbsp;/g, " ").trim()
            : undefined;

        return {
            id: `sound-transit-${ev.id}`,
            ripped: new Date(),
            date: zonedStart,
            duration,
            summary: ev.title.trim(),
            description,
            url: ev.url ? `${BASE_URL}${ev.url}` : undefined,
        } satisfies RipperCalendarEvent;
    }
}
