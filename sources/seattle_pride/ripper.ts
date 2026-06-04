import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const DEFAULT_DURATION_HOURS = 2;
const DEFAULT_START_HOUR = 12; // noon for date-only or all-day events

const MONTHS: Record<string, number> = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
};

export interface EventCard {
    title: string;
    dateText: string;
    description: string;
    link: string;
}

export interface ParsedDateTime {
    year: number;
    month: number;
    day: number;
    startHour: number;
    startMinute: number;
    endHour?: number;
    endMinute?: number;
}

export function parseEventCards(html: string): EventCard[] {
    const root = parse(html);
    const cardEls = root.querySelectorAll('.wrap_card');
    const cards: EventCard[] = [];

    for (const card of cardEls) {
        const divs = card.querySelectorAll('div');
        if (divs.length < 2) continue;

        const dateText = divs[0].innerText.trim();
        const linkEl = card.querySelector('a[href]');
        const title = linkEl?.innerText.trim() ?? '';
        const link = linkEl?.getAttribute('href') ?? '';
        // Last div is the description
        const description = divs[divs.length - 1].innerText.trim();

        if (!title || !dateText) continue;

        cards.push({ title, dateText, description, link });
    }

    return cards;
}

export function parseDateText(dateText: string, currentYear: number): ParsedDateTime | null {
    // Normalize: join lines and collapse whitespace so multi-line dates become single-line
    const normalized = dateText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .join(' ');

    // Pattern: "Month Day, ( Year | H:MM am/pm [- H:MM am/pm] )"
    // The comma after the day is followed by either a 4-digit year or a time.
    // Stops after the optional end time, ignoring multi-date annotations that follow.
    const re = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s+(?:(\d{4})|(\d{1,2}):(\d{2})\s*(am|pm)(?:\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm))?))?/i;

    const match = normalized.match(re);
    if (!match) return null;

    const month = MONTHS[match[1].toLowerCase()];
    const day = parseInt(match[2]);
    const year = match[3] ? parseInt(match[3]) : currentYear;

    if (!month || !day) return null;

    if (!match[4]) {
        // Date only, no time — use noon
        return { year, month, day, startHour: DEFAULT_START_HOUR, startMinute: 0 };
    }

    let startHour = parseInt(match[4]);
    const startMinute = parseInt(match[5]);
    const startAmPm = match[6].toLowerCase();

    if (startAmPm === 'pm' && startHour !== 12) startHour += 12;
    if (startAmPm === 'am' && startHour === 12) startHour = 0;

    // Midnight-to-midnight indicates time unknown — use noon
    if (startHour === 0 && startMinute === 0) {
        return { year, month, day, startHour: DEFAULT_START_HOUR, startMinute: 0 };
    }

    let endHour: number | undefined;
    let endMinute: number | undefined;

    if (match[7]) {
        endHour = parseInt(match[7]);
        endMinute = parseInt(match[8]);
        const endAmPm = match[9].toLowerCase();
        if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
        if (endAmPm === 'am' && endHour === 12) endHour = 0;
    }

    return { year, month, day, startHour, startMinute, endHour, endMinute };
}

export function parseLocationFromHtml(html: string): string | null {
    const root = parse(html);
    // The address is in a div.text-sm that contains "Seattle, WA" and a zip code
    const textSmDivs = root.querySelectorAll('div.text-sm');
    for (const div of textSmDivs) {
        const text = div.innerText;
        if (/Seattle,\s*WA/i.test(text) && /\d{5}/.test(text)) {
            // Remove "Directions" link text and collapse whitespace
            return text.replace(/\s*Directions\s*/g, '').replace(/\s+/g, ' ').trim();
        }
    }
    return null;
}

export function parseImageFromHtml(html: string): string | null {
    const root = parse(html);
    // Per-event hero image is exposed as og:image on the detail page.
    const meta = root.querySelectorAll('meta[property="og:image"], meta[name="og:image"]');
    for (const m of meta) {
        const content = m.getAttribute('content')?.trim();
        if (content && /^https?:\/\//i.test(content)) {
            return content;
        }
    }
    return null;
}

export default class SeattlePrideRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);
        const currentYear = now.year();

        const res = await this.fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`Seattle Pride events page returned ${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const cards = parseEventCards(html);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const card of cards) {
            const eventUrl = card.link.startsWith('http')
                ? card.link
                : `https://seattlepride.org${card.link}`;

            // Fetch detail page for location and per-event image
            let location: string | null = null;
            let imageUrl: string | null = null;
            if (card.link) {
                try {
                    const detailRes = await this.fetchFn(eventUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
                    });
                    if (detailRes.ok) {
                        const detailHtml = await detailRes.text();
                        location = parseLocationFromHtml(detailHtml);
                        imageUrl = parseImageFromHtml(detailHtml);
                    }
                } catch {
                    // location and image are optional — continue without them
                }
            }

            const result = this.parseCard(card, currentYear, location, zone, eventUrl, imageUrl);

            // Skip past events
            if ('date' in result && result.date.isBefore(now)) continue;

            if ('date' in result) events.push(result);
            else errors.push(result);
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing — returns RipperCalendarEvent or RipperError, never null.
    // Past-event filtering and detail-page fetching are handled in the caller.
    parseCard(
        card: EventCard,
        currentYear: number,
        location: string | null,
        zone: ZoneId,
        eventUrl: string,
        imageUrl: string | null = null,
    ): RipperCalendarEvent | RipperError {
        const parsed = parseDateText(card.dateText, currentYear);
        if (!parsed) {
            return {
                type: 'ParseError',
                reason: `Unparseable date: ${card.dateText.substring(0, 100)}`,
                context: card.title,
            };
        }

        const { year, month, day, startHour, startMinute, endHour, endMinute } = parsed;

        let eventDate: ZonedDateTime;
        try {
            eventDate = ZonedDateTime.of(
                LocalDateTime.of(year, month, day, startHour, startMinute),
                zone
            );
        } catch {
            return {
                type: 'ParseError',
                reason: `Invalid date components: ${year}-${month}-${day} ${startHour}:${startMinute}`,
                context: card.title,
            };
        }

        let duration = Duration.ofHours(DEFAULT_DURATION_HOURS);
        if (endHour !== undefined) {
            const startMins = startHour * 60 + startMinute;
            const endMins = endHour * 60 + (endMinute ?? 0);
            if (endMins > startMins) {
                duration = Duration.ofMinutes(endMins - startMins);
            }
        }

        const slug = eventUrl.split('/').filter(Boolean).pop()
            ?? card.title.toLowerCase().replace(/\s+/g, '-');

        return {
            id: `seattle-pride-${slug}`,
            ripped: new Date(),
            date: eventDate,
            duration,
            summary: card.title,
            description: card.description || undefined,
            location: location ?? undefined,
            url: eventUrl,
            imageUrl: imageUrl ?? undefined,
        };
    }
}
