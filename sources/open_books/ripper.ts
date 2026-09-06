import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const LOCATION = "Open Books: A Poem Emporium, 108 Cherry Street, Seattle, WA 98104";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DEFAULT_DURATION_MINUTES = 60;
// Placeholder hour used only when no start time can be found in the list
// item text at all. The event is still published (so it appears on the
// calendar) but paired with a startTime UncertaintyError rather than
// silently presenting the placeholder as fact — see docs/event-uncertainty.md.
const DEFAULT_START_HOUR = 12;
const EVENTS_PAGE_URL = "https://open-books-a-poem-emporium.myshopify.com/pages/events-calendar";

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

interface ShopifyPageResponse {
    page: {
        body_html: string;
    };
}

// One <li> pulled out of a <ul> that follows a recognized month-name <p>.
interface RawListItem {
    /** Plain-text month name from the enclosing <p> header (sanity check only). */
    monthHeader: string;
    /** Inner HTML of the <li>, unmodified — still needs tag-stripping/href extraction. */
    innerHtml: string;
}

interface ParsedItem {
    month: number;
    day: number;
    year: number;
    title: string;
    url?: string;
    hour: number;
    minute: number;
    endHour?: number;
    endMinute?: number;
    timeConfident: boolean;
    cost?: EventCost;
}

export default class OpenBooksRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString() + '?format=json', {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' }
        });
        if (!res.ok) throw new Error(`Open Books events page returned HTTP ${res.status}`);

        const data: ShopifyPageResponse = await res.json();

        const now = ZonedDateTime.now(TIMEZONE);
        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        const items = this.extractListItems(data.page.body_html);

        for (const item of items) {
            const results = this.parseListItem(item);
            const event = results.find((r): r is RipperCalendarEvent => 'date' in r);
            if (event && event.date.isBefore(now)) continue;
            for (const r of results) {
                if ('date' in r) events.push(r);
                else errors.push(r);
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

    /**
     * Walk body_html sequentially: a <p> containing a recognized month name
     * establishes the "current month" context; every <li> inside the <ul>
     * that follows is tagged with that month header. body_html is not
     * well-formed enough to trust a DOM parser's nesting (there are stray
     * empty `<ul><ul></ul></ul>` blocks before the real content), so this
     * does a simple ordered scan over top-level `<p>...</p>` and
     * `<li>...</li>` tags instead.
     */
    // Public for testing
    extractListItems(bodyHtml: string): RawListItem[] {
        const items: RawListItem[] = [];
        let currentMonth: string | null = null;

        // Match every <p>...</p> (month header candidate) and <li>...</li>
        // (event line) in document order.
        const blockRe = /<p[^>]*>([\s\S]*?)<\/p>|<li[^>]*>([\s\S]*?)<\/li>/gi;
        let match: RegExpExecArray | null;
        while ((match = blockRe.exec(bodyHtml)) !== null) {
            if (match[1] !== undefined) {
                // <p> block — check if its plain text names a month.
                const text = this.stripHtml(match[1]).toLowerCase();
                const found = MONTHS.find(m => text.includes(m));
                if (found) currentMonth = found;
            } else if (match[2] !== undefined && currentMonth) {
                items.push({ monthHeader: currentMonth, innerHtml: match[2] });
            }
        }

        return items;
    }

    /**
     * Parse one <li>'s inner HTML into an event or a ParseError. Never
     * returns null — see AGENTS.md "Parse Methods Must Never Return Null".
     */
    // Public for testing
    parseListItem(item: RawListItem): RipperEvent[] {
        const plainText = this.stripHtml(item.innerHtml);

        // Date prefix, e.g. "9/20:" or "10/18" or "10/28:". Numeric M/D is
        // authoritative; the enclosing month header is only a sanity check.
        const dateRe = /(\d{1,2})\s*\/\s*(\d{1,2})\s*:?/;
        const dateMatch = plainText.match(dateRe);
        if (!dateMatch) {
            return [{
                type: 'ParseError',
                reason: `No M/D date prefix found in list item`,
                context: plainText,
            }];
        }

        const month = parseInt(dateMatch[1], 10);
        const day = parseInt(dateMatch[2], 10);

        // Everything after the date prefix is "Title, time, cost" — but the
        // title itself may contain commas, so split by finding the
        // time/cost segments from the tail rather than naively splitting on
        // the first comma.
        const rest = plainText.slice((dateMatch.index ?? 0) + dateMatch[0].length).trim();

        const parsedTail = this.parseTailSegments(rest);

        const year = this.resolveYear(month, day);

        const hour = parsedTail.timeConfident ? parsedTail.hour : DEFAULT_START_HOUR;
        const minute = parsedTail.timeConfident ? parsedTail.minute : 0;

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, hour, minute),
            TIMEZONE
        );

        let durationMinutes = DEFAULT_DURATION_MINUTES;
        if (parsedTail.endHour !== undefined) {
            const end = parsedTail.endHour * 60 + (parsedTail.endMinute ?? 0);
            const start = hour * 60 + minute;
            if (end > start) durationMinutes = end - start;
        }

        // href extraction: the first <a href="..."> found in the raw inner
        // HTML, if any. Falls back to the events-calendar page when the
        // title has no link (e.g. "Other People's Poems").
        const hrefMatch = item.innerHtml.match(/<a[^>]+href="([^"]+)"/i);
        const url = hrefMatch ? hrefMatch[1].replace(/&amp;/g, '&') : EVENTS_PAGE_URL;

        const title = parsedTail.title;
        if (!title) {
            return [{
                type: 'ParseError',
                reason: `No title text found after date prefix`,
                context: plainText,
            }];
        }

        const id = `open-books-${this.slugify(title)}-${year}-${month}-${day}`;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            location: LOCATION,
            url,
            cost: parsedTail.cost,
        };

        const out: RipperEvent[] = [event];

        // No confident time found in the list item text — publish with the
        // placeholder hour but pair an UncertaintyError so the resolver can
        // fill in the real time later, instead of passing off
        // DEFAULT_START_HOUR as fact.
        if (!parsedTail.timeConfident) {
            const unknownFields: UncertaintyField[] = ['startTime', 'duration'];
            const uncertainty: UncertaintyError = {
                type: 'Uncertainty',
                reason: `Open Books listing for "${title}" had a date but no start time`,
                source: 'open-books',
                unknownFields,
                event,
                partialFingerprint: this.fingerprint(plainText, year, month, day),
            };
            out.push(uncertainty);
        }

        return out;
    }

    /**
     * Parse the "Title, time, cost" tail that follows the date prefix.
     * Finds the time-pattern segment and cost-pattern segment from the end
     * of the string, treating everything before them as the title (titles
     * often contain their own commas, e.g. "Reading with Ellie Black,
     * Rivka Clifton & Charlie Lou Evans").
     */
    // Public for testing
    parseTailSegments(rest: string): {
        title: string; hour: number; minute: number; endHour?: number; endMinute?: number;
        timeConfident: boolean; cost?: EventCost;
    } {
        let text = rest;

        // Cost segment: "free", "$N", "donation" (any casing), optionally
        // preceded by a comma.
        let cost: EventCost | undefined;
        const costRe = /,?\s*(free|\$\s?(\d+(?:\.\d{1,2})?)|donation)\s*$/i;
        const costMatch = text.match(costRe);
        if (costMatch) {
            if (/^free$/i.test(costMatch[1])) {
                cost = { min: 0 };
            } else if (costMatch[2]) {
                const amount = parseFloat(costMatch[2]);
                if (!isNaN(amount)) cost = { min: amount };
            }
            text = text.slice(0, costMatch.index).trim();
        }

        // Time segment: a range ("12:30-2pm", "12:30-2:30", "5:00 pm - 10:00 pm")
        // or a single time ("7pm"), optionally preceded by a comma.
        const rangeRe = /,?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i;
        const singleRe = /,?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i;

        let hour = DEFAULT_START_HOUR;
        let minute = 0;
        let endHour: number | undefined;
        let endMinute: number | undefined;
        let timeConfident = false;

        const rangeMatch = text.match(rangeRe);
        if (rangeMatch && (rangeMatch[3] || rangeMatch[6] || rangeMatch[2] || rangeMatch[5])) {
            // At least one side must carry either am/pm or a ":mm" minutes
            // component, otherwise this isn't confidently a time range
            // (avoids matching stray trailing number pairs, e.g. a year
            // range in a title). "12:30-2:30" has no am/pm anywhere but
            // carries minutes on both sides, so it still qualifies.
            hour = parseInt(rangeMatch[1], 10);
            minute = parseInt(rangeMatch[2] ?? '0', 10);
            endHour = parseInt(rangeMatch[4], 10);
            endMinute = parseInt(rangeMatch[5] ?? '0', 10);
            const startAmPm = rangeMatch[3]?.toLowerCase();
            // When only one side names am/pm, both sides share it (e.g.
            // "12:30-2:30" with no am/pm at all defaults to PM daytime
            // events; "12:30-2pm" — end is pm, so start is pm too).
            const endAmPm = (rangeMatch[6] ?? startAmPm ?? 'pm').toLowerCase();
            const effectiveStartAmPm = (startAmPm ?? endAmPm).toLowerCase();

            if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
            else if (endAmPm === 'am' && endHour === 12) endHour = 0;

            if (effectiveStartAmPm === 'pm' && hour !== 12) hour += 12;
            else if (effectiveStartAmPm === 'am' && hour === 12) hour = 0;

            timeConfident = true;
            text = text.slice(0, rangeMatch.index).trim();
        } else {
            const singleMatch = text.match(singleRe);
            if (singleMatch) {
                hour = parseInt(singleMatch[1], 10);
                minute = parseInt(singleMatch[2] ?? '0', 10);
                const ampm = singleMatch[3].toLowerCase();
                if (ampm === 'pm' && hour !== 12) hour += 12;
                else if (ampm === 'am' && hour === 12) hour = 0;
                timeConfident = true;
                text = text.slice(0, singleMatch.index).trim();
            }
        }

        // Whatever's left is the title. Strip leading/trailing commas,
        // colons, and whitespace left over from the surrounding segments.
        const title = text.replace(/^[\s,:]+|[\s,:]+$/g, '').trim();

        return { title, hour, minute, endHour, endMinute, timeConfident, cost };
    }

    /**
     * Infer the year for a bare M/D date: none of the listings carry an
     * explicit year, so roll over to next year when the constructed date
     * (in the store's timezone) would otherwise land in the past.
     */
    // Public for testing
    resolveYear(month: number, day: number, now: ZonedDateTime = ZonedDateTime.now(TIMEZONE)): number {
        const candidateYear = now.year();
        try {
            const candidate = ZonedDateTime.of(
                LocalDateTime.of(candidateYear, month, day, 23, 59),
                TIMEZONE
            );
            if (candidate.isBefore(now)) return candidateYear + 1;
            return candidateYear;
        } catch {
            // Invalid month/day combination (shouldn't happen given the
            // regex, but guard anyway) — fall back to the current year.
            return candidateYear;
        }
    }

    // Stable hash of what we actually parsed, so the uncertainty-cache entry
    // is invalidated when the source later changes (e.g. upstream adds a
    // start time, or the date moves). djb2 over the id + resolved date + text.
    fingerprint(plainText: string, year: number, month: number, day: number): string {
        const material = `open-books|${year}-${month}-${day}|${plainText}`;
        let h = 5381;
        for (let i = 0; i < material.length; i++) {
            h = ((h << 5) + h + material.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(16);
    }

    // Public for testing
    slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    // Public for testing
    stripHtml(html: string): string {
        return html
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
}
