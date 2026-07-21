import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { EventCost, RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from "node-html-parser";

const MONTHS: Record<string, number> = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
};

const VENUE_NAME = "Airport Tavern";
const VENUE_ADDRESS = "5811 Airport Way S, Seattle, WA 98108";
const LOCATION = `${VENUE_NAME}, ${VENUE_ADDRESS}`;

/**
 * Ripper for Airport Tavern's SeeTickets-powered WordPress calendar.
 * The calendar page (https://airporttavern.com/calendar/) lists all upcoming
 * events in a single page using `.seetickets-list-event-container` divs.
 * Since the HTMLRipper base fetches once per day, we deduplicate across
 * daily fetches using the SeeTickets event ID from the URL.
 */
export default class AirportTavernRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        const entries = html.querySelectorAll('.seetickets-list-event-container');

        for (const entry of entries) {
            try {
                // Extract event title and URL from .event-title a
                const titleLink = entry.querySelector('.event-title a');
                if (!titleLink) continue;
                const eventTitle = titleLink.textContent.trim();
                if (!eventTitle) continue;

                const eventUrl = titleLink.getAttribute('href') || '';
                if (!eventUrl) continue;

                // Extract event ID from SeeTickets URL (e.g., /event/EVENT-NAME/697643)
                const idMatch = eventUrl.match(/\/event\/[^/]+\/(\d+)/);
                const eventId = idMatch ? idMatch[1] : eventUrl;

                // Deduplicate across daily fetches
                if (this.seenEvents.has(eventId)) continue;
                this.seenEvents.add(eventId);

                // Extract date from .event-date (e.g., "Tue Jul 21")
                const dateEl = entry.querySelector('.event-date');
                if (!dateEl) {
                    events.push({
                        type: "ParseError",
                        reason: `No date element for event "${eventTitle}" (${eventUrl})`,
                        context: eventUrl
                    });
                    continue;
                }

                const dateText = dateEl.textContent.trim();
                const dateMatch = dateText.match(/(\w{3})\s+(\w{3})\s+(\d{1,2})/);
                if (!dateMatch) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse date "${dateText}" for event "${eventTitle}"`,
                        context: eventUrl
                    });
                    continue;
                }

                const month = MONTHS[dateMatch[2]];
                if (!month) {
                    events.push({
                        type: "ParseError",
                        reason: `Unknown month abbreviation "${dateMatch[2]}" for event "${eventTitle}"`,
                        context: eventUrl
                    });
                    continue;
                }

                const day = parseInt(dateMatch[3]);
                // Year is not in the date text; infer from the ZonedDateTime
                // (the base class passes the day being processed). If the
                // event month is earlier than the current month, it's next year.
                let year = date.year();
                if (month < date.monthValue()) {
                    year++;
                } else if (month === date.monthValue() && day < date.dayOfMonth()) {
                    year++;
                }

                // Extract show time from .see-showtime (e.g., "8:00PM")
                const showTimeEl = entry.querySelector('.see-showtime');
                let hour = 20; // default 8 PM
                let minute = 0;
                if (showTimeEl) {
                    const timeText = showTimeEl.textContent.trim();
                    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                    if (timeMatch) {
                        hour = parseInt(timeMatch[1]);
                        minute = parseInt(timeMatch[2]);
                        const ampm = timeMatch[3].toUpperCase();
                        if (ampm === 'PM' && hour !== 12) hour += 12;
                        if (ampm === 'AM' && hour === 12) hour = 0;
                    }
                }

                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, hour, minute),
                    ZoneId.of('America/Los_Angeles')
                );

                // Extract door time for description
                const doorTimeEl = entry.querySelector('.see-doortime');
                const doorTime = doorTimeEl?.textContent.trim() || '';

                // Extract headliners
                const headlinersEl = entry.querySelector('.headliners');
                const headliners = headlinersEl?.textContent.trim() || '';

                // Extract supporting talent
                const supportEl = entry.querySelector('.supporting-talent');
                const supportText = supportEl?.textContent.trim() || '';

                // Extract genre
                const genreEl = entry.querySelector('.genre');
                const genre = genreEl?.textContent.trim() || '';

                // Extract price
                const priceEl = entry.querySelector('.price');
                const priceText = priceEl?.textContent.trim() || '';
                const cost = parsePrice(priceText);

                // Extract image
                const imgEl = entry.querySelector('.seetickets-list-view-event-image');
                const imageUrl = imgEl?.getAttribute('src') || undefined;

                // Build summary
                let summary = eventTitle;
                if (supportText && supportText !== eventTitle) {
                    summary += ` ${supportText}`;
                }

                // Build description
                let description = '';
                if (headliners && headliners !== eventTitle) {
                    description += `${headliners}\n`;
                }
                if (supportText) {
                    description += `${supportText}\n`;
                }
                if (genre) {
                    description += `Genre: ${genre}\n`;
                }
                description += `\nVenue: ${LOCATION}`;
                if (doorTime) {
                    description += `\nDoors: ${doorTime}`;
                }
                description += `\n\nTickets: ${eventUrl}`;

                const event: RipperCalendarEvent = {
                    id: `airport-tavern-${eventId}`,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofHours(3),
                    summary: summary,
                    description: description.trim() || undefined,
                    location: LOCATION,
                    url: eventUrl,
                    imageUrl: imageUrl,
                    cost: cost,
                };

                events.push(event);
            } catch (error) {
                const titleEl = entry.querySelector('.event-title a');
                const title = titleEl?.textContent.trim() || 'unknown';
                const url = titleEl?.getAttribute('href') || '';
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event for ${title} at ${VENUE_NAME}: ${error}`,
                    context: url
                });
            }
        }

        return events;
    }
}

/**
 * Parse SeeTickets price text into EventCost.
 * Examples: "$5.00-$10.00", "$0.00", "$19.99-$80.00"
 */
function parsePrice(priceText: string): EventCost | undefined {
    if (!priceText) return undefined;

    const matches = priceText.match(/\$(\d+(?:\.\d{2})?)/g);
    if (!matches || matches.length === 0) return undefined;

    const prices = matches.map(m => parseFloat(m.replace('$', '')));
    const min = Math.min(...prices);
    const max = prices.length > 1 ? Math.max(...prices) : undefined;

    if (min === 0 && max === undefined) return { min: 0 };
    if (min === 0 && max !== undefined) return { min: 0, max };
    if (max !== undefined) return { min, max };
    return { min };
}