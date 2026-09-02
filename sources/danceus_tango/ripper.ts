import { Duration, LocalDate, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, EventCost, UncertaintyField } from "../../lib/config/schema.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// DanceUS.org's Seattle Argentine tango calendar page embeds a JSON-LD array
// (one object per listed event) with reliable structured data — venue name,
// lat/lng, description, image, event url — but no start time. The visible
// event cards on the same page carry the start time (and, for some, a
// price) as plain text next to a font-awesome icon, keyed by the same
// `/event/<id>/<slug>/` href. We merge the two by url. Same platform and
// markup as sources/danceus_swing (a sibling DanceUS genre calendar).
const SOURCE_URL = "https://www.danceus.org/events/argentine-tango/seattle-wa-tango-calendar/";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const SEATTLE_LOCALITY = "Seattle";

// DanceUS never lists an end time, so pick a default by the card's own
// "Class" / "Party" badge rather than guessing a single duration for both.
const DEFAULT_CLASS_DURATION = Duration.ofMinutes(90);
const DEFAULT_PARTY_DURATION = Duration.ofHours(2);

interface CardMeta {
    time?: string;   // e.g. "7:00 PM", as displayed
    badge?: string;  // "Class" | "Party"
    price?: number;  // parsed from "$25"; undefined when no price shown
}

interface LdGeo {
    latitude?: string;
    longitude?: string;
}

interface LdAddress {
    addressLocality?: string;
}

interface LdLocation {
    name?: string;
    geo?: LdGeo;
    address?: LdAddress;
}

interface LdEvent {
    startDate?: string; // "YYYY-MM-DD" — never includes a time
    name?: string;
    url?: string;
    description?: string;
    image?: string;
    location?: LdLocation;
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Parses "7:00 PM" / "12:00 AM" style times. Returns null if unparsable.
function parseClockTime(text: string): { hour: number; minute: number } | null {
    const m = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === 'PM') hour += 12;
    return { hour, minute: parseInt(m[2], 10) };
}

// DanceUS uses "12:00 AM" as the placeholder when no real time is listed
// (confirmed against the event's own JSON-LD, which also defaults to
// midnight in that case) — treat it the same as "no time given".
function isUnknownTimeSentinel(time: { hour: number; minute: number }): boolean {
    return time.hour === 0 && time.minute === 0;
}

export default class DanceUSTangoRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];

        const res = await this.fetchFn(SOURCE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) throw new Error(`DanceUS Seattle tango calendar returned HTTP ${res.status}`);
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
        const results: RipperEvent[] = [];

        const ldEvents = this.extractLdEvents(html);
        if ('type' in ldEvents) return [ldEvents];

        const doc = parseHtml(html);
        const cardMeta = this.parseCardMeta(doc);

        for (const ld of ldEvents) {
            results.push(...this.buildEvent(ld, cardMeta));
        }

        return results;
    }

    // Scans every JSON-LD script block on the page (not just the first) and
    // returns the one whose parsed content is Event data, since a page can
    // carry other JSON-LD (breadcrumbs, org schema) alongside the event list.
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
            const items = Array.isArray(parsed) ? parsed : [parsed];
            const events = items.filter((item): item is LdEvent =>
                typeof item === 'object' && item !== null && (item as { '@type'?: string })['@type'] === 'Event');
            if (events.length > 0) return events;
        }

        return {
            type: 'ParseError',
            reason: sawJson ? 'No JSON-LD Event data found on page' : 'No parsable JSON-LD found on page',
            context: undefined,
        };
    }

    private buildEvent(ld: LdEvent, cardMeta: Map<string, CardMeta>): RipperEvent[] {
        if (!ld.name || !ld.url || !ld.startDate) {
            return [{ type: 'ParseError', reason: 'JSON-LD event missing name, url, or startDate', context: JSON.stringify(ld).slice(0, 200) }];
        }

        // Seattle-focus filter: mirrors sources/danceus_swing — drop any
        // listing whose JSON-LD address locality isn't Seattle proper.
        const locality = ld.location?.address?.addressLocality;
        if (locality && locality !== SEATTLE_LOCALITY) return [];

        let href: string;
        try {
            href = new URL(ld.url).pathname;
        } catch {
            return [{ type: 'ParseError', reason: `Unparsable event url: ${ld.url}`, context: ld.name }];
        }
        const meta = cardMeta.get(href);

        let localDate: LocalDate;
        try {
            localDate = LocalDate.parse(ld.startDate);
        } catch {
            return [{ type: 'ParseError', reason: `Unparsable startDate: ${ld.startDate}`, context: ld.name }];
        }

        const parsedTime = meta?.time ? parseClockTime(meta.time) : null;
        const timeUnknown = !parsedTime || isUnknownTimeSentinel(parsedTime);
        const hour = timeUnknown ? 12 : parsedTime!.hour;
        const minute = timeUnknown ? 0 : parsedTime!.minute;
        const date = ZonedDateTime.of(localDate.atTime(hour, minute), TIMEZONE);

        const duration = meta?.badge === 'Party' ? DEFAULT_PARTY_DURATION : DEFAULT_CLASS_DURATION;

        const venueName = ld.location?.name?.trim();
        const location = venueName ? `${venueName}, Seattle, WA` : 'Seattle, WA';

        const lat = ld.location?.geo?.latitude ? Number(ld.location.geo.latitude) : undefined;
        const lng = ld.location?.geo?.longitude ? Number(ld.location.geo.longitude) : undefined;

        const cost: EventCost | undefined = meta?.price !== undefined ? { min: meta.price } : undefined;

        // DanceUS's numeric event id (from the url path, e.g.
        // /event/1771616149751684/...) identifies the recurring listing
        // itself, not a specific date — the same id reappears in next
        // week's build for the same class. Combine it with the date so
        // each occurrence still gets a distinct, stable id, per the repo's
        // Stable Event IDs convention.
        const sourceId = href.match(/^\/event\/([^/]+)\//)?.[1] ?? slugify(ld.name);
        const id = `danceus-tango-${sourceId}-${ld.startDate}`;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration,
            summary: decode(ld.name),
            description: ld.description ? decode(ld.description) : undefined,
            location,
            url: ld.url,
            imageUrl: ld.image,
            ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
            ...(cost ? { cost } : {}),
        };

        if (!timeUnknown) return [event];

        // Push both: the event (with a placeholder noon start) and the
        // Uncertainty error the infra layer merges against the cache.
        // partialFingerprint is the raw displayed time text; if DanceUS
        // later lists a real time for this occurrence, the fingerprint
        // changes and the cached resolution is invalidated.
        const unknownFields: UncertaintyField[] = ['startTime', 'duration'];
        return [event, {
            type: 'Uncertainty',
            reason: `DanceUS listing for "${ld.name}" did not include a start time`,
            source: 'danceus-tango',
            unknownFields,
            event,
            partialFingerprint: meta?.time ?? 'no-time-listed',
        }];
    }

    private parseCardMeta(doc: HTMLElement): Map<string, CardMeta> {
        const map = new Map<string, CardMeta>();

        for (const card of doc.querySelectorAll('.search-event-card')) {
            const link = card.querySelector('.search-event-card-title a');
            const href = link?.getAttribute('href');
            if (!href || !href.startsWith('/event/')) continue;

            let time: string | undefined;
            for (const item of card.querySelectorAll('.search-event-card-meta-item')) {
                if (item.querySelector('.fa-clock-o')) {
                    time = item.text.trim();
                }
            }

            const badge = card.querySelector('.search-event-card-badge')?.text.trim();

            const priceText = card.querySelector('.search-event-card-price')?.text.trim();
            const priceMatch = priceText?.match(/\$([\d.]+)/);
            const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;

            map.set(href, { time, badge, price });
        }

        return map;
    }
}
