import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
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

const BASE_URL = "https://fryemuseum.org";
const MUSEUM_ADDRESS = "Frye Art Museum, 704 Terry Ave, Seattle, WA 98104";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS: Record<string, number> = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
};

export interface ParsedEventCard {
    href: string;
    title: string;
    dateText: string;
}

export default class FryeArtMuseumRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const res = await fetch(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; CalendarRipper/1.0)" }
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const html = parse(await res.text());
        const eventCards = this.parseEventCards(html);

        const eventResults = await Promise.all(
            eventCards.map(card => this.fetchAndParseEvent(card))
        );
        const allEvents = eventResults.flat();

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

    public parseEventCards(html: HTMLElement): ParsedEventCard[] {
        const cards: ParsedEventCard[] = [];
        const cardElements = html.querySelectorAll("div.card.upcoming__card");

        for (const card of cardElements) {
            const linkEl = card.querySelector("a.upcoming__link");
            const titleEl = card.querySelector("h2.card__title");
            const dateEl = card.querySelector("p.card__date");

            if (!linkEl || !titleEl || !dateEl) continue;

            const href = linkEl.getAttribute("href") || "";
            const title = titleEl.text?.trim() || "";
            const dateText = dateEl.text?.trim() || "";

            // Only include events with a day-of-week date (not exhibitions like "Through April 12, 2026")
            const startsWithDay = DAYS_OF_WEEK.some(day => dateText.startsWith(day));
            if (!href || !title || !startsWithDay) continue;

            cards.push({ href, title, dateText });
        }

        return cards;
    }

    private async fetchAndParseEvent(card: ParsedEventCard): Promise<RipperEvent[]> {
        try {
            const url = `${BASE_URL}${card.href}`;
            const res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; CalendarRipper/1.0)" }
            });
            if (!res.ok) {
                return [{
                    type: "ParseError" as const,
                    reason: `HTTP ${res.status} fetching event ${url}`,
                    context: card.title,
                }];
            }

            const canonicalUrl = res.url;
            const html = parse(await res.text());
            return this.parseEventDetail(card, html, canonicalUrl);
        } catch (error) {
            return [{
                type: "ParseError" as const,
                reason: `Error fetching event ${card.href}: ${error}`,
                context: card.title,
            }];
        }
    }

    public parseEventDetail(card: ParsedEventCard, html: HTMLElement, canonicalUrl: string): RipperEvent[] {
        const dateEl = html.querySelector("p.event-single__display-date");
        const timeEl = html.querySelector("p.event-single__display-time");

        if (!dateEl) {
            return [{
                type: "ParseError" as const,
                reason: `No date element found for event: ${card.title}`,
                context: card.href,
            }];
        }

        const dateText = dateEl.text?.trim() || "";
        const timeText = timeEl?.text?.trim() || "";

        // Skip recurring date patterns (e.g. "Fridays", "Monthly, fourth Thursdays", "First Sundays")
        // These don't represent a single concrete date; the listing page already filters by day-of-week.
        if (this.isRecurringPattern(dateText)) {
            return [];
        }

        const parsedDate = this.parseDate(dateText);
        if (!parsedDate) {
            return [{
                type: "ParseError" as const,
                reason: `Could not parse date "${dateText}" for event: ${card.title}`,
                context: card.href,
            }];
        }

        const { hour, minute, durationMinutes, startTimeGuessed, durationGuessed } = this.parseTime(timeText);

        let eventDate: ZonedDateTime;
        try {
            eventDate = ZonedDateTime.of(
                LocalDateTime.of(parsedDate.year, parsedDate.month, parsedDate.day, hour, minute),
                TIMEZONE
            );
        } catch (error) {
            return [{
                type: "ParseError" as const,
                reason: `Invalid date for event "${card.title}": ${error}`,
                context: dateText,
            }];
        }

        const addressEl = html.querySelector("div.event-single__address address");
        const locationText = addressEl?.text?.trim() || "";
        const location = locationText.length > 0 ? locationText : MUSEUM_ADDRESS;

        const imageUrl = this.extractImageUrl(html);

        const nodeId = card.href.match(/\/node\/(\d+)/)?.[1] || card.href;
        const event: RipperCalendarEvent = {
            id: `frye-${nodeId}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: card.title,
            location,
            url: canonicalUrl,
            imageUrl,
        };

        const results: RipperEvent[] = [event];
        const unknownFields: UncertaintyField[] = [];
        if (startTimeGuessed) unknownFields.push("startTime");
        if (durationGuessed) unknownFields.push("duration");
        if (unknownFields.length > 0) {
            results.push({
                type: "Uncertainty",
                reason: startTimeGuessed
                    ? `Event-page time element unrecognised: "${timeText}"`
                    : "Event-page time has a start but no end",
                source: "frye_art_museum",
                unknownFields,
                event,
                partialFingerprint: simpleHash(`${dateText}|${timeText}`),
            });
        }
        return results;
    }

    // Extract the per-event hero image from the event detail page. The Frye event
    // page exposes `img.event-single__image` with a root-relative src; resolve it
    // against BASE_URL to produce an absolute URL. Returns undefined when absent.
    public extractImageUrl(html: HTMLElement): string | undefined {
        const imgEl = html.querySelector("img.event-single__image");
        const raw = imgEl?.getAttribute("src")?.trim();
        if (!raw) return undefined;
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith("//")) return `https:${raw}`;
        if (raw.startsWith("/")) return `${BASE_URL}${raw}`;
        return undefined;
    }

    public isRecurringPattern(dateText: string): boolean {
        // Recurring patterns contain no digits (e.g. "Fridays", "First Sundays",
        // "Monthly, fourth Thursdays"). Concrete dates always have a day number.
        // However, ordinal-based recurring patterns like "First Sundays (1–3 pm)"
        // contain digits in the time portion, so also detect ordinal/plural-day patterns.
        const ordinalPrefixes = /^(First|Second|Third|Fourth|Fifth|Last|Every|Monthly|Weekly)\b/i;
        const pluralDays = /(?:Sundays|Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays)/i;
        return ordinalPrefixes.test(dateText) || pluralDays.test(dateText) || !/\d/.test(dateText);
    }

    public parseDate(dateText: string): { year: number; month: number; day: number } | null {
        // Handle date ranges with en/em-dash: "June 5–June 7, 2026" → use start date (June 5, 2026)
        if (/[–—]/.test(dateText)) {
            const yearMatch = dateText.match(/(\d{4})/);
            const rangeYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
            const startPart = dateText.split(/[–—]/)[0].trim();
            const startMatch = startPart.match(/^(\w+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
            if (!startMatch) return null;
            const startMonth = MONTHS[startMatch[1]];
            if (!startMonth) return null;
            const startDay = parseInt(startMatch[2], 10);
            const startYear = parseInt(startMatch[3] ?? '') || rangeYear;
            if (startYear) return { year: startYear, month: startMonth, day: startDay };
            // Year inference for ranges without an explicit year
            const now = LocalDate.now();
            let inferredYear = now.year();
            try {
                if (LocalDate.of(inferredYear, startMonth, startDay).isBefore(now.minusDays(7))) inferredYear += 1;
            } catch { return null; }
            return { year: inferredYear, month: startMonth, day: startDay };
        }

        // Format: "February 22, 2026" or "February 22"
        const match = dateText.match(/^(\w+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
        if (!match) return null;

        const monthName = match[1];
        const day = parseInt(match[2], 10);
        const month = MONTHS[monthName];
        if (!month) return null;

        if (match[3]) {
            return { year: parseInt(match[3], 10), month, day };
        }

        // Infer year: if the date is more than 7 days in the past, assume next year
        const now = LocalDate.now();
        let year = now.year();
        try {
            const candidate = LocalDate.of(year, month, day);
            if (candidate.isBefore(now.minusDays(7))) {
                year += 1;
            }
        } catch {
            // Invalid date, return null
            return null;
        }

        return { year, month, day };
    }

    public parseTime(timeText: string): { hour: number; minute: number; durationMinutes: number; startTimeGuessed: boolean; durationGuessed: boolean } {
        // Handle en-dash (–) and hyphen (-) as range separator
        // Formats: "2–4 pm", "2:30–4 pm", "10 am–12 pm", "11 am–1:30 pm", "6:30 pm"
        const normalised = timeText.replace(/\u2013/g, "-"); // en-dash to hyphen

        // Range: "2-4 pm", "2:30-4 pm", "10 am-12 pm"
        const rangeMatch = normalised.match(
            /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i
        );
        if (rangeMatch) {
            const [, startHStr, startMStr, startPeriod, endHStr, endMStr, endPeriod] = rangeMatch;

            const startMin = startMStr ? parseInt(startMStr, 10) : 0;
            const endMin = endMStr ? parseInt(endMStr, 10) : 0;
            let endHour = parseInt(endHStr, 10);
            const ep = endPeriod.toLowerCase();
            if (ep === "pm" && endHour !== 12) endHour += 12;
            if (ep === "am" && endHour === 12) endHour = 0;

            let startHour = parseInt(startHStr, 10);
            const effectivePeriod = (startPeriod || endPeriod).toLowerCase();
            if (effectivePeriod === "pm" && startHour !== 12) startHour += 12;
            if (effectivePeriod === "am" && startHour === 12) startHour = 0;

            // If start ends up after end, flip start period (e.g. "11-1pm" → 11am not 11pm)
            if (startHour > endHour) {
                startHour = parseInt(startHStr, 10);
                const flipped = effectivePeriod === "pm" ? "am" : "pm";
                if (flipped === "pm" && startHour !== 12) startHour += 12;
                if (flipped === "am" && startHour === 12) startHour = 0;
            }

            const durationMinutes = Math.max(
                (endHour * 60 + endMin) - (startHour * 60 + startMin),
                30
            );
            return { hour: startHour, minute: startMin, durationMinutes, startTimeGuessed: false, durationGuessed: false };
        }

        // Single time: "6:30 pm"
        const singleMatch = normalised.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
        if (singleMatch) {
            let hour = parseInt(singleMatch[1], 10);
            const minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
            const period = singleMatch[3].toLowerCase();
            if (period === "pm" && hour !== 12) hour += 12;
            if (period === "am" && hour === 12) hour = 0;
            return { hour, minute, durationMinutes: 120, startTimeGuessed: false, durationGuessed: true };
        }

        // Unparseable time — default to 10am, 2 hours (museum opens at 11am, but programs vary)
        return { hour: 10, minute: 0, durationMinutes: 120, startTimeGuessed: true, durationGuessed: true };
    }
}
