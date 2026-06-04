import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { parse, HTMLElement } from "node-html-parser";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const LOCATION = "Skylark Café & Club, 3803 Delridge Way SW, Seattle, WA 98106";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const BASE_URL = "https://www.skylarkcafe.com";

const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4,
    may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12
};

export default class SkylarkCafeRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await this.fetchFn(ripper.config.url.href, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' }
        });
        if (!res.ok) throw new Error(`Skylark calendar returned HTTP ${res.status}`);

        const html = parse(await res.text());
        const events = this.parseCalendar(html);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config
        }];
    }

    parseCalendar(html: HTMLElement): RipperEvent[] {
        const items = html.querySelectorAll('.collection-item-3.w-dyn-item');
        return items.map(item => this.parseItem(item));
    }

    parseItem(item: HTMLElement): RipperCalendarEvent | RipperError {
        const titleEl = item.querySelector('.text-block-12');
        const dateEl = item.querySelector('.date');
        const linkEl = item.querySelector('a.link-block-4');
        const descEl = item.querySelector('.rich-text-block-10');
        const ticketsDiv = item.querySelector('.tickets-div');

        const title = titleEl?.textContent?.trim();
        const dateStr = dateEl?.textContent?.trim();
        const linkHref = linkEl?.getAttribute('href');

        if (!title) {
            return { type: 'ParseError', reason: 'Missing event title', context: item.rawText.slice(0, 100) };
        }
        if (!dateStr) {
            return { type: 'ParseError', reason: `Missing date for: ${title}`, context: title };
        }

        const date = this.parseDateString(dateStr);
        if (!date) {
            return { type: 'ParseError', reason: `Could not parse date "${dateStr}"`, context: title };
        }

        // Only use the ticket link if the div doesn't have w-condition-invisible and the href isn't '#'
        let url = linkHref ? new URL(linkHref, BASE_URL).href : `${BASE_URL}/calendar`;
        if (ticketsDiv && !ticketsDiv.classList.contains('w-condition-invisible')) {
            const ticketLink = ticketsDiv.querySelector('a.button');
            const ticketHref = ticketLink?.getAttribute('href');
            if (ticketHref && ticketHref !== '#') {
                url = ticketHref;
            }
        }

        const description = descEl ? decode(descEl.textContent.trim()) : undefined;

        // Per-event artist image is set as a CSS background-image on .artist-image
        const artistImageEl = item.querySelector('.artist-image');
        const bgStyle = artistImageEl?.getAttribute('style') ?? '';
        const bgMatch = bgStyle.match(/background-image:\s*url\((['"]?)(.*?)\1\)/i);
        const rawImage = bgMatch?.[2]?.trim();
        let imageUrl: string | undefined = undefined;
        if (rawImage && rawImage !== 'none') {
            try {
                imageUrl = new URL(decode(rawImage), BASE_URL).href;
            } catch {
                imageUrl = undefined;
            }
        }

        // Stable ID derived from the event URL slug
        const slugMatch = linkHref ? linkHref.match(/\/global-events\/([^/?#]+)/) : null;
        const id = slugMatch ? `skylark-${slugMatch[1]}` : `skylark-${title}-${dateStr}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration: Duration.ofHours(3),
            summary: title,
            description: description || undefined,
            location: LOCATION,
            url,
            imageUrl,
        };

        return event;
    }

    parseDateString(dateStr: string): ZonedDateTime | null {
        // Format: "May 28, 2026 8:00 PM"
        const match = dateStr.trim().match(/^(\w+)\s+(\d+),\s+(\d{4})\s+(\d+):(\d+)\s+(AM|PM)$/i);
        if (!match) return null;

        const [, monthName, dayStr, yearStr, hourStr, minStr, ampm] = match;
        const month = MONTH_NAMES[monthName.toLowerCase()];
        if (!month) return null;

        let hour = parseInt(hourStr, 10);
        const minute = parseInt(minStr, 10);

        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;

        try {
            const localDt = LocalDateTime.of(
                parseInt(yearStr, 10),
                month,
                parseInt(dayStr, 10),
                hour,
                minute
            );
            return localDt.atZone(TIMEZONE);
        } catch {
            return null;
        }
    }
}
