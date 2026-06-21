import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
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
        };
    };
}

function normalizeIsoOffset(dateStr: string): string {
    return dateStr.replace(/([+-])(\d{2})(\d{2})$/, '$1$2:$3');
}

function extractEvents(html: string): { events: HumanitixEvent[]; parseError?: RipperError } {
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
        try {
            const data: unknown = JSON.parse(match[1]);
            if (data !== null && typeof data === 'object' && !Array.isArray(data) &&
                (data as Record<string, unknown>)['@type'] === 'ItemList') {
                const items = (data as { itemListElement?: Array<Record<string, unknown>> }).itemListElement ?? [];
                const events: HumanitixEvent[] = [];
                for (const listItem of items) {
                    const event = ((listItem['item'] ?? listItem) as HumanitixEvent);
                    if (event?.['@type'] === 'Event') events.push(event);
                }
                if (events.length > 0) return { events };
            }
        } catch { /* skip malformed JSON-LD */ }
    }
    return {
        events: [],
        parseError: { type: "ParseError", reason: "No Humanitix ItemList JSON-LD found on page", context: "black-tan-hall" }
    };
}

export default class BlackTanHallRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`Black & Tan Hall returned HTTP ${res.status}`);

        const html = await res.text();
        const { events: rawEvents, parseError } = extractEvents(html);
        const errors: RipperError[] = parseError ? [parseError] : [];
        const events: RipperCalendarEvent[] = [];
        const seen = new Set<string>();

        for (const event of rawEvents) {
            if (event['@type'] !== 'Event') continue;
            if (seen.has(event.url)) continue;
            seen.add(event.url);

            let startZdt: ZonedDateTime;
            try {
                startZdt = ZonedDateTime.parse(normalizeIsoOffset(event.startDate)).withZoneSameInstant(timezone);
            } catch {
                errors.push({ type: "ParseError", reason: `Invalid startDate: ${event.startDate}`, context: event.name });
                continue;
            }

            if (startZdt.isBefore(now)) continue;

            let duration = Duration.ofHours(2);
            if (event.endDate) {
                try {
                    const endZdt = ZonedDateTime.parse(normalizeIsoOffset(event.endDate)).withZoneSameInstant(timezone);
                    const diffMinutes = Duration.between(startZdt, endZdt).toMinutes();
                    if (diffMinutes > 0 && diffMinutes <= 8 * 60) duration = Duration.ofMinutes(diffMinutes);
                } catch { /* keep default duration */ }
            }

            const slug = event.url.split('/').filter(Boolean).pop() ?? '';
            const location = event.location?.address?.streetAddress
                ? (event.location.name
                    ? `${event.location.name}, ${event.location.address.streetAddress}`
                    : event.location.address.streetAddress)
                : undefined;

            events.push({
                id: `black-tan-hall-${slug}`,
                ripped: new Date(),
                date: startZdt,
                duration,
                summary: decode(event.name),
                description: event.description ? decode(event.description).substring(0, 500) : undefined,
                location,
                url: event.url,
                imageUrl: event.image,
                cost: { paid: true },
            });
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
