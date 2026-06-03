import { Duration, LocalDate, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const DEFAULT_LOCATION = "KeyBank Outdoor Movies at Marymoor Park, 6046 W Lake Sammamish Pkwy NE, Redmond, WA 98052";
const DEFAULT_DURATION = Duration.ofHours(3);

const MONTHS: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
};

export interface ParsedHeading {
    month: number;
    day: number;
    title: string;
}

// Parse strings like "Wednesday, July 8th: FERRIS BUELLER'S DAY OFF" or
// "Wednesday, July15th: MAMA MIA" (note: source HTML sometimes omits the
// space between the month name and the day).
export function parseHeading(heading: string): ParsedHeading | null {
    const match = heading.match(/^[A-Za-z]+,\s*([A-Za-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s*[:\-]\s*(.+)$/);
    if (!match) return null;
    const [, monthRaw, dayRaw, titleRaw] = match;
    const month = MONTHS[monthRaw.toLowerCase()];
    if (!month) return null;
    const day = parseInt(dayRaw, 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    const title = titleRaw.trim();
    if (!title) return null;
    return { month, day, title };
}

// Parse a body string like "Doors Open at: 7:30pm Movie starts at 9:30pm: TITLE".
// Returns the doors-open time. Tolerates the source's known typo ("7:00m") by
// treating a bare "m" suffix as "pm".
export function parseDoorsTime(bodyText: string): LocalTime | null {
    const m = bodyText.match(/Doors Open at:\s*(\d{1,2}):(\d{2})\s*(am|pm|m)\b/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    const suffix = m[3].toLowerCase();
    if (suffix === 'am') {
        if (hour === 12) hour = 0;
    } else {
        // 'pm' or the typo 'm'
        if (hour < 12) hour += 12;
    }
    return LocalTime.of(hour, minute);
}

// Pick the year for a (month, day) pair: use the soonest occurrence whose
// date is not in the past relative to `now`'s local date. Returns null when
// the (month, day) is not a real calendar date in either year (e.g. Feb 30).
export function inferYear(month: number, day: number, now: ZonedDateTime): number | null {
    try {
        const today = now.toLocalDate();
        const thisYear = LocalDate.of(now.year(), month, day);
        return thisYear.isBefore(today) ? now.year() + 1 : now.year();
    } catch {
        return null;
    }
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function titleCase(s: string): string {
    return s.split(/(\s+)/).map(part => {
        if (!/\S/.test(part)) return part;
        const lower = part.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join('');
}

export function parsePanel(
    panel: HTMLElement,
    now: ZonedDateTime,
    zone: ZoneId
): RipperCalendarEvent | ParseError | null {
    const headingEl = panel.querySelector('.fusion-toggle-heading');
    const heading = headingEl?.textContent?.trim();
    if (!heading) return null;

    const parsed = parseHeading(heading);
    if (!parsed) {
        return {
            type: 'ParseError',
            reason: `Could not parse heading: "${heading}"`,
            context: heading,
        };
    }

    const bodyEl = panel.querySelector('.panel-body');
    const bodyText = bodyEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const doorsTime = parseDoorsTime(bodyText) ?? LocalTime.of(19, 0);

    const year = inferYear(parsed.month, parsed.day, now);
    if (year === null) {
        return {
            type: 'ParseError',
            reason: `Invalid calendar date in heading: month=${parsed.month}, day=${parsed.day}`,
            context: heading,
        };
    }
    let date: ZonedDateTime;
    try {
        date = ZonedDateTime.of(LocalDate.of(year, parsed.month, parsed.day), doorsTime, zone);
    } catch {
        return {
            type: 'ParseError',
            reason: `Invalid calendar date: ${year}-${parsed.month}-${parsed.day}`,
            context: heading,
        };
    }

    if (date.isBefore(now)) return null;

    const ticketLink = bodyEl
        ?.querySelectorAll('a')
        .find(a => /tickets?/i.test(a.textContent ?? ''));
    const rawUrl = ticketLink?.getAttribute('href');
    const url = rawUrl?.startsWith('http') ? rawUrl : undefined;

    const imgEl = bodyEl?.querySelector('img');
    const rawImage = imgEl?.getAttribute('data-lazy-src') ?? imgEl?.getAttribute('src') ?? undefined;
    const image = rawImage?.startsWith('http') ? rawImage : undefined;

    const niceTitle = titleCase(parsed.title);
    const summary = `${niceTitle} — Outdoor Movies at Marymoor`;

    return {
        id: `marymoor-movies-${year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}-${slugify(parsed.title)}`,
        ripped: new Date(),
        date,
        duration: DEFAULT_DURATION,
        summary,
        location: DEFAULT_LOCATION,
        url,
        imageUrl: image,
    };
}

export function parsePanelsFromHtml(
    html: HTMLElement,
    now: ZonedDateTime,
    zone: ZoneId
): { events: RipperCalendarEvent[]; errors: ParseError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: ParseError[] = [];
    for (const panel of html.querySelectorAll('.fusion-panel')) {
        const result = parsePanel(panel, now, zone);
        if (result === null) continue;
        if ('date' in result) events.push(result);
        else errors.push(result);
    }
    return { events, errors };
}

export default class MarymoorMoviesRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        if (!res.ok) {
            throw new Error(`Marymoor Movies page returned ${res.status} ${res.statusText}`);
        }

        const html = parse(await res.text());
        const { events, errors } = parsePanelsFromHtml(html, now, zone);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
