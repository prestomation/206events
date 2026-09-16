import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_DURATION_MINUTES = 90;

// The RSS feed's mec:location field is a bare venue name (no address). SDSM
// hosts almost everything at its own Georgetown space, plus an occasional
// off-site show; map the venues we've seen to a full street address for
// precise geocoding. An unrecognized future venue falls back to the bare
// name, which the geocoder will attempt on its own.
export const KNOWN_VENUES: Record<string, string> = {
    "The LAB@1010 | SDSM Georgetown": "The LAB @ 1010, 1010 S Bailey St, Seattle, WA 98108",
    "Hellbent Brewery": "Hellbent Brewing Company, 13035 Lake City Way NE, Seattle, WA 98125",
};

// A weekly church congregation's worship service rented into the space —
// not a general public community event in the sense the rest of this feed
// is, so it's filtered out before parsing rather than published as one.
const SKIPPED_TITLE_SUBSTRINGS = ["Church Service"];

export interface RawSdsmItem {
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

export function extractFeedItems(xml: string): RawSdsmItem[] {
    const items: RawSdsmItem[] = [];
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

export function isSkippedTitle(title: string): boolean {
    const decoded = decodeHtmlEntities(title);
    return SKIPPED_TITLE_SUBSTRINGS.some(s => decoded.includes(s));
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

// The feed unrolls each recurring listing (e.g. "Must Sing Now") into a
// separate <item> per future occurrence, all sharing one guid/post id — the
// occurrence's own startDate has to be folded into the id or every future
// occurrence would collide onto a single event.
export function parseFeedItem(raw: RawSdsmItem, zone: ZoneId): RipperEvent {
    const { title, link, guid, startDate, startHour, endDate, endHour, location } = raw;
    if (!title || !link || !guid || !startDate || !startHour || !endDate || !endHour || !location) {
        return {
            type: "ParseError",
            reason: "Missing a required field (title/link/guid/start/end/location) in Seattle Drum School RSS item",
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
    try {
        eventDate = ZonedDateTime.of(LocalDateTime.of(start.year, start.month, start.day, start.hour, start.minute), zone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid date/time for event "${title}": ${error}`, context: title };
    }

    let diffMinutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute);
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    const duration = diffMinutes > 0 ? Duration.ofMinutes(diffMinutes) : Duration.ofMinutes(DEFAULT_DURATION_MINUTES);

    const postIdMatch = decodeHtmlEntities(guid).match(/[?&]p=(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : decodeHtmlEntities(title).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const id = `seattle-drum-school-${postId}-${startDate}`;

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

export default class SeattleDrumSchoolRipper implements IRipper {
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
        const rawItems = extractFeedItems(xml).filter(raw => !(raw.title && isSkippedTitle(raw.title)));

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
