import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const LOCATION = "Vermillion, 1508 11th Ave, Seattle, WA 98122";
const TIMEZONE = ZoneId.of('America/Los_Angeles');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

interface DatedLine {
    label: string;
    year: number; month: number; day: number;
    startHour: number; startMinute: number;
    endHour: number; endMinute: number;
}

// Vermillion has no dedicated events page or feed — the current exhibition's
// title and reception dates are hand-written into a homepage text block each
// month (e.g. "Jeff Mihalyo: PAST & PRESENT" / "Opening Thursday, July 2,
// 2026 5-8pm" / "Capitol Hill Artwalk Reception: Thursday, July 9, 2026
// 5-9pm"). This ripper scrapes that block directly from the homepage.
export default class VermillionGalleryRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const url = ripper.config.url.href;

        const res = await this.fetchFn(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const html = await res.text();

        const events = this.parseHomepageHtml(html);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing. Scans every rich-text block on the homepage for one
    // that pairs an <h4> (exhibition title) with an <h3> containing at least
    // one parseable reception date/time line. Returns a ParseError (never an
    // empty silent result) when no such block is found.
    parseHomepageHtml(html: string): RipperEvent[] {
        const root = parse(html);
        const blocks = root.querySelectorAll('.sqs-html-content');

        const events: RipperEvent[] = [];
        let matchedBlock = false;

        for (const block of blocks) {
            const h4 = block.querySelector('h4');
            const h3 = block.querySelector('h3');
            if (!h4 || !h3) continue;

            const title = h4.text.replace(/\s+/g, ' ').trim();
            if (!title) continue;

            const lines = h3.innerHTML
                .split(/<br\s*\/?>/i)
                .map(line => parse(line).text.replace(/\s+/g, ' ').trim())
                .filter(Boolean);

            const dated = this.extractDatedLines(lines);
            if (dated.length === 0) continue;

            matchedBlock = true;
            const runsThrough = lines.find(l => /show runs through/i.test(l));
            for (const d of dated) {
                events.push(this.buildEvent(title, d, runsThrough));
            }
        }

        if (!matchedBlock) {
            events.push({
                type: 'ParseError',
                reason: 'No exhibition block with a parseable reception date found on homepage',
                context: html.substring(0, 200),
            });
        }

        return events;
    }

    private extractDatedLines(lines: string[]): DatedLine[] {
        const dated: DatedLine[] = [];
        for (const line of lines) {
            const parsed = this.parseDateTimeFromLine(line);
            if (!parsed) continue;
            const label = /artwalk/i.test(line) ? 'Capitol Hill Art Walk' : 'Opening Reception';
            dated.push({ label, ...parsed });
        }
        return dated;
    }

    // Public for testing. Matches lines like:
    //   "Opening Thursday, July 2, 2026 5-8pm"
    //   "Capitol Hill Artwalk Reception: Thursday, July 9, 2026 5-9pm"
    parseDateTimeFromLine(line: string): {
        year: number; month: number; day: number;
        startHour: number; startMinute: number;
        endHour: number; endMinute: number;
    } | null {
        const monthPattern = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');
        const re = new RegExp(
            `(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\\s+` +
            `(${monthPattern})\\s+(\\d{1,2}),\\s+(\\d{4})\\s+` +
            `(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?` +
            `\\s*[\\u2013\\-]\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)`,
            'i'
        );
        const match = line.match(re);
        if (!match) return null;

        const [, monthName, dayStr, yearStr, startHourStr, startMinStr, startAmPm,
            endHourStr, endMinStr, endAmPm] = match;

        const monthIdx = MONTHS.findIndex(m => m === monthName.toLowerCase());
        if (monthIdx === -1) return null;

        const year = parseInt(yearStr, 10);
        const month = monthIdx + 1;
        const day = parseInt(dayStr, 10);
        let startHour = parseInt(startHourStr, 10);
        const startMinute = parseInt(startMinStr ?? '0', 10);
        let endHour = parseInt(endHourStr, 10);
        const endMinute = parseInt(endMinStr ?? '0', 10);

        if (endAmPm.toLowerCase() === 'pm' && endHour !== 12) endHour += 12;
        else if (endAmPm.toLowerCase() === 'am' && endHour === 12) endHour = 0;

        if (startAmPm) {
            if (startAmPm.toLowerCase() === 'pm' && startHour !== 12) startHour += 12;
            else if (startAmPm.toLowerCase() === 'am' && startHour === 12) startHour = 0;
        } else if (endAmPm.toLowerCase() === 'pm' && startHour + 12 <= endHour) {
            // Infer PM for a start time with no explicit am/pm (e.g. "5-8pm")
            // only when doing so keeps start <= end (e.g. "11-1pm" stays 11am).
            startHour += 12;
        }

        return { year, month, day, startHour, startMinute, endHour, endMinute };
    }

    private buildEvent(title: string, d: DatedLine, runsThrough?: string): RipperCalendarEvent | RipperError {
        const durationMinutes = (d.endHour * 60 + d.endMinute) - (d.startHour * 60 + d.startMinute);
        if (durationMinutes <= 0) {
            return {
                type: 'ParseError',
                reason: `Parsed duration <= 0 (${durationMinutes}min) for "${title}" (${d.label})`,
                context: `${d.year}-${d.month}-${d.day}`,
            };
        }

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(d.year, d.month, d.day, d.startHour, d.startMinute),
            TIMEZONE
        );

        const description = runsThrough ? `${title}. ${runsThrough}.` : title;
        const dateSlug = `${d.year}${String(d.month).padStart(2, '0')}${String(d.day).padStart(2, '0')}`;

        return {
            id: `vermillion-gallery-${slugify(`${title}-${d.label}`)}-${dateSlug}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: `${title} — ${d.label}`,
            description,
            location: LOCATION,
            url: 'https://www.vermillionseattle.com/',
        };
    }
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
