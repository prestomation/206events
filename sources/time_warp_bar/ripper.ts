import { Instant, ZoneId, ZonedDateTime, Duration } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const CALENDAR_URL = "https://timewarp.bar/calendar/events/";
const LOCATION = "Time Warp, 1420 10th Ave, Seattle, WA 98122";
const DEFAULT_DURATION_HOURS = 2;

/**
 * Time Warp (Capitol Hill pinball bar) event calendar ripper.
 *
 * The site embeds a Google Calendar via the WordPress Simple Calendar plugin
 * (google-calendar-events) -- the same "simcal" HTML grid pattern already
 * handled by sources/hellbent_brewing/ripper.ts. The page server-renders
 * only the current calendar month (no `?simcal-month=`/`?simcal-year=` query
 * pagination found), so each build only sees whatever remains of the
 * current month at fetch time.
 *
 * Each event is a <li class="simcal-event"> containing:
 *   - <span class="simcal-event-title"> (outside the tooltip) for the name
 *   - <span data-event-start="UNIX_SECONDS"> for the start
 *   - <span data-event-end="UNIX_SECONDS"> for the end (when present)
 *   - <div class="simcal-event-description"> for an optional description
 */
export default class TimeWarpBarRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        let html: string;
        try {
            const res = await this.fetchFn(CALENDAR_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            html = await res.text();
        } catch (error) {
            return ripper.config.calendars.map(c => ({
                name: c.name,
                friendlyname: c.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason: `Failed to fetch page: ${error}`, context: CALENDAR_URL }],
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

    /**
     * Parse events from the Simple Calendar HTML grid.
     * Only events starting at or after `now` are returned.
     */
    public parseEvents(html: string, now: ZonedDateTime, timezone: ZoneId): RipperEvent[] {
        const root = parse(html);
        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        const eventEls = root.querySelectorAll('li.simcal-event');

        for (const el of eventEls) {
            try {
                // First span.simcal-event-title is the visible event name (outside tooltip)
                const titleEl = el.querySelector('span.simcal-event-title');
                const rawTitle = titleEl?.textContent?.trim();
                if (!rawTitle) continue;
                const title = rawTitle.replace(/&#0*39;/g, "'").replace(/&amp;/g, '&').trim();

                // data-event-start holds a Unix timestamp in seconds
                const startEl = el.querySelector('[data-event-start]');
                const startTs = startEl?.getAttribute('data-event-start');
                if (!startTs) continue;

                const startDate = ZonedDateTime.ofInstant(
                    Instant.ofEpochSecond(parseInt(startTs, 10)),
                    timezone
                );

                if (startDate.isBefore(now)) continue;

                const key = `${startTs}-${title}`;
                if (seen.has(key)) continue;
                seen.add(key);

                // data-event-end holds the end Unix timestamp in seconds, when present
                const endEl = el.querySelector('[data-event-end]');
                const endTs = endEl?.getAttribute('data-event-end');
                const endSeconds = endTs ? parseInt(endTs, 10) : NaN;
                const startSeconds = parseInt(startTs, 10);
                const duration = Number.isFinite(endSeconds) && endSeconds > startSeconds
                    ? Duration.ofSeconds(endSeconds - startSeconds)
                    : Duration.ofHours(DEFAULT_DURATION_HOURS);

                const descEl = el.querySelector('div.simcal-event-description');
                const rawDescription = descEl?.textContent?.trim();
                const description = rawDescription
                    ? rawDescription.replace(/&#0*39;/g, "'").replace(/&amp;/g, '&').trim()
                    : undefined;

                events.push({
                    id: `time-warp-${startTs}-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
                    ripped: new Date(),
                    date: startDate,
                    duration,
                    summary: title,
                    description,
                    location: LOCATION,
                    url: CALENDAR_URL,
                });
            } catch (err) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse Time Warp event: ${err}`,
                    context: "simcal-event",
                });
            }
        }

        return events;
    }
}
