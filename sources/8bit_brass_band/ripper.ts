import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";

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

/** Extract event URLs from the Wix event-pages sitemap XML. */
export function extractSitemapUrls(xml: string): string[] {
    const matches = [...xml.matchAll(/<loc>(https:\/\/www\.8bitbrassband\.com\/event-details\/[^<]+)<\/loc>/g)];
    return matches.map(m => m[1]);
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
        } catch {}
    }
    return null;
}

/**
 * Returns true if the event location is in Washington state (Seattle area).
 * Skips events with explicit non-WA US state addresses (OR, TX, LA, etc.).
 * Events without a state-specific address are included — the band is
 * Seattle-based and their non-location-tagged events are typically local.
 */
export function isWashingtonEvent(location: WixEventJsonLd["location"]): boolean {
    const address = location?.address ?? "";

    // Explicit WA address → include
    if (/, WA /.test(address)) return true;

    // Explicit non-WA state in address → skip
    if (/, (OR|TX|LA|CA|NY|FL|CO|AZ|NV|WI|MN|MA|IL|OH|PA|GA)[,\s]/.test(address)) return false;

    // No state-specific address → include (Seattle-based band)
    return true;
}

/**
 * Parse a single event from its JSON-LD and event page URL.
 * Returns the event, or a ParseError if the data is malformed.
 * Filtering (past events, non-WA location) is the caller's responsibility.
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

    let duration = Duration.ofHours(3);
    if (jsonLd.endDate) {
        try {
            const endZdt = ZonedDateTime.parse(jsonLd.endDate).withZoneSameInstant(timezone);
            const diffMinutes = Duration.between(startZdt, endZdt).toMinutes();
            if (diffMinutes > 0) duration = Duration.ofMinutes(diffMinutes);
        } catch {}
    }

    const slug = eventUrl.split("/event-details/")[1] ?? eventUrl;
    const location =
        jsonLd.location?.address ||
        (jsonLd.location?.name ? `${jsonLd.location.name}, Seattle, WA` : "Seattle, WA");

    return {
        id: `8bit-brass-band-${slug}`,
        ripped: new Date(),
        date: startZdt,
        duration,
        summary: jsonLd.name,
        description: jsonLd.description,
        location,
        url: eventUrl,
        imageUrl: jsonLd.image?.url,
    };
}

export default class EightBitBrassBandRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        // Fetch event-pages sitemap to discover all published event URLs
        const sitemapRes = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": USER_AGENT },
        });
        if (!sitemapRes.ok) throw new Error(`Sitemap fetch failed: HTTP ${sitemapRes.status}`);
        const sitemapXml = await sitemapRes.text();
        const eventUrls = extractSitemapUrls(sitemapXml);

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

            // Skip events outside Seattle/WA area
            if (!isWashingtonEvent(jsonLd.location)) continue;

            const result = parseEventFromJsonLd(jsonLd, eventUrl, timezone);
            if ("date" in result) {
                // Skip past events
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
