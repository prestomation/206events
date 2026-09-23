import { ChronoUnit, Duration, LocalDate, LocalDateTime, Period, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { FetchFn, getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// King County Library System events (kcls.bibliocommons.com/v2/events).
//
// The BiblioCommons events SPA loads its data from a public, unauthenticated
// gateway API:
//   GET https://gateway.bibliocommons.com/v2/libraries/kcls/events
//       ?sort=definition.start asc&cancelled=false&limit=100&page=N
// Each page returns `events.items` (ids, in order) plus normalized
// `entities` (events, locations = branches, places = non-branch venues,
// images). The API ignores date-range params, so we page through the
// start-ascending list until we pass the lookahead window.
//
// Routing: each branch calendar declares `config.branchId` (the
// BiblioCommons branchLocationId). The calendar with `config.otherLocations`
// collects events at non-branch places and at branches with no calendar of
// their own. Online-only events (no branch and no place) are skipped.

const PAGE_LIMIT = 100;
const MAX_PAGES = 60;
const DEFAULT_LOOKAHEAD = Period.ofWeeks(6);
const DEFAULT_DURATION = Duration.ofHours(1);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ONLINE_PLACE = /^\s*online\s*$/i;
const EVENT_URL_BASE = "https://kcls.bibliocommons.com/v2/events/";

export interface BCAddress { number?: string; street?: string; city?: string; state?: string; zip?: string }
export interface BCLocation { id: string; name: string; address?: BCAddress; mapLocation?: { centrePoint?: { lat?: number; lng?: number } } }
export interface BCPlace extends BCLocation {}
export interface BCImage { id: string; url?: string }
export interface BCEvent {
    id: string;
    key?: string;
    definition: {
        start?: string;
        end?: string;
        title?: string;
        description?: string;
        branchLocationId?: string | null;
        nonBranchLocationId?: string | null;
        locationDetails?: string | null;
        featuredImageId?: string | null;
        isCancelled?: boolean;
    };
}
export interface BCPage {
    events?: { items?: string[]; pagination?: { pages?: number; page?: number } };
    entities?: {
        events?: Record<string, BCEvent>;
        locations?: Record<string, BCLocation>;
        places?: Record<string, BCPlace>;
        images?: Record<string, BCImage>;
    };
}

export interface Entities {
    locations: Record<string, BCLocation>;
    places: Record<string, BCPlace>;
    images: Record<string, BCImage>;
}

export default class KCLSRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const zone = ripper.config.calendars[0]?.timezone ?? ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(zone);
        const windowStart = now.toLocalDate().atStartOfDay();
        const windowEnd = windowStart.plus(ripper.config.lookahead ?? DEFAULT_LOOKAHEAD);

        const { events, entities } = await this.fetchWindow(ripper.config.url.href, windowEnd);
        return this.buildCalendars(ripper, events, entities, windowStart, windowEnd);
    }

    private async fetchWindow(baseUrl: string, windowEnd: LocalDateTime): Promise<{ events: BCEvent[]; entities: Entities }> {
        const events: BCEvent[] = [];
        const entities: Entities = { locations: {}, places: {}, images: {} };
        for (let page = 1; page <= MAX_PAGES; page++) {
            const params = new URLSearchParams({
                sort: "definition.start asc",
                cancelled: "false",
                limit: String(PAGE_LIMIT),
                page: String(page),
            });
            const res = await this.fetchFn(`${baseUrl}?${params.toString()}`);
            if (!res.ok) throw new Error(`KCLS events API returned ${res.status} ${res.statusText} (page ${page})`);
            const data = await res.json() as BCPage;
            const pageEvents = KCLSRipper.pageEvents(data);
            events.push(...pageEvents);
            Object.assign(entities.locations, data.entities?.locations ?? {});
            Object.assign(entities.places, data.entities?.places ?? {});
            Object.assign(entities.images, data.entities?.images ?? {});

            const totalPages = data.events?.pagination?.pages ?? page;
            const lastStart = pageEvents[pageEvents.length - 1]?.definition?.start;
            if (page >= totalPages || pageEvents.length === 0) break;
            if (lastStart && lastStart >= windowEnd.toString()) break;
        }
        return { events, entities };
    }

    public static pageEvents(data: BCPage): BCEvent[] {
        const byId = data.entities?.events ?? {};
        return (data.events?.items ?? []).map(id => byId[id]).filter((e): e is BCEvent => !!e);
    }

    public buildCalendars(ripper: Ripper, events: BCEvent[], entities: Entities, windowStart: LocalDateTime, windowEnd: LocalDateTime): RipperCalendar[] {
        const calendars = ripper.config.calendars;
        const branchToCal = new Map<string, string>();
        let otherCal: string | undefined;
        for (const c of calendars) {
            if (c.config?.branchId) branchToCal.set(String(c.config.branchId), c.name);
            if (c.config?.otherLocations) otherCal = c.name;
        }
        const buckets = new Map<string, { events: RipperCalendarEvent[]; errors: RipperError[] }>();
        for (const c of calendars) buckets.set(c.name, { events: [], errors: [] });
        const seen = new Set<string>();

        for (const ev of events) {
            const def = ev.definition ?? {};
            if (def.isCancelled) continue;
            const branchId = def.branchLocationId ?? undefined;
            const placeId = def.nonBranchLocationId ?? undefined;
            // Online-only programs have no physical location.
            if (!branchId && !placeId) continue;
            if (!branchId && placeId && ONLINE_PLACE.test(entities.places[placeId]?.name ?? '')) continue;
            if (seen.has(ev.id)) continue;
            seen.add(ev.id);

            const calName = (branchId && branchToCal.get(branchId)) || otherCal;
            if (!calName) continue;
            const cal = calendars.find(c => c.name === calName)!;

            // Branch calendars declare their own geo; events routed to the
            // catch-all calendar carry the branch/place coordinates instead.
            const result = this.parseEvent(ev, entities, cal.timezone, calName === otherCal);
            const bucket = buckets.get(calName)!;
            if ('date' in result) {
                const local = result.date.toLocalDateTime();
                // Ongoing multi-week programs that began before today, and
                // anything past the lookahead, are out of window.
                if (local.isBefore(windowStart) || !local.isBefore(windowEnd)) continue;
                bucket.events.push(result);
            } else {
                bucket.errors.push(result);
            }
        }

        return calendars.map(c => ({
            name: c.name,
            friendlyname: c.friendlyname,
            events: buckets.get(c.name)!.events,
            errors: buckets.get(c.name)!.errors,
            parent: ripper.config,
            tags: c.tags ?? [],
        }));
    }

    public parseEvent(ev: BCEvent, entities: Entities, zone: ZoneId, attachCoords = false): RipperCalendarEvent | RipperError {
        const def = ev.definition ?? {};
        const title = def.title?.replace(/\s+/g, ' ').trim();
        if (!title) return { type: 'ParseError', reason: 'KCLS event missing title', context: ev.id };
        if (!def.start) return { type: 'ParseError', reason: 'KCLS event missing start', context: `${ev.id} ${title}` };

        // All-day events carry date-only start/end ("2026-09-28"), with an
        // inclusive end date.
        const allDay = DATE_ONLY.test(def.start);
        let start: ZonedDateTime;
        try {
            start = allDay
                ? LocalDate.parse(def.start).atStartOfDay(zone)
                : LocalDateTime.parse(def.start).atZone(zone);
        } catch (e) {
            return { type: 'ParseError', reason: `Could not parse start "${def.start}": ${e}`, context: title };
        }
        let duration = allDay ? Duration.ofDays(1) : DEFAULT_DURATION;
        if (allDay && def.end && DATE_ONLY.test(def.end)) {
            try {
                const days = LocalDate.parse(def.start).until(LocalDate.parse(def.end), ChronoUnit.DAYS) + 1;
                if (days > 0) duration = Duration.ofDays(days);
            } catch {
                // best-effort end date
            }
        } else if (!allDay && def.end) {
            try {
                const seconds = LocalDateTime.parse(def.end).atZone(zone).toEpochSecond() - start.toEpochSecond();
                if (seconds > 0) duration = Duration.ofSeconds(seconds);
            } catch {
                // best-effort end time
            }
        }

        const event: RipperCalendarEvent = {
            id: `kcls-${ev.id}`,
            ripped: new Date(),
            date: start,
            duration,
            summary: title,
            description: KCLSRipper.buildDescription(def.description, def.locationDetails),
            location: KCLSRipper.formatLocation(def, entities),
            url: `${EVENT_URL_BASE}${ev.id}`,
        };
        const imageUrl = def.featuredImageId ? entities.images[def.featuredImageId]?.url : undefined;
        if (imageUrl) event.imageUrl = imageUrl;

        const where = def.branchLocationId
            ? entities.locations[def.branchLocationId]
            : (def.nonBranchLocationId ? entities.places[def.nonBranchLocationId] : undefined);
        const pt = attachCoords ? where?.mapLocation?.centrePoint : undefined;
        if (pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
            event.lat = pt.lat;
            event.lng = pt.lng;
            event.geocodeSource = 'ripper';
        }
        return event;
    }

    public static formatLocation(def: BCEvent['definition'], entities: Entities): string | undefined {
        if (def.branchLocationId) {
            const loc = entities.locations[def.branchLocationId];
            if (!loc) return undefined;
            const addr = formatAddress(loc.address);
            return [`KCLS ${loc.name} Library`, addr].filter(Boolean).join(', ');
        }
        if (def.nonBranchLocationId) {
            const place = entities.places[def.nonBranchLocationId];
            if (!place) return undefined;
            const name = place.name?.replace(/\s+/g, ' ').trim();
            return [name, formatAddress(place.address)].filter(Boolean).join(', ') || undefined;
        }
        return undefined;
    }

    public static buildDescription(html: string | undefined, locationDetails: string | null | undefined): string | undefined {
        const text = html ? htmlToText(html) : '';
        const room = locationDetails?.trim();
        const parts = [text, room ? `Room: ${room}` : ''].filter(Boolean);
        return parts.length ? parts.join('\n\n') : undefined;
    }
}

function formatAddress(a: BCAddress | undefined): string | undefined {
    if (!a) return undefined;
    // Some upstream rows repeat the house number inside `street`; do not print it twice.
    const num = a.number?.trim();
    const streetOnly = a.street?.trim();
    const street = (num && streetOnly?.startsWith(num + ' ') ? streetOnly : [num, streetOnly].filter(Boolean).join(' '))
        .replace(/\s+/g, ' ').trim();
    const stateZip = [a.state, a.zip?.substring(0, 5)].filter(Boolean).join(' ');
    const parts = [street, a.city?.trim(), stateZip].filter(Boolean);
    return parts.length ? parts.join(', ') : undefined;
}

function htmlToText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|li|div)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&rsquo;/g, '’')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
