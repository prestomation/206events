import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

/**
 * TechMeetups.io — Seattle page.
 *
 * The page embeds a schema.org `ItemList` named "Upcoming Tech Events in
 * Seattle" in a `<script type="application/ld+json">` block; each
 * `itemListElement[].item` is an `Event` with startDate (ISO with offset),
 * url (the Meetup/Luma event page), description, and location — either a
 * `VirtualLocation` or a `Place` with a PostalAddress.
 *
 * Only in-person events located in Seattle are kept: the online webinars
 * listed there are not tied to the city. The listing's images are generic
 * stock photos, so they are not used. No end time is published; events get
 * a 2-hour default duration.
 */

const DEFAULT_DURATION_HOURS = 2;

interface LdPlace {
    "@type"?: string;
    name?: string;
    address?: string | { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string };
}

interface LdEvent {
    "@type"?: string;
    name?: string;
    startDate?: string;
    endDate?: string;
    url?: string;
    description?: string;
    eventStatus?: string;
    eventAttendanceMode?: string;
    location?: LdPlace;
    organizer?: { name?: string };
}

/** Pull every schema.org Event out of the page's JSON-LD ItemLists. */
export function extractLdEvents(html: string): { events: LdEvent[]; errors: RipperError[] } {
    const root = parse(html);
    const events: LdEvent[] = [];
    const errors: RipperError[] = [];
    for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
        let data: any;
        try {
            // rawText, not text: .text HTML-decodes entities (e.g. &#010;) into control chars that break JSON.parse.
            data = JSON.parse(script.rawText);
        } catch (e) {
            errors.push({ type: "ParseError", reason: `Invalid JSON-LD block: ${e}`, context: script.text.slice(0, 120) });
            continue;
        }
        const blocks = Array.isArray(data) ? data : [data];
        for (const block of blocks) {
            if (block?.["@type"] !== "ItemList" || !Array.isArray(block.itemListElement)) continue;
            for (const el of block.itemListElement) {
                const item = el?.item ?? el;
                if (item?.["@type"] === "Event") events.push(item as LdEvent);
            }
        }
    }
    return { events, errors };
}

export function isInPersonSeattle(ev: LdEvent): boolean {
    const loc = ev.location;
    if (!loc || loc["@type"] !== "Place") return false;
    if (ev.eventAttendanceMode && /OnlineEventAttendanceMode$/.test(ev.eventAttendanceMode)) return false;
    const addr = loc.address;
    if (typeof addr === "string") return /\bSeattle\b/i.test(addr);
    return /^seattle$/i.test((addr?.addressLocality ?? "").trim());
}

function eventIdFromUrl(url: string | undefined, fallback: string): string {
    if (url) {
        const meetup = url.match(/meetup\.com\/([^/]+)\/events\/(\d+)/i);
        if (meetup) return `meetup-${meetup[2]}`;
        const slug = url.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop();
        if (slug) return `techmeetups-${slug.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    }
    return `techmeetups-${fallback.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function formatLocation(loc: LdPlace): string {
    const addr = loc.address;
    const parts: string[] = [];
    if (loc.name) parts.push(decode(loc.name).trim());
    if (typeof addr === "string") {
        parts.push(addr.trim());
    } else if (addr) {
        if (addr.streetAddress) parts.push(addr.streetAddress.trim());
        const cityState = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ");
        if (cityState) parts.push(addr.postalCode ? `${cityState} ${addr.postalCode}` : cityState);
    }
    return parts.filter(Boolean).join(", ");
}

export function parseLdEvent(ev: LdEvent): RipperCalendarEvent | RipperError {
    const summary = decode(ev.name ?? "").replace(/\s+/g, " ").trim();
    if (!summary) return { type: "ParseError", reason: "Event missing name", context: ev.url ?? "" };
    if (!ev.startDate) return { type: "ParseError", reason: "Event missing startDate", context: summary };

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.parse(ev.startDate);
    } catch {
        return { type: "ParseError", reason: `Unparseable startDate: ${ev.startDate}`, context: summary };
    }

    let duration = Duration.ofHours(DEFAULT_DURATION_HOURS);
    if (ev.endDate) {
        try {
            const ms = ZonedDateTime.parse(ev.endDate).toInstant().toEpochMilli() - start.toInstant().toEpochMilli();
            if (ms > 0) duration = Duration.ofMillis(ms);
        } catch {
            // keep default
        }
    }

    const descParts: string[] = [];
    if (ev.organizer?.name) descParts.push(`Hosted by ${decode(ev.organizer.name).trim()}`);
    if (ev.description) descParts.push(decode(ev.description).trim());

    return {
        id: eventIdFromUrl(ev.url, `${summary}-${start.toLocalDate().toString()}`),
        ripped: new Date(),
        date: start,
        duration,
        summary,
        description: descParts.join("\n\n") || undefined,
        location: ev.location ? formatLocation(ev.location) || undefined : undefined,
        url: ev.url,
    };
}

export function parseTechMeetupsHtml(html: string): Array<RipperCalendarEvent | RipperError> {
    const { events, errors } = extractLdEvents(html);
    const results: Array<RipperCalendarEvent | RipperError> = [...errors];
    const seen = new Set<string>();
    for (const ev of events) {
        if (ev.eventStatus && /EventCancelled$/.test(ev.eventStatus)) continue;
        if (!isInPersonSeattle(ev)) continue;
        const result = parseLdEvent(ev);
        if ("date" in result) {
            if (result.id && seen.has(result.id)) continue;
            if (result.id) seen.add(result.id);
        }
        results.push(result);
    }
    return results;
}

export default class TechMeetupsSeattleRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];
        const url = ripper.config.url.toString();

        const res = await fetchFn(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" } });
        if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
        const html = await res.text();

        const parsed = parseTechMeetupsHtml(html);
        const now = ZonedDateTime.now();
        const events = parsed.filter((r): r is RipperCalendarEvent => "date" in r && !r.date.isBefore(now.minusHours(3)));
        const errors = parsed.filter((r): r is RipperError => "type" in r);

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            tags: cal.tags ?? [],
            parent: ripper.config,
        }];
    }
}
