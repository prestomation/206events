import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { parse, HTMLElement } from "node-html-parser";
import { ChronoUnit, Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { Ripper, RipperCalendar, RipperEvent, RipperCalendarEvent, RipperError, UncertaintyError } from "../../lib/config/schema.js";
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

/**
 * Ripper for Bad Albert's Tap & Grill (SpotApps platform, Ballard).
 *
 * The events page renders all upcoming events server-side. Each event is a
 * <section id="..."> containing an "addtocalendar" widget block:
 *   <var class="atc_event">
 *     <var class="atc_date_start">2026-09-07 11:00:00</var>
 *     <var class="atc_date_end">2026-09-07 22:00:00</var>
 *     <var class="atc_title">Labor Day</var>
 *     <var class="atc_description">...</var>
 *   </var>
 * which gives fully structured local start/end datetimes directly, no
 * free-text date parsing needed.
 */

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const VENUE_ADDRESS = "Bad Albert's Tap & Grill, 5100 Ballard Ave NW, Seattle, WA 98107";
const VENUE_URL = "https://badalberts.com/seattle-ballard-bad-albert-s-tap-and-grill-events";
const DEFAULT_DURATION_MINUTES = 120;
const FETCH_ATTEMPTS = 3;

export default class BadAlbertsRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    // Override the base HTMLRipper fetch with a small retry-with-backoff:
    // CI has occasionally hit a transient `TypeError: fetch failed` here
    // (observed alongside identical failures on unrelated sources in the
    // same build, i.e. a runner-level network blip, not a badalberts.com
    // block) — a single retry absorbs that instead of publishing 0 events.
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const url = ripper.config.url.toString();

        let html: HTMLElement;
        try {
            html = parse(await this.fetchWithRetry(fetchFn, url));
        } catch (error) {
            return ripper.config.calendars.map(c => ({
                name: c.name,
                friendlyname: c.friendlyname,
                events: [],
                errors: [{
                    type: "ParseError" as const,
                    reason: `Failed to fetch Bad Albert's events: ${error}`,
                    context: url,
                }],
                parent: ripper.config,
                tags: c.tags || [],
            }));
        }

        const events = await this.parseEvents(html, ZonedDateTime.now(TIMEZONE), {});
        return ripper.config.calendars.map(c => ({
            name: c.name,
            friendlyname: c.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => !('type' in e)),
            errors: events.filter((e): e is RipperError => 'type' in e),
            parent: ripper.config,
            tags: c.tags || [],
        }));
    }

    private async fetchWithRetry(fetchFn: FetchFn, url: string): Promise<string> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
            try {
                const res = await fetchFn(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)',
                    },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                return await res.text();
            } catch (error) {
                lastError = error;
                if (attempt < FETCH_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        throw lastError;
    }

    public async parseEvents(html: HTMLElement, _date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const sections = html.querySelectorAll('div.events-holder section[id]');

        for (const section of sections) {
            const id = section.getAttribute('id') || '';
            if (!id || this.seenEvents.has(id)) continue;

            const result = this.parseSection(section, id);
            if ('type' in result) {
                events.push(result);
            } else {
                this.seenEvents.add(id);
                events.push(result.event);
                if (result.durationUncertain) {
                    const uncertainty: UncertaintyError = {
                        type: "Uncertainty",
                        reason: "SpotApps atc_date_end missing, unparsable, or identical to atc_date_start",
                        source: "bad-alberts",
                        unknownFields: ["duration"],
                        event: result.event,
                        partialFingerprint: simpleHash(`${result.event.id}|${result.event.date.toString()}`),
                    };
                    events.push(uncertainty);
                }
            }
        }

        return events;
    }

    private parseSection(section: HTMLElement, id: string): { event: RipperCalendarEvent; durationUncertain: boolean } | RipperError {
        const atc = section.querySelector('var.atc_event');
        if (!atc) {
            return { type: "ParseError", reason: "Event section missing atc_event block", context: id };
        }

        const title = atc.querySelector('var.atc_title')?.textContent?.trim();
        const startText = atc.querySelector('var.atc_date_start')?.textContent?.trim();

        if (!title || !startText) {
            return { type: "ParseError", reason: "atc_event missing atc_title or atc_date_start", context: id };
        }

        const start = this.parseDateTime(startText);
        if (!start) {
            return { type: "ParseError", reason: `Could not parse atc_date_start "${startText}"`, context: title };
        }

        const endText = atc.querySelector('var.atc_date_end')?.textContent?.trim();
        let durationMinutes = DEFAULT_DURATION_MINUTES;
        let durationUncertain = true;
        if (endText) {
            const end = this.parseDateTime(endText);
            if (end) {
                const minutes = start.until(end, ChronoUnit.MINUTES);
                if (minutes > 0) {
                    durationMinutes = minutes;
                    durationUncertain = false;
                } else if (minutes < 0) {
                    // A few source entries have an end time earlier than the
                    // start time on the same calendar date when the event
                    // crosses midnight (the site doesn't roll the date over)
                    // — treat that as "ends the next day" rather than a
                    // negative duration.
                    durationMinutes = minutes + 24 * 60;
                    durationUncertain = false;
                }
                // minutes === 0 (identical start/end) carries no real
                // duration signal — keep the default and flag it uncertain
                // rather than publishing a spurious 24-hour event.
            }
        }

        const description = atc.querySelector('var.atc_description')?.textContent?.trim();

        let imageUrl = section.querySelector('.event-image-holder img')?.getAttribute('src');
        if (imageUrl?.startsWith('//')) imageUrl = 'https:' + imageUrl;

        const event: RipperCalendarEvent = {
            id: `bad-alberts-${id}`,
            ripped: new Date(),
            date: start.atZone(TIMEZONE),
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            description: description || undefined,
            location: VENUE_ADDRESS,
            url: VENUE_URL,
            imageUrl: imageUrl || undefined,
            cost: { min: 0 },
        };

        return { event, durationUncertain };
    }

    private parseDateTime(text: string): LocalDateTime | null {
        // "2026-09-07 11:00:00"
        const match = text.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return null;
        const [, year, month, day, hour, minute, second] = match.map(Number);
        try {
            return LocalDateTime.of(year, month, day, hour, minute, second);
        } catch {
            return null;
        }
    }
}
