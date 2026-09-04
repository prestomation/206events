import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { ZonedDateTime, LocalDateTime, Duration, ZoneId } from "@js-joda/core";
import { decode } from "html-entities";
import '@js-joda/timezone';

const DEFAULT_DURATION = Duration.ofHours(3);

// Venue names as they appear on the event detail page (`.event-location`),
// mapped to a geocodable full address. Events at an unmapped venue fall
// back to the raw scraped name, which the shared geocoder will attempt to
// resolve (or flag as a geocode gap) on its own.
const VENUE_ADDRESSES: Record<string, string> = {
    "Southgate Roller Rink": "Southgate Roller Rink, 9646 17th Ave SW, Seattle, WA 98106",
    "Magnuson Park Hangar 30": "Magnuson Park Hangar 30, 6310 NE 74th St, Seattle, WA 98115",
};

interface EventLink {
    postId: string;
    url: string;
}

export function extractEventLinks(html: HTMLElement): EventLink[] {
    const links: EventLink[] = [];
    const seen = new Set<string>();

    for (const anchor of html.querySelectorAll('a.event_link')) {
        const href = anchor.getAttribute('href');
        const postId = anchor.parentNode?.getAttribute('id')?.replace(/^post-/, '');
        if (!href || !postId || seen.has(postId)) continue;
        seen.add(postId);
        links.push({ postId, url: decode(href) });
    }

    return links;
}

// Parses a time like "4:45 PM" into { hour, minute } in 24h form.
function parseClockTime(text: string): { hour: number; minute: number } | undefined {
    const m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return undefined;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const meridiem = m[3].toUpperCase();
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
}

export function parseEventDetailPage(html: HTMLElement, url: string, postId: string, zone: ZoneId): RipperEvent {
    const titleEl = html.querySelector('h1.entry-title');
    const title = titleEl ? decode(titleEl.text.trim()) : undefined;
    if (!title) {
        return { type: "ParseError", reason: "Could not find event title (h1.entry-title)", context: url };
    }

    const dateText = html.querySelector('.event-date')?.text.trim();
    const dateMatch = dateText?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dateMatch) {
        return { type: "ParseError", reason: `Could not parse event date: "${dateText}"`, context: title };
    }
    const [, month, day, year] = dateMatch;

    // Prefer "first whistle" (when the bout actually starts) over "doors
    // open"; fall back to whichever time is present. Both read as
    // "<strong>H:MM PM</strong> doors open<br/><strong>H:MM PM</strong> first whistle".
    const timeText = html.querySelector('.event-time')?.text ?? '';
    const clockTimes = timeText.match(/\d{1,2}:\d{2}\s*[AP]M/gi) ?? [];
    const firstWhistle = clockTimes.length > 1 ? clockTimes[1] : clockTimes[0];
    const clock = firstWhistle ? parseClockTime(firstWhistle) : undefined;

    const date = ZonedDateTime.of(
        LocalDateTime.of(parseInt(year, 10), parseInt(month, 10), parseInt(day, 10), clock?.hour ?? 12, clock?.minute ?? 0),
        zone
    );

    const rawLocation = html.querySelector('.event-location')?.text.trim();
    const location = rawLocation ? (VENUE_ADDRESSES[rawLocation] ?? rawLocation) : undefined;

    const event: RipperCalendarEvent = {
        id: `rat-city-roller-derby-${postId}`,
        ripped: new Date(),
        date,
        duration: DEFAULT_DURATION,
        summary: title,
        location,
        url,
    };

    return event;
}

export default class RatCityRollerDerbyRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);
        const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' };

        const listingRes = await fetchFn(ripper.config.url.toString(), { headers });
        if (!listingRes.ok) {
            throw Error(`${listingRes.status} ${listingRes.statusText}`);
        }
        const listingHtml = parseHtml(await listingRes.text());
        const eventLinks = extractEventLinks(listingHtml);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const link of eventLinks) {
            const res = await fetchFn(link.url, { headers });
            if (!res.ok) {
                errors.push({ type: "ParseError", reason: `Failed to fetch event page: ${res.status} ${res.statusText}`, context: link.url });
                continue;
            }
            const detailHtml = parseHtml(await res.text());
            const result = parseEventDetailPage(detailHtml, res.url || link.url, link.postId, zone);
            if ('date' in result) {
                if (result.date.isBefore(now)) continue; // Past event — intentional skip
                events.push(result);
            } else {
                errors.push(result);
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
}
