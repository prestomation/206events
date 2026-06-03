import { Duration, LocalDate, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const BASE_URL = "https://www.seattlecenter.com";
const DEFAULT_LOCATION = "Mural Amphitheatre, Seattle Center, 305 Harrison St, Seattle, WA 98109";
// Page states "Movies begin at dusk (about 9pm)" — use 21:00 as the published start.
const START_TIME = LocalTime.of(21, 0);
// Pre-show short film + feature; ~2.5h is a reasonable upper bound.
const DEFAULT_DURATION = Duration.ofMinutes(150);

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

export interface ParsedTitle {
    title: string;
    month: number;
    day: number;
}

// Parse "Wonka | Jul 24" or "The Princess Bride | July 31" etc. The page uses
// "Title | Mon DD" with a pipe separator and an abbreviated month name.
export function parseTitleAndDate(text: string): ParsedTitle | null {
    const match = text.match(/^(.+?)\s*\|\s*([A-Za-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s*$/);
    if (!match) return null;
    const [, titleRaw, monthRaw, dayRaw] = match;
    const title = titleRaw.trim();
    if (!title) return null;
    const month = MONTHS[monthRaw.toLowerCase()];
    if (!month) return null;
    const day = parseInt(dayRaw, 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    return { title, month, day };
}

// Pick the year for a (month, day) pair: use the soonest occurrence whose date
// is not before today. Returns null when the (month, day) is not a real
// calendar date in either year (e.g. Feb 30).
export function inferYear(month: number, day: number, now: ZonedDateTime): number | null {
    try {
        const today = now.toLocalDate();
        const thisYear = LocalDate.of(now.year(), month, day);
        return thisYear.isBefore(today) ? now.year() + 1 : now.year();
    } catch {
        return null;
    }
}

// Pull the URL out of a CSS `background-image: url(...)` declaration.
export function extractBackgroundImageUrl(styleAttr: string | undefined): string | null {
    if (!styleAttr) return null;
    const m = styleAttr.match(/background-image\s*:\s*url\(\s*(['"]?)([^)'"]+)\1\s*\)/i);
    return m ? m[2] : null;
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function absolutize(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${BASE_URL}/${pathOrUrl.replace(/^\//, '')}`;
}

export function parseFeaturedItem(
    item: HTMLElement,
    now: ZonedDateTime,
    zone: ZoneId
): RipperCalendarEvent | ParseError | null {
    const titleEl = item.querySelector('.featured-item__title');
    const rawTitle = titleEl?.textContent;
    if (!rawTitle) return null;
    const text = decode(rawTitle).replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const parsed = parseTitleAndDate(text);
    if (!parsed) {
        return {
            type: 'ParseError',
            reason: `Could not parse "<title> | <Mon DD>" out of featured-item title: "${text}"`,
            context: text,
        };
    }

    const year = inferYear(parsed.month, parsed.day, now);
    if (year === null) {
        return {
            type: 'ParseError',
            reason: `Invalid calendar date: month=${parsed.month}, day=${parsed.day}`,
            context: text,
        };
    }

    let date: ZonedDateTime;
    try {
        date = ZonedDateTime.of(LocalDate.of(year, parsed.month, parsed.day), START_TIME, zone);
    } catch {
        return {
            type: 'ParseError',
            reason: `Could not construct ZonedDateTime for ${year}-${parsed.month}-${parsed.day}`,
            context: text,
        };
    }

    if (date.isBefore(now)) return null;

    const href = item.getAttribute('href') ?? undefined;
    const url = href ? absolutize(href) : undefined;

    const bgUrl = extractBackgroundImageUrl(item.getAttribute('style') ?? undefined);
    const image = bgUrl ? absolutize(bgUrl) : undefined;

    return {
        id: `movies-at-the-mural-${year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}-${slugify(parsed.title)}`,
        ripped: new Date(),
        date,
        duration: DEFAULT_DURATION,
        summary: `${parsed.title} — Movies at the Mural`,
        description: "Free outdoor movie at the Mural Amphitheatre lawn, Seattle Center. Movies begin at dusk (about 9pm). Seating is first-come, first-served. Preceded by a student short film.",
        location: DEFAULT_LOCATION,
        url,
        imageUrl: image,
    };
}

export function parseFeaturedItemsFromHtml(
    html: HTMLElement,
    now: ZonedDateTime,
    zone: ZoneId
): { events: RipperCalendarEvent[]; errors: ParseError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: ParseError[] = [];
    // Only anchor elements with class "featured-item" (not children like
    // "featured-item__title" or "featured-item__content").
    for (const item of html.querySelectorAll('a.featured-item')) {
        const href = item.getAttribute('href') ?? '';
        // Restrict to the movie cards. Every Movies-at-the-Mural card links
        // under /events/event-calendar/movies-at-the-mural*, so anchor on that
        // path to ignore any unrelated featured-items on the page.
        if (!/events\/event-calendar\/movies-at-the-mural/i.test(href)) continue;
        const result = parseFeaturedItem(item, now, zone);
        if (result === null) continue;
        if ('date' in result) events.push(result);
        else errors.push(result);
    }
    return { events, errors };
}

export default class MoviesAtTheMuralRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        if (!res.ok) {
            throw new Error(`Movies at the Mural page returned ${res.status} ${res.statusText}`);
        }

        const html = parse(await res.text());
        const { events, errors } = parseFeaturedItemsFromHtml(html, now, zone);

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
