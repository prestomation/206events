import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { ZonedDateTime, LocalDate, LocalTime, LocalDateTime, Duration, ZoneId } from "@js-joda/core";
import { decode } from "html-entities";
import '@js-joda/timezone';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)',
};

// The listing page's `<em>` line is one plain-text run per event:
// "September 16, 9am-12:30pm @ Burke-Gilman Trail". Times are always
// digits + am/pm (never a bare "-" on their own), so the greedy trailing
// group safely captures a location that itself contains a hyphen
// (e.g. "Burke-Gilman Trail").
const LISTING_LINE_PATTERN = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}(?::\d{2})?\s*[ap]m)\s*-\s*(\d{1,2}(?::\d{2})?\s*[ap]m)\s*@\s*(.+)$/i;
const TIME_PATTERN = /^(\d{1,2})(?::(\d{2}))?\s*([ap])m$/i;

export interface ListingEntry {
    eventId: string;
    detailUrl: string;
    title: string;
    monthDayTimeLocation: string;
    description: string;
}

// The calendar page is a single table: one `<tr><td><div class="event">`
// per upcoming work party, each carrying its own title, date/time/location
// line, and a short description ending in a "more" link back to the same
// detail page. Everything the ripper needs lives on this one page — no
// per-event detail-page fetch required.
export function extractListingEntries(html: HTMLElement): ListingEntry[] {
    const entries: ListingEntry[] = [];

    for (const eventDiv of html.querySelectorAll('div.event')) {
        const anchor = eventDiv.querySelector('h4 a');
        const href = anchor?.getAttribute('href');
        const eventId = href?.match(/\/event\/(\d+)/)?.[1];
        const title = anchor?.text.trim();

        const paragraphs = eventDiv.querySelectorAll('p');
        const emText = paragraphs[0]?.querySelector('em')?.text.trim();

        if (!href || !eventId || !title || !emText) continue;

        // Second `<p>` is the description, ending in a "more" link back to
        // this same event — strip that trailing anchor rather than trusting
        // the word "more" never appears in real prose. Any other inline
        // markup (nothing seen in practice, but this is hand-authored HTML)
        // is stripped too, so tags never leak into the published text.
        const descriptionHtml = paragraphs[1]?.innerHTML ?? '';
        const withoutMoreLink = descriptionHtml.replace(/<a\b[^>]*>.*?<\/a>\s*$/is, '');
        const description = decode(withoutMoreLink.replace(/<[^>]+>/g, ' '))
            .replace(/\s+/g, ' ')
            .trim();

        entries.push({
            eventId,
            detailUrl: new URL(href, 'https://seattle.greencitypartnerships.org').toString(),
            title: decode(title),
            monthDayTimeLocation: decode(emText),
            description,
        });
    }

    return entries;
}

function parseTime(raw: string): { hour: number; minute: number } | undefined {
    const m = raw.trim().match(TIME_PATTERN);
    if (!m) return undefined;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3].toLowerCase();
    if (meridiem === 'p' && hour !== 12) hour += 12;
    if (meridiem === 'a' && hour === 12) hour = 0;
    return { hour, minute };
}

// The listing never states a year. Roll forward to next year when the
// event's month has already passed relative to `now` (e.g. a January
// event listed while building in December) — same convention as
// nw_metal_calendar.
function resolveYear(monthIndex: number, now: ZonedDateTime): number {
    const monthNumber = monthIndex + 1;
    return monthNumber < now.monthValue() ? now.year() + 1 : now.year();
}

export function parseListingEntry(entry: ListingEntry, zone: ZoneId, now: ZonedDateTime): RipperEvent {
    const m = entry.monthDayTimeLocation.match(LISTING_LINE_PATTERN);
    if (!m) {
        return { type: "ParseError", reason: `Could not parse date/time/location: "${entry.monthDayTimeLocation}"`, context: entry.title };
    }
    const [, monthName, dayStr, startRaw, endRaw, location] = m;

    const monthIndex = MONTHS.indexOf(monthName.toLowerCase());
    if (monthIndex === -1) {
        return { type: "ParseError", reason: `Unrecognized month name: "${monthName}"`, context: entry.title };
    }

    const start = parseTime(startRaw);
    const end = parseTime(endRaw);
    if (!start || !end) {
        return { type: "ParseError", reason: `Could not parse time range: "${startRaw}-${endRaw}"`, context: entry.title };
    }

    const year = resolveYear(monthIndex, now);
    let date: ZonedDateTime;
    let duration: Duration;
    try {
        const startDateTime = LocalDateTime.of(LocalDate.of(year, monthIndex + 1, parseInt(dayStr, 10)), LocalTime.of(start.hour, start.minute));
        date = ZonedDateTime.of(startDateTime, zone);
        const endTime = LocalTime.of(end.hour, end.minute);
        duration = Duration.between(LocalTime.of(start.hour, start.minute), endTime);
        if (duration.isNegative() || duration.isZero()) {
            return { type: "ParseError", reason: `End time is not after start time: "${entry.monthDayTimeLocation}"`, context: entry.title };
        }
    } catch (err) {
        return { type: "ParseError", reason: `Invalid event date/time: "${entry.monthDayTimeLocation}" (${err})`, context: entry.title };
    }

    const event: RipperCalendarEvent = {
        id: `green-seattle-partnership-${entry.eventId}`,
        ripped: new Date(),
        date,
        duration,
        summary: entry.title,
        description: entry.description || undefined,
        location: `${location.trim()}, Seattle, WA`,
        url: entry.detailUrl,
        cost: { min: 0 },
    };

    return event;
}

export default class GreenSeattlePartnershipRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await fetchFn(ripper.config.url.toString(), { headers: REQUEST_HEADERS });
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }
        const html = parseHtml(await res.text());
        const listedEntries = extractListingEntries(html);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const entry of listedEntries) {
            const result = parseListingEntry(entry, zone, now);
            if (!('date' in result)) {
                errors.push(result);
                continue;
            }
            if (result.date.isBefore(now)) continue; // Past event — intentional skip
            events.push(result);
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }
}
