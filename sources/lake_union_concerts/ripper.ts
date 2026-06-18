import { Duration, ZonedDateTime, ZoneId } from '@js-joda/core';
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, EventCost } from '../../lib/config/schema.js';
import { getFetchForConfig } from '../../lib/config/proxy-fetch.js';
import '@js-joda/timezone';

const TICKETS_URL = 'https://www.lakeunionconcerts.com/tickets';
const USER_AGENT_TICKETS = 'Mozilla/5.0 (compatible; 206events/1.0)';
const USER_AGENT_POSH = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface PoshEventJsonLd {
    '@context': string;
    '@type': string;
    name: string;
    startDate: string;
    endDate?: string;
    url?: string;
    description?: string;
    image?: string | string[];
    location?: {
        name?: string;
        address?: {
            streetAddress?: string;
        };
        geo?: {
            latitude?: number;
            longitude?: number;
        };
    };
    offers?: {
        price?: number;
        priceCurrency?: string;
    };
}

export function extractEventUrls(html: string): string[] {
    const matches = html.match(/https:\/\/posh\.vip\/e\/[a-z0-9-]+/g) ?? [];
    return [...new Set(matches)];
}

export function extractJsonLd(html: string): PoshEventJsonLd | null {
    const rscPattern = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let match: RegExpExecArray | null;

    while ((match = rscPattern.exec(html)) !== null) {
        let text: string;
        try {
            text = JSON.parse(`"${match[1]}"`);
        } catch {
            continue;
        }

        // Quick filter: must contain JSON-LD Event markers
        if (!text.includes('"@type"') || !text.includes('startDate') || !text.includes('Event')) continue;

        // Find the first { and try to parse the JSON-LD from there.
        // The RSC chunk for the JSON-LD is typically the object itself.
        const jsonStart = text.indexOf('{');
        if (jsonStart === -1) continue;

        // First try: parse the whole remainder as JSON (works when chunk is pure JSON-LD)
        try {
            const candidate = JSON.parse(text.slice(jsonStart)) as PoshEventJsonLd;
            if (candidate['@type'] === 'Event' && candidate['@context']?.includes('schema.org')) {
                return candidate;
            }
        } catch {
            // Fallback: use brace counting to find the JSON object boundary
            let depth = 0;
            let end = -1;
            for (let i = jsonStart; i < text.length; i++) {
                if (text[i] === '{') depth++;
                else if (text[i] === '}') {
                    depth--;
                    if (depth === 0) { end = i; break; }
                }
            }
            if (end === -1) continue;
            try {
                const candidate = JSON.parse(text.slice(jsonStart, end + 1)) as PoshEventJsonLd;
                if (candidate['@type'] === 'Event' && candidate['@context']?.includes('schema.org')) {
                    return candidate;
                }
            } catch {
                continue;
            }
        }
    }

    return null;
}

export function parseEventPage(
    html: string,
    eventUrl: string,
    now: ZonedDateTime,
    timezone: ZoneId,
): RipperCalendarEvent | RipperError {
    const jsonLd = extractJsonLd(html);
    if (!jsonLd) {
        return { type: 'ParseError', reason: 'No JSON-LD Event data found in RSC payload', context: eventUrl };
    }

    let startZdt: ZonedDateTime;
    try {
        startZdt = ZonedDateTime.parse(jsonLd.startDate).withZoneSameInstant(timezone);
    } catch {
        return { type: 'ParseError', reason: `Invalid startDate: ${jsonLd.startDate}`, context: jsonLd.name };
    }

    if (startZdt.isBefore(now)) {
        return { type: 'ParseError', reason: 'Event is in the past', context: jsonLd.name };
    }

    let duration = Duration.ofHours(3);
    if (jsonLd.endDate) {
        try {
            const endZdt = ZonedDateTime.parse(jsonLd.endDate).withZoneSameInstant(timezone);
            const diffMinutes = Duration.between(startZdt, endZdt).toMinutes();
            if (diffMinutes > 0) duration = Duration.ofMinutes(diffMinutes);
        } catch {}
    }

    const slug = eventUrl.split('/').filter(Boolean).pop() ?? '';
    const location = jsonLd.location?.address?.streetAddress
        || jsonLd.location?.name
        || 'Lake Union, Seattle, WA';

    const imageArr = Array.isArray(jsonLd.image) ? jsonLd.image : (jsonLd.image ? [jsonLd.image] : []);
    const imageUrl = imageArr.length > 0 ? imageArr[0] : undefined;

    let cost: EventCost | undefined;
    if (jsonLd.offers?.price !== undefined) {
        cost = { min: jsonLd.offers.price };
    }

    return {
        id: `lake-union-concerts-${slug}`,
        ripped: new Date(),
        date: startZdt,
        duration,
        summary: jsonLd.name,
        description: jsonLd.description?.substring(0, 2000),
        location,
        url: eventUrl,
        imageUrl,
        cost,
    };
}

export default class LakeUnionConcertsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of('America/Los_Angeles');
        const now = ZonedDateTime.now(timezone);
        const calConfig = ripper.config.calendars[0];

        const ticketsRes = await fetchFn(TICKETS_URL, {
            headers: { 'User-Agent': USER_AGENT_TICKETS },
        });
        if (!ticketsRes.ok) {
            throw new Error(`Lake Union Concerts tickets page returned HTTP ${ticketsRes.status}`);
        }

        const ticketsHtml = await ticketsRes.text();
        const eventUrls = extractEventUrls(ticketsHtml);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        if (eventUrls.length === 0) {
            errors.push({
                type: 'ParseError',
                reason: 'No posh.vip event links found on tickets page',
                context: TICKETS_URL,
            });
        }

        for (const eventUrl of eventUrls) {
            const eventRes = await fetchFn(eventUrl, {
                headers: { 'User-Agent': USER_AGENT_POSH },
            });
            if (!eventRes.ok) {
                errors.push({
                    type: 'ParseError',
                    reason: `Failed to fetch event page: HTTP ${eventRes.status}`,
                    context: eventUrl,
                });
                continue;
            }

            const eventHtml = await eventRes.text();
            const result = parseEventPage(eventHtml, eventUrl, now, timezone);
            if ('date' in result) {
                events.push(result);
            } else if (result.reason !== 'Event is in the past') {
                errors.push(result);
            }
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
        }];
    }
}
