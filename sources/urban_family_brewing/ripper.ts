import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const CALENDAR_URL = "https://urbanfamilybrewing.com/home/calendar/";
const LOCATION = "Urban Family Brewing Co., 1103 NW 52nd St, Seattle, WA 98107";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

/**
 * Urban Family Brewing (Ballard) ripper.
 *
 * The taproom's Sugar Calendar Lite (WordPress plugin) month view server-renders
 * every event for the current month as a `[data-eventurl]` cell carrying
 * `data-eventid` (stable per-occurrence WP post id), `data-calendarsinfo` (which
 * of the site's two calendars — "Food Truck Calendar" and "Urban Family Brewing
 * Ballard" — the event belongs to), and two `<time datetime="...">` elements for
 * start/end. Only the current month is available; there's no query param to page
 * to future months, so this ripper surfaces whatever the live page shows.
 */
export default class UrbanFamilyBrewingRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        let html: string;
        try {
            const res = await this.fetchFn(CALENDAR_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            html = await res.text();
        } catch (error) {
            return [{
                name: calConfig.name,
                friendlyname: calConfig.friendlyname,
                events: [],
                errors: [{ type: "ParseError", reason: `Failed to fetch calendar page: ${error}`, context: CALENDAR_URL }],
                tags: calConfig.tags ?? ripper.config.tags ?? [],
                parent: ripper.config,
            }];
        }

        const now = ZonedDateTime.now(TIMEZONE);
        const events = this.parseEvents(html, now);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing. Parses every event cell in the Sugar Calendar month-view
    // HTML, drops duplicates by event id, and filters out events that have already
    // ended relative to `now`.
    public parseEvents(html: string, now: ZonedDateTime): RipperEvent[] {
        const root = parse(html);
        const cells = root.querySelectorAll('[data-eventurl]');
        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        for (const cell of cells) {
            const result = this.parseEventCell(cell);
            if ('date' in result) {
                if (seen.has(result.id!)) continue;
                seen.add(result.id!);
                if (result.date.isBefore(now)) continue;
            }
            events.push(result);
        }

        return events;
    }

    // Public for testing — returns RipperCalendarEvent or RipperError, never null.
    // Dedup and past-event filtering are handled by the caller (parseEvents).
    public parseEventCell(cell: HTMLElement): RipperCalendarEvent | RipperError {
        const eventId = cell.getAttribute('data-eventid');
        const eventUrl = cell.getAttribute('data-eventurl');
        if (!eventId || !eventUrl) {
            return { type: 'ParseError', reason: 'Missing data-eventid or data-eventurl on event cell', context: cell.toString().slice(0, 200) };
        }

        const rawTitle = cell.querySelector('.sugar-calendar-block__event-cell__title')?.textContent?.trim();
        if (!rawTitle) {
            return { type: 'ParseError', reason: 'Missing event title', context: eventUrl };
        }

        const timeEls = cell.querySelectorAll('time[datetime]');
        const startIso = timeEls[0]?.getAttribute('datetime');
        const endIso = timeEls[1]?.getAttribute('datetime');
        if (!startIso || !endIso) {
            return { type: 'ParseError', reason: 'Missing start/end datetime', context: rawTitle };
        }

        let startZdt: ZonedDateTime;
        let durationMinutes: number;
        try {
            startZdt = ZonedDateTime.of(LocalDateTime.parse(startIso), TIMEZONE);
            const endZdt = ZonedDateTime.of(LocalDateTime.parse(endIso), TIMEZONE);
            durationMinutes = Duration.between(startZdt, endZdt).toMinutes();
        } catch (e) {
            return { type: 'ParseError', reason: `Failed to parse datetime: ${e}`, context: rawTitle };
        }
        if (durationMinutes <= 0) {
            return { type: 'ParseError', reason: `Parsed duration <= 0 (${durationMinutes}min)`, context: rawTitle };
        }

        const summary = this.isFoodTruckEvent(cell) ? `Food Truck: ${rawTitle}` : rawTitle;

        return {
            id: `urban-family-brewing-${eventId}`,
            ripped: new Date(),
            date: startZdt,
            duration: Duration.ofMinutes(durationMinutes),
            summary,
            location: LOCATION,
            url: eventUrl,
        };
    }

    // Public for testing — the food truck rotation is cross-listed on both the
    // venue's own calendar and a shared "Food Truck Calendar"; house events
    // (trivia, yoga, live shows) only carry the venue calendar.
    public isFoodTruckEvent(cell: HTMLElement): boolean {
        const raw = cell.getAttribute('data-calendarsinfo');
        if (!raw) return false;
        try {
            const info = JSON.parse(raw);
            return (info.calendars ?? []).some((c: { name?: string }) => c.name === 'Food Truck Calendar');
        } catch {
            return false;
        }
    }
}
