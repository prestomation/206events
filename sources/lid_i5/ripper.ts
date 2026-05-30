import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { parse } from "node-html-parser";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Lid I-5 is a grassroots campaign to build a lid park over Interstate 5
// through downtown Seattle. Their WordPress.com site has no calendar plugin
// or ICS feed; the tours page lists each walking tour as an anchor linking to
// a Seattle Parks Foundation registration page, with the date and time in the
// link text (e.g. "Tuesday, June 23, 2026, 5:30 PM – 7:00"). Each registration
// URL ends in a stable upstream id (e.g. ".../e800432") that we reuse as the
// event id.

const TIMEZONE = ZoneId.of('America/Los_Angeles');
const LOCATION = "Optum parking lot, 703 Marion St, Seattle, WA 98104";
const SUMMARY = "Lid I-5 Walking Tour";
const DESCRIPTION =
    "Volunteer-led walking tour of the Downtown I-5 lid study area. See the " +
    "freeway canyon up close and learn about the community-led effort to build " +
    "a lid park over I-5, visiting existing lids at Freeway Park and the Seattle " +
    "Convention Center. Donations of $10+ per person are welcome but not required.";
const DEFAULT_DURATION_MINUTES = 90;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

export default class LidI5Ripper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error('Lid I-5 ripper requires at least one calendar configuration');
        }
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) throw new Error(`Lid I-5 tours page returned ${res.status} ${res.statusText}`);

        const html = await res.text();
        const now = ZonedDateTime.now(TIMEZONE);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        // Anchors are unique per tour, but a single tour may be linked twice
        // (date list + body). Dedup on the resolved event id.
        const seen = new Set<string>();
        for (const { href, text } of this.extractTourLinks(html)) {
            const result = this.parseTourLink(href, text);
            if ('date' in result) {
                // parseTourLink always sets an id, but the type is optional;
                // guard explicitly rather than asserting non-null.
                if (!result.id) continue;
                if (seen.has(result.id)) continue;
                seen.add(result.id);
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

    // Public for testing. Returns the registration anchors on the tours page.
    extractTourLinks(html: string): { href: string; text: string }[] {
        const root = parse(html);
        const links: { href: string; text: string }[] = [];
        for (const a of root.querySelectorAll('a')) {
            const href = a.getAttribute('href') ?? '';
            if (!/seattleparksfoundation\.org\/event\//i.test(href)) continue;
            links.push({ href, text: a.text.trim() });
        }
        return links;
    }

    // Public for testing. Never returns null — every anchor either produces an
    // event or a ParseError explaining why it couldn't be parsed.
    parseTourLink(href: string, text: string): RipperCalendarEvent | RipperError {
        const idMatch = href.match(/\/(e\d+)(?:[/?#]|$)/i);
        const upstreamId = idMatch ? idMatch[1] : null;

        const monthNames = MONTHS.join('|');
        const dateMatch = text.match(
            new RegExp(`(${monthNames})\\s+(\\d{1,2}),\\s+(\\d{4})`, 'i'),
        );
        if (!dateMatch) {
            return {
                type: 'ParseError',
                reason: 'No parseable date found in tour link text',
                context: `${text} (${href})`,
            };
        }

        const month = MONTHS.indexOf(dateMatch[1].toLowerCase()) + 1;
        const day = parseInt(dateMatch[2], 10);
        const year = parseInt(dateMatch[3], 10);

        const timeMatch = text.match(
            /(\d{1,2}):(\d{2})\s*(am|pm)?\s*[–\-]\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i,
        );

        let startHour = 17;
        let startMinute = 30;
        let durationMinutes = DEFAULT_DURATION_MINUTES;

        if (timeMatch) {
            startHour = parseInt(timeMatch[1], 10);
            startMinute = parseInt(timeMatch[2], 10);
            const startAmPm = timeMatch[3]?.toLowerCase();
            let endHour = parseInt(timeMatch[4], 10);
            const endMinute = parseInt(timeMatch[5], 10);
            let endAmPm = timeMatch[6]?.toLowerCase();

            // The end time often omits am/pm ("5:30 PM – 7:00"); inherit the
            // start meridiem when it's missing.
            if (!endAmPm) endAmPm = startAmPm;

            startHour = this.to24Hour(startHour, startAmPm);
            endHour = this.to24Hour(endHour, endAmPm);

            const start = startHour * 60 + startMinute;
            const end = endHour * 60 + endMinute;
            if (end > start) durationMinutes = end - start;
        }

        const id = upstreamId ? `lidi5-${upstreamId}` : `lidi5-${year}-${month}-${day}`;

        return {
            id,
            ripped: new Date(),
            date: ZonedDateTime.of(
                LocalDateTime.of(year, month, day, startHour, startMinute),
                TIMEZONE,
            ),
            duration: Duration.ofMinutes(durationMinutes),
            summary: SUMMARY,
            description: DESCRIPTION,
            location: LOCATION,
            url: href,
        };
    }

    private to24Hour(hour: number, ampm: string | undefined): number {
        // No meridiem — leave the hour as-is (already 24-hour, or the caller
        // inherited the start meridiem before calling).
        if (!ampm) return hour;
        if (ampm === 'pm' && hour !== 12) return hour + 12;
        if (ampm === 'am' && hour === 12) return 0;
        return hour;
    }
}
