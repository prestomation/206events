import { Duration, ZonedDateTime, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

// Salsa Vida's Seattle guide page embeds a schema.org ItemList of the next
// ~2 weeks of social-dance occurrences as a single JSON-LD block — full
// start/end time (with offset), venue address + lat/lng, and price all in
// one fetch. No per-event page fetch needed.
const SOURCE_URL = "https://www.salsavida.com/guides/washington/seattle/";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const SEATTLE_LOCALITY = "Seattle";
const DEFAULT_DURATION = Duration.ofHours(2);

interface LdAddress {
    streetAddress?: string;
    addressLocality?: string;
}

interface LdGeo {
    latitude?: number;
    longitude?: number;
}

interface LdLocation {
    name?: string;
    address?: LdAddress;
    geo?: LdGeo;
}

interface LdOffer {
    price?: string;
}

interface LdEvent {
    name?: string;
    url?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    image?: string[];
    location?: LdLocation;
    offers?: LdOffer;
}

function slugFromUrl(url: string): string | undefined {
    try {
        const segments = new URL(url).pathname.split('/').filter(Boolean);
        return segments[segments.length - 1];
    } catch {
        return undefined;
    }
}

function extractCost(offer: LdOffer | undefined): EventCost | undefined {
    if (!offer?.price) return undefined;
    const min = parseFloat(offer.price);
    return Number.isNaN(min) ? undefined : { min };
}

export default class SalsaVidaRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];

        const res = await this.fetchFn(SOURCE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) throw new Error(`Salsa Vida Seattle guide returned HTTP ${res.status}`);
        const html = await res.text();
        const results = this.parsePageHtml(html);

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: results.filter((e): e is RipperError => 'type' in e),
            tags: cal.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing
    parsePageHtml(html: string): RipperEvent[] {
        const ldEvents = this.extractLdEvents(html);
        if ('type' in ldEvents) return [ldEvents];

        const seen = new Set<string>();
        const results: RipperEvent[] = [];
        for (const ld of ldEvents) {
            const result = this.buildEvent(ld);
            if (result === undefined) continue; // out-of-Seattle, silently skipped
            if ('type' in result) {
                results.push(result);
                continue;
            }
            if (result.id && seen.has(result.id)) continue;
            if (result.id) seen.add(result.id);
            results.push(result);
        }
        return results;
    }

    // The guide page's ItemList JSON-LD wraps each event as
    // `{ "@type": "ListItem", "item": { "@type": "Event", ... } }`.
    private extractLdEvents(html: string): LdEvent[] | RipperError {
        const scriptRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let match: RegExpExecArray | null;

        while ((match = scriptRegex.exec(html)) !== null) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(match[1].trim());
            } catch {
                continue;
            }
            if (typeof parsed !== 'object' || parsed === null) continue;
            const itemListElement = (parsed as { itemListElement?: unknown }).itemListElement;
            if (!Array.isArray(itemListElement)) continue;

            const events = itemListElement
                .map((li) => (li as { item?: unknown })?.item)
                .filter((item): item is LdEvent =>
                    typeof item === 'object' && item !== null && (item as { '@type'?: string })['@type'] === 'Event');
            if (events.length > 0) return events;
        }

        return { type: 'ParseError', reason: 'No JSON-LD Event ItemList found on page', context: undefined };
    }

    // Returns undefined (not an error) for a non-Seattle venue — filtered
    // silently in the caller, same as the "intentional content filter"
    // pattern documented in AGENTS.md.
    private buildEvent(ld: LdEvent): RipperCalendarEvent | RipperError | undefined {
        if (!ld.name || !ld.url || !ld.startDate) {
            return { type: 'ParseError', reason: 'JSON-LD event missing name, url, or startDate', context: JSON.stringify(ld).slice(0, 200) };
        }

        const locality = ld.location?.address?.addressLocality;
        if (locality !== SEATTLE_LOCALITY) return undefined;

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.parse(ld.startDate).withZoneSameInstant(TIMEZONE);
        } catch (error) {
            return { type: 'ParseError', reason: `Unparsable startDate "${ld.startDate}": ${error}`, context: ld.name };
        }

        let duration = DEFAULT_DURATION;
        if (ld.endDate) {
            try {
                const end = ZonedDateTime.parse(ld.endDate).withZoneSameInstant(TIMEZONE);
                const minutes = Duration.between(date, end).toMinutes();
                if (minutes > 0) duration = Duration.ofMinutes(minutes);
            } catch {
                // Fall back to DEFAULT_DURATION.
            }
        }

        const venueName = ld.location?.name?.trim();
        const streetAddress = ld.location?.address?.streetAddress?.trim();
        const location = [venueName, streetAddress].filter(Boolean).join(', ') || undefined;

        const lat = ld.location?.geo?.latitude;
        const lng = ld.location?.geo?.longitude;

        const slug = slugFromUrl(ld.url) ?? ld.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const id = `salsavida-${slug}-${date.toLocalDate().toString()}`;

        return {
            id,
            ripped: new Date(),
            date,
            duration,
            summary: decode(ld.name),
            description: ld.description ? decode(ld.description) : undefined,
            location,
            url: ld.url,
            imageUrl: ld.image?.[0],
            ...(typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : {}),
            cost: extractCost(ld.offers),
        };
    }
}
