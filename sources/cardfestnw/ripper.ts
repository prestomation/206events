import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, LocalDate, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of('America/Los_Angeles');

// The site (a Framer-built page) does not publish specific opening hours
// anywhere for these shows — no time appears in the JSON-LD `Event` nodes
// or elsewhere on the page (checked both cardfestnw.com and the linked
// ontreasure.com ticket pages). Trading-card/collectibles shows of this
// kind conventionally run late morning to mid-afternoon, so we default to
// a 10am-4pm window and flag it as approximate in the description rather
// than presenting a guess as fact.
const DEFAULT_START_HOUR = 10;
const DEFAULT_DURATION = Duration.ofHours(6);

interface LdAddress {
    "@type"?: string;
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
}

interface LdPlace {
    "@type"?: string;
    name?: string;
    address?: LdAddress;
}

interface LdEventNode {
    "@type"?: string;
    name?: string;
    startDate?: string;
    url?: string;
    image?: string;
    location?: LdPlace;
}

function formatAddress(address: LdAddress | undefined): string | undefined {
    if (!address) return undefined;
    const parts = [
        address.streetAddress,
        [address.addressLocality, address.addressRegion].filter(Boolean).join(", "),
        address.postalCode,
    ].filter((p): p is string => Boolean(p && p.trim()));
    return parts.length > 0 ? parts.join(", ") : undefined;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export default class CardfestNWRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        if (!res.ok) throw new Error(`cardfestnw.com returned ${res.status}`);

        const html = await res.text();
        const nodes = this.parseJsonLdEvents(html);

        const now = ZonedDateTime.now(TIMEZONE);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const node of nodes) {
            const result = this.parseEventNode(node);
            if ('date' in result) {
                if (!result.date.isBefore(now)) events.push(result);
            } else {
                errors.push(result);
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

    // Public for testing. Extracts the `Event` nodes out of the page's
    // `<script type="application/ld+json">` `@graph` array.
    parseJsonLdEvents(html: string): LdEventNode[] {
        const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
        const nodes: LdEventNode[] = [];

        for (const scriptMatch of scripts) {
            let data: unknown;
            try {
                data = JSON.parse(scriptMatch[1]);
            } catch {
                continue; // Skip malformed JSON blocks
            }

            const graphField = (data as Record<string, unknown> | null)?.['@graph'];
            const graph: unknown[] = Array.isArray(graphField) ? graphField : [data];

            for (const node of graph) {
                const n = node as LdEventNode;
                if (n && n['@type'] === 'Event') {
                    nodes.push(n);
                }
            }
        }

        return nodes;
    }

    // Public for testing
    parseEventNode(node: LdEventNode): RipperCalendarEvent | RipperError {
        const title = node.name?.trim();
        if (!title) {
            return {
                type: 'ParseError',
                reason: 'Event node missing name',
                context: JSON.stringify(node),
            };
        }

        if (!node.startDate) {
            return {
                type: 'ParseError',
                reason: `Event node missing startDate: ${title}`,
                context: title,
            };
        }

        let localDate: LocalDate;
        try {
            // startDate is date-only (e.g. "2026-07-18"), no time component.
            localDate = LocalDate.parse(node.startDate.trim().slice(0, 10));
        } catch {
            return {
                type: 'ParseError',
                reason: `Unparseable startDate "${node.startDate}" for event: ${title}`,
                context: title,
            };
        }

        const eventDate = ZonedDateTime.of(
            localDate.atTime(DEFAULT_START_HOUR, 0),
            TIMEZONE
        );

        const place = node.location;
        const address = formatAddress(place?.address);
        const location = [place?.name, address].filter(Boolean).join(", ") || undefined;

        const dateKey = localDate.toString();
        const id = `cardfestnw-${slugify(title)}-${dateKey}`;

        return {
            id,
            ripped: new Date(),
            date: eventDate,
            duration: DEFAULT_DURATION,
            summary: title,
            description: "Exact opening hours are not listed on the Cardfest NW site — check the ticket link for confirmed times.",
            location,
            url: node.url,
            imageUrl: node.image,
            cost: { paid: true },
        };
    }
}
