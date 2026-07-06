import { ZonedDateTime, Duration, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const BASE_URL = "https://qabookco.com";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
// Used when the "Time:" field gives only a start time with no end ("6:00pm"),
// which the list page does for most in-store talks/book-club meetings.
const DEFAULT_DURATION_MINUTES = 60;

export interface ParsedEventCard {
    href: string;
    title: string;
    dateText: string;
    timeText: string;
    locationText: string;
    imageUrl?: string;
}

export default class QueenAnneBookCompanyRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const html = parse(await res.text());
        const cards = this.parseEventCards(html);

        const now = ZonedDateTime.now(TIMEZONE);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const card of cards) {
            const results = this.parseCard(card);
            const event = results.find((r): r is RipperCalendarEvent => "date" in r);
            if (event && event.date.isBefore(now)) continue;
            for (const r of results) {
                if ("date" in r) events.push(r);
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

    // Public for testing. Extracts one card per `<article id="event-N"
    // class="event-list">` block on the events listing page. Every field the
    // ripper needs (title, date, time, place) is already printed on this page,
    // so no per-event detail-page fetch is required.
    public parseEventCards(html: HTMLElement): ParsedEventCard[] {
        const cards: ParsedEventCard[] = [];

        for (const article of html.querySelectorAll("article.event-list")) {
            const titleEl = article.querySelector(".event-list__title a");
            const href = titleEl?.getAttribute("href")?.trim();
            const title = titleEl?.text?.trim();
            if (!href || !title) continue;

            const outer = article.toString();
            const dateText = outer.match(/Date:\s*<\/span>\s*([^<]+?)\s*<\/div>/i)?.[1] ?? "";
            const timeText = outer.match(/Time:\s*<\/span>\s*([^<]+?)\s*<\/div>/i)?.[1] ?? "";
            const placeMatch = outer.match(/Place:\s*<\/span>([\s\S]*?)<div class="event-list__links">/i);
            const locationText = placeMatch ? this.cleanText(placeMatch[1]) : "";

            const imgSrc = article.querySelector(".event-list__image img")?.getAttribute("src")?.trim();
            const imageUrl = imgSrc ? this.resolveUrl(imgSrc) : undefined;

            cards.push({ href, title, dateText, timeText, locationText, imageUrl });
        }

        return cards;
    }

    // Public for testing. Returns the event plus, when the "Time:" text left
    // the start or duration uncertain, a paired UncertaintyError with the
    // same event embedded (see docs/event-uncertainty.md).
    public parseCard(card: ParsedEventCard): RipperEvent[] {
        // Detail-page URLs are `/event/YYYY-MM-DD/<slug>` — the slug plus the
        // URL's own date segment give a stable id derived from source content.
        const idMatch = card.href.match(/^\/event\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/?$/);
        if (!idMatch) {
            return [{ type: "ParseError", reason: `Unrecognized event URL: ${card.href}`, context: card.title }];
        }

        const dateMatch = card.dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!dateMatch) {
            return [{ type: "ParseError", reason: `Could not parse date "${card.dateText}"`, context: card.title }];
        }
        const [, monthStr, dayStr, yearStr] = dateMatch;

        const { hour, minute, durationMinutes, startTimeGuessed, durationGuessed } = this.parseTime(card.timeText);

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(
                LocalDateTime.of(parseInt(yearStr, 10), parseInt(monthStr, 10), parseInt(dayStr, 10), hour, minute),
                TIMEZONE
            );
        } catch (err) {
            return [{ type: "ParseError", reason: `Invalid date "${card.dateText}": ${err}`, context: card.title }];
        }

        const event: RipperCalendarEvent = {
            id: `queen-anne-book-company-${idMatch[1]}-${idMatch[2]}`,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes),
            summary: card.title,
            location: card.locationText ? this.normalizeLocation(card.locationText) : undefined,
            url: `${BASE_URL}${card.href}`,
            imageUrl: card.imageUrl,
        };

        const unknownFields: UncertaintyField[] = [];
        if (startTimeGuessed) unknownFields.push("startTime");
        if (durationGuessed) unknownFields.push("duration");
        if (unknownFields.length === 0) return [event];

        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            reason: startTimeGuessed
                ? `Unrecognized time text: "${card.timeText}"`
                : `Time "${card.timeText}" has a start but no end`,
            source: "queen-anne-book-company",
            unknownFields,
            event,
            partialFingerprint: this.fingerprint(card),
        };
        return [event, uncertainty];
    }

    // Public for testing
    public parseTime(timeText: string): { hour: number; minute: number; durationMinutes: number; startTimeGuessed: boolean; durationGuessed: boolean } {
        const normalized = timeText.replace(/–/g, "-").trim();

        const rangeMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
        if (rangeMatch) {
            const [, sh, sm, sp, eh, em, ep] = rangeMatch;
            let startHour = parseInt(sh, 10);
            if (sp.toLowerCase() === "pm" && startHour !== 12) startHour += 12;
            if (sp.toLowerCase() === "am" && startHour === 12) startHour = 0;
            let endHour = parseInt(eh, 10);
            if (ep.toLowerCase() === "pm" && endHour !== 12) endHour += 12;
            if (ep.toLowerCase() === "am" && endHour === 12) endHour = 0;

            const startMin = parseInt(sm, 10);
            const endMin = parseInt(em, 10);
            const rangeMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
            // An end time before the start (e.g. an overnight "10:00pm - 12:30am"
            // this store hasn't printed so far) can't be trusted as a real
            // range — fall back to the guessed-duration default and flag it,
            // rather than silently clamping to a positive-but-wrong duration.
            if (rangeMinutes <= 0) {
                return { hour: startHour, minute: startMin, durationMinutes: DEFAULT_DURATION_MINUTES, startTimeGuessed: false, durationGuessed: true };
            }
            return { hour: startHour, minute: startMin, durationMinutes: rangeMinutes, startTimeGuessed: false, durationGuessed: false };
        }

        const singleMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
        if (singleMatch) {
            const [, h, m, p] = singleMatch;
            let hour = parseInt(h, 10);
            if (p.toLowerCase() === "pm" && hour !== 12) hour += 12;
            if (p.toLowerCase() === "am" && hour === 12) hour = 0;
            return { hour, minute: parseInt(m, 10), durationMinutes: DEFAULT_DURATION_MINUTES, startTimeGuessed: false, durationGuessed: true };
        }

        // Unrecognized time text — publish at a placeholder evening hour (typical
        // for this store's programming) and flag both fields as uncertain.
        return { hour: 18, minute: 0, durationMinutes: DEFAULT_DURATION_MINUTES, startTimeGuessed: true, durationGuessed: true };
    }

    // Public for testing. The printed address never names a city — in-store
    // events carry the full "Seattle, WA <zip>" store address, but off-site
    // partner locations give only a venue/street name plus "United States".
    // Strip that noise and default to Seattle so the geocoder has a usable
    // query instead of a bare venue name.
    public normalizeLocation(raw: string): string {
        const stripped = raw.replace(/,?\s*United States\s*$/i, "").trim();
        return /seattle/i.test(stripped) ? stripped : `${stripped}, Seattle, WA`;
    }

    private resolveUrl(src: string): string {
        if (/^https?:\/\//i.test(src)) return src;
        if (src.startsWith("//")) return `https:${src}`;
        return `${BASE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
    }

    private cleanText(fragment: string): string {
        return decode(
            fragment
                .replace(/<br\s*\/?>/gi, ", ")
                .replace(/<[^>]+>/g, " ")
        )
            .replace(/\s+/g, " ")
            .replace(/\s*,\s*/g, ", ")
            .replace(/(,\s*)+/g, ", ")
            .replace(/^,\s*|,\s*$/g, "")
            .trim();
    }

    // Stable hash of the raw time text, so the uncertainty-cache entry
    // invalidates if the source later adds/changes a start time.
    private fingerprint(card: ParsedEventCard): string {
        const material = `queen-anne-book-company|${card.href}|${card.dateText}|${card.timeText}`;
        let h = 5381;
        for (let i = 0; i < material.length; i++) {
            h = ((h << 5) + h + material.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(16);
    }
}
