import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement } from 'node-html-parser';
import { ZonedDateTime, Duration, LocalDate } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";

// udistrictseattle.com/about/events is a self-managed page listing the
// U District Partnership's signature annual events (Boba Fest, Chow Down,
// Cherry Blossom Festival, Street Fair, ...). It never publishes a start
// time or duration for these — only a date (or date range) and a
// description — so every event is emitted with a placeholder time and
// paired with an UncertaintyError. See docs/event-uncertainty.md.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
const DEFAULT_SINGLE_DAY_DURATION = Duration.ofHours(6);

interface ParsedRange {
    start: LocalDate;
    end: LocalDate;
}

export default class UDistrictPartnershipRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        // Only the first "features view-grid" section (under the "U District
        // Events" heading) holds the dated signature events. A second section
        // further down the page ("Other Events & Performance Venues") reuses
        // the same card markup for a plain venue directory with no dates at
        // all, so we deliberately never select into it.
        const eventsSection = html.querySelectorAll('section.features.view-grid')[0];
        if (!eventsSection) {
            return [{
                type: "ParseError",
                reason: "Could not find the events section (section.features.view-grid) on the page",
                context: undefined,
            }];
        }

        const cards = eventsSection.querySelectorAll('.feature.column');
        for (const card of cards) {
            const titleElement = card.querySelector('h3');
            const title = titleElement?.text.trim();
            if (!title) {
                events.push({
                    type: "ParseError",
                    reason: "Feature card had no title (h3)",
                    context: card.outerHTML.substring(0, 200),
                });
                continue;
            }

            const contentDiv = card.querySelector('.feature-text .content');
            const dateElement = contentDiv?.querySelector('strong');
            const dateText = dateElement?.text.trim();
            if (!dateText) {
                events.push({
                    type: "ParseError",
                    reason: "Could not find date text (first <strong>)",
                    context: title,
                });
                continue;
            }

            const range = parseDateRange(dateText);
            if (!range) {
                events.push({
                    type: "ParseError",
                    reason: `Date not yet announced or unparseable: "${dateText}"`,
                    context: title,
                });
                continue;
            }

            const description = extractDescription(contentDiv!);
            const url = extractUrl(contentDiv!);
            const imageUrl = card.querySelector('.feature-thumb img')?.getAttribute('src')?.trim() || undefined;

            // Span from the placeholder noon start on day one through the
            // placeholder length on the last day (e.g. a 2-day range noon
            // day 1 -> 6pm day 2), rather than a full extra day tacked on
            // past the announced end date.
            const spanDays = range.end.toEpochDay() - range.start.toEpochDay();
            const eventDate = ZonedDateTime.of(
                range.start.year(), range.start.monthValue(), range.start.dayOfMonth(),
                DEFAULT_UNKNOWN_TIME_HOUR, DEFAULT_UNKNOWN_TIME_MINUTE, 0, 0, date.zone(),
            );
            const duration = Duration.ofDays(spanDays).plus(DEFAULT_SINGLE_DAY_DURATION);

            const eventId = generateEventId(title, range.start);
            if (this.seenEvents.has(eventId)) continue;
            this.seenEvents.add(eventId);

            const event: RipperCalendarEvent = {
                id: eventId,
                ripped: new Date(),
                date: eventDate,
                duration,
                summary: title,
                description,
                location: "University District, Seattle, WA",
                url,
                imageUrl,
            };
            events.push(event);

            const unknownFields: UncertaintyField[] = ["startTime", "duration"];
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: `udistrictseattle.com events page did not include a start time (raw date: "${dateText}")`,
                source: "u-district-partnership",
                unknownFields,
                event,
                partialFingerprint: `${title}-${range.start.toString()}-${range.end.toString()}`,
            };
            events.push(uncertainty);
        }

        return events;
    }
}

// Pull the plain-text description paragraphs from a card's `.content` div,
// excluding the paragraph that holds the date `<strong>` (identified
// structurally, not by comparing text, so a future date line with
// surrounding text like "Date: <strong>...</strong>" still gets excluded)
// and the "Learn More" button.
function extractDescription(contentDiv: HTMLElement): string {
    const paragraphs = contentDiv.querySelectorAll('p')
        .filter(p => !p.querySelector('strong') && !p.querySelector('a.button'))
        .map(p => p.text.trim())
        .filter(text => text.length > 0);
    return paragraphs.join('\n\n');
}

// The "Learn More" button links to the event's own subpage on
// udistrictseattle.com.
function extractUrl(contentDiv: HTMLElement): string | undefined {
    const button = contentDiv.querySelector('a.button');
    const href = button?.getAttribute('href')?.trim();
    return href || undefined;
}

const monthMap: { [key: string]: number } = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12,
};
const weekdayNames = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b,?\s*/g;

// Parses the date text of a feature card into a day range. Handles:
//   "August 1, 2026"                                  — single day
//   "Saturday May 15 & Sunday, May 16, 2027"           — two-day range
// Returns null for anything without a resolvable day (e.g. "Spring 2027").
function parseDateRange(rawDateText: string): ParsedRange | null {
    const dateText = rawDateText.replace(weekdayNames, '').replace(/\s+/g, ' ').trim();

    // "Month Day1 & [Month] Day2, Year" — a multi-day range spelled out as
    // two dates joined by "&" (the second month is optional; when omitted,
    // both days share the first month).
    const rangeMatch = dateText.match(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*&\s*(?:(January|February|March|April|May|June|July|August|September|October|November|December)\s+)?(\d{1,2}),?\s+(\d{4})/
    );
    if (rangeMatch) {
        const month1 = monthMap[rangeMatch[1]];
        const day1 = parseInt(rangeMatch[2], 10);
        const month2 = rangeMatch[3] ? monthMap[rangeMatch[3]] : month1;
        const day2 = parseInt(rangeMatch[4], 10);
        const year = parseInt(rangeMatch[5], 10);
        const start = LocalDate.of(year, month1, day1);
        const end = LocalDate.of(year, month2, day2);
        return end.isBefore(start) ? { start: end, end: start } : { start, end };
    }

    // Single day: "Month Day, Year"
    const singleMatch = dateText.match(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/
    );
    if (singleMatch) {
        const month = monthMap[singleMatch[1]];
        const day = parseInt(singleMatch[2], 10);
        const year = parseInt(singleMatch[3], 10);
        const d = LocalDate.of(year, month, day);
        return { start: d, end: d };
    }

    return null;
}

// Stable id from source content only: title slug + start date.
function generateEventId(title: string, startDate: LocalDate): string {
    const titleSlug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `${titleSlug}-${startDate.toString()}`;
}
