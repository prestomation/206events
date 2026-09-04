import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { ZonedDateTime, LocalDateTime, Duration, ZoneId } from "@js-joda/core";
import { decode } from "html-entities";
import '@js-joda/timezone';

const DEFAULT_DURATION = Duration.ofHours(2);

export interface OpenMicEntry {
    detailId: string;
    detailUrl: string;
    venueName: string;
    address: string;
    time: string;   // e.g. "7:00pm"
    dateStr: string; // "MM/DD/YY"
}

// The listing page is one table: a `<th colspan="2">Weekday MM/DD/YY</th>`
// header row followed by one `<tr><td>time</td><td><a>...</a></td></tr>`
// row per open mic that week. Walking `<tr>`s in document order and
// carrying the most recent header date forward mirrors that structure.
export function extractOpenMicEntries(html: HTMLElement): OpenMicEntry[] {
    const entries: OpenMicEntry[] = [];
    let currentDateStr: string | undefined;

    for (const row of html.querySelectorAll('tr')) {
        const header = row.querySelector('th');
        if (header) {
            const m = header.text.match(/(\d{2}\/\d{2}\/\d{2})/);
            currentDateStr = m?.[1];
            continue;
        }

        if (!currentDateStr) continue; // Row appeared before any date header — skip.

        const cells = row.querySelectorAll('td');
        if (cells.length < 2) continue;

        const time = cells[0].text.trim();
        const anchor = cells[1].querySelector('a');
        const href = anchor?.getAttribute('href');
        const detailId = href?.match(/[?&]id=(\d+)/)?.[1];
        const venueName = anchor?.querySelector('b')?.text.trim();
        const addressHtml = anchor?.innerHTML.split(/<br\s*\/?>/i)[1];
        const address = addressHtml ? decode(addressHtml.replace(/<[^>]+>/g, '').trim()) : undefined;

        if (!href || !detailId || !venueName || !address) continue;

        entries.push({ detailId, detailUrl: href, venueName: decode(venueName), address, time, dateStr: currentDateStr });
    }

    return entries;
}

export function parseOpenMicEntry(entry: OpenMicEntry, zone: ZoneId): RipperEvent {
    const dateMatch = entry.dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (!dateMatch) {
        return { type: "ParseError", reason: `Could not parse date: "${entry.dateStr}"`, context: entry.venueName };
    }
    const [, month, day, twoDigitYear] = dateMatch;

    const timeMatch = entry.time.match(/(\d{1,2}):(\d{2})\s*([ap]m)/i);
    let hour = 19; // Most open mics start in the evening; used only if the listing omits a time.
    let minute = 0;
    if (timeMatch) {
        hour = parseInt(timeMatch[1], 10);
        minute = parseInt(timeMatch[2], 10);
        const meridiem = timeMatch[3].toLowerCase();
        if (meridiem === 'pm' && hour !== 12) hour += 12;
        if (meridiem === 'am' && hour === 12) hour = 0;
    }

    let date: ZonedDateTime;
    try {
        date = ZonedDateTime.of(
            LocalDateTime.of(2000 + parseInt(twoDigitYear, 10), parseInt(month, 10), parseInt(day, 10), hour, minute),
            zone
        );
    } catch (err) {
        return { type: "ParseError", reason: `Invalid event date/time: "${entry.dateStr} ${entry.time}" (${err})`, context: entry.venueName };
    }

    const event: RipperCalendarEvent = {
        id: `badslava-${entry.detailId}-${date.toLocalDate().toString().replace(/-/g, '')}`,
        ripped: new Date(),
        date,
        duration: DEFAULT_DURATION,
        summary: `Open Mic at ${entry.venueName}`,
        location: entry.address,
        url: entry.detailUrl,
    };

    return event;
}

export default class BadslavaOpenMicsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);
        const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' };

        const res = await fetchFn(ripper.config.url.toString(), { headers });
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }
        const html = parseHtml(await res.text());
        const listedEntries = extractOpenMicEntries(html);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const entry of listedEntries) {
            const result = parseOpenMicEntry(entry, zone);
            if ('date' in result) {
                if (result.date.isBefore(now)) continue; // Past event — intentional skip
                events.push(result);
            } else {
                errors.push(result);
            }
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
