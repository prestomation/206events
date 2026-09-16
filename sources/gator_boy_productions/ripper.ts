import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { HTMLElement, parse } from "node-html-parser";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Collapse non-breaking spaces / runs of whitespace (from <br> etc) into single spaces. */
function cleanText(s: string): string {
    return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

const EVENTS_URL = "https://gatorboyproductions.com/events/";
const SOURCE_NAME = "gator-boy-productions";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

// If a parsed month/day already passed more than this many days ago this
// year, assume the page means next year (the page carries no explicit year).
const PAST_TOLERANCE_DAYS = 3;

const MONTH_MAP: Record<string, number> = {
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

function monthFromToken(token: string): number | undefined {
    return MONTH_MAP[token.toLowerCase().replace(/\.$/, '')];
}

function resolveYear(month: number, day: number, today: LocalDate): LocalDate | null {
    try {
        let candidate = LocalDate.of(today.year(), month, day);
        if (candidate.isBefore(today.minusDays(PAST_TOLERANCE_DAYS))) {
            candidate = candidate.plusYears(1);
        }
        return candidate;
    } catch {
        return null;
    }
}

type DateParseResult =
    | { kind: 'single'; month: number; day: number }
    | { kind: 'monthDayRange'; month: number; startDay: number; endDay: number }
    // "Thursdays, Sep.17–Oct.1" style recurring class-series ranges — not a
    // single dated event. Callers should surface a ParseError rather than
    // guess which occurrence to publish.
    | { kind: 'weekdayRange' }
    | { kind: 'invalid' };

const WEEKDAY_PLURAL_RE = /^(sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)\s*,/i;
// "December 3-6" — month + day range, no day-of-week, no comma before the month.
const MONTH_DAY_RANGE_RE = /^([A-Za-z]+)\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s*$/;
// "Fri, October 2" / "Sunday, October 4" / bare "October 2" — optional
// leading weekday + comma, then a single month/day.
const SINGLE_DATE_RE = /^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\.?\s*(\d{1,2})\s*$/;

/** Parse the date text from the event heading (left side of the "|"). */
export function parseDateText(raw: string): DateParseResult {
    const text = raw.trim();
    if (WEEKDAY_PLURAL_RE.test(text)) return { kind: 'weekdayRange' };

    const rangeMatch = text.match(MONTH_DAY_RANGE_RE);
    if (rangeMatch) {
        const month = monthFromToken(rangeMatch[1]);
        if (month) {
            return { kind: 'monthDayRange', month, startDay: parseInt(rangeMatch[2], 10), endDay: parseInt(rangeMatch[3], 10) };
        }
    }

    const singleMatch = text.match(SINGLE_DATE_RE);
    if (singleMatch) {
        const month = monthFromToken(singleMatch[1]);
        if (month) {
            return { kind: 'single', month, day: parseInt(singleMatch[2], 10) };
        }
    }

    return { kind: 'invalid' };
}

// Matches "at [the] VENUE NAME (ADDRESS)" in the description paragraph —
// consistently how Gator Boy Productions names the venue + address for
// every event on the page.
const VENUE_ADDRESS_RE = /\bat\s+(?:the\s+)?([^()]+?)\s*\(([^)]+)\)/i;

export interface ExtractedVenue {
    venueName: string;
    address: string;
    location: string;
}

/** Extract "VENUE (ADDRESS)" from a description paragraph. Returns null if not found. */
export function extractVenueAddress(paragraphText: string): ExtractedVenue | null {
    const match = paragraphText.match(VENUE_ADDRESS_RE);
    if (!match) return null;
    const venueName = match[1].trim().replace(/[,.;:]+$/, '');
    const address = match[2].trim();
    if (!venueName || !address) return null;
    return { venueName, address, location: `${venueName}, ${address}` };
}

// Known Seattle venues whose address text names only the neighborhood, not
// literally "Seattle" (e.g. Reverie Ballroom's "...915 E Pine St, Capitol
// Hill)"). Kept as a narrow, explicit allowlist rather than reusing
// city.config.ts's full `neighborhoods` list, since that list also contains
// separately-incorporated suburb cities (Bothell, Kenmore, Redmond, Renton,
// Shoreline, Tukwila) that must NOT be treated as "Seattle" for this filter.
const KNOWN_SEATTLE_VENUES = new Set(['reverie ballroom', 'eagles mother aerie']);

/**
 * Gator Boy Productions occasionally lists out-of-town shows (Portland,
 * Mercer Island) alongside its regular Seattle dances. This source is
 * scoped to Seattle-area coverage only, so events whose extracted address
 * isn't recognizably in Seattle are filtered out by the caller.
 */
export function isSeattleAddress(venueName: string, address: string): boolean {
    if (/\bseattle\b/i.test(address)) return true;
    return KNOWN_SEATTLE_VENUES.has(venueName.trim().toLowerCase());
}

interface TimeInfo {
    hour: number;
    minute: number;
    durationMinutes: number;
    startTimeGuessed: boolean;
    durationGuessed: boolean;
}

const TIME_TOKEN_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;

function toMinutesSinceMidnight(hourStr: string, minuteStr: string | undefined, meridiem: string): number {
    let hour = parseInt(hourStr, 10);
    const minute = minuteStr ? parseInt(minuteStr, 10) : 0;
    const p = meridiem.toLowerCase();
    if (p === 'pm' && hour !== 12) hour += 12;
    if (p === 'am' && hour === 12) hour = 0;
    return hour * 60 + minute;
}

/**
 * Best-effort start time / duration from free-text prose (e.g. "6:30pm Dance
 * Lesson, 7:30-10pm dance"). Takes the first clock-time token as the start
 * and the last as the end. Mirrors the confident-range-vs-guessed-fallback
 * shape of sources/rainier_arts_center/ripper.ts's parseTime.
 */
export function extractTimeRange(text: string): TimeInfo {
    const matches = [...text.matchAll(TIME_TOKEN_RE)];
    if (matches.length === 0) {
        return { hour: 19, minute: 0, durationMinutes: 120, startTimeGuessed: true, durationGuessed: true };
    }

    const startTotal = toMinutesSinceMidnight(matches[0][1], matches[0][2], matches[0][3]);
    const hour = Math.floor(startTotal / 60);
    const minute = startTotal % 60;

    if (matches.length === 1) {
        return { hour, minute, durationMinutes: 150, startTimeGuessed: false, durationGuessed: true };
    }

    const last = matches[matches.length - 1];
    const endTotal = toMinutesSinceMidnight(last[1], last[2], last[3]);
    let durationMinutes = endTotal - startTotal;
    if (durationMinutes <= 0) durationMinutes += 24 * 60; // midnight-spanning event
    durationMinutes = Math.max(durationMinutes, 30);
    return { hour, minute, durationMinutes, startTimeGuessed: false, durationGuessed: false };
}

export default class GatorBoyProductionsRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const today = LocalDate.now(TIMEZONE);
        let allEvents: RipperEvent[];
        try {
            const res = await this.fetchFn(EVENTS_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!res.ok) {
                allEvents = [{
                    type: "ParseError",
                    reason: `HTTP ${res.status} fetching ${EVENTS_URL}`,
                    context: EVENTS_URL,
                }];
            } else {
                const html = parse(await res.text());
                allEvents = this.parseEventsPage(html, EVENTS_URL, today);
            }
        } catch (error) {
            allEvents = [{
                type: "ParseError",
                reason: `Error fetching ${EVENTS_URL}: ${error}`,
                context: EVENTS_URL,
            }];
        }

        for (const cal of ripper.config.calendars) {
            calendars[cal.name].events = allEvents;
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
     * The events page is Divi (WordPress page builder) prose: each event is a
     * `div.et_pb_text_inner` block with an optional `<h5>` eyebrow line, an
     * `<h4 class="sqsrte-small">DATE | TITLE</h4>` heading, and a `<p>`
     * description that names the venue + address in "at VENUE (ADDRESS)"
     * form. Non-event blocks (the page's `<h1>` title, etc.) have no
     * matching `<h4>` and are skipped — not an error, just not an event.
     */
    public parseEventsPage(html: HTMLElement, url: string, today: LocalDate): RipperEvent[] {
        const blocks = html.querySelectorAll('div.et_pb_text_inner');
        const results: RipperEvent[] = [];

        for (const block of blocks) {
            const heading = block.querySelector('h4.sqsrte-small');
            if (!heading) continue; // not an event block

            const headingText = cleanText(heading.text);
            const pipeIndex = headingText.indexOf('|');
            if (pipeIndex === -1) {
                results.push({
                    type: "ParseError",
                    reason: `Could not split date/title from heading "${headingText}"`,
                    context: url,
                });
                continue;
            }
            const dateTextRaw = headingText.slice(0, pipeIndex).trim();
            const titleTextRaw = headingText.slice(pipeIndex + 1).trim();
            if (!dateTextRaw || !titleTextRaw) {
                results.push({
                    type: "ParseError",
                    reason: `Empty date or title in heading "${headingText}"`,
                    context: url,
                });
                continue;
            }

            // Caller-side filter (AGENTS.md "Parse Methods Must Never Return
            // Null" — intentional content filters belong here, before
            // calling the parser): cancellation notices like "NO Gator Boy
            // dance" are not real events. The site always shouts "NO" for
            // these, so match case-sensitively to avoid catching a
            // normally-cased title that happens to start with "No".
            if (/^NO\b/.test(titleTextRaw)) {
                continue;
            }

            const eyebrowEl = block.querySelector('h5');
            const eyebrowText = eyebrowEl ? cleanText(eyebrowEl.text) : undefined;
            const paragraphEl = block.querySelector('p');
            const paragraphText = paragraphEl ? cleanText(paragraphEl.text) : '';

            // Caller-side filter (checked before calling the parser, same as
            // the cancellation filter above): this source is Seattle-scoped,
            // but Gator Boy Productions occasionally lists out-of-town shows
            // (Portland, Mercer Island). Drop those silently — being out of
            // scope isn't a parse failure. This must happen before
            // parseEventBlock runs, not after: filtering only the resulting
            // RipperCalendarEvent would still leak its paired Uncertainty
            // error (same event, different array item) into the results.
            const venue = extractVenueAddress(paragraphText);
            if (venue && !isSeattleAddress(venue.venueName, venue.address)) {
                continue;
            }

            const parsed = this.parseEventBlock(dateTextRaw, titleTextRaw, eyebrowText, paragraphText, url, today);
            results.push(...parsed);
        }

        return results;
    }

    /**
     * Parse a single event block into a RipperCalendarEvent (or a
     * RipperError for a genuine parse failure — an unparseable date, or a
     * description with no discoverable venue/address). Never returns null.
     */
    public parseEventBlock(
        dateTextRaw: string,
        titleTextRaw: string,
        eyebrowText: string | undefined,
        paragraphText: string,
        url: string,
        today: LocalDate,
    ): RipperEvent[] {
        const dateResult = parseDateText(dateTextRaw);

        if (dateResult.kind === 'weekdayRange') {
            return [{
                type: "ParseError",
                reason: `recurring class series date range, not a single dated event — skipping ("${dateTextRaw}")`,
                context: url,
            }];
        }
        if (dateResult.kind === 'invalid') {
            return [{
                type: "ParseError",
                reason: `Could not parse date "${dateTextRaw}"`,
                context: url,
            }];
        }

        const venue = extractVenueAddress(paragraphText);
        if (!venue) {
            return [{
                type: "ParseError",
                reason: `Could not find a "VENUE (ADDRESS)" pattern in description: "${paragraphText}"`,
                context: url,
            }];
        }

        let startDate: LocalDate | null;
        let durationMinutesOverride: number | undefined;

        if (dateResult.kind === 'single') {
            startDate = resolveYear(dateResult.month, dateResult.day, today);
        } else {
            // monthDayRange — take the first day as DTSTART with a duration
            // spanning the full range (e.g. "December 3-6" -> 4 days).
            if (dateResult.endDay < dateResult.startDay) {
                return [{
                    type: "ParseError",
                    reason: `Invalid date range in "${dateTextRaw}": end day ${dateResult.endDay} precedes start day ${dateResult.startDay}`,
                    context: url,
                }];
            }
            startDate = resolveYear(dateResult.month, dateResult.startDay, today);
            durationMinutesOverride = (dateResult.endDay - dateResult.startDay + 1) * 24 * 60;
        }

        if (!startDate) {
            return [{
                type: "ParseError",
                reason: `Invalid date "${dateTextRaw}"`,
                context: url,
            }];
        }

        if (startDate.isBefore(today)) {
            return [];
        }

        const timeInfo = extractTimeRange(paragraphText);

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(
                LocalDateTime.of(startDate.year(), startDate.monthValue(), startDate.dayOfMonth(), timeInfo.hour, timeInfo.minute),
                TIMEZONE,
            );
        } catch (e) {
            return [{
                type: "ParseError",
                reason: `Invalid datetime for "${dateTextRaw}": ${e}`,
                context: url,
            }];
        }

        const durationMinutes = durationMinutesOverride ?? timeInfo.durationMinutes;
        const id = `${SOURCE_NAME}-${slugify(titleTextRaw)}-${date.toLocalDate().toString()}`;
        const description = [eyebrowText, paragraphText].filter(Boolean).join('\n\n') || undefined;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes),
            summary: titleTextRaw,
            description,
            location: venue.location,
            url,
        };

        const unknownFields: UncertaintyField[] = [];
        if (timeInfo.startTimeGuessed) unknownFields.push("startTime");
        // Only flag duration uncertain when it actually came from the guessed
        // fallback — a monthDayRange's duration is derived from the date
        // range itself and isn't guessed even if no clock time was found.
        if (timeInfo.durationGuessed && durationMinutesOverride === undefined) unknownFields.push("duration");

        const results: RipperEvent[] = [event];
        if (unknownFields.length > 0) {
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: `Start time/duration inferred from free-text description, not a structured field: "${paragraphText}"`,
                source: SOURCE_NAME,
                unknownFields,
                event,
                partialFingerprint: simpleHash(`${dateTextRaw}|${paragraphText}`),
            };
            results.push(uncertainty);
        }
        return results;
    }
}
