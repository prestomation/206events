import { Duration, LocalDate, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decodeEntities } from "../../lib/text-normalize.js";
import '@js-joda/timezone';

// Seattle Blues Dance Collective (seattlebluesdance.com) is a nonprofit that
// curates blues-dance socials, classes, and live-music nights across many
// Seattle venues (Reverie Ballroom, Black & Tan Hall, Bacovino Winery, Dance
// Underground, etc.). Its `/calendar` page is a client-rendered widget, but
// the widget itself calls a public, unauthenticated JSON API directly:
//   GET /events.json?month=<1-12>&year=<yyyy>
// found by reading the page's inline `loadEvents()` fetch call. Each request
// returns not just that calendar month but a rolling several-week window
// starting at that month (confirmed live: a September query already included
// October dates), so a handful of monthly requests a few months apart cover
// the full lookahead with heavy overlap — handled here by deduping on the
// API's own stable per-occurrence `uid`.
const LOOKAHEAD_MONTHS = 6;
const DEFAULT_TIMEZONE = ZoneId.of("America/Los_Angeles");
const FRIENDLY_URL = "https://seattlebluesdance.com/";

interface SbdcEvent {
    date?: string;         // "YYYY-MM-DD"
    time?: string;         // "6:00 PM - 9:00 PM", or "All Day"
    title?: string;
    description?: string;  // sometimes contains HTML (links, <br/>) — left
                            // intact; the web UI sanitizes and renders event
                            // description HTML, same as other sources.
    location?: string;     // full street address, or "" when unstated
    uid?: string;
}

// "6:00 PM - 9:00 PM" -> { start: 18:00, durationMinutes: 180 }. "All Day" is
// a stated fact from the source (not a guessed duration), so it maps to a
// full calendar day rather than being left uncertain.
export function parseTimeRange(raw: string): { start: LocalTime; durationMinutes: number } | null {
    if (/all\s*day/i.test(raw)) {
        return { start: LocalTime.of(0, 0), durationMinutes: 24 * 60 };
    }
    const match = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    const [, startHourStr, startMinStr, startAmPm, endHourStr, endMinStr, endAmPm] = match;

    const to24Hour = (hourStr: string, ampm: string): number => {
        let hour = parseInt(hourStr, 10) % 12;
        if (ampm.toUpperCase() === "PM") hour += 12;
        return hour;
    };

    const start = LocalTime.of(to24Hour(startHourStr, startAmPm), parseInt(startMinStr, 10));
    const end = LocalTime.of(to24Hour(endHourStr, endAmPm), parseInt(endMinStr, 10));

    let durationMinutes = (end.toSecondOfDay() - start.toSecondOfDay()) / 60;
    if (durationMinutes <= 0) durationMinutes += 24 * 60; // crosses midnight, e.g. "9:00 PM - 12:00 AM"
    return { start, durationMinutes };
}

export function parseEvent(raw: SbdcEvent): RipperCalendarEvent | RipperError {
    const title = raw.title?.trim();
    if (!title) {
        return { type: "ParseError", reason: "Event missing title", context: raw.uid ?? JSON.stringify(raw).slice(0, 100) };
    }
    if (!raw.uid) {
        return { type: "ParseError", reason: "Event missing uid", context: title };
    }
    if (!raw.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
        return { type: "ParseError", reason: `Could not parse date: "${raw.date}"`, context: title };
    }

    const timeRange = raw.time ? parseTimeRange(raw.time) : null;
    if (!timeRange) {
        return { type: "ParseError", reason: `Could not parse time: "${raw.time}"`, context: title };
    }

    const localDate = LocalDate.parse(raw.date);
    const date = ZonedDateTime.of(localDate, timeRange.start, DEFAULT_TIMEZONE);
    const duration = Duration.ofMinutes(timeRange.durationMinutes);

    return {
        id: `sbdc-${raw.uid}`,
        ripped: new Date(),
        date,
        duration,
        summary: decodeEntities(title),
        description: raw.description || undefined,
        location: raw.location || undefined,
        url: FRIENDLY_URL,
    };
}

export default class SeattleBluesDanceCollectiveRipper extends JSONRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        if (!ripper.config.calendars?.length) {
            throw new Error("No calendars configured");
        }
        const calConfig = ripper.config.calendars[0];
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = calConfig.timezone ?? DEFAULT_TIMEZONE;

        const today = ZonedDateTime.now(timezone).toLocalDate();
        const results: RipperEvent[] = [];
        const seenUids = new Set<string>();

        for (let i = 0; i < LOOKAHEAD_MONTHS; i++) {
            const target = today.plusMonths(i);
            const params = new URLSearchParams({
                month: target.monthValue().toString(),
                year: target.year().toString(),
            });
            const url = `${ripper.config.url.href}?${params.toString()}`;

            const res = await fetchFn(url);
            if (!res.ok) {
                // The current month must succeed; a later month failing to
                // load (e.g. a transient error) shouldn't fail the whole
                // ripper — the overlapping windows mean most of its events
                // were likely already captured by an earlier month anyway.
                if (i === 0) throw new Error(`Seattle Blues Dance Collective events API returned ${res.status} ${res.statusText}`);
                continue;
            }
            const jsonData = await res.json();
            const rawEvents: SbdcEvent[] = Array.isArray(jsonData) ? jsonData : [];
            const parsed = await this.parseEvents(jsonData, ZonedDateTime.now(timezone), {});

            // Dedup on the raw uid (present whether or not the item parsed
            // successfully) rather than the parsed event's id, so a
            // malformed listing that recurs across overlapping monthly
            // windows is reported as a ParseError once, not up to 6 times.
            parsed.forEach((item, idx) => {
                const uid = rawEvents[idx]?.uid;
                if (uid) {
                    if (seenUids.has(uid)) return;
                    seenUids.add(uid);
                }
                results.push(item);
            });
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => "date" in e),
            errors: results.filter((e): e is RipperError => "type" in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public (required by the JSONRipper abstract signature, and used
    // directly by tests). `_date`/`_config` are unused: this source fetches
    // one ranged month per call rather than JSONRipper's default day-by-day
    // template model, hence the overridden `rip()` above.
    public async parseEvents(jsonData: any, _date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        if (!Array.isArray(jsonData)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: expected an array of events",
                context: JSON.stringify(jsonData).slice(0, 200),
            }];
        }
        return jsonData.map((raw: SbdcEvent) => parseEvent(raw));
    }
}
