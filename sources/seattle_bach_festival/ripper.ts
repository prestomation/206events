import { Duration, LocalDate, LocalDateTime, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

/**
 * Seattle Bach Festival (https://seattlebachfestival.org/events/) lists its
 * season with the Venture Event Manager (VEM) WordPress plugin. The /events/
 * page renders every upcoming occurrence server-side:
 *
 *   .vem-single-event[vem-event-id]
 *     .vem-single-event-title
 *     .vem-one-occurrence
 *       .vem-single-event-date-start   "7:30PM, Friday, October 23, 2026" (optional " - 4:00PM")
 *       .vem-single-occurrence-venue   "First Baptist Church Seattle"
 *       .venue-address / .venue-city   "1111 Harvard Ave" / "Seattle, WA 98122"
 *       .vem-single-event-date-ticket-link a  ("BUY TICKETS" / "Register for this Free Event")
 *
 * Most programs are performed three times (Seattle plus Tacoma/Lynnwood);
 * the caller keeps only occurrences in Seattle.
 */

const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const DEFAULT_DURATION = Duration.ofHours(2);

// "7:30PM, Friday, October 23, 2026" with an optional " - 4:00PM" end time.
const DATE_RE = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM),\s*\w+,\s*(\w+)\s+(\d{1,2}),\s*(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM))?\s*$/i;

function to24(hour: number, ampm: string): number {
    const pm = ampm.toUpperCase() === 'PM';
    if (pm && hour !== 12) return hour + 12;
    if (!pm && hour === 12) return 0;
    return hour;
}

export function parseOccurrenceDate(text: string): { start: LocalDateTime; end?: LocalDateTime } | null {
    const m = DATE_RE.exec(text);
    if (!m) return null;
    const month = MONTHS[m[4].toLowerCase()];
    if (!month) return null;
    try {
        const day = LocalDate.of(parseInt(m[6], 10), month, parseInt(m[5], 10));
        const start = LocalDateTime.of(day, LocalTime.of(to24(parseInt(m[1], 10), m[3]), parseInt(m[2], 10)));
        let end: LocalDateTime | undefined;
        if (m[7]) {
            end = LocalDateTime.of(day, LocalTime.of(to24(parseInt(m[7], 10), m[9]), parseInt(m[8], 10)));
            if (!end.isAfter(start)) end = undefined;
        }
        return { start, end };
    } catch {
        return null;
    }
}

export interface Occurrence {
    eventId: string;
    title: string;
    url?: string;
    imageUrl?: string;
    dateText: string;
    venue: string;
    address: string;
    city: string;
    ticketText: string;
    ticketUrl?: string;
}

function text(el: HTMLElement | null | undefined): string {
    return (el?.text ?? '').replace(/\s+/g, ' ').trim();
}

export function extractOccurrences(html: string): Occurrence[] {
    const root = parse(html);
    const out: Occurrence[] = [];
    for (const ev of root.querySelectorAll('.vem-single-event')) {
        const title = text(ev.querySelector('.vem-single-event-title'));
        const eventId = ev.getAttribute('vem-event-id') ?? '';
        const url = ev.querySelector('.vem-more-details a')?.getAttribute('href')
            ?? ev.querySelector('.vem-single-event-thumbnail a')?.getAttribute('href')
            ?? undefined;
        const imageUrl = ev.querySelector('.vem-single-event-thumbnail img')?.getAttribute('src') ?? undefined;
        for (const occ of ev.querySelectorAll('.vem-one-occurrence')) {
            const dateText = text(occ.querySelector('.vem-single-event-date-start'));
            if (!dateText) continue; // empty template placeholder
            const ticket = occ.querySelector('.vem-single-event-date-ticket-link a');
            out.push({
                eventId,
                title,
                url,
                imageUrl,
                dateText,
                venue: text(occ.querySelector('.vem-single-occurrence-venue')),
                address: text(occ.querySelector('.venue-address')),
                city: text(occ.querySelector('.venue-city')).replace(/\s+,/g, ','),
                ticketText: text(ticket),
                ticketUrl: ticket?.getAttribute('href') ?? undefined,
            });
        }
    }
    return out;
}

export function isInSeattle(occ: Occurrence): boolean {
    return /^seattle\b/i.test(occ.city);
}

export function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function occurrenceToEvent(occ: Occurrence, zone: ZoneId): RipperCalendarEvent | RipperError {
    if (!occ.title) {
        return { type: 'ParseError', reason: 'Event block has no title', context: occ.dateText };
    }
    const parsed = parseOccurrenceDate(occ.dateText);
    if (!parsed) {
        return { type: 'ParseError', reason: `Cannot parse date: "${occ.dateText}"`, context: occ.title };
    }
    const date = ZonedDateTime.of(parsed.start, zone);
    const duration = parsed.end
        ? Duration.between(parsed.start, parsed.end)
        : DEFAULT_DURATION;
    const location = [occ.venue, occ.address, occ.city].filter(Boolean).join(', ');
    const free = /free/i.test(occ.ticketText);
    const key = occ.eventId || slugify(occ.title);
    return {
        id: `seattle-bach-festival-${key}-${parsed.start.toLocalDate().toString()}-${parsed.start.toLocalTime().toString().replace(':', '')}`,
        ripped: new Date(),
        date,
        duration,
        summary: occ.title,
        location: location || undefined,
        url: occ.url ?? occ.ticketUrl,
        imageUrl: occ.imageUrl,
        cost: free ? { min: 0 } : { paid: true },
    };
}

export default class SeattleBachFestivalRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];
        const zone = ZoneId.of(cal.timezone.toString());
        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) throw new Error(`${ripper.config.url} returned HTTP ${res.status}`);
        const { events, errors } = parseEventsPage(await res.text(), zone, ZonedDateTime.now(zone));
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

export function parseEventsPage(html: string, zone: ZoneId, now: ZonedDateTime): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();
    for (const occ of extractOccurrences(html)) {
        // Intentional filter: out-of-city repeat performances (Tacoma, Lynnwood).
        if (!isInSeattle(occ)) continue;
        const result = occurrenceToEvent(occ, zone);
        if (!('date' in result)) {
            errors.push(result);
            continue;
        }
        if (result.date.isBefore(now)) continue;
        const id = result.id ?? '';
        if (seen.has(id)) continue;
        seen.add(id);
        events.push(result);
    }
    return { events, errors };
}
