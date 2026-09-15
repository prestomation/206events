import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId, DayOfWeek, TemporalAdjusters } from "@js-joda/core";
import {
    IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent,
    UncertaintyError, UncertaintyField, EventCost,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

const BASE_URL = "https://nordicmuseum.org";
const MUSEUM_ADDRESS = "National Nordic Museum, 2655 NW Market Street, Seattle, WA 98107";
const KNOWN_ADDRESS_NEEDLE = "2655 nw market street";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const USER_AGENT = "Mozilla/5.0 (compatible; CalendarRipper/1.0)";

// How far out to synthesize concrete occurrences for recurring-phrase cards
// ("Every Thursday", "First and third Wednesday of every month"). Bounded so
// we don't over-synthesize past what the source has actually confirmed —
// roughly 9 weeks, matching the Free First Thursday synthesis precedent.
const LOOKAHEAD_DAYS = 63;

const MONTH_ABBR3: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function monthFromName(name: string): number | undefined {
    const key = name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
    return MONTH_ABBR3[key];
}

const WEEKDAYS: Record<string, DayOfWeek> = {
    monday: DayOfWeek.MONDAY, tuesday: DayOfWeek.TUESDAY, wednesday: DayOfWeek.WEDNESDAY,
    thursday: DayOfWeek.THURSDAY, friday: DayOfWeek.FRIDAY, saturday: DayOfWeek.SATURDAY, sunday: DayOfWeek.SUNDAY,
};

// -1 is a sentinel for "last" (TemporalAdjusters.lastInMonth), since ordinal 0
// is not meaningful for dayOfWeekInMonth.
const ORDINAL_WORDS: Record<string, number> = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1,
};

export interface ParsedEventCard {
    href: string;
    title: string;
    dateText: string;
}

export type DateClassification =
    | { kind: "single"; year: number; month: number; day: number }
    | { kind: "range" }
    | { kind: "weekly"; weekday: DayOfWeek; boundStart?: { month: number; day: number }; boundEnd?: { month: number; day: number } }
    | { kind: "monthly-nth"; weekday: DayOfWeek; ordinals: number[] }
    | { kind: "unknown" };

/**
 * Classify a Nordic Museum date-text subheading into one of the three shapes
 * documented on the calendar page: a concrete single date, a multi-day
 * festival-range summary, or a recurring phrase ("Every <day>", optionally
 * bounded by a date range, or "Nth [and Mth] <day> of every month").
 */
export function classifyDateText(dateText: string): DateClassification {
    const t = dateText.trim();

    // "Every Thursday, Sept 24-Nov 19" — bounded weekly recurrence.
    let m = t.match(/^Every\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*([A-Za-z]+)\.?\s+(\d{1,2})\s*[-–]\s*([A-Za-z]+)\.?\s+(\d{1,2})$/i);
    if (m) {
        const weekday = WEEKDAYS[m[1].toLowerCase()];
        const startMonth = monthFromName(m[2]);
        const endMonth = monthFromName(m[4]);
        if (weekday && startMonth && endMonth) {
            return {
                kind: "weekly",
                weekday,
                boundStart: { month: startMonth, day: parseInt(m[3], 10) },
                boundEnd: { month: endMonth, day: parseInt(m[5], 10) },
            };
        }
    }

    // "Every Thursday" — unbounded weekly recurrence.
    m = t.match(/^Every\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i);
    if (m) {
        const weekday = WEEKDAYS[m[1].toLowerCase()];
        if (weekday) return { kind: "weekly", weekday };
    }

    // "First and third Wednesday of every month" / "Third Wednesday of every month"
    m = t.match(/^((?:First|Second|Third|Fourth|Fifth|Last)(?:\s+and\s+(?:First|Second|Third|Fourth|Fifth|Last))?)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+of\s+every\s+month$/i);
    if (m) {
        const weekday = WEEKDAYS[m[2].toLowerCase()];
        const ordinals = m[1].toLowerCase().split(/\s+and\s+/).map(w => ORDINAL_WORDS[w]).filter((n): n is number => n !== undefined);
        if (weekday && ordinals.length > 0) return { kind: "monthly-nth", weekday, ordinals };
    }

    // "September 15-19, 2026" / "September 30-October 2, 2026" — a multi-day
    // festival summary card. Its individual screenings/sessions already have
    // their own single-date cards on the same page, so this is skipped.
    if (/^[A-Za-z]+\.?\s+\d{1,2}\s*[-–]\s*(?:[A-Za-z]+\.?\s+)?\d{1,2},\s*\d{4}$/.test(t)) {
        return { kind: "range" };
    }

    // "Sept 15, 2026" / "October 1, 2026" — a concrete single date.
    m = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})$/);
    if (m) {
        const month = monthFromName(m[1]);
        if (month) return { kind: "single", year: parseInt(m[3], 10), month, day: parseInt(m[2], 10) };
    }

    return { kind: "unknown" };
}

export interface ParsedTimeRange {
    hour: number;
    minute: number;
    durationMinutes: number;
    startTimeGuessed: boolean;
    durationGuessed: boolean;
}

/**
 * Parse the time-range text from an event's Date info block, e.g.
 * "6:00 pm - 8:00 pm", "10:00am - 8:00pm", "1:00 - 2:00pm" (trailing marker
 * only), or "6:30 pm – 8:00 pm" (en dash). Multi-section text like
 * "NOR1A: 5-6:30pm; NOR1C: 6:45-8pm" (two class sections with different
 * times) doesn't match and falls through to the unparseable default.
 */
export function parseTimeRange(timeText: string): ParsedTimeRange {
    const normalized = timeText.trim().replace(/[–—]/g, "-"); // en/em dash → hyphen

    const rangeMatch = normalized.match(
        /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i
    );
    if (rangeMatch) {
        const [, startHStr, startMStr, startPeriodRaw, endHStr, endMStr, endPeriod] = rangeMatch;
        const startMin = startMStr ? parseInt(startMStr, 10) : 0;
        const endMin = endMStr ? parseInt(endMStr, 10) : 0;
        let endHour = parseInt(endHStr, 10);
        const ep = endPeriod.toLowerCase();
        if (ep === "pm" && endHour !== 12) endHour += 12;
        if (ep === "am" && endHour === 12) endHour = 0;

        let startHour = parseInt(startHStr, 10);
        const effectivePeriod = (startPeriodRaw || endPeriod).toLowerCase();
        if (effectivePeriod === "pm" && startHour !== 12) startHour += 12;
        if (effectivePeriod === "am" && startHour === 12) startHour = 0;

        // If start ends up after end, flip the *inferred* start period (e.g.
        // "11-1pm" → 11am not 11pm). Only when the period was actually
        // omitted from the start side — an explicit "10pm - 1am" legitimately
        // crosses midnight and must not be reinterpreted as 10am.
        if (!startPeriodRaw && (startHour > endHour || (startHour === endHour && startMin > endMin))) {
            startHour = parseInt(startHStr, 10);
            const flipped = effectivePeriod === "pm" ? "am" : "pm";
            if (flipped === "pm" && startHour !== 12) startHour += 12;
            if (flipped === "am" && startHour === 12) startHour = 0;
        }

        const durationMinutes = Math.max((endHour * 60 + endMin) - (startHour * 60 + startMin), 15);
        return { hour: startHour, minute: startMin, durationMinutes, startTimeGuessed: false, durationGuessed: false };
    }

    // Single time, no range: "6:30 pm"
    const singleMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (singleMatch) {
        let hour = parseInt(singleMatch[1], 10);
        const minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
        const period = singleMatch[3].toLowerCase();
        if (period === "pm" && hour !== 12) hour += 12;
        if (period === "am" && hour === 12) hour = 0;
        return { hour, minute, durationMinutes: 120, startTimeGuessed: false, durationGuessed: true };
    }

    // Unparseable (empty, or multi-section text like the Norwegian class
    // listing) — placeholder resolved by the uncertainty system.
    return { hour: 12, minute: 0, durationMinutes: 120, startTimeGuessed: true, durationGuessed: true };
}

/**
 * Parse admission text (e.g. "Members: $12\nGeneral Admission: $14", or
 * "Tour included with Museum admission") into an EventCost. Prefers a
 * "General Admission" price when present (the pricing rubric's cheapest
 * general-admission figure); falls back to the first dollar amount found.
 * Returns undefined (unknown, not a guess) when the text names no price —
 * e.g. "included with Museum admission" doesn't tell us this program's own
 * marginal cost — or when there's no Admission block at all. An absent
 * block isn't reliably "free": it may just be a different page template
 * or a program bundled into paid museum admission. Per AGENTS.md, publish
 * cost as unknown rather than guess; the non-fatal costGaps queue drains it.
 */
export function parseCost(admissionText: string | undefined): EventCost | undefined {
    if (admissionText === undefined) return undefined;
    const text = admissionText.trim();
    if (!text) return undefined;
    if (/\bfree\b/i.test(text) && !/\$\s*\d/.test(text)) return { min: 0 };

    const gaMatch = text.match(/General\s*Admission:?\s*\$\s*(\d+(?:\.\d+)?)/i);
    if (gaMatch) return { min: parseFloat(gaMatch[1]) };

    const anyMatch = text.match(/\$\s*(\d+(?:\.\d+)?)/);
    if (anyMatch) return { min: parseFloat(anyMatch[1]) };

    return undefined;
}

function isKnownMuseumAddress(contactText: string | undefined): boolean {
    return !!contactText && contactText.toLowerCase().includes(KNOWN_ADDRESS_NEEDLE);
}

function slugFromHref(href: string): string {
    return href.replace(/^.*\/events\//, "").replace(/\/$/, "");
}

// Resolve a bare "Month Day - Month Day" range (no year, as seen in
// weekly-recurrence bounds like "Sept 24-Nov 19") to concrete dates
// relative to `today`. The two ends must be resolved as a *pair* — never
// independently pick a year for `start` and a separate year for `end`
// based on each one's own distance from `today`. Rolling `start` forward
// to next year once it's more than a week in the past (as if that alone
// meant the whole range had elapsed) breaks a range that's still
// in-progress: e.g. "Sept 24-Nov 19" checked on Oct 15 would push `start`
// to next September while `end` stays this November, leaving `end`
// before `start` and silently producing zero occurrences for the rest of
// the season. Instead: assume the range falls in the current year (with
// `end`'s year bumped when the range wraps past December 31st), and only
// roll the whole pair forward a year if `end` — the range's actual close
// — has already passed relative to `today`.
function resolveBoundedRange(
    start: { month: number; day: number },
    end: { month: number; day: number },
    today: LocalDate,
): { start: LocalDate; end: LocalDate } {
    const wraps = end.month < start.month || (end.month === start.month && end.day < start.day);
    let year = today.year();
    let startDate = LocalDate.of(year, start.month, start.day);
    let endDate = LocalDate.of(wraps ? year + 1 : year, end.month, end.day);
    if (endDate.isBefore(today)) {
        year += 1;
        startDate = LocalDate.of(year, start.month, start.day);
        endDate = LocalDate.of(wraps ? year + 1 : year, end.month, end.day);
    }
    return { start: startDate, end: endDate };
}

export function computeWeeklyOccurrences(
    classification: { weekday: DayOfWeek; boundStart?: { month: number; day: number }; boundEnd?: { month: number; day: number } },
    today: LocalDate,
    lookaheadDays: number,
): LocalDate[] {
    let lowerBound = today;
    let upperBound = today.plusDays(lookaheadDays);

    if (classification.boundStart && classification.boundEnd) {
        const { start, end } = resolveBoundedRange(classification.boundStart, classification.boundEnd, today);
        if (start.isAfter(lowerBound)) lowerBound = start;
        if (end.isBefore(upperBound)) upperBound = end;
    }

    if (upperBound.isBefore(lowerBound)) return [];

    const dates: LocalDate[] = [];
    let d = lowerBound.with(TemporalAdjusters.nextOrSame(classification.weekday));
    const maxIterations = Math.ceil(lookaheadDays / 7) + 2;
    let i = 0;
    while (!d.isAfter(upperBound) && i < maxIterations) {
        dates.push(d);
        d = d.plusWeeks(1);
        i++;
    }
    return dates;
}

export function computeMonthlyNthOccurrences(
    classification: { weekday: DayOfWeek; ordinals: number[] },
    today: LocalDate,
    lookaheadDays: number,
): LocalDate[] {
    const upperBound = today.plusDays(lookaheadDays);
    const dates: LocalDate[] = [];
    let monthCursor = today.withDayOfMonth(1);
    let guard = 0;
    while (!monthCursor.isAfter(upperBound) && guard < 6) {
        for (const ordinal of classification.ordinals) {
            let d: LocalDate;
            try {
                d = ordinal === -1
                    ? monthCursor.with(TemporalAdjusters.lastInMonth(classification.weekday))
                    : monthCursor.with(TemporalAdjusters.dayOfWeekInMonth(ordinal, classification.weekday));
            } catch {
                continue;
            }
            if (!d.isBefore(today) && !d.isAfter(upperBound)) dates.push(d);
        }
        monthCursor = monthCursor.plusMonths(1);
        guard++;
    }
    dates.sort((a, b) => a.toString().localeCompare(b.toString()));
    return dates;
}

export default class NordicMuseumRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const res = await this.fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": USER_AGENT },
        });
        if (!res.ok) {
            throw new Error(`${ripper.config.url} returned HTTP ${res.status}: ${res.statusText}`);
        }

        const html = parse(await res.text());
        const cards = this.parseEventCards(html);
        const today = LocalDate.now(TIMEZONE);

        const eventResults = await Promise.all(
            cards.map(card => this.fetchAndParseCard(card, today, ripper.config.name))
        );
        const allEvents = eventResults.flat();

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter((e): e is RipperCalendarEvent => "date" in e),
            errors: allEvents.filter((e): e is RipperError => "type" in e),
            tags: cal.tags ?? [],
            parent: ripper.config,
        }));
    }

    public parseEventCards(html: HTMLElement): ParsedEventCard[] {
        const cards: ParsedEventCard[] = [];
        for (const card of html.querySelectorAll("div.card-event.position-relative")) {
            const linkEl = card.querySelector("a.card-title-link");
            const dateEl = card.querySelector(".subheading p");
            if (!linkEl || !dateEl) continue;

            const href = linkEl.getAttribute("href") || "";
            const title = linkEl.text?.trim() || "";
            const dateText = dateEl.text?.trim() || "";
            if (!href || !title || !dateText) continue;

            cards.push({ href, title, dateText });
        }
        return cards;
    }

    private async fetchAndParseCard(card: ParsedEventCard, today: LocalDate, sourceName: string): Promise<RipperEvent[]> {
        const listClassification = classifyDateText(card.dateText);

        // The multi-day festival-range summary card is redundant with its own
        // individually-dated screening cards elsewhere on the page — skip it
        // without spending a fetch.
        if (listClassification.kind === "range") {
            return [{
                type: "ParseError",
                reason: `"${card.title}" (${card.dateText}) is a date-range summary card, individual screenings already listed separately`,
                context: card.href,
            }];
        }
        if (listClassification.kind === "unknown") {
            return [{
                type: "ParseError",
                reason: `Could not classify date text "${card.dateText}" for "${card.title}"`,
                context: card.href,
            }];
        }

        try {
            const res = await this.fetchFn(card.href, { headers: { "User-Agent": USER_AGENT } });
            if (!res.ok) {
                return [{
                    type: "ParseError",
                    reason: `HTTP ${res.status} fetching event ${card.href}`,
                    context: card.title,
                }];
            }
            const canonicalUrl = res.url || card.href;
            const detailHtml = parse(await res.text());
            return this.parseEventDetail(card, detailHtml, canonicalUrl, today, sourceName);
        } catch (error) {
            return [{
                type: "ParseError",
                reason: `Error fetching event ${card.href}: ${error}`,
                context: card.title,
            }];
        }
    }

    public parseEventDetail(
        card: ParsedEventCard,
        html: HTMLElement,
        canonicalUrl: string,
        today: LocalDate,
        sourceName: string,
    ): RipperEvent[] {
        const title = html.querySelector("h1")?.text?.trim() || card.title;

        const dateBlock = html.querySelector('div.info-detail[title="Date"] .info-detail__content');
        if (!dateBlock) {
            return [{
                type: "ParseError",
                reason: `No date block found on detail page for "${title}"`,
                context: canonicalUrl,
            }];
        }
        const ps = dateBlock.querySelectorAll("p");
        const dateText = ps[0]?.text?.trim() || "";
        const timeText = ps[1]?.text?.trim() || "";

        const classification = classifyDateText(dateText);

        const admissionText = html.querySelector('div.info-detail[title="Admission"] .info-detail__content')?.text?.trim();
        const cost = parseCost(admissionText);
        const imageUrl = html.querySelector("img.split-banner__img")?.getAttribute("src") || undefined;

        const contactBlock = html.querySelector('div.info-detail[title="Contact"]');
        const contactText = contactBlock
            ? (contactBlock.querySelector('a[href*="maps.google.com"]') ?? contactBlock).text?.replace(/\s+/g, " ").trim()
            : undefined;

        const slug = slugFromHref(card.href);
        const timeResult = parseTimeRange(timeText);

        if (classification.kind === "single") {
            const id = `nordic-museum-${slug}`;
            let date: ZonedDateTime;
            try {
                date = ZonedDateTime.of(
                    LocalDateTime.of(classification.year, classification.month, classification.day, timeResult.hour, timeResult.minute),
                    TIMEZONE
                );
            } catch (err) {
                return [{
                    type: "ParseError",
                    reason: `Invalid date for "${title}": ${err}`,
                    context: dateText,
                }];
            }
            return this.buildEvent(
                id, title, date, timeResult.durationMinutes, canonicalUrl, imageUrl, cost,
                sourceName, timeResult, timeText, contactText, `${dateText}|${timeText}`
            );
        }

        if (classification.kind === "weekly" || classification.kind === "monthly-nth") {
            const occurrences = classification.kind === "weekly"
                ? computeWeeklyOccurrences(classification, today, LOOKAHEAD_DAYS)
                : computeMonthlyNthOccurrences(classification, today, LOOKAHEAD_DAYS);

            const results: RipperEvent[] = [];
            for (const occDate of occurrences) {
                const id = `nordic-museum-${slug}-${occDate.toString()}`;
                let date: ZonedDateTime;
                try {
                    date = ZonedDateTime.of(
                        LocalDateTime.of(occDate.year(), occDate.monthValue(), occDate.dayOfMonth(), timeResult.hour, timeResult.minute),
                        TIMEZONE
                    );
                } catch (err) {
                    results.push({
                        type: "ParseError",
                        reason: `Invalid synthesized date for "${title}": ${err}`,
                        context: occDate.toString(),
                    });
                    continue;
                }
                results.push(...this.buildEvent(
                    id, title, date, timeResult.durationMinutes, canonicalUrl, imageUrl, cost,
                    sourceName, timeResult, timeText, contactText, `${dateText}|${timeText}|${occDate.toString()}`
                ));
            }
            return results;
        }

        // "range" here means the detail page's own Date block disagrees with
        // the list card's classification (defensive — not expected live), and
        // "unknown" means the date text didn't match any recognised shape.
        return [{
            type: "ParseError",
            reason: `Could not classify detail-page date text "${dateText}" for "${title}"`,
            context: canonicalUrl,
        }];
    }

    private buildEvent(
        id: string,
        title: string,
        date: ZonedDateTime,
        durationMinutes: number,
        url: string,
        imageUrl: string | undefined,
        cost: EventCost | undefined,
        sourceName: string,
        timeResult: ParsedTimeRange,
        timeText: string,
        contactText: string | undefined,
        fingerprintSeed: string,
    ): RipperEvent[] {
        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            location: MUSEUM_ADDRESS,
            url,
            imageUrl,
            cost,
        };

        const unknownFields: UncertaintyField[] = [];
        const reasons: string[] = [];
        if (timeResult.startTimeGuessed) {
            unknownFields.push("startTime", "duration");
            reasons.push(`unrecognised time text "${timeText}"`);
        } else if (timeResult.durationGuessed) {
            unknownFields.push("duration");
            reasons.push(`time has a start but no confirmed end ("${timeText}")`);
        }
        if (!isKnownMuseumAddress(contactText)) {
            unknownFields.push("location");
            reasons.push(contactText ? `Contact block shows a different address: "${contactText}"` : "no Contact block found on detail page");
        }

        if (unknownFields.length === 0) return [event];

        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            source: sourceName,
            unknownFields,
            event,
            reason: reasons.join("; "),
            partialFingerprint: simpleHash(fingerprintSeed),
        };
        return [event, uncertainty];
    }
}
