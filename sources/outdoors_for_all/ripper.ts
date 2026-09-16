import { ChronoUnit, Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decodeEntities } from "../../lib/text-normalize.js";
import { decodeUrlEntities } from "../../lib/url-entities.js";
import '@js-joda/timezone';

// Placeholder time/duration for listings that omit mec:startHour/mec:endHour
// (a handful of recurring programs, e.g. "Learn to Ride", are published with
// a date but no time). The event still gets emitted so it shows up on the
// calendar; the infrastructure layer pairs it with an UncertaintyError so the
// event-uncertainty-resolver skill can fill in the real time on a later
// build. See docs/event-uncertainty.md.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
const DEFAULT_UNKNOWN_DURATION = Duration.ofHours(2);
const DEFAULT_DURATION = Duration.ofHours(1);

// Outdoors for All is a regional (Puget Sound-wide) adaptive-recreation
// nonprofit, not a Seattle-only one — its RSS feed also lists hikes and
// gravel rides at trailheads well outside city limits (Snoqualmie Valley,
// the I-90 corridor) and one program hosted in Bellevue. Per AGENTS.md, only
// events with a *known Seattle* mec:location are kept; every other location
// (including an empty mec:location) is dropped in the caller. Same "curated
// address allowlist" shape as sources/seattle_drum_school's KNOWN_VENUES.
export const KNOWN_SEATTLE_VENUES: Record<string, string> = {
    "Magnuson Park": "6344 NE 74th St, Seattle, WA 98115",
    "Old Stove Brewing Ballard": "1550 NW 49th St, Seattle, WA 98107",
};

export interface RawOfaItem {
    title?: string;
    link?: string;
    guid?: string;
    startDate?: string;
    startHour?: string;
    endDate?: string;
    endHour?: string;
    location?: string;
    description?: string;
}

export function extractFeedItems(xml: string): RawOfaItem[] {
    const items: RawOfaItem[] = [];
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
            description: field(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/),
        });
    }
    return items;
}

export function resolveSeattleVenue(location: string | undefined): string | undefined {
    if (!location) return undefined;
    return KNOWN_SEATTLE_VENUES[location.trim()];
}

export function parseMecDate(dateStr: string): { year: number; month: number; day: number } | null {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

export function parseMecHour(hourStr: string | undefined): { hour: number; minute: number } | null {
    if (!hourStr || hourStr.trim().length === 0) return null;
    const m = hourStr.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const period = m[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return { hour, minute };
}

export function extractImageAndDescription(raw: string | undefined): { imageUrl?: string; description?: string } {
    if (!raw) return {};
    const imgMatch = raw.match(/<img[^>]*\ssrc="([^"]+)"/);
    const imageUrl = imgMatch ? decodeUrlEntities(imgMatch[1]) : undefined;
    const withoutImg = raw.replace(/<img[^>]*>/, "");
    const withoutTags = withoutImg.replace(/<[^>]*>/g, "");
    const description = decodeEntities(withoutTags).trim();
    return { imageUrl, description: description.length > 0 ? description : undefined };
}

// The feed unrolls each recurring listing (e.g. "Learn to Ride") into a
// separate <item> per future occurrence, all sharing one guid/post id — the
// occurrence's own startDate has to be folded into the id or every future
// occurrence would collide onto a single event.
export function parseFeedItem(raw: RawOfaItem, zone: ZoneId, seattleLocation: string): RipperEvent {
    const { title, link, guid, startDate } = raw;
    if (!title || !link || !guid || !startDate) {
        return {
            type: "ParseError",
            reason: "Missing a required field (title/link/guid/startDate) in Outdoors for All RSS item",
            context: title ?? link ?? guid,
        };
    }

    const start = parseMecDate(startDate);
    if (!start) {
        return { type: "ParseError", reason: `Could not parse start date: "${startDate}"`, context: title };
    }

    const startTime = parseMecHour(raw.startHour);
    const hour = startTime?.hour ?? DEFAULT_UNKNOWN_TIME_HOUR;
    const minute = startTime?.minute ?? DEFAULT_UNKNOWN_TIME_MINUTE;

    let eventDate: ZonedDateTime;
    try {
        eventDate = ZonedDateTime.of(LocalDateTime.of(start.year, start.month, start.day, hour, minute), zone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid date/time for event "${title}": ${error}`, context: title };
    }

    let duration = startTime ? DEFAULT_DURATION : DEFAULT_UNKNOWN_DURATION;
    const end = raw.endDate ? parseMecDate(raw.endDate) : null;
    const endTime = parseMecHour(raw.endHour);
    if (startTime && end && endTime) {
        try {
            const endDate = ZonedDateTime.of(LocalDateTime.of(end.year, end.month, end.day, endTime.hour, endTime.minute), zone);
            const minutes = eventDate.until(endDate, ChronoUnit.MINUTES);
            if (minutes > 0) duration = Duration.ofMinutes(minutes);
        } catch {
            // Keep the default duration — the end date/time was malformed.
        }
    }

    const postIdMatch = decodeEntities(guid).match(/[?&]p=(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : decodeEntities(title).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const id = `outdoors-for-all-${postId}-${startDate}`;

    const { imageUrl, description } = extractImageAndDescription(raw.description);

    return {
        id,
        ripped: new Date(),
        date: eventDate,
        duration,
        summary: decodeEntities(title),
        description,
        location: seattleLocation,
        url: decodeUrlEntities(link),
        imageUrl,
    };
}

export default class OutdoorsForAllRipper implements IRipper {
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
            // Outdoors for All is regional, not Seattle-only — drop any
            // listing whose location isn't a known Seattle venue rather than
            // reporting it as a parse gap. See KNOWN_SEATTLE_VENUES.
            const seattleLocation = resolveSeattleVenue(raw.location);
            if (!seattleLocation) continue;

            const result = parseFeedItem(raw, zone, seattleLocation);
            if (!("date" in result)) {
                errors.push(result);
                continue;
            }
            if (result.date.isBefore(now)) continue;
            events.push(result);

            if (!parseMecHour(raw.startHour)) {
                const unknownFields: UncertaintyField[] = ["startTime", "duration"];
                errors.push({
                    type: "Uncertainty",
                    reason: `Outdoors for All listing did not include a start time (date: "${raw.startDate}")`,
                    source: "outdoors-for-all",
                    unknownFields,
                    event: result,
                    partialFingerprint: fingerprint(result.summary, raw.startDate ?? ''),
                });
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

function fingerprint(title: string, dateText: string): string {
    const s = `${title}|${dateText}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
