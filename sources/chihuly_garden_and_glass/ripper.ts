import { ZonedDateTime, Duration, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
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

const BASE_URL = "https://www.chihulygardenandglass.com";
const VENUE_ADDRESS = "Chihuly Garden and Glass, 305 Harrison St, Seattle, WA 98109";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const USER_AGENT = "Mozilla/5.0 (compatible; CalendarRipper/1.0)";

const MONTHS: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4,
    May: 5, June: 6, July: 7, August: 8,
    September: 9, October: 10, November: 11, December: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).join("|");
const DATE_PATTERN = new RegExp(`(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, "g");

export interface ParsedEventCard {
    href: string;
    title: string;
    dateText: string;
}

interface ParsedTime {
    hour: number;
    minute: number;
}

interface DatedOccurrence {
    year: number;
    month: number;
    day: number;
    // Per-date inline time override, e.g. "September 6, 2026 (Class starts at 8AM)"
    // taking precedence over the series' general "Doors open ... begins at" time.
    override: ParsedTime | null;
}

export default class ChihulyGardenAndGlassRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const res = await fetch(ripper.config.url.toString(), { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const html = parse(await res.text());
        const cards = this.parseEventCards(html);

        const eventResults = await Promise.all(cards.map(card => this.fetchAndParseEvent(card)));
        const now = ZonedDateTime.now();
        const allEvents = eventResults.flat().filter(e => !("date" in e) || !e.date.isBefore(now));

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

    // The events listing page renders each upcoming program as a
    // `div.item.block` card with a title, a date/date-range blurb, and a
    // "Learn More" link to the event's own detail page (where the actual
    // occurrence dates and times live).
    public parseEventCards(html: HTMLElement): ParsedEventCard[] {
        const cards: ParsedEventCard[] = [];
        for (const item of html.querySelectorAll("div.item.block")) {
            const titleEl = item.querySelector("h3");
            const dateEl = item.querySelector("div.pt-2 p");
            const linkEl = item.querySelector("a");

            const href = linkEl?.getAttribute("href")?.trim() || "";
            const title = titleEl?.text?.trim() || "";
            const dateText = dateEl?.text?.trim() || "";
            if (!href || !title) continue;

            cards.push({ href, title, dateText });
        }
        return cards;
    }

    private async fetchAndParseEvent(card: ParsedEventCard): Promise<RipperEvent[]> {
        try {
            const res = await fetch(card.href, { headers: { "User-Agent": USER_AGENT } });
            if (!res.ok) {
                return [{
                    type: "ParseError" as const,
                    reason: `HTTP ${res.status} fetching event ${card.href}`,
                    context: card.title,
                }];
            }
            const html = parse(await res.text());
            return this.parseEventDetail(card, html, res.url);
        } catch (error) {
            return [{
                type: "ParseError" as const,
                reason: `Error fetching event ${card.href}: ${error}`,
                context: card.title,
            }];
        }
    }

    public parseEventDetail(card: ParsedEventCard, html: HTMLElement, canonicalUrl: string): RipperEvent[] {
        const h1 = html.querySelector("h1");
        const headerEl = h1?.nextElementSibling;
        if (!headerEl) {
            return [{
                type: "ParseError" as const,
                reason: `No header date element found for event: ${card.title}`,
                context: card.href,
            }];
        }

        const headerText = headerEl.text.trim();
        const yearMatch = headerText.match(/\d{4}/);
        const defaultYear = yearMatch ? parseInt(yearMatch[0], 10) : LocalDateTime.now().year();
        const slug = this.slugFromHref(card.href);
        const imageUrl = this.extractImageUrl(html);
        const description = this.extractDescription(html);

        // A small number of one-off events (e.g. "GATHER") carry their own
        // single explicit date + start/end time in the header itself, rather
        // than a "Dates:" list in the body — the site marks these with a
        // `.event-listing__time` span next to the date.
        const timeSpanEl = headerEl.querySelector(".event-listing__time");
        if (timeSpanEl) {
            return this.buildSingleTimedEvent(card, headerText, timeSpanEl.text.trim(), canonicalUrl, imageUrl, description, slug, defaultYear);
        }

        return this.buildRecurringSeriesEvents(card, html, headerText, canonicalUrl, imageUrl, description, slug, defaultYear);
    }

    private buildSingleTimedEvent(
        card: ParsedEventCard, headerText: string, timeRangeText: string, canonicalUrl: string,
        imageUrl: string | undefined, description: string | undefined, slug: string, defaultYear: number,
    ): RipperEvent[] {
        const dateMatch = this.firstDateMatch(headerText, defaultYear);
        if (!dateMatch) {
            return [{
                type: "ParseError" as const,
                reason: `Could not parse date from header "${headerText}" for event: ${card.title}`,
                context: card.href,
            }];
        }

        const times = timeRangeText.match(/(\d{1,2})(?::(\d{2}))?\s*([AP]M)\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*([AP]M)/i);
        let hour = 12, minute = 0, durationMinutes = 120, timeGuessed = true;
        if (times) {
            const start = this.to24Hour(parseInt(times[1], 10), times[2] ? parseInt(times[2], 10) : 0, times[3]);
            const end = this.to24Hour(parseInt(times[4], 10), times[5] ? parseInt(times[5], 10) : 0, times[6]);
            hour = start.hour;
            minute = start.minute;
            durationMinutes = Math.max((end.hour * 60 + end.minute) - (hour * 60 + minute), 30);
            timeGuessed = false;
        }

        let eventDate: ZonedDateTime;
        try {
            eventDate = ZonedDateTime.of(LocalDateTime.of(dateMatch.year, dateMatch.month, dateMatch.day, hour, minute), TIMEZONE);
        } catch (error) {
            return [{
                type: "ParseError" as const,
                reason: `Invalid date for event "${card.title}": ${error}`,
                context: headerText,
            }];
        }

        const event: RipperCalendarEvent = {
            id: `chihuly-${slug}-${this.dateSuffix(dateMatch)}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: card.title,
            description,
            location: VENUE_ADDRESS,
            url: canonicalUrl,
            imageUrl,
        };

        const results: RipperEvent[] = [event];
        if (timeGuessed) {
            results.push(this.uncertaintyFor(event, ["startTime", "duration"], `Could not parse a time range from "${timeRangeText}"`, `${headerText}|${timeRangeText}`));
        }
        return results;
    }

    private buildRecurringSeriesEvents(
        card: ParsedEventCard, html: HTMLElement, headerText: string, canonicalUrl: string,
        imageUrl: string | undefined, description: string | undefined, slug: string, defaultYear: number,
    ): RipperEvent[] {
        const proseEl = html.querySelector("div.prose");
        if (!proseEl) {
            return [{
                type: "ParseError" as const,
                reason: `No description body found for event: ${card.title}`,
                context: card.href,
            }];
        }

        // Past occurrences are struck through (`<s>...</s>`) by the site
        // itself rather than removed from the page, so drop them before
        // scanning for dates. `<s\b` (not just `<s`) avoids matching `<style>`.
        const proseHtml = proseEl.innerHTML.replace(/<s\b[^>]*>[\s\S]*?<\/s>/g, " ");
        const proseText = this.stripTags(proseHtml);

        let occurrences = this.extractOccurrences(proseText, defaultYear);
        // Single-date events with no "Dates:" list in the body (e.g.
        // "Meditation and Sound Bath") carry their one date only in the
        // header blurb.
        if (occurrences.length === 0) {
            const headerDate = this.firstDateMatch(headerText, defaultYear);
            if (headerDate) occurrences = [{ ...headerDate, override: null }];
        }
        if (occurrences.length === 0) return [];

        const generalTime = this.extractGeneralTime(proseText);
        const explicitDurationMinutes = this.extractExplicitDuration(proseText);

        const results: RipperEvent[] = [];
        for (const occ of occurrences) {
            const time = occ.override ?? generalTime ?? { hour: 12, minute: 0 };
            const durationMinutes = explicitDurationMinutes ?? 60;

            let eventDate: ZonedDateTime;
            try {
                eventDate = ZonedDateTime.of(LocalDateTime.of(occ.year, occ.month, occ.day, time.hour, time.minute), TIMEZONE);
            } catch (error) {
                results.push({
                    type: "ParseError" as const,
                    reason: `Invalid date for event "${card.title}": ${error}`,
                    context: `${occ.year}-${occ.month}-${occ.day}`,
                });
                continue;
            }

            const event: RipperCalendarEvent = {
                id: `chihuly-${slug}-${this.dateSuffix(occ)}`,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofMinutes(durationMinutes),
                summary: card.title,
                description,
                location: VENUE_ADDRESS,
                url: canonicalUrl,
                imageUrl,
            };
            results.push(event);

            const unknownFields: UncertaintyField[] = [];
            if (!occ.override && !generalTime) unknownFields.push("startTime");
            if (explicitDurationMinutes === null) unknownFields.push("duration");
            if (unknownFields.length > 0) {
                results.push(this.uncertaintyFor(
                    event, unknownFields,
                    `Series page gave no explicit ${unknownFields.join("/")} for this occurrence`,
                    proseText,
                ));
            }
        }
        return results;
    }

    private uncertaintyFor(event: RipperCalendarEvent, unknownFields: UncertaintyField[], reason: string, fingerprintSource: string): UncertaintyError {
        return {
            type: "Uncertainty",
            reason,
            source: "chihuly_garden_and_glass",
            unknownFields,
            event,
            partialFingerprint: simpleHash(fingerprintSource),
        };
    }

    // Scans free text for "Month Day[, Year]" occurrences, pairing each with
    // an optional inline time override like "(Class starts at 8AM)" that
    // some series use for a one-off exception (see sample-yoga.html).
    public extractOccurrences(text: string, defaultYear: number): DatedOccurrence[] {
        const occurrences: DatedOccurrence[] = [];
        DATE_PATTERN.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = DATE_PATTERN.exec(text)) !== null) {
            const month = MONTHS[m[1]];
            const day = parseInt(m[2], 10);
            const year = m[3] ? parseInt(m[3], 10) : defaultYear;

            const window = text.slice(m.index, m.index + 80);
            const overrideMatch = window.match(/\((?:Class|Yoga)\s+(?:starts|begins)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*([AP]M)\)/i);
            const override = overrideMatch
                ? this.to24Hour(parseInt(overrideMatch[1], 10), overrideMatch[2] ? parseInt(overrideMatch[2], 10) : 0, overrideMatch[3])
                : null;

            occurrences.push({ year, month, day, override });
        }
        return occurrences;
    }

    private firstDateMatch(text: string, defaultYear: number): { year: number; month: number; day: number } | null {
        DATE_PATTERN.lastIndex = 0;
        const m = DATE_PATTERN.exec(text);
        if (!m) return null;
        return { year: m[3] ? parseInt(m[3], 10) : defaultYear, month: MONTHS[m[1]], day: parseInt(m[2], 10) };
    }

    // The series' shared start time, anchored to the "Doors open at X, class/yoga
    // begins/starts at Y" summary sentence so a per-date override earlier in
    // the same paragraph (see extractOccurrences) isn't mistaken for it.
    public extractGeneralTime(text: string): ParsedTime | null {
        let m = text.match(/Doors open at[^.]*?(?:class|yoga)\s+(?:starts|begins)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*([AP]M)/i);
        if (!m) m = text.match(/(?:class|yoga)\s+(?:starts|begins)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*([AP]M)/i);
        if (!m) return null;
        return this.to24Hour(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, m[3]);
    }

    // Only trusts a duration the page states explicitly ("a 50-minute Pilates
    // class", "this two-hour guided session") — never a passing mention of
    // minutes elsewhere in the copy (e.g. "instruction for the first 30
    // minutes" is part of a longer evening, not the whole event length).
    public extractExplicitDuration(text: string): number | null {
        let m = text.match(/(\d+)[\s-]?minute(?:s)?\s+(?:beginner-friendly\s+)?(?:Pilates\s+|Yoga\s+)?(?:class|session)/i);
        if (m) return parseInt(m[1], 10);
        if (/\btwo[\s-]hour\b/i.test(text)) return 120;
        if (/\bone[\s-]hour\b/i.test(text)) return 60;
        return null;
    }

    public extractImageUrl(html: HTMLElement): string | undefined {
        const imgEl = html.querySelector("img.w-full.h-auto");
        const raw = imgEl?.getAttribute("src")?.trim();
        if (!raw) return undefined;
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith("//")) return `https:${raw}`;
        if (raw.startsWith("/")) return `${BASE_URL}${raw}`;
        return undefined;
    }

    // First substantial paragraph of body copy, skipping the logistical
    // "Dates:" / "Doors open" / ticketing lines.
    public extractDescription(html: HTMLElement): string | undefined {
        const proseEl = html.querySelector("div.prose");
        if (!proseEl) return undefined;
        for (const p of proseEl.querySelectorAll("p")) {
            const text = p.text.trim();
            if (text.length > 40 && !/^(Dates:|Doors open|Tickets? must)/i.test(text)) {
                return text;
            }
        }
        return undefined;
    }

    private stripTags(html: string): string {
        return html
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&#0?39;/g, "'")
            .replace(/&rsquo;/g, "’")
            .replace(/\s+/g, " ")
            .trim();
    }

    private to24Hour(hour: number, minute: number, period: string): ParsedTime {
        const p = period.toUpperCase();
        let h = hour % 12;
        if (p === "PM") h += 12;
        return { hour: h, minute };
    }

    private dateSuffix(d: { year: number; month: number; day: number }): string {
        return `${d.year}${String(d.month).padStart(2, "0")}${String(d.day).padStart(2, "0")}`;
    }

    private slugFromHref(href: string): string {
        const parts = href.split("/").filter(Boolean);
        return parts[parts.length - 1] || href;
    }
}
