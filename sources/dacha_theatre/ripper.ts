import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

interface HumanitixEvent {
    "@type": string;
    name: string;
    url: string;
    startDate: string;
    endDate?: string;
    description?: string;
    image?: string;
    location?: {
        name?: string;
        address?: {
            streetAddress?: string;
            addressLocality?: string;
        };
    };
}

// Humanitix emits offsets like "-0700" (no colon); js-joda requires "-07:00".
function normalizeIsoOffset(dateStr: string): string {
    return dateStr.replace(/([+-])(\d{2})(\d{2})$/, '$1$2:$3');
}

// Extract unique Humanitix event page URLs from Dacha homepage HTML.
export function extractHumanitixLinks(html: string): string[] {
    const linkRegex = /https?:\/\/events\.humanitix\.com\/([a-z0-9-]+)/g;
    const seen = new Set<string>();
    const links: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
        const clean = `https://events.humanitix.com/${m[1]}`;
        if (!seen.has(clean)) {
            seen.add(clean);
            links.push(clean);
        }
    }
    return links;
}

// Extract events from a Humanitix per-production page (JSON array of Event objects).
export function extractDachaEvents(html: string): { events: HumanitixEvent[]; parseError?: RipperError } {
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
        try {
            const data: unknown = JSON.parse(match[1]);
            if (
                Array.isArray(data) &&
                data.length > 0 &&
                (data as Record<string, unknown>[])[0]['@type'] === 'Event'
            ) {
                return { events: data as HumanitixEvent[] };
            }
        } catch { /* skip malformed JSON-LD */ }
    }
    return {
        events: [],
        parseError: {
            type: "ParseError",
            reason: "No Event array JSON-LD found on page",
            context: "dacha-theatre",
        },
    };
}

export function parseDachaEvents(
    rawEvents: HumanitixEvent[],
    now: ZonedDateTime,
    timezone: ZoneId,
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];

    for (const event of rawEvents) {
        if (event['@type'] !== 'Event') continue;

        let startZdt: ZonedDateTime;
        try {
            startZdt = ZonedDateTime.parse(normalizeIsoOffset(event.startDate)).withZoneSameInstant(timezone);
        } catch {
            errors.push({
                type: "ParseError",
                reason: `Invalid startDate: ${event.startDate}`,
                context: event.name,
            });
            continue;
        }

        if (startZdt.isBefore(now)) continue;

        let duration = Duration.ofHours(2);
        if (event.endDate) {
            try {
                const endZdt = ZonedDateTime.parse(normalizeIsoOffset(event.endDate)).withZoneSameInstant(timezone);
                const diffMinutes = Duration.between(startZdt, endZdt).toMinutes();
                if (diffMinutes > 0 && diffMinutes <= 8 * 60) {
                    duration = Duration.ofMinutes(diffMinutes);
                }
            } catch { /* keep default duration */ }
        }

        // ID: slug from URL + start datetime digits, stable across builds.
        const slug = event.url.split('/').filter(Boolean).pop() ?? '';
        const startClean = event.startDate.replace(/[^0-9T]/g, '').substring(0, 15);
        const id = `dacha-${slug}-${startClean}`;

        const location = event.location?.address?.streetAddress
            ? event.location.name
                ? `${event.location.name}, ${event.location.address.streetAddress}`
                : event.location.address.streetAddress
            : undefined;

        events.push({
            id,
            ripped: new Date(),
            date: startZdt,
            duration,
            summary: event.name,
            description: event.description?.trim().substring(0, 500) || undefined,
            location,
            url: event.url,
            image: event.image,
        });
    }

    return { events, errors };
}

export default class DachaTheatreRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const homeRes = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!homeRes.ok) throw new Error(`Dacha Theatre homepage returned HTTP ${homeRes.status}`);

        const homeHtml = await homeRes.text();
        const humanitixUrls = extractHumanitixLinks(homeHtml);

        const allEvents: RipperCalendarEvent[] = [];
        const allErrors: RipperError[] = [];

        if (humanitixUrls.length === 0) {
            allErrors.push({
                type: "ParseError",
                reason: "No Humanitix event links found on Dacha homepage",
                context: "dacha-theatre",
            });
        }

        for (const url of humanitixUrls) {
            const res = await fetchFn(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
            });
            if (!res.ok) {
                allErrors.push({
                    type: "ParseError",
                    reason: `Humanitix event page returned HTTP ${res.status}`,
                    context: url,
                });
                continue;
            }
            const html = await res.text();
            const { events: rawEvents, parseError } = extractDachaEvents(html);
            if (parseError) allErrors.push(parseError);
            const { events, errors } = parseDachaEvents(rawEvents, now, timezone);
            allEvents.push(...events);
            allErrors.push(...errors);
        }

        const calConfig = ripper.config.calendars[0];
        if (!calConfig) throw new Error("Dacha Theatre ripper requires at least one calendar configuration");
        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: allEvents,
            errors: allErrors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
