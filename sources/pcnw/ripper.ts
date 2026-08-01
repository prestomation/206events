import { ChronoUnit, Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const LOCATION = "Photographic Center Northwest, 900 12th Ave, Seattle, WA 98122";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION_MINUTES = 120;
// Placeholder hour used only when no time at all could be found near the
// date (rare — e.g. a headline date with the actual time buried further
// down in the body). The event still publishes so it appears on the
// calendar, paired with a startTime UncertaintyError instead of quietly
// presenting the placeholder as fact.
const DEFAULT_START_HOUR = 18;

// The events custom post type (EventON's `ajde_events`) accumulates years of
// history with no reliable "future only" filter or event-date sort exposed
// via the REST API — only the WP post creation/modification date, which the
// default `order=desc` uses. In practice PCNW creates/edits an event's post
// shortly before it happens, so the most-recently-touched posts skew toward
// upcoming events. Fetching the first PAGES_TO_FETCH pages (most-recently
// modified first) reliably surfaces the events happening in the next several
// months without paging through the full multi-year history; a genuinely
// future event whose post hasn't been touched in a long time could fall
// outside this window, but that hasn't been observed in practice.
const PAGE_SIZE = 100;
const PAGES_TO_FETCH = 2;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

interface PCNWEventPost {
    id: number;
    link: string;
    title: { rendered: string };
    content: { rendered: string };
    _embedded?: { 'wp:featuredmedia'?: { source_url?: string }[] };
}

interface ParsedDate {
    month: number;
    day: number;
    year: number;
    hour: number;
    minute: number;
    endHour?: number;
    endMinute?: number;
    // A time (start, no confirmed end) was found near the date.
    timeConfident: boolean;
    // A start-end range was found, so the duration is a real value, not a guess.
    durationConfident: boolean;
}

// Public for testing
export function stripHtml(html: string): string {
    return decode(html
        .replace(/<[^>]+>/g, ' ')
        // A handful of source posts have malformed markup missing the "<"
        // before a closing tag (e.g. "$116/strong>"), which the tag-strip
        // above can't catch since it isn't a well-formed tag. Clean up the
        // leftover fragment rather than publish it verbatim in the description.
        .replace(/\/(?:strong|em|b|i|p|span|a)>/g, ''))
        .replace(/\s+/g, ' ').trim();
}

function monthIndexOf(name: string): number {
    return MONTHS.findIndex(m => m === name.toLowerCase());
}

const DASH_RE = /[-‐‑‒–—]/;

// A "Day – Day" / "Month Day – Month Day" range is either a single
// continuous multi-day event (a 1-3 day weekend workshop — "October 10 –
// 11") or shorthand for a weekly-cadence multi-week class ("October 7 – 28 |
// Wednesday 6-9pm", a four-week series). Both use identical punctuation; the
// only reliable signal is the span: a real continuous event never runs more
// than about a week, so a longer span is expanded into one candidate per
// week (proper calendar-date arithmetic, so month/year boundaries — "July 7
// – August 4" — carry correctly) rather than treated as two far-apart
// endpoints with everything in between silently skipped.
function extractRangeCandidates(dateClause: string, year: number): { month: number; day: number }[] {
    const monthNames = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');
    const rangeRe = new RegExp(
        `(?:(${monthNames})\\s+)?(?<!\\d)(\\d{1,2})(?!\\d)\\s*(?:${DASH_RE.source})\\s*(?:(${monthNames})\\s+)?(?<!\\d)(\\d{1,2})(?!\\d)`,
        'i'
    );
    const m = dateClause.match(rangeRe);
    if (!m) return [];

    const startMonth = m[1] ? monthIndexOf(m[1]) + 1 : null;
    const startDay = parseInt(m[2], 10);
    const endMonth = m[3] ? monthIndexOf(m[3]) + 1 : startMonth;
    const endDay = parseInt(m[4], 10);
    if (!startMonth || !endMonth) return [];

    let start: LocalDate;
    let end: LocalDate;
    try {
        start = LocalDate.of(year, startMonth, startDay);
        end = LocalDate.of(year, endMonth, endDay);
    } catch {
        return [];
    }
    if (end.isBefore(start)) return [];

    const toCandidate = (d: LocalDate) => ({ month: d.monthValue(), day: d.dayOfMonth() });

    if (start.until(end, ChronoUnit.DAYS) <= 7) {
        return [toCandidate(start), toCandidate(end)];
    }

    const candidates: { month: number; day: number }[] = [];
    let d = start;
    while (!d.isAfter(end)) {
        candidates.push(toCandidate(d));
        d = d.plusDays(7);
    }
    if (candidates[candidates.length - 1].month !== end.monthValue() || candidates[candidates.length - 1].day !== end.dayOfMonth()) {
        candidates.push(toCandidate(end));
    }
    return candidates;
}

// Multi-session workshops list every session in the date clause (e.g.
// "November 2, 9, 16 & 30, 2026" or "September 27, October 4 & 11, 2026").
// Extracts every (month, day) pair in the clause, carrying the most
// recently seen month name forward onto bare day numbers.
function extractListCandidates(dateClause: string): { month: number; day: number }[] {
    const monthNames = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');
    // (?<!\d)/(?!\d) rather than \b on the trailing side: a day number is
    // often immediately followed by an ordinal suffix ("24th") with no word
    // boundary between the digit and the letter, which \b would miss.
    const tokenRe = new RegExp(`(?:(${monthNames})\\s+)?(?<!\\d)(\\d{1,2})(?!\\d)`, 'gi');
    const candidates: { month: number; day: number }[] = [];
    let currentMonth: number | null = null;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(dateClause)) !== null) {
        if (match[1]) {
            const idx = monthIndexOf(match[1]);
            if (idx !== -1) currentMonth = idx + 1;
        }
        if (currentMonth !== null) {
            candidates.push({ month: currentMonth, day: parseInt(match[2], 10) });
        }
    }
    return candidates;
}

// Public for testing. `year` is only needed for the dash-range branch, where
// expanding a multi-week series requires real calendar-date arithmetic.
export function extractCandidateDates(dateClause: string, year: number): { month: number; day: number }[] {
    if (DASH_RE.test(dateClause)) {
        const rangeCandidates = extractRangeCandidates(dateClause, year);
        if (rangeCandidates.length > 0) return rangeCandidates;
    }
    return extractListCandidates(dateClause);
}

// Public for testing
export function parseEventDate(text: string, now: ZonedDateTime): ParsedDate | null {
    const monthNames = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');
    const dateRe = new RegExp(`(${monthNames})\\s+(\\d{1,2})`, 'i');
    const dateMatch = text.match(dateRe);
    if (!dateMatch || dateMatch.index === undefined) return null;

    const monthIdx = MONTHS.findIndex(m => m === dateMatch[1].toLowerCase());
    if (monthIdx === -1) return null;

    const afterDate = text.slice(dateMatch.index + dateMatch[0].length);
    // The year always terminates the date clause (a single date, a
    // "Day - Day" range, or a "Day, Day & Day" list), so it can be a fair
    // distance from the first month/day we matched.
    const yearWindow = afterDate.slice(0, 60);
    const yearMatch = yearWindow.match(/\b(20\d{2})\b/);

    let month: number;
    let day: number;
    let year: number;
    let timeSearchStart: number;

    if (yearMatch && yearMatch.index !== undefined) {
        year = parseInt(yearMatch[1], 10);

        // The full date clause, from the first month name through (but not
        // including) the year — every (month, day) pair a multi-session
        // listing names lives in here.
        const dateClause = dateMatch[0] + afterDate.slice(0, yearMatch.index);
        // dateClause always starts with dateMatch[0] itself, so this should
        // never come back empty, but fall back to the originally matched
        // (month, day) rather than crash if some clause shape ever defeats
        // the scan.
        const candidates = extractCandidateDates(dateClause, year);
        if (candidates.length === 0) candidates.push({ month: monthIdx + 1, day: parseInt(dateMatch[2], 10) });
        // Pair each candidate with its real LocalDate, dropping any that
        // aren't calendar-valid (e.g. a stray digit token misread as day 31
        // of a 30-day month) instead of letting LocalDate.of throw.
        const dated = candidates
            .map(c => {
                try {
                    return { c, date: LocalDate.of(year, c.month, c.day) };
                } catch {
                    return null;
                }
            })
            .filter((x): x is { c: { month: number; day: number }; date: LocalDate } => x !== null);
        // Prefer the earliest session that hasn't happened yet, so a workshop
        // already partway through its series still publishes its next
        // occurrence instead of disappearing once the first listed date
        // passes. Falls back to the last (most recent) candidate when every
        // session is already in the past — it will be dropped by the
        // isBefore(now) check in parseEventPost either way.
        const nowDate = now.toLocalDate();
        const sorted = [...dated].sort((a, b) => a.date.compareTo(b.date));
        const chosen = sorted.find(x => !x.date.isBefore(nowDate)) ?? sorted[sorted.length - 1];
        if (!chosen) {
            // Every candidate was calendar-invalid — fall back to the
            // originally matched (month, day) rather than error out; it'll
            // very likely fail LocalDateTime.of below too, surfacing as the
            // usual ParseError instead of a crash.
            month = monthIdx + 1;
            day = parseInt(dateMatch[2], 10);
        } else {
            month = chosen.c.month;
            day = chosen.c.day;
        }
        timeSearchStart = yearMatch.index + yearMatch[0].length;
    } else {
        // No year stated anywhere near the date — PCNW's older posts about a
        // now-past artist talk/reception/annual-program description often
        // omit it entirely (the date reads as "this year" implicitly), and
        // the only "20XX" nearby is frequently an unrelated year (a past
        // exhibition's opening year, a tax-policy effective date, a photo
        // credit). Assume the current year rather than erroring: if that
        // lands in the past — the overwhelmingly common case for these — the
        // isBefore(now) check in parseEventPost drops it silently, exactly
        // like any other past event. Skip the multi-session candidate scan
        // here too, since without a year to bound it the clause has no clean
        // end and would swallow unrelated time-of-day digits.
        month = monthIdx + 1;
        day = parseInt(dateMatch[2], 10);
        year = now.year();
        timeSearchStart = 0;
    }

    const timeWindow = afterDate.slice(timeSearchStart, timeSearchStart + 300);

    const rangeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-‐‑‒–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
    const rangeMatch = timeWindow.match(rangeRe);
    const singleRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
    const singleMatch = timeWindow.match(singleRe);

    let hour = DEFAULT_START_HOUR;
    let minute = 0;
    let endHour: number | undefined;
    let endMinute: number | undefined;
    let timeConfident = false;
    let durationConfident = false;

    if (rangeMatch) {
        hour = parseInt(rangeMatch[1], 10);
        minute = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
        const startAmPm = rangeMatch[3]?.toLowerCase();
        endHour = parseInt(rangeMatch[4], 10);
        endMinute = rangeMatch[5] ? parseInt(rangeMatch[5], 10) : 0;
        const endAmPm = rangeMatch[6].toLowerCase();

        if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
        else if (endAmPm === 'am' && endHour === 12) endHour = 0;

        if (startAmPm === 'pm' && hour !== 12) hour += 12;
        else if (startAmPm === 'am' && hour === 12) hour = 0;
        else if (!startAmPm && endAmPm === 'pm' && hour < 12 && hour < (endHour > 12 ? endHour - 12 : endHour)) {
            hour += 12;
        }
        timeConfident = true;
        durationConfident = true;
    } else if (singleMatch) {
        hour = parseInt(singleMatch[1], 10);
        minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
        const ampm = singleMatch[3].toLowerCase();
        if (ampm === 'pm' && hour !== 12) hour += 12;
        else if (ampm === 'am' && hour === 12) hour = 0;
        timeConfident = true;
    }

    return { month, day, year, hour, minute, endHour, endMinute, timeConfident, durationConfident };
}

// Public for testing
export function parseCost(text: string): EventCost | undefined {
    const dollarMatch = text.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    if (dollarMatch) return { min: parseFloat(dollarMatch[1].replace(/,/g, '')) };
    if (/\bfree\b/i.test(text)) return { min: 0 };
    return undefined;
}

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

// Public for testing
export function parseEventPost(post: PCNWEventPost, now: ZonedDateTime): RipperEvent[] {
    const plainText = stripHtml(post.content.rendered);
    const parsed = parseEventDate(plainText, now);

    if (!parsed) {
        return [{
            type: 'ParseError',
            reason: 'No parseable date found in event body',
            context: decode(post.title.rendered),
        }];
    }

    const eventDate = ZonedDateTime.of(
        LocalDateTime.of(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute),
        TIMEZONE
    );

    // Posts accumulate for years with no future-only filter available server
    // side (see PAGES_TO_FETCH above) — silently drop past occurrences here.
    if (eventDate.isBefore(now)) return [];

    let durationMinutes = DEFAULT_DURATION_MINUTES;
    if (parsed.durationConfident && parsed.endHour !== undefined) {
        const end = parsed.endHour * 60 + (parsed.endMinute ?? 0);
        const start = parsed.hour * 60 + parsed.minute;
        if (end > start) durationMinutes = end - start;
    }

    const imageUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || undefined;

    const event: RipperCalendarEvent = {
        id: `pcnw-${post.id}`,
        ripped: new Date(),
        date: eventDate,
        duration: Duration.ofMinutes(durationMinutes),
        summary: decode(post.title.rendered),
        description: plainText || undefined,
        location: LOCATION,
        url: post.link,
        imageUrl,
        cost: parseCost(plainText),
    };

    const out: RipperEvent[] = [event];

    const unknownFields: UncertaintyField[] = !parsed.timeConfident
        ? ['startTime', 'duration']
        : !parsed.durationConfident
            ? ['duration']
            : [];

    if (unknownFields.length > 0) {
        const uncertainty: UncertaintyError = {
            type: 'Uncertainty',
            reason: !parsed.timeConfident
                ? `PCNW listing for "${event.summary}" had a date but no start time`
                : `PCNW listing for "${event.summary}" had a start time but no end time`,
            source: 'pcnw',
            unknownFields,
            event,
            partialFingerprint: simpleHash(plainText),
        };
        out.push(uncertainty);
    }

    return out;
}

export default class PCNWRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn: FetchFn = getFetchForConfig(ripper.config);
        const baseUrl = ripper.config.url.toString();
        const now = ZonedDateTime.now(TIMEZONE);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        const seen = new Set<string>();

        for (let page = 1; page <= PAGES_TO_FETCH; page++) {
            const url = `${baseUrl}?per_page=${PAGE_SIZE}&page=${page}&_embed=1`;
            const res = await fetchFn(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!res.ok) {
                errors.push({
                    type: 'ParseError',
                    reason: `PCNW events API page ${page} returned HTTP ${res.status}`,
                    context: url,
                });
                break;
            }

            let posts: PCNWEventPost[];
            try {
                posts = await res.json();
            } catch (err) {
                errors.push({
                    type: 'ParseError',
                    reason: `PCNW events API page ${page} returned invalid JSON: ${err}`,
                    context: url,
                });
                break;
            }
            if (posts.length === 0) break;

            for (const post of posts) {
                const title = decode(post.title.rendered);
                // "CLOSED: ..." posts are holiday-closure notices, not events.
                if (/^closed:/i.test(title)) continue;

                const id = `pcnw-${post.id}`;
                if (seen.has(id)) continue;
                seen.add(id);

                try {
                    const results = parseEventPost(post, now);
                    for (const r of results) {
                        if ('date' in r) events.push(r);
                        else errors.push(r);
                    }
                } catch (err) {
                    errors.push({
                        type: 'ParseError',
                        reason: `Failed to parse event ${post.id}: ${err}`,
                        context: title,
                    });
                }
            }
        }

        const cal = ripper.config.calendars[0];
        if (!cal) {
            throw new Error("No calendars configured for pcnw ripper");
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            tags: cal.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
