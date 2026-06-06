import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const LOCATION = "International Fountain, Seattle Center, 305 Harrison St, Seattle, WA 98109";
const SOURCE_URL = "https://www.visitseattle.org/sea26/drone-show/";
// Drone shows run approximately 15–20 minutes; use 30 min as a comfortable upper bound.
const SHOW_DURATION = Duration.ofMinutes(30);

const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export interface ParsedShow {
    dateStr: string; // "YYYY-MM-DD"
    hour: number;
    minute: number;
    timeKnown: boolean;
    timeApproximate: boolean;
    matchName: string;
}

/**
 * Parse a time string like "10pm", "11:30pm" into { hour, minute }.
 * Returns null if the string is not a recognizable time.
 */
export function parseTimeStr(raw: string): { hour: number; minute: number } | null {
    const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3].toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return { hour, minute };
}

/**
 * Parse a single <li> item from the drone show schedule.
 *
 * Expected <strong> text formats:
 *   "Monday, June 15 show at 10pm"
 *   "Friday, June 19 showtime TBD"
 *   "Wednesday, June 24 show at 10pm"
 *   "Friday, June 26 show after 11pm"
 *   "Wednesday, July 1 show at 11:30pm"
 *   "Monday, July 6 showtime TBD"
 */
export function parseShowItem(
    strongText: string,
    liText: string,
    year: number,
): ParsedShow | RipperError {
    const clean = strongText.replace(/\s+/g, ' ').trim();

    // Extract date: "Month DD" anywhere in the string
    const dateMatch = clean.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i);
    if (!dateMatch) {
        return { type: 'ParseError', reason: 'No date found in show item', context: clean };
    }
    const monthNum = MONTHS[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2], 10);
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Extract match name from the full <li> text (text in parentheses after the <strong>)
    const matchNameMatch = liText.replace(/\s+/g, ' ').trim().match(/\(([^)]+)\)\s*$/);
    const matchName = matchNameMatch ? matchNameMatch[1].trim() : '';

    // Detect "showtime TBD" — time unknown; use noon as placeholder
    if (/showtime\s+tbd/i.test(clean)) {
        return { dateStr, hour: 12, minute: 0, timeKnown: false, timeApproximate: false, matchName };
    }

    // Detect "show after HH:MMpm" — time approximate
    const afterMatch = clean.match(/show\s+after\s+([\d:]+\s*(?:am|pm))/i);
    if (afterMatch) {
        const parsed = parseTimeStr(afterMatch[1].replace(/\s+/g, ''));
        const t = parsed ?? { hour: 23, minute: 0 };
        return { dateStr, hour: t.hour, minute: t.minute, timeKnown: true, timeApproximate: true, matchName };
    }

    // "show at HH:MMpm"
    const atMatch = clean.match(/show\s+at\s+([\d:]+\s*(?:am|pm))/i);
    if (atMatch) {
        const parsed = parseTimeStr(atMatch[1].replace(/\s+/g, ''));
        if (!parsed) {
            return { type: 'ParseError', reason: `Unparseable time: "${atMatch[1]}"`, context: clean };
        }
        return { dateStr, hour: parsed.hour, minute: parsed.minute, timeKnown: true, timeApproximate: false, matchName };
    }

    return { type: 'ParseError', reason: 'Could not parse show time', context: clean };
}

export default class Sea26DroneShowsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error('No calendars configured for sea26-drone-shows');
        }
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) throw new Error(`SEA 26 Drone Shows page returned ${res.status} ${res.statusText}`);

        const html = await res.text();
        const now = ZonedDateTime.now(TIMEZONE);
        const year = now.year();
        const source = ripper.config.name;
        const calendar = calConfig.name;

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const result of this.parseShows(html, year, source, calendar)) {
            if ('date' in result) {
                if (!result.date.isBefore(now)) events.push(result);
            } else {
                errors.push(result);
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

    // Public for testing. Parses all show items from the HTML.
    // Returns a flat array of events (RipperCalendarEvent) and errors (RipperError).
    // For TBD-time shows, both the placeholder event and its UncertaintyError are included.
    parseShows(
        html: string,
        year: number,
        source = 'sea26-drone-shows',
        calendar = 'drone-shows',
    ): Array<RipperCalendarEvent | RipperError> {
        const root = parse(html);
        const results: Array<RipperCalendarEvent | RipperError> = [];

        // Find the <ul> that follows the "Drone Show Times" heading
        const h3 = root.querySelectorAll('h3').find(
            el => el.text.trim().toLowerCase().includes('drone show times'),
        );
        if (!h3) return results;

        // The schedule <ul> is a direct child of the same container as the h3.
        const ul = h3.parentNode?.querySelector('ul');
        if (!ul) return results;

        for (const li of ul.querySelectorAll('li')) {
            const strong = li.querySelector('strong');
            if (!strong) continue;

            const parsed = parseShowItem(strong.text, li.text, year);
            if ('type' in parsed) {
                results.push(parsed as RipperError);
                continue;
            }

            const show = parsed as ParsedShow;
            const matchLabel = show.matchName ? `: ${show.matchName}` : '';
            const title = `SEA 26 Drone Show${matchLabel}`;
            const id = `sea26-drone-show-${show.dateStr}`;

            let startDt: ZonedDateTime;
            try {
                startDt = ZonedDateTime.of(
                    LocalDateTime.of(
                        parseInt(show.dateStr.slice(0, 4)),
                        parseInt(show.dateStr.slice(5, 7)),
                        parseInt(show.dateStr.slice(8, 10)),
                        show.hour,
                        show.minute,
                    ),
                    TIMEZONE,
                );
            } catch (e) {
                results.push({ type: 'ParseError', reason: `Could not build datetime: ${e}`, context: show.dateStr });
                continue;
            }

            const baseDescription = 'Free drone show by Visit Seattle at Seattle Center following the FIFA World Cup 26™ match. Ideal viewing from Fisher Pavilion or the International Fountain area.';

            const event: RipperCalendarEvent = {
                id,
                ripped: new Date(),
                summary: title,
                date: startDt,
                duration: SHOW_DURATION,
                location: LOCATION,
                url: SOURCE_URL,
                description: show.timeApproximate
                    ? baseDescription + ' (Start time approximate — show follows the match.)'
                    : baseDescription,
            };

            results.push(event);

            if (!show.timeKnown) {
                const unknownFields: UncertaintyField[] = ['startTime'];
                const uncertainty: UncertaintyError = {
                    type: 'Uncertainty',
                    reason: `Show time not yet announced for ${show.dateStr} (${show.matchName || 'match TBD'})`,
                    source,
                    calendar,
                    unknownFields,
                    event,
                    partialFingerprint: show.dateStr,
                };
                results.push(uncertainty);
            }
        }

        return results;
    }
}
