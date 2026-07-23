import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement, parse } from "node-html-parser";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";

import '@js-joda/timezone';

const LOCATION = "VICE Seattle, 1532 Minor Ave, Seattle, WA 98101";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const EVENT_START_HOUR = 21;
const EVENT_START_MINUTE = 30;
const EVENT_DURATION_HOURS = 4.5;

/**
 * VICE Seattle uses the Booketing/UrVenue platform for event management.
 * The events page at booketing.com renders a server-side HTML calendar table
 * with all upcoming events. Each event is in a <td class="uvsingleevent"> cell
 * containing a link to the individual event page.
 *
 * Since the URL has no date template, we override rip() to fetch the page once
 * and parse all events from the single response, rather than fetching the same
 * URL once per day in the lookahead period.
 */
export default class ViceSeattleRipper extends HTMLRipper {
    private seenEventCodes = new Set<string>();

    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const url = ripper.config.url;

        const res = await fetchFn(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }

        const htmlString = await res.text();
        const html = parse(htmlString);

        const events: RipperEvent[] = this.parseAllEvents(html);

        const calendars: RipperCalendar[] = ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: events.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: events.filter(e => "type" in e) as RipperError[],
            parent: ripper.config,
            tags: cal.tags || [],
        }));

        return calendars;
    }

    public async parseEvents(_html: HTMLElement, _date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        // Not used — we override rip() to fetch once and parse all events.
        return [];
    }

    /**
     * Parse all event cells from the booketing calendar table.
     * Each event is in a <td class="uvtddate-YYYY-MM-DD uvsingleevent"> cell.
     */
    private parseAllEvents(html: HTMLElement): RipperEvent[] {
        const events: RipperEvent[] = [];
        const cells = html.querySelectorAll('td.uvsingleevent');

        for (const cell of cells) {
            // Extract date from the cell's class (uvtddate-YYYY-MM-DD)
            const classAttr = cell.getAttribute('class') || '';
            const dateClass = classAttr.split(/\s+/).find(c => c.startsWith('uvtddate-'));
            if (!dateClass) {
                continue;
            }

            const dateStr = dateClass.replace('uvtddate-', '');
            const dateParts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!dateParts) {
                events.push({
                    type: "ParseError",
                    reason: `Could not parse date from class: "${dateClass}"`,
                    context: cell.textContent?.trim().slice(0, 100),
                });
                continue;
            }

            const year = parseInt(dateParts[1]);
            const month = parseInt(dateParts[2]);
            const day = parseInt(dateParts[3]);

            // Find the event link. Only `a.flyer` cells carry real event
            // details (title, image) — cells further out only render a
            // generic `a.datelink` wrapping a "Book" CTA with no title or
            // image yet. Skip those rather than publish "Book" as the
            // summary; the same eventcode reappears with real details once
            // the date enters the venue's flyer window.
            const link = cell.querySelector('a.flyer');
            if (!link) {
                continue;
            }

            const href = link.getAttribute('href') || '';
            if (!href) {
                continue;
            }

            // Extract eventcode from the URL
            const eventcodeMatch = href.match(/eventcode=([A-Z0-9]+)/);
            const eventcode = eventcodeMatch?.[1] || '';
            if (!eventcode) {
                // No eventcode means it's not a real event listing
                continue;
            }

            // Deduplicate by eventcode
            if (this.seenEventCodes.has(eventcode)) {
                continue;
            }
            this.seenEventCodes.add(eventcode);

            // Extract slug from URL
            const slugMatch = href.match(/\/event\/\d+\/\d+\/([^/?]+)/);
            const slug = slugMatch?.[1] || '';

            // Extract title from the link's text content. Current markup
            // nests the real title in `.uv-cellover .uv-celloverinner .name`,
            // alongside a sibling `.ddate` ("Thu, Jul 23") — `.uv-event-title`
            // is legacy and no longer present, and falling straight through
            // to `link.textContent` concatenates the date label onto the
            // front of every title (e.g. "Thu, Jul 23EDM music...").
            const titleEl = link.querySelector('.name') ?? link.querySelector('.uv-event-title');
            let title = '';
            if (titleEl) {
                title = titleEl.textContent?.trim() || '';
            }
            if (!title) {
                // Fallback: get text from the link, clean up whitespace
                title = link.textContent?.trim() || '';
                // Remove date label text that might be nested
                title = title.replace(/^Jul\s+\d+$|^Aug\s+\d+$|^Sep\s+\d+$|^Oct\s+\d+$/, '').trim();
            }
            if (!title) {
                // Last resort: use the slug
                title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            }

            // Extract image URL from data attributes
            const dataFolder = link.getAttribute('data-folder') || '';
            const dataFile = link.getAttribute('data-file') || '';
            let imageUrl: string | undefined;
            if (dataFolder && dataFile) {
                imageUrl = `${dataFolder}/500SC0/${dataFile}`;
            }

            // Build the full event detail URL
            const eventUrl = href.startsWith('http') ? href : `https://booketing.com${href}`;

            // Build description
            const description = `${eventUrl}\n\n21+ | VICE Seattle nightlife`;

            try {
                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, EVENT_START_HOUR, EVENT_START_MINUTE),
                    TIMEZONE
                );

                const event: RipperCalendarEvent = {
                    id: `vice-seattle-${eventcode}`,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofMillis(Math.round(EVENT_DURATION_HOURS * 3600 * 1000)),
                    summary: title,
                    description,
                    location: LOCATION,
                    url: eventUrl,
                    imageUrl,
                    cost: { paid: true },
                };

                events.push(event);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                events.push({
                    type: "ParseError",
                    reason: `Failed to create event for ${eventcode}: ${errorMessage}`,
                    context: `${dateStr} ${title}`,
                });
            }
        }

        return events;
    }
}