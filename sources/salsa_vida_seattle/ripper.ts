import { Duration, OffsetDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, EventCost } from "../../lib/config/schema.js";
import { decode } from "html-entities";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Salsa Vida's Seattle guide page (https://www.salsavida.com/guides/washington/seattle)
// server-renders a single JSON-LD `ItemList` of `Event` items on first load —
// no browser/AJAX needed. Each item carries a real start/end time (with UTC
// offset), a full street address with lat/lng, a price, and a description.
// The page also offers a "Load More" button, but that goes through a
// WordPress admin-ajax endpoint gated by a per-page nonce — not worth
// reverse-engineering when the initial ~20-event window (rolling ~2 weeks
// out) is already a clean, reliable source on its own.
const SOURCE_URL = "https://www.salsavida.com/guides/washington/seattle";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const SEATTLE_LOCALITY = "Seattle";
const DEFAULT_DURATION = Duration.ofHours(2);

interface LdOffer {
    price?: string;
}

interface LdAddress {
    addressLocality?: string;
    streetAddress?: string;
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

interface LdEvent {
    name?: string;
    url?: string;
    startDate?: string; // full ISO 8601 with UTC offset, e.g. "2026-09-02T20:45:00-07:00"
    endDate?: string;
    description?: string;
    image?: string[] | string;
    location?: LdLocation;
    offers?: LdOffer;
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseCost(offers?: LdOffer): EventCost | undefined {
    if (!offers || offers.price === undefined) return undefined;
    const price = parseFloat(offers.price);
    if (!Number.isFinite(price)) return undefined;
    return { min: price };
}

export default class SalsaVidaSeattleRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];

        const res = await this.fetchFn(SOURCE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) throw new Error(`Salsa Vida Seattle guide returned HTTP ${res.status}`);
        const html = await res.text();
        const events = this.parsePageHtml(html);

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: cal.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing
    parsePageHtml(html: string): RipperEvent[] {
        const ldEvents = this.extractLdEvents(html);
        if ('type' in ldEvents) return [ldEvents];

        const results: RipperEvent[] = [];
        for (const ld of ldEvents) {
            results.push(...this.buildEvent(ld));
        }
        return results;
    }

    // Scans every JSON-LD script block on the page (not just the first) and
    // returns the Event items nested under an `ItemList`'s `itemListElement`,
    // since a page can carry other JSON-LD (org schema, breadcrumbs) too.
    private extractLdEvents(html: string): LdEvent[] | RipperError {
        const scriptRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let match: RegExpExecArray | null;
        let sawJson = false;

        while ((match = scriptRegex.exec(html)) !== null) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(match[1].trim());
            } catch {
                continue;
            }
            sawJson = true;
            if (typeof parsed !== 'object' || parsed === null) continue;
            const itemListElement = (parsed as { itemListElement?: unknown }).itemListElement;
            if ((parsed as { '@type'?: string })['@type'] !== 'ItemList' || !Array.isArray(itemListElement)) continue;

            const events = itemListElement
                .map((li) => (li as { item?: unknown })?.item)
                .filter((item): item is LdEvent =>
                    typeof item === 'object' && item !== null && (item as { '@type'?: string })['@type'] === 'Event');
            if (events.length > 0) return events;
        }

        return {
            type: 'ParseError',
            reason: sawJson ? 'No ItemList of Event JSON-LD found on page' : 'No parsable JSON-LD found on page',
            context: undefined,
        };
    }

    private buildEvent(ld: LdEvent): RipperEvent[] {
        if (!ld.name || !ld.url || !ld.startDate) {
            return [{ type: 'ParseError', reason: 'JSON-LD event missing name, url, or startDate', context: JSON.stringify(ld).slice(0, 200) }];
        }

        // Seattle-focus filter: the "Seattle" guide also lists events at
        // Eastside/outlying venues (Kirkland, Shoreline, Kent) that share the
        // same regional dance scene. Skip those rather than emit an
        // out-of-city event.
        const locality = ld.location?.address?.addressLocality;
        if (locality && locality !== SEATTLE_LOCALITY) return [];

        let date: ZonedDateTime;
        try {
            date = OffsetDateTime.parse(ld.startDate).atZoneSameInstant(TIMEZONE);
        } catch {
            return [{ type: 'ParseError', reason: `Unparsable startDate: ${ld.startDate}`, context: ld.name }];
        }

        let duration = DEFAULT_DURATION;
        if (ld.endDate) {
            try {
                const endInstant = OffsetDateTime.parse(ld.endDate).atZoneSameInstant(TIMEZONE).toInstant();
                const parsed = Duration.between(date.toInstant(), endInstant);
                if (!parsed.isNegative() && !parsed.isZero()) duration = parsed;
            } catch {
                // Keep the default duration — an unparsable endDate isn't worth failing the event over.
            }
        }

        const venueName = ld.location?.name?.trim();
        const streetAddress = ld.location?.address?.streetAddress?.trim();
        const location = venueName && streetAddress
            ? `${venueName}, ${streetAddress}`
            : venueName ?? streetAddress ?? 'Seattle, WA';

        const lat = ld.location?.geo?.latitude;
        const lng = ld.location?.geo?.longitude;

        const cost = parseCost(ld.offers);
        const imageUrl = Array.isArray(ld.image) ? ld.image[0] : ld.image;

        // Salsa Vida reuses the same event url for every occurrence of a
        // recurring listing (e.g. a weekly social); combine the url slug
        // with the occurrence date for a stable, distinct id per the repo's
        // Stable Event IDs convention.
        let slug: string;
        try {
            const segments = new URL(ld.url).pathname.split('/').filter(Boolean);
            slug = segments[segments.length - 1] ?? slugify(ld.name);
        } catch {
            slug = slugify(ld.name);
        }
        const id = `salsa-vida-${slug}-${date.toLocalDate().toString()}`;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration,
            summary: decode(ld.name),
            description: ld.description ? decode(ld.description) : undefined,
            location,
            url: ld.url,
            imageUrl,
            ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
            ...(cost ? { cost } : {}),
        };

        return [event];
    }
}
