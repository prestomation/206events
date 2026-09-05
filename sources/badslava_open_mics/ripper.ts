import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { ZonedDateTime, LocalDateTime, Duration, ZoneId } from "@js-joda/core";
import { decode } from "html-entities";
import '@js-joda/timezone';

const DEFAULT_DURATION = Duration.ofHours(2);
const TIME_PATTERN = /(\d{1,2}):(\d{2})\s*([ap]m)/i;

export function hasParseableTime(time: string): boolean {
    return TIME_PATTERN.test(time);
}

// Badslava's own venue names are sometimes suffixed with descriptive/marketing
// copy after a "-" or "|" (e.g. "Skylark Cafe & Club- Live Music | Scratch
// Kitchen | West Seattle"). Trimming to the leading segment keeps event
// titles readable and improves cross-source title matching against venues
// that already have their own dedicated source under a plainer name.
export function cleanVenueName(raw: string): string {
    return raw.split(/\s*[-|]\s+/)[0].trim();
}

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

        entries.push({ detailId, detailUrl: href, venueName: cleanVenueName(decode(venueName)), address, time, dateStr: currentDateStr });
    }

    return entries;
}

// Badslava's own event detail page (details.php?id=<id>) renders a plain
// info table with a `<tr><td><b>Event Cost: </b><br>Free</td></tr>` (or
// "Paid") row. The site never publishes an actual dollar amount — just
// this binary flag — so "Paid" can only become `{ paid: true }` (ticketed,
// amount unknown), never a guessed number.
const COST_PATTERN = /Event Cost:\s*<\/b>\s*<br\s*\/?>\s*([^<]*)/i;

export function parseEventCost(detailHtml: string): EventCost | undefined {
    const raw = detailHtml.match(COST_PATTERN)?.[1]?.trim().toLowerCase();
    if (raw === 'free') return { min: 0 };
    if (raw === 'paid') return { paid: true };
    return undefined;
}

// badslava.com fronts every page (listing and detail alike) with an
// intermittent bot-check: some requests 409 with a page whose only content
// is `document.cookie = "humans_21909=1"; document.location.reload(true)`.
// That cookie name/value is fixed site-wide (verified stable across dozens
// of requests), so sending it up front — exactly what the reload would set
// — reliably avoids the extra round trip rather than working around it
// after the fact.
const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)',
    'Cookie': 'humans_21909=1',
};

export function parseOpenMicEntry(entry: OpenMicEntry, zone: ZoneId): RipperEvent {
    const dateMatch = entry.dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (!dateMatch) {
        return { type: "ParseError", reason: `Could not parse date: "${entry.dateStr}"`, context: entry.venueName };
    }
    const [, month, day, twoDigitYear] = dateMatch;

    const timeMatch = entry.time.match(TIME_PATTERN);
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

// Fetches one event's own detail page and extracts its Event Cost field.
// Returns `undefined` (rather than throwing) when the fetch succeeds but the
// field is missing/unparseable, so the caller can tell "server error" apart
// from "page fetched fine, cost just wasn't there" only via the throw path —
// both are treated as an unresolved cost by the caller either way.
async function fetchDetailPageCost(fetchFn: FetchFn, detailUrl: string): Promise<EventCost | undefined> {
    const res = await fetchFn(detailUrl, { headers: REQUEST_HEADERS });
    if (!res.ok) {
        throw Error(`${res.status} ${res.statusText}`);
    }
    return parseEventCost(await res.text());
}

export default class BadslavaOpenMicsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await fetchFn(ripper.config.url.toString(), { headers: REQUEST_HEADERS });
        if (!res.ok) {
            throw Error(`${res.status} ${res.statusText}`);
        }
        const html = parseHtml(await res.text());
        const listedEntries = extractOpenMicEntries(html);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const entry of listedEntries) {
            const result = parseOpenMicEntry(entry, zone);
            if (!('date' in result)) {
                errors.push(result);
                continue;
            }
            if (result.date.isBefore(now)) continue; // Past event — intentional skip

            // One UncertaintyError per event: both gaps (start time from the
            // listing, cost from the detail page) fold into the same
            // `unknownFields` array/reason rather than emitting two errors
            // for the same event.id, per the cost-resolver skill's
            // "append to existing unknownFields" rule.
            const unknownFields: UncertaintyField[] = [];
            const reasons: string[] = [];

            if (!hasParseableTime(entry.time)) {
                unknownFields.push("startTime");
                reasons.push(`listing did not include a parseable start time (raw: "${entry.time}")`);
            }

            try {
                const cost = await fetchDetailPageCost(fetchFn, entry.detailUrl);
                if (cost) {
                    result.cost = cost;
                } else {
                    unknownFields.push("cost");
                    reasons.push(`detail page (id ${entry.detailId}) had no recognized Event Cost value`);
                }
            } catch (err) {
                unknownFields.push("cost");
                reasons.push(`failed to fetch/parse detail page (id ${entry.detailId}) for cost: ${err}`);
            }

            events.push(result);

            if (unknownFields.length > 0) {
                errors.push({
                    type: "Uncertainty",
                    reason: `badslava-open-mics ${reasons.join('; ')}`,
                    source: "badslava-open-mics",
                    unknownFields,
                    event: result,
                });
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
