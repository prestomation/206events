import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyField } from "../../lib/config/schema.js";
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

const BASE_URL = "https://arcseattle.org";
const EVENTS_URL = `${BASE_URL}/events/`;
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const SOURCE = "arc-seattle";

const MONTHS: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4,
    May: 5, June: 6, July: 7, August: 8,
    September: 9, October: 10, November: 11, December: 12,
};

export interface ParsedEventCard {
    href: string;
    title: string;
    dateText: string;
    description: string;
    imageUrl?: string;
}

export interface ParsedSession {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    location: string;
}

export default class ArcSeattleRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const res = await fetch(EVENTS_URL, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" }
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const html = parse(await res.text());
        const cards = this.parseEventCards(html);

        const eventResults = await Promise.all(
            cards.map(card => this.fetchAndParseEvent(card))
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

    // The /events/ landing page lists each event as a
    // `div.wp-block-group.is-vertical` containing a `h3.wp-block-heading`
    // whose leading `<mark>` holds the date (or a vague placeholder like
    // "Annually in August"), a description paragraph, and a button linking
    // to the event's own detail page.
    public parseEventCards(html: HTMLElement): ParsedEventCard[] {
        const cards: ParsedEventCard[] = [];
        const groups = html.querySelectorAll("div.wp-block-group.is-vertical");

        for (const group of groups) {
            const heading = group.querySelector("h3.wp-block-heading");
            if (!heading) continue;

            const mark = heading.querySelector("mark");
            if (!mark) continue;

            const markText = mark.text.trim();
            const fullText = heading.text;
            const title = (fullText.startsWith(mark.text) ? fullText.slice(mark.text.length) : fullText.replace(mark.text, "")).trim();
            if (!title) continue;

            const link = group.querySelector(".wp-block-button a");
            const href = link?.getAttribute("href")?.trim();
            // Skip cards that link off-site (e.g. the "Other Events" card
            // pointing at seattle.gov) — those aren't ARC's own events.
            if (!href || !href.startsWith(`${BASE_URL}/events/`)) continue;

            const description = group.querySelector("p.wp-block-paragraph")?.text?.trim() || "";
            const rawImg = group.querySelector("figure img")?.getAttribute("data-src")?.trim();

            cards.push({ href, title, dateText: markText, description, imageUrl: rawImg || undefined });
        }

        return cards;
    }

    private async fetchAndParseEvent(card: ParsedEventCard): Promise<RipperEvent[]> {
        try {
            const res = await fetch(card.href, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" }
            });
            if (!res.ok) {
                return [{
                    type: "ParseError" as const,
                    reason: `HTTP ${res.status} fetching event ${card.href}`,
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
        // Multi-session events (e.g. Street Hockey Clinics) list each
        // occurrence's own date/time/location — prefer those over the
        // single summary date on the listing card.
        const sessions = this.parseSessions(html);
        if (sessions.length > 0) {
            return sessions.map((session, i) => this.buildSessionEvent(card, session, canonicalUrl, i));
        }

        const parsedDate = this.parseSingleDate(card.dateText);
        if (!parsedDate) {
            // Vague/recurring placeholder text ("Annually in August", "Spring
            // 2026") isn't a concrete future date yet — not a parse failure,
            // just nothing to publish until ARC posts a specific date.
            return [];
        }

        return this.buildSingleEvent(card, parsedDate, html, canonicalUrl);
    }

    // Looks for "Saturday, October 17th, 2026:"-style paragraphs followed by
    // a `<ul>` of "10 a.m. – Venue Name" list items.
    public parseSessions(html: HTMLElement): ParsedSession[] {
        const sessions: ParsedSession[] = [];
        const dateHeaderRe = /^(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4}):?$/;
        const sessionRe = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*[-–]\s*(.+)$/i;

        for (const p of html.querySelectorAll("p.wp-block-paragraph")) {
            const headerMatch = p.text.trim().match(dateHeaderRe);
            if (!headerMatch) continue;

            const month = MONTHS[headerMatch[1]];
            if (!month) continue;
            const day = parseInt(headerMatch[2], 10);
            const year = parseInt(headerMatch[3], 10);

            let sibling = p.nextElementSibling;
            while (sibling && sibling.tagName?.toLowerCase() !== "ul") {
                sibling = sibling.nextElementSibling;
            }
            if (!sibling) continue;

            for (const li of sibling.querySelectorAll("li")) {
                const liMatch = li.text.replace(/–/g, "-").trim().match(sessionRe);
                if (!liMatch) continue;

                let hour = parseInt(liMatch[1], 10);
                const minute = liMatch[2] ? parseInt(liMatch[2], 10) : 0;
                const period = liMatch[3].toLowerCase();
                if (period === "p" && hour !== 12) hour += 12;
                if (period === "a" && hour === 12) hour = 0;

                sessions.push({ year, month, day, hour, minute, location: liMatch[4].trim() });
            }
        }

        return sessions;
    }

    // "August 21st, 2027" / "December 12th, 2026" — a single concrete date
    // with no day-of-week prefix (that form is only used on the listing
    // card, not the detail-page session headers).
    public parseSingleDate(dateText: string): { year: number; month: number; day: number } | null {
        const match = dateText.match(/^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/);
        if (!match) return null;

        const month = MONTHS[match[1]];
        if (!month) return null;

        return { year: parseInt(match[3], 10), month, day: parseInt(match[2], 10) };
    }

    private buildSessionEvent(card: ParsedEventCard, session: ParsedSession, canonicalUrl: string, index: number): RipperCalendarEvent {
        const slug = card.href.replace(/\/$/, "").split("/").pop() || card.title;
        const dateStamp = `${session.year}${String(session.month).padStart(2, "0")}${String(session.day).padStart(2, "0")}`;
        const timeStamp = `${String(session.hour).padStart(2, "0")}${String(session.minute).padStart(2, "0")}`;

        return {
            id: `arc-seattle-${slug}-${dateStamp}-${timeStamp}`,
            ripped: new Date(),
            date: ZonedDateTime.of(LocalDateTime.of(session.year, session.month, session.day, session.hour, session.minute), TIMEZONE),
            duration: Duration.ofHours(2),
            summary: index === 0 ? card.title : `${card.title} — ${session.location}`,
            description: card.description,
            location: `${session.location}, Seattle, WA`,
            url: canonicalUrl,
            imageUrl: card.imageUrl,
            cost: { min: 0 },
        };
    }

    // Single-occurrence events (Big Day of Play, Pathway of Lights) publish
    // a date but no explicit time on the page — derive a best-guess location
    // from the detail page's own `<title>` ("Name | Venue" or "Name | ... at
    // Venue") and flag the guessed time as uncertain rather than presenting
    // it as fact.
    private buildSingleEvent(card: ParsedEventCard, date: { year: number; month: number; day: number }, html: HTMLElement, canonicalUrl: string): RipperEvent[] {
        const location = this.extractLocation(html);
        const defaultHour = 11;
        const defaultMinute = 0;

        const event: RipperCalendarEvent = {
            id: `arc-seattle-${card.href.replace(/\/$/, "").split("/").pop() || card.title}`,
            ripped: new Date(),
            date: ZonedDateTime.of(LocalDateTime.of(date.year, date.month, date.day, defaultHour, defaultMinute), TIMEZONE),
            duration: Duration.ofHours(3),
            summary: card.title,
            description: card.description,
            location: location ? `${location}, Seattle, WA` : undefined,
            url: canonicalUrl,
            imageUrl: card.imageUrl,
            cost: { min: 0 },
        };

        const unknownFields: UncertaintyField[] = ["startTime", "duration"];
        return [event, {
            type: "Uncertainty",
            reason: `No specific start time published on the page — only a date ("${card.dateText}")`,
            source: SOURCE,
            unknownFields,
            event,
            partialFingerprint: simpleHash(`${card.dateText}|${card.description}`),
        }];
    }

    public extractLocation(html: HTMLElement): string | undefined {
        const title = html.querySelector("title")?.text?.trim();
        if (!title || !title.includes("|")) return undefined;

        const afterPipe = title.split("|").slice(1).join("|").trim();
        const atMatch = afterPipe.match(/\bat\s+(.+)$/i);
        return (atMatch ? atMatch[1] : afterPipe).trim() || undefined;
    }
}
