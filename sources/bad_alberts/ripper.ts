import { ChronoUnit, DateTimeFormatter, Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const LOCATION = "Bad Albert's Tap & Grill, 5100 Ballard Avenue NW, Seattle, WA 98107";
const EVENTS_URL = "https://badalberts.com/-events";
const DEFAULT_ZONE = ZoneId.of("America/Los_Angeles");
const DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

/**
 * Bad Albert's runs on the "Spot" bar-events widget: each event is a
 * `<section id="...">` carrying an "add to calendar" block with machine
 * readable `.atc_*` vars (date_start/date_end/timezone/title/description) —
 * no free-text date parsing needed.
 */
export default class BadAlbertsRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const results: RipperEvent[] = [];
        const sections = html.querySelectorAll("section[id]");

        for (const section of sections) {
            const id = section.getAttribute("id");
            if (!id || this.seenEvents.has(id)) continue;
            this.seenEvents.add(id);

            const startText = section.querySelector(".atc_date_start")?.textContent.trim();
            const title = section.querySelector(".atc_title")?.textContent.trim();
            if (!startText || !title) {
                results.push({ type: "ParseError", reason: "Missing atc_date_start or atc_title in event section", context: id });
                continue;
            }

            let start: LocalDateTime;
            try {
                start = LocalDateTime.parse(startText, DATE_FORMAT);
            } catch (e) {
                results.push({ type: "ParseError", reason: `Could not parse atc_date_start "${startText}": ${e}`, context: id });
                continue;
            }

            const tzText = section.querySelector(".atc_timezone")?.textContent.trim();
            let zone = DEFAULT_ZONE;
            if (tzText) {
                try {
                    zone = ZoneId.of(tzText);
                } catch (e) {
                    results.push({ type: "ParseError", reason: `Unrecognized atc_timezone "${tzText}": ${e}`, context: id });
                    continue;
                }
            }

            const duration = this.parseDuration(start, section.querySelector(".atc_date_end")?.textContent.trim());
            const description = this.parseDescription(section);

            const event: RipperCalendarEvent = {
                id: `bad-alberts-${id}`,
                ripped: new Date(),
                date: ZonedDateTime.of(start, zone),
                duration,
                summary: title,
                description: description || undefined,
                location: LOCATION,
                url: EVENTS_URL,
            };

            results.push(event);
        }

        return results;
    }

    // The widget doesn't roll the end date past midnight for overnight
    // events (e.g. karaoke "8:00 PM - 12:00 AM" is encoded as the same
    // calendar date at 00:00) — treat an end at or before the start as
    // falling on the next day. Falls back to a 2-hour default when the
    // end text is missing or unparsable.
    private parseDuration(start: LocalDateTime, endText: string | undefined): Duration {
        const DEFAULT_DURATION = Duration.ofHours(2);
        if (!endText) return DEFAULT_DURATION;

        let end: LocalDateTime;
        try {
            end = LocalDateTime.parse(endText, DATE_FORMAT);
        } catch (e) {
            return DEFAULT_DURATION;
        }

        if (!end.isAfter(start)) end = end.plusDays(1);
        const seconds = start.until(end, ChronoUnit.SECONDS);
        return Duration.ofSeconds(seconds);
    }

    // The `.event-info-text` paragraphs are the source's own separately-styled
    // blurb copy; the widget's `.atc_description` var glues the title and every
    // paragraph together with no whitespace, so prefer the paragraphs and only
    // fall back to it when a section has none.
    private parseDescription(section: HTMLElement): string | undefined {
        const paragraphs = section.querySelectorAll(".event-info-text p")
            .map(p => p.textContent.trim())
            .filter(Boolean);
        if (paragraphs.length) return paragraphs.join("\n\n");
        return section.querySelector(".atc_description")?.textContent.trim() || undefined;
    }
}
