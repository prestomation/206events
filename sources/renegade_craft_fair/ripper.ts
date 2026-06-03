import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Stable event page slugs for Seattle — these pages are updated each year with new dates.
const SEATTLE_SLUGS = ["seattle-spring", "seattle-fall", "seattle-winter"];
const BASE_URL = "https://www.renegadecraft.com/event/";

/**
 * Parse a date string in the format produced by the site's "Add to Calendar" widget:
 * "MM/DD/YYYY H:MM am" or "MM/DD/YYYY H:MM pm"
 */
export function parseAddeventatcDate(dateStr: string): LocalDateTime | null {
    const parts = dateStr.trim().split(/\s+/);
    if (parts.length < 3) return null;

    const dateParts = parts[0].split("/");
    if (dateParts.length !== 3) return null;

    const timeParts = parts[1].split(":");
    if (timeParts.length !== 2) return null;

    const month = parseInt(dateParts[0], 10);
    const day = parseInt(dateParts[1], 10);
    const year = parseInt(dateParts[2], 10);
    let hour = parseInt(timeParts[0], 10);
    const minute = parseInt(timeParts[1], 10);
    const meridiem = parts[2].toLowerCase();

    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    try {
        return LocalDateTime.of(year, month, day, hour, minute);
    } catch {
        return null;
    }
}

function extractSpanText(html: string, className: string): string | null {
    const match = html.match(new RegExp(`class="${className}"[^>]*>([\\s\\S]*?)<\\/span>`, "i"));
    return match ? match[1].trim() : null;
}

function extractThumbnailUrl(html: string): string | undefined {
    const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of scripts) {
        try {
            const data = JSON.parse(m[1]);
            const graph: unknown[] = Array.isArray(data['@graph']) ? data['@graph'] : [data];
            for (const node of graph) {
                const n = node as Record<string, unknown>;
                if (typeof n.thumbnailUrl === 'string') return n.thumbnailUrl;
            }
        } catch { /* skip malformed JSON */ }
    }
    return undefined;
}

/**
 * Parse all "Add to Calendar" event blocks from an event page's HTML.
 * Each block corresponds to one day of the fair.
 */
export function parseEventsFromHtml(html: string, url: string): (RipperCalendarEvent | ParseError)[] {
    const events: (RipperCalendarEvent | ParseError)[] = [];
    const image = extractThumbnailUrl(html);

    const blockRegex = /<div[^>]+class="addeventatc"[^>]*>([\s\S]*?)<\/div>/g;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(html)) !== null) {
        const block = match[1];

        const startStr = extractSpanText(block, "start");
        if (!startStr) {
            events.push({ type: "ParseError", reason: "Missing start span in addeventatc block", context: url });
            continue;
        }

        const startLocal = parseAddeventatcDate(startStr);
        if (!startLocal) {
            events.push({ type: "ParseError", reason: `Unparseable start date: ${startStr}`, context: url });
            continue;
        }

        const tzStr = extractSpanText(block, "timezone") || "America/Los_Angeles";
        let zone: ZoneId;
        try {
            zone = ZoneId.of(tzStr);
        } catch {
            zone = ZoneId.of("America/Los_Angeles");
        }
        const startDate = ZonedDateTime.of(startLocal, zone);

        let duration = Duration.ofHours(6);
        const endStr = extractSpanText(block, "end");
        if (endStr) {
            const endLocal = parseAddeventatcDate(endStr);
            if (endLocal) {
                const endDate = ZonedDateTime.of(endLocal, zone);
                const diffMillis = endDate.toInstant().toEpochMilli() - startDate.toInstant().toEpochMilli();
                if (diffMillis > 0) duration = Duration.ofMillis(diffMillis);
            }
        }

        const rawLocation = extractSpanText(block, "location");
        const location = rawLocation ? rawLocation.replace(/\s+/g, " ").trim() : undefined;

        const title = extractSpanText(block, "title") || "Renegade Craft Fair Seattle";

        const dateKey = startLocal.toLocalDate().toString();
        const id = `renegade-craft-fair-seattle-${dateKey}`;

        events.push({
            id,
            ripped: new Date(),
            date: startDate,
            duration,
            summary: title,
            location,
            url,
            imageUrl: image,
        });
    }

    return events;
}

export default class RenegadeCraftFairRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const slug of SEATTLE_SLUGS) {
            const url = `${BASE_URL}${slug}/`;

            let res: Response;
            try {
                res = await fetchFn(url, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
                });
            } catch (err) {
                errors.push({ type: "ParseError", reason: `Fetch failed for ${url}: ${err}`, context: slug });
                continue;
            }

            if (!res.ok) {
                errors.push({ type: "ParseError", reason: `HTTP ${res.status} fetching ${url}`, context: slug });
                continue;
            }

            const html = await res.text();
            const results = parseEventsFromHtml(html, url);

            for (const result of results) {
                if ("date" in result) {
                    if (!result.date.isBefore(now)) events.push(result);
                } else {
                    errors.push(result);
                }
            }
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
}
