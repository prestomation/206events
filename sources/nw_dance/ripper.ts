import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_DURATION_MINUTES = 90;

// The RSS feed's mec:location field is a bare venue name (no address). NW
// Dance rotates between a small set of known halls; map the ones we've seen
// to a full street address for precise geocoding. An unrecognized future
// venue falls back to the bare name, which the geocoder will attempt on its
// own (surfacing a GeocodeError if it can't resolve it).
export const KNOWN_VENUES: Record<string, string> = {
    "Leif Erikson Hall": "Leif Erikson Hall, 2245 NW 57th St, Seattle, WA 98107",
    "Sunset Hill Community Hall": "Sunset Hill Community Hall, 3003 NW 66th St, Seattle, WA 98117",
};

export interface RawNwDanceItem {
    title?: string;
    link?: string;
    guid?: string;
    startDate?: string;
    startHour?: string;
    endDate?: string;
    endHour?: string;
    location?: string;
    cost?: string;
    description?: string;
}

export function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&hellip;/g, '…')
        .replace(/&nbsp;/g, ' ');
}

export function extractFeedItems(xml: string): RawNwDanceItem[] {
    const items: RawNwDanceItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const field = (re: RegExp): string | undefined => block.match(re)?.[1]?.trim();
        items.push({
            title: field(/<title>([\s\S]*?)<\/title>/),
            link: field(/<link>([\s\S]*?)<\/link>/),
            guid: field(/<guid[^>]*>([\s\S]*?)<\/guid>/),
            startDate: field(/<mec:startDate>([\s\S]*?)<\/mec:startDate>/),
            startHour: field(/<mec:startHour>([\s\S]*?)<\/mec:startHour>/),
            endDate: field(/<mec:endDate>([\s\S]*?)<\/mec:endDate>/),
            endHour: field(/<mec:endHour>([\s\S]*?)<\/mec:endHour>/),
            location: field(/<mec:location>([\s\S]*?)<\/mec:location>/),
            cost: field(/<mec:cost>([\s\S]*?)<\/mec:cost>/),
            description: field(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/),
        });
    }
    return items;
}

export function parseMecDateTime(dateStr: string, hourStr: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) return null;

    const timeMatch = hourStr.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!timeMatch) return null;

    let hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    const period = timeMatch[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    return {
        year: parseInt(dateMatch[1], 10),
        month: parseInt(dateMatch[2], 10),
        day: parseInt(dateMatch[3], 10),
        hour,
        minute,
    };
}

export function parseCost(costText: string | undefined): EventCost | undefined {
    if (!costText) return undefined;
    const trimmed = costText.trim();
    if (/^free$/i.test(trimmed)) return { min: 0 };
    const m = trimmed.match(/\$(\d+(?:\.\d+)?)/);
    if (m) return { min: parseFloat(m[1]) };
    return { paid: true };
}

export function resolveLocation(venueName: string): string {
    return KNOWN_VENUES[venueName] ?? venueName;
}

export function extractImageAndDescription(raw: string | undefined): { imageUrl?: string; description?: string } {
    if (!raw) return {};
    const imgMatch = raw.match(/<img[^>]*\ssrc="([^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : undefined;
    const withoutImg = raw.replace(/<img[^>]*>/, "");
    const withoutTags = withoutImg.replace(/<[^>]*>/g, "");
    const description = decodeHtmlEntities(withoutTags).trim();
    return { imageUrl, description: description.length > 0 ? description : undefined };
}

export function parseFeedItem(raw: RawNwDanceItem, zone: ZoneId): RipperEvent {
    const { title, link, guid, startDate, startHour, endDate, endHour, location } = raw;
    if (!title || !link || !guid || !startDate || !startHour || !endDate || !endHour || !location) {
        return {
            type: "ParseError",
            reason: "Missing a required field (title/link/guid/start/end/location) in NW Dance RSS item",
            context: title ?? link ?? guid,
        };
    }

    const start = parseMecDateTime(startDate, startHour);
    if (!start) {
        return { type: "ParseError", reason: `Could not parse start date/time: "${startDate} ${startHour}"`, context: title };
    }
    const end = parseMecDateTime(endDate, endHour);
    if (!end) {
        return { type: "ParseError", reason: `Could not parse end date/time: "${endDate} ${endHour}"`, context: title };
    }

    let eventDate: ZonedDateTime;
    let endDateTime: ZonedDateTime;
    try {
        eventDate = ZonedDateTime.of(LocalDateTime.of(start.year, start.month, start.day, start.hour, start.minute), zone);
        endDateTime = ZonedDateTime.of(LocalDateTime.of(end.year, end.month, end.day, end.hour, end.minute), zone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid date/time for event "${title}": ${error}`, context: title };
    }

    let duration = Duration.ofMinutes(DEFAULT_DURATION_MINUTES);
    const diffMinutes = Duration.between(eventDate, endDateTime).toMinutes();
    if (diffMinutes > 0) duration = Duration.ofMinutes(diffMinutes);

    const postIdMatch = decodeHtmlEntities(guid).match(/[?&]p=(\d+)/);
    const id = postIdMatch ? `nw-dance-${postIdMatch[1]}` : `nw-dance-${startDate}-${decodeHtmlEntities(title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    const { imageUrl, description } = extractImageAndDescription(raw.description);

    return {
        id,
        ripped: new Date(),
        date: eventDate,
        duration,
        summary: decodeHtmlEntities(title),
        description,
        location: resolveLocation(decodeHtmlEntities(location)),
        url: link,
        imageUrl,
        cost: parseCost(raw.cost),
    };
}

export default class NwDanceRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`RSS feed returned ${res.status} ${res.statusText}`);
        }

        const xml = await res.text();
        const rawItems = extractFeedItems(xml);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        for (const raw of rawItems) {
            const result = parseFeedItem(raw, zone);
            if ("date" in result) {
                if (result.date.isBefore(now)) continue;
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
