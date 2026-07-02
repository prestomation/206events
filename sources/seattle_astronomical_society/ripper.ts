import { Duration, LocalDate, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const EVENT_URL_PREFIX = "https://www.seattleastro.org/events-1/";

interface WixEventJsonLd {
    "@type": string;
    name: string;
    description?: string;
    startDate: string;
    endDate?: string;
    location?: {
        "@type"?: string;
        name?: string;
        address?: string;
        url?: string;
    };
    image?: {
        "@type"?: string;
        url?: string;
    };
}

/** Extract event page URLs from the Wix event-pages sitemap XML. */
export function extractSitemapUrls(xml: string): string[] {
    const matches = [...xml.matchAll(/<loc>(https:\/\/www\.seattleastro\.org\/events-1\/[^<]+)<\/loc>/g)];
    return matches.map(m => m[1]);
}

/**
 * The club's event slugs end in a `-YYYY-MM-DD-HH-MM` timestamp (optionally
 * followed by a Wix de-dupe suffix like `-2`). Extracting the date lets the
 * ripper skip fetching the ~200 historical event pages that also live in the
 * sitemap, without needing to parse every page just to find out it's past.
 * Slugs without a recognizable date (e.g. a stray "test-event" page) return
 * null and are skipped — every real event on this site follows the pattern.
 */
export function extractSlugDate(url: string): LocalDate | null {
    const match = url.match(/(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}(?:-\d+)?$/);
    if (!match) return null;
    const [, year, month, day] = match;
    try {
        return LocalDate.of(Number(year), Number(month), Number(day));
    } catch {
        return null;
    }
}

/** Extract the first schema.org/Event JSON-LD object from an event detail page. */
export function extractEventJsonLd(html: string): WixEventJsonLd | null {
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
        try {
            const data: unknown = JSON.parse(match[1]);
            if (data && typeof data === "object" && !Array.isArray(data) &&
                (data as WixEventJsonLd)["@type"] === "Event") {
                return data as WixEventJsonLd;
            }
        } catch { }
    }
    return null;
}

/**
 * The club serves the whole Puget Sound region (Woodinville, Snoqualmie,
 * Duvall, Bonney Lake, Covington, even Goldendale for a dark-sky site) —
 * only a minority of its events are physically in Seattle. Unlike a
 * single-city source, this ripper requires an explicit "Seattle, WA"
 * address rather than defaulting missing/ambiguous addresses to "include",
 * so out-of-city and virtual (Zoom) events are excluded.
 */
export function isSeattleEvent(location: WixEventJsonLd["location"]): boolean {
    const address = location?.address ?? "";
    return /(^|,)\s*Seattle,\s*WA\b/i.test(address);
}

/**
 * Parse a single event from its JSON-LD and event page URL.
 * Returns the event, or a ParseError if the data is malformed.
 * Filtering (past events, non-Seattle location) is the caller's responsibility.
 */
export function parseEventFromJsonLd(
    jsonLd: WixEventJsonLd,
    eventUrl: string,
    timezone: ZoneId,
): RipperCalendarEvent | RipperError {
    let startZdt: ZonedDateTime;
    try {
        startZdt = ZonedDateTime.parse(jsonLd.startDate).withZoneSameInstant(timezone);
    } catch {
        return {
            type: "ParseError",
            reason: `Invalid startDate: ${jsonLd.startDate}`,
            context: jsonLd.name,
        };
    }

    let duration = Duration.ofHours(2);
    if (jsonLd.endDate) {
        try {
            const endZdt = ZonedDateTime.parse(jsonLd.endDate).withZoneSameInstant(timezone);
            const diffMinutes = Duration.between(startZdt, endZdt).toMinutes();
            if (diffMinutes > 0) duration = Duration.ofMinutes(diffMinutes);
        } catch { }
    }

    const slug = eventUrl.startsWith(EVENT_URL_PREFIX) ? eventUrl.slice(EVENT_URL_PREFIX.length) : eventUrl;

    return {
        id: `seattle-astronomical-society-${slug}`,
        ripped: new Date(),
        date: startZdt,
        duration,
        summary: jsonLd.name,
        description: jsonLd.description,
        location: jsonLd.location?.address,
        url: eventUrl,
        imageUrl: jsonLd.image?.url,
    };
}

export default class SeattleAstronomicalSocietyRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);
        const today = now.toLocalDate();

        const sitemapRes = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": USER_AGENT },
        });
        if (!sitemapRes.ok) throw new Error(`Sitemap fetch failed: HTTP ${sitemapRes.status}`);
        const sitemapXml = await sitemapRes.text();

        const eventUrls = extractSitemapUrls(sitemapXml)
            .filter(url => {
                const slugDate = extractSlugDate(url);
                return slugDate !== null && !slugDate.isBefore(today);
            });

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const eventUrl of eventUrls) {
            const pageRes = await fetchFn(eventUrl, { headers: { "User-Agent": USER_AGENT } });
            if (!pageRes.ok) {
                errors.push({
                    type: "ParseError",
                    reason: `HTTP ${pageRes.status} fetching event page`,
                    context: eventUrl,
                });
                continue;
            }

            const html = await pageRes.text();
            const jsonLd = extractEventJsonLd(html);
            if (!jsonLd) {
                errors.push({ type: "ParseError", reason: "No JSON-LD Event found", context: eventUrl });
                continue;
            }

            // Skip events outside Seattle proper (regional club — see isSeattleEvent)
            if (!isSeattleEvent(jsonLd.location)) continue;

            const result = parseEventFromJsonLd(jsonLd, eventUrl, timezone);
            if ("date" in result) {
                if (result.date.isBefore(now)) continue;
                events.push(result);
            } else {
                errors.push(result);
            }
        }

        const calConfig = ripper.config.calendars[0];
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
