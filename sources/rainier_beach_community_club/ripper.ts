import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const SITE_ORIGIN = "https://rainierbeachcommunityclub.org";
const EVENTS_URL = `${SITE_ORIGIN}/events/`;
const VENUE_ADDRESS = "Rainier Beach Community Club, 6038 S Pilgrim St, Seattle, WA 98118";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const DATE_REGEX = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i;

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

interface ParsedTime {
    hour: number;
    minute: number;
    durationMinutes: number;
    startTimeGuessed: boolean;
    durationGuessed: boolean;
}

/**
 * Parse a free-text time fragment such as "3-6 pm", "10am-Noon", or
 * "Doors open 7pm, tasting 7:30pm". The site's copy is hand-written prose,
 * not a structured field, so this handles the handful of shapes actually
 * observed rather than general natural-language time parsing.
 */
export function parseTimeText(rawText: string): ParsedTime {
    const text = rawText.replace(/\bnoon\b/gi, '12:00pm').replace(/\bmidnight\b/gi, '12:00am');

    // Range: "3-6 pm", "10am-Noon" (now "10am-12:00pm"), "7:00 pm - 9:30 pm"
    const rangeMatch = text.match(
        /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
    );
    if (rangeMatch) {
        const [, startHStr, startMStr, startPeriod, endHStr, endMStr, endPeriod] = rangeMatch;
        const ep = endPeriod.toLowerCase();
        // The start period is often omitted ("3-6 pm") — borrow the end's period.
        const sp = (startPeriod ?? endPeriod).toLowerCase();

        let startHour = parseInt(startHStr, 10);
        const startMin = startMStr ? parseInt(startMStr, 10) : 0;
        if (sp === 'pm' && startHour !== 12) startHour += 12;
        if (sp === 'am' && startHour === 12) startHour = 0;

        let endHour = parseInt(endHStr, 10);
        const endMin = endMStr ? parseInt(endMStr, 10) : 0;
        if (ep === 'pm' && endHour !== 12) endHour += 12;
        if (ep === 'am' && endHour === 12) endHour = 0;

        let durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
        if (durationMinutes <= 0) durationMinutes += 24 * 60;
        return { hour: startHour, minute: startMin, durationMinutes, startTimeGuessed: false, durationGuessed: false };
    }

    // No range — take every standalone time mention and use the last one as
    // the start (matches copy like "Doors open 7pm, tasting 7:30pm", where
    // the later time is when the event itself starts).
    const singleMatches = [...text.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi)];
    if (singleMatches.length > 0) {
        const last = singleMatches[singleMatches.length - 1];
        let hour = parseInt(last[1], 10);
        const minute = last[2] ? parseInt(last[2], 10) : 0;
        const period = last[3].toLowerCase();
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;
        return { hour, minute, durationMinutes: 120, startTimeGuessed: false, durationGuessed: true };
    }

    // No parseable time at all — fall back to a placeholder evening slot.
    return { hour: 18, minute: 0, durationMinutes: 120, startTimeGuessed: true, durationGuessed: true };
}

export default class RainierBeachCommunityClubRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        let events: RipperEvent[];
        try {
            const res = await this.fetchFn(EVENTS_URL);
            if (!res.ok) {
                events = [{ type: "ParseError", reason: `HTTP ${res.status} fetching ${EVENTS_URL}`, context: EVENTS_URL }];
            } else {
                const html = await res.text();
                const today = LocalDate.now(TIMEZONE);
                events = this.parseEventsPage(html, today);
            }
        } catch (error) {
            events = [{ type: "ParseError", reason: `Failed to fetch ${EVENTS_URL}: ${error}`, context: EVENTS_URL }];
        }

        for (const cal of ripper.config.calendars) {
            calendars[cal.name].events = events;
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags,
        }));
    }

    /**
     * The events page is a single static WordPress page — every event is an
     * `<h2>` title (linking to its own detail page) followed by sibling
     * elements holding an `<h4>` date/time line and a description paragraph,
     * up until the next `<h2>`. There is no ICS/API export.
     */
    public parseEventsPage(html: string, today: LocalDate): RipperEvent[] {
        const root = parse(html);
        const content = root.querySelector('div.entry-content');
        if (!content) {
            return [{ type: "ParseError", reason: "No entry-content found on events page", context: EVENTS_URL }];
        }

        // Only direct children of entry-content are real event headings — the
        // page also has same-styled <h2> callouts nested inside event blocks
        // (e.g. Wine Tasting's "$15 at door; $10 pre-paid online" price line),
        // which a recursive querySelectorAll would wrongly treat as events.
        const headings = content.childNodes.filter(
            (n): n is HTMLElement => n instanceof HTMLElement && n.tagName === 'H2' && n.classList.contains('wp-block-heading')
        );
        const results: RipperEvent[] = [];
        for (const h2 of headings) {
            results.push(...this.parseEventBlock(h2, today));
        }
        return results;
    }

    /** Gather the sibling nodes between this `<h2>` and the next one. */
    private collectBlockSiblings(h2: HTMLElement): HTMLElement[] {
        const siblings: HTMLElement[] = [];
        let sib = h2.nextElementSibling;
        while (sib && !(sib.tagName === 'H2' && sib.classList.contains('wp-block-heading'))) {
            siblings.push(sib);
            sib = sib.nextElementSibling;
        }
        return siblings;
    }

    public parseEventBlock(h2: HTMLElement, today: LocalDate): RipperEvent[] {
        const link = h2.querySelector('a');
        const title = (link?.text ?? h2.text).replace(/\s+/g, ' ').trim();
        if (!title) {
            return [{ type: "ParseError", reason: "Event heading has no title text", context: EVENTS_URL }];
        }

        const hrefRaw = link?.getAttribute('href')?.trim();
        const url = hrefRaw ? new URL(hrefRaw, SITE_ORIGIN).toString() : EVENTS_URL;

        const siblings = this.collectBlockSiblings(h2);
        const h4s = siblings.flatMap(sib => sib.tagName === 'H4' ? [sib] : sib.querySelectorAll('h4'));

        let dateMatch: RegExpMatchArray | null = null;
        let matchedText = '';
        for (const h4 of h4s) {
            const text = h4.text;
            const m = text.match(DATE_REGEX);
            if (m) {
                dateMatch = m;
                matchedText = text;
                break;
            }
        }

        if (!dateMatch) {
            // No concrete date on the page yet (e.g. "2026 date TBD", a
            // recurring pattern with no specific instance, or a seasonal
            // break). This isn't a parse failure — the page was read
            // correctly, it just doesn't have an instance to publish yet —
            // so skip silently, the same way past/cancelled events are
            // dropped below rather than reported as errors.
            return [];
        }

        const monthName = dateMatch[1].toLowerCase();
        const month = MONTHS[monthName];
        const day = parseInt(dateMatch[2], 10);
        const explicitYear = dateMatch[3] ? parseInt(dateMatch[3], 10) : undefined;

        let year = explicitYear ?? today.year();
        if (!explicitYear) {
            try {
                if (LocalDate.of(year, month, day).isBefore(today.minusDays(7))) year += 1;
            } catch {
                return [{ type: "ParseError", reason: `Invalid date "${monthName} ${day}" for "${title}"`, context: url }];
            }
        }

        let localDate: LocalDate;
        try {
            localDate = LocalDate.of(year, month, day);
        } catch (e) {
            return [{ type: "ParseError", reason: `Invalid date "${monthName} ${day}, ${year}" for "${title}": ${e}`, context: url }];
        }

        if (localDate.isBefore(today)) {
            // Past event still listed on the page (e.g. between site updates) — not an error, just nothing to publish.
            return [];
        }

        const remainder = matchedText.slice((dateMatch.index ?? 0) + dateMatch[0].length);
        const timeInfo = parseTimeText(remainder);

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(
                LocalDateTime.of(localDate.year(), localDate.monthValue(), localDate.dayOfMonth(), timeInfo.hour, timeInfo.minute),
                TIMEZONE
            );
        } catch (e) {
            return [{ type: "ParseError", reason: `Invalid datetime for "${title}": ${e}`, context: url }];
        }

        const description = siblings
            .flatMap(sib => sib.tagName === 'P' ? [sib] : sib.querySelectorAll('p'))
            .map(p => p.text.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join(' ') || undefined;

        const slugMatch = hrefRaw ? url.match(/\/([^/]+)\/?$/) : null;
        const slug = slugMatch ? slugify(slugMatch[1]) : slugify(title);
        const id = `rbcc-${slug}-${localDate.toString()}`;

        const unknownFields: UncertaintyField[] = [];
        if (timeInfo.startTimeGuessed) unknownFields.push("startTime");
        if (timeInfo.durationGuessed) unknownFields.push("duration");

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(timeInfo.durationMinutes),
            summary: title,
            description,
            location: VENUE_ADDRESS,
            url,
        };

        const results: RipperEvent[] = [event];
        if (unknownFields.length > 0) {
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: timeInfo.startTimeGuessed
                    ? `Could not find a start time in "${matchedText}"`
                    : `Could not find an end time in "${matchedText}"`,
                source: "rainier-beach-community-club",
                unknownFields,
                event,
                partialFingerprint: simpleHash(matchedText),
            };
            results.push(uncertainty);
        }
        return results;
    }
}
