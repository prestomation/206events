import { ChronoUnit, Duration, LocalDate, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const BASE_URL = "https://www.seattlecenter.com";
const DEFAULT_LOCATION = "Seattle Center, 305 Harrison St, Seattle, WA 98109";
const START_TIME = LocalTime.of(11, 0);

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

function absolutize(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${BASE_URL}/${pathOrUrl.replace(/^\//, '')}`;
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function inferYear(month: number, day: number, now: ZonedDateTime): number | null {
    try {
        const today = now.toLocalDate();
        const thisYear = LocalDate.of(now.year(), month, day);
        return thisYear.isBefore(today) ? now.year() + 1 : now.year();
    } catch {
        return null;
    }
}

export interface FestalDate {
    startYear: number;
    startMonth: number;
    startDay: number;
    durationHours: number;
}

export function parseFestalDate(dateStr: string, now: ZonedDateTime): FestalDate | null {
    const s = dateStr.trim();

    // Cross-month range: "Oct 31-Nov 1" or "October 31-November 1, 2026"
    const crossMonthMatch = s.match(
        /^([A-Za-z]+)\.?\s+(\d+)\s*[-–]\s*([A-Za-z]+)\.?\s+(\d+)(?:,?\s*(\d{4}))?/i
    );
    if (crossMonthMatch) {
        const [, m1, d1Raw, m2, d2Raw, yearStr] = crossMonthMatch;
        const startMonth = MONTHS[m1.toLowerCase()];
        const endMonth = MONTHS[m2.toLowerCase()];
        if (!startMonth || !endMonth) return null;
        const startDay = parseInt(d1Raw, 10);
        const endDay = parseInt(d2Raw, 10);
        const startYear = yearStr ? parseInt(yearStr, 10) : inferYear(startMonth, startDay, now);
        if (!startYear) return null;
        try {
            const endYear = endMonth < startMonth ? startYear + 1 : startYear;
            const startLD = LocalDate.of(startYear, startMonth, startDay);
            const endLD = LocalDate.of(endYear, endMonth, endDay);
            const days = startLD.until(endLD, ChronoUnit.DAYS) + 1;
            // Span from 11am on day 1 to 7pm on last day: (days-1)*24h + 8h
            return { startYear, startMonth, startDay, durationHours: (days - 1) * 24 + 8 };
        } catch {
            return null;
        }
    }

    // Same-month range: "Feb 14-15, 2026" or "Jun 6-7"
    const sameMonthMatch = s.match(
        /^([A-Za-z]+)\.?\s+(\d+)\s*[-–]\s*(\d+)(?:,?\s*(\d{4}))?/i
    );
    if (sameMonthMatch) {
        const [, m, d1Raw, d2Raw, yearStr] = sameMonthMatch;
        const startMonth = MONTHS[m.toLowerCase()];
        if (!startMonth) return null;
        const startDay = parseInt(d1Raw, 10);
        const endDay = parseInt(d2Raw, 10);
        const startYear = yearStr ? parseInt(yearStr, 10) : inferYear(startMonth, startDay, now);
        if (!startYear) return null;
        const days = endDay - startDay + 1;
        // Span from 11am on day 1 to 7pm on last day: (days-1)*24h + 8h
        return { startYear, startMonth, startDay, durationHours: (days - 1) * 24 + 8 };
    }

    // Single day: "Mar 22" or "Jul 11, 2026"
    const singleDayMatch = s.match(/^([A-Za-z]+)\.?\s+(\d+)(?:,?\s*(\d{4}))?/i);
    if (singleDayMatch) {
        const [, m, dRaw, yearStr] = singleDayMatch;
        const startMonth = MONTHS[m.toLowerCase()];
        if (!startMonth) return null;
        const startDay = parseInt(dRaw, 10);
        const startYear = yearStr ? parseInt(yearStr, 10) : inferYear(startMonth, startDay, now);
        if (!startYear) return null;
        return { startYear, startMonth, startDay, durationHours: 8 };
    }

    return null;
}

// h2 is an h2.fifty-fifty__title element; its parent is .fifty-fifty__header,
// whose next sibling is .fifty-fifty__content containing the <b> date.
export function parseFestalSection(
    h2: HTMLElement,
    now: ZonedDateTime,
    zone: ZoneId
): RipperCalendarEvent | ParseError | null {
    const anchor = h2.querySelector('a');
    if (!anchor) return null;

    const href = anchor.getAttribute('href') ?? '';
    // Skip PDFs, external links, and non-festival page entries
    if (!href || href.endsWith('.pdf') || /^https?:\/\//i.test(href)) return null;

    const title = decode(anchor.textContent).replace(/\s+/g, ' ').trim();
    if (!title) return null;

    const url = absolutize(href);

    // h2 is inside .fifty-fifty__header; content is in the next sibling div
    const contentDiv = h2.parentNode?.nextElementSibling;
    if (!contentDiv) return null;

    const bold = contentDiv.querySelector('b');
    if (!bold) return null;
    const dateStr = decode(bold.textContent).replace(/\s+/g, ' ').trim();

    if (/postponed/i.test(dateStr)) return null;

    const parsed = parseFestalDate(dateStr, now);
    // Return null (not ParseError) for entries with non-date bold text (e.g. intro sections)
    if (!parsed) return null;

    let startDate: ZonedDateTime;
    try {
        startDate = ZonedDateTime.of(
            LocalDate.of(parsed.startYear, parsed.startMonth, parsed.startDay),
            START_TIME,
            zone
        );
    } catch {
        return {
            type: 'ParseError',
            reason: `Invalid date: ${parsed.startYear}-${parsed.startMonth}-${parsed.startDay}`,
            context: title,
        };
    }

    const endDate = startDate.plus(Duration.ofHours(parsed.durationHours));
    if (endDate.isBefore(now)) return null;

    const contentText = decode(contentDiv.textContent).replace(/\s+/g, ' ').trim();
    const description = contentText.replace(dateStr, '').replace(/^\s*[,.\s]+/, '').trim() || undefined;

    const mm = String(parsed.startMonth).padStart(2, '0');
    const dd = String(parsed.startDay).padStart(2, '0');

    return {
        id: `seattle-center-festal-${parsed.startYear}-${mm}-${dd}-${slugify(title)}`,
        ripped: new Date(),
        date: startDate,
        duration: Duration.ofHours(parsed.durationHours),
        summary: title,
        description,
        location: DEFAULT_LOCATION,
        url,
    };
}

export function parseFestalFromHtml(
    html: HTMLElement,
    now: ZonedDateTime,
    zone: ZoneId
): { events: RipperCalendarEvent[]; errors: ParseError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: ParseError[] = [];

    for (const h2 of html.querySelectorAll('h2.fifty-fifty__title')) {
        const result = parseFestalSection(h2, now, zone);
        if (result === null) continue;
        if ('date' in result) events.push(result);
        else errors.push(result);
    }

    return { events, errors };
}

export default class FestalRipper implements IRipper {
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
            throw new Error(`Seattle Center Festál page returned ${res.status} ${res.statusText}`);
        }

        const html = parse(await res.text());
        const { events, errors } = parseFestalFromHtml(html, now, zone);

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
