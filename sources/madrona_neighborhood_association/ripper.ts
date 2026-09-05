import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const BASE_URL = "https://madrona.us";
const TIMEZONE = ZoneId.of('America/Los_Angeles');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

interface TimeRange {
    hour: number;
    minute: number;
    endHour: number;
    endMinute: number;
}

interface EventPage {
    slug: string;
    path: string;
    title: string;
    location: string;
    url: string;
}

// Madrona Neighborhood Association publishes each recurring event as its own
// static "Events & Programs" page (no calendar plugin, no ICS/JSON feed —
// verified: the site's Tribe Events REST API returns zero events). Each page
// uses its own freeform wording for the date, so there's no single generic
// format to parse; every page gets a dedicated parser below. Pages whose
// event is announced without a concrete date ("Spring Date & Time TBA") are
// intentionally left out of this list — there's nothing to scrape yet.
const PAGES: EventPage[] = [
    {
        slug: 'trick-or-treat-34th-ave',
        path: '/trickortreat/',
        title: 'Trick or Treat 34th Ave',
        location: 'The Madrona Business District, 34th Ave, Seattle, WA 98122',
        url: 'https://madrona.us/trickortreat/',
    },
    {
        slug: 'monthly-meeting',
        path: '/monthlymeetings/',
        title: 'Madrona Neighborhood Association Monthly Meeting',
        location: 'Madrona Playground Shelter House, 3211 E Spring St, Seattle, WA 98122',
        url: 'https://madrona.us/monthlymeetings/',
    },
    {
        slug: 'music-in-the-playfield',
        path: '/musicintheplayfield/',
        title: 'Music In The Playfield',
        location: 'Madrona Playfield, 3211 E Spring St, Seattle, WA 98122',
        url: 'https://madrona.us/musicintheplayfield/',
    },
];

export default class MadronaNeighborhoodAssociationRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const now = ZonedDateTime.now(TIMEZONE);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const page of PAGES) {
            let text: string;
            try {
                const res = await fetchFn(BASE_URL + page.path, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
                });
                if (!res.ok) {
                    errors.push({ type: 'ParseError', reason: `HTTP ${res.status} fetching ${page.path}`, context: page.slug });
                    continue;
                }
                text = this.stripHtml(await res.text());
            } catch (err) {
                errors.push({ type: 'ParseError', reason: `Failed to fetch ${page.path}: ${err}`, context: page.slug });
                continue;
            }

            // Past events are filtered here (not in the parsers) so the
            // parsers stay testable against whatever date they're given.
            // Parsing is wrapped per-page so a crash on one page (e.g. an
            // unexpected regex match producing an out-of-range day) can't
            // take down the other two pages' events — same convention as
            // sources/book_larder/ripper.ts's per-item try/catch.
            let results: RipperEvent[];
            try {
                results = this.parsePage(page, text);
            } catch (err) {
                errors.push({ type: 'ParseError', reason: `Failed to parse ${page.path}: ${err}`, context: page.slug });
                continue;
            }
            for (const result of results) {
                if ('date' in result) {
                    if (result.date.isBefore(now)) continue;
                    events.push(result);
                } else {
                    errors.push(result);
                }
            }
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing. Dispatches to the page-specific parser.
    parsePage(page: EventPage, text: string): RipperEvent[] {
        switch (page.slug) {
            case 'trick-or-treat-34th-ave':
                return this.parseTrickOrTreat(page, text);
            case 'monthly-meeting':
                return this.parseMonthlyMeeting(page, text);
            case 'music-in-the-playfield':
                return this.parseMusicInThePlayfield(page, text);
            default:
                return [{ type: 'ParseError', reason: 'No parser registered for page', context: page.slug }];
        }
    }

    // "Trick or Treat / The Madrona Business District / Saturday, Oct 31, 2026 / 4-6PM"
    parseTrickOrTreat(page: EventPage, text: string): RipperEvent[] {
        // Anchored on "Business District" (like the other two parsers anchor
        // on their own nearby landmark text) rather than searching the whole
        // page: an unanchored date regex risks silently matching an unrelated
        // "Month D, YYYY"-shaped string elsewhere on the page (nav, footer
        // copyright, related-post blurbs) and publishing the wrong date.
        const anchor = text.indexOf('Business District');
        if (anchor === -1) {
            return [{ type: 'ParseError', reason: 'No "Business District" heading found (page structure changed?)', context: page.slug }];
        }
        const block = text.slice(anchor, anchor + 200);

        const dateMatch = block.match(/([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),\s*(\d{4})/);
        if (!dateMatch || dateMatch.index === undefined) {
            return [{ type: 'ParseError', reason: 'No date found on page (likely TBA)', context: page.slug }];
        }
        const month = this.monthIndex(dateMatch[1]);
        if (month === -1) {
            return [{ type: 'ParseError', reason: `Unrecognized month "${dateMatch[1]}"`, context: page.slug }];
        }
        const day = parseInt(dateMatch[2], 10);
        const year = parseInt(dateMatch[3], 10);

        const time = this.parseTimeRange(block.slice(dateMatch.index, dateMatch.index + 200));
        if (!time) {
            return [{ type: 'ParseError', reason: 'Found a date but no time range nearby', context: page.slug }];
        }

        return [this.buildEvent(page, year, month, day, time, `madrona-trick-or-treat-${year}-${month}-${day}`)];
    }

    // "Our next meeting will be on: Wednesday October 7th, 2026 7:00PM-8:15PM Location: Madrona Playfield Shelterhouse"
    parseMonthlyMeeting(page: EventPage, text: string): RipperEvent[] {
        const anchor = text.indexOf('next meeting will be on');
        if (anchor === -1) {
            return [{ type: 'ParseError', reason: 'No "next meeting" announcement found', context: page.slug }];
        }
        const block = text.slice(anchor, anchor + 200);

        const dateMatch = block.match(/([A-Z][a-z]{2,8})\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})/);
        if (!dateMatch || dateMatch.index === undefined) {
            return [{ type: 'ParseError', reason: 'No date found in next-meeting announcement', context: page.slug }];
        }
        const month = this.monthIndex(dateMatch[1]);
        if (month === -1) {
            return [{ type: 'ParseError', reason: `Unrecognized month "${dateMatch[1]}"`, context: page.slug }];
        }
        const day = parseInt(dateMatch[2], 10);
        const year = parseInt(dateMatch[3], 10);

        const time = this.parseTimeRange(block.slice(dateMatch.index));
        if (!time) {
            return [{ type: 'ParseError', reason: 'Found a meeting date but no time range', context: page.slug }];
        }

        return [this.buildEvent(page, year, month, day, time, `madrona-monthly-meeting-${year}-${month}-${day}`)];
    }

    // "Free summer concerts in Madrona / Three Tuesday evenings in the park, August 2026
    //  / AUGUST 11 · 18 · 25 / Tuesdays · 6 to 8 PM · Madrona Playfield"
    // One event per listed day (2-3 dated Tuesdays each summer).
    parseMusicInThePlayfield(page: EventPage, text: string): RipperEvent[] {
        const anchor = text.indexOf('evenings in the park');
        if (anchor === -1) {
            return [{ type: 'ParseError', reason: 'No season announcement found (likely off-season)', context: page.slug }];
        }
        const block = text.slice(anchor, anchor + 300);

        const yearMatch = block.match(/,\s*([A-Z][a-z]+)\s+(\d{4})/);
        if (!yearMatch) {
            return [{ type: 'ParseError', reason: 'No month/year found in season announcement', context: page.slug }];
        }
        const month = this.monthIndex(yearMatch[1]);
        if (month === -1) {
            return [{ type: 'ParseError', reason: `Unrecognized month "${yearMatch[1]}"`, context: page.slug }];
        }
        const year = parseInt(yearMatch[2], 10);

        // Matches an arbitrary-length run of "NN · NN" day tokens after the
        // month name (not capped at 3) — the page currently lists three
        // Tuesdays, but a season with more shouldn't silently lose one.
        // Case-insensitive: the heading is "AUGUST 11 · 18 · 25" in the live
        // markup, but don't assume that capitalization is guaranteed to hold.
        // Requires at least one "digits + separator" pair before the final
        // digit group so this can't match the single bare year in the
        // "evenings in the park, August 2026" sentence above the heading —
        // that "August" is a different occurrence than the all-caps one this
        // is meant to anchor on.
        const daysMatch = block.match(new RegExp(`${yearMatch[1]}\\s+((?:\\d{1,2}\\s*[·,]\\s*)+\\d{1,2})`, 'i'));
        if (!daysMatch) {
            return [{ type: 'ParseError', reason: 'No dated Tuesdays list found', context: page.slug }];
        }
        const days = (daysMatch[1].match(/\d{1,2}/g) ?? []).map(d => parseInt(d, 10));
        if (days.length === 0) {
            return [{ type: 'ParseError', reason: 'No dated Tuesdays list found', context: page.slug }];
        }

        const time = this.parseTimeRange(block.slice((daysMatch.index ?? 0) + daysMatch[0].length));
        if (!time) {
            return [{ type: 'ParseError', reason: 'Found concert dates but no time range', context: page.slug }];
        }

        return days.map(day => this.buildEvent(page, year, month, day, time, `madrona-music-in-the-playfield-${year}-${month}-${day}`));
    }

    // Returns a ParseError instead of throwing when the parsed numbers don't
    // form a valid calendar date (e.g. a mis-parsed day-of-month) — a single
    // page's regex slip should degrade to one dropped event, not crash the
    // whole ripper (see the per-page try/catch in rip()).
    private buildEvent(page: EventPage, year: number, month: number, day: number, time: TimeRange, id: string): RipperEvent {
        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(LocalDateTime.of(year, month, day, time.hour, time.minute), TIMEZONE);
        } catch (err) {
            return { type: 'ParseError', reason: `Invalid date ${year}-${month}-${day}: ${err}`, context: page.slug };
        }

        const startMinutes = time.hour * 60 + time.minute;
        const endMinutes = time.endHour * 60 + time.endMinute;
        const durationMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : 120;

        return {
            id,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes),
            summary: page.title,
            location: page.location,
            url: page.url,
        };
    }

    private monthIndex(name: string): number {
        const lower = name.toLowerCase();
        let idx = MONTHS.indexOf(lower);
        if (idx === -1) idx = MONTHS.findIndex(m => m.startsWith(lower));
        return idx === -1 ? -1 : idx + 1;
    }

    // Public for testing. Parses a "H(:MM)?(am|pm)? <sep> H(:MM)?(am|pm)" range,
    // where <sep> is a hyphen/en-dash or the word "to". When only the end side
    // carries am/pm (e.g. "4-6PM" or "6 to 8 PM"), infers the start period from
    // the end — same approach as other freeform-time rippers in this repo
    // (see sources/book_larder/ripper.ts).
    parseTimeRange(text: string): TimeRange | null {
        const rangeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
        const match = text.match(rangeRe);
        if (!match) return null;

        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2] ?? '0', 10);
        const startAmPm = match[3]?.toLowerCase();
        let endHour = parseInt(match[4], 10);
        const endMinute = parseInt(match[5] ?? '0', 10);
        const endAmPm = match[6].toLowerCase();

        if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
        else if (endAmPm === 'am' && endHour === 12) endHour = 0;

        if (startAmPm === 'pm' && hour !== 12) hour += 12;
        else if (startAmPm === 'am' && hour === 12) hour = 0;
        else if (!startAmPm) {
            const endHour12 = endHour > 12 ? endHour - 12 : endHour;
            if (endAmPm === 'pm' && hour < 12 && hour < endHour12) hour += 12;
        }

        return { hour, minute, endHour, endMinute };
    }

    // Public for testing
    stripHtml(html: string): string {
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&middot;/g, '·')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
}
