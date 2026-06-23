import { Duration, LocalDate, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of("America/Los_Angeles");

// Default start time used when the listing page doesn't show event times.
// SAL events are typically evening programs — the uncertainty system surfaces
// these gaps so the resolver can fill in the real time per-event.
const DEFAULT_HOUR = 19;
const DEFAULT_MINUTE = 30;
const DEFAULT_DURATION = Duration.ofHours(2);

// Maps "january-2026" → { month: 1, year: 2026 }
function parseMonthKey(key: string): { month: number; year: number } | null {
    const monthNames: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4,
        may: 5, june: 6, july: 7, august: 8,
        september: 9, october: 10, november: 11, december: 12,
    };
    const parts = key.split("-");
    if (parts.length !== 2) return null;
    const month = monthNames[parts[0].toLowerCase()];
    const year = parseInt(parts[1]);
    if (!month || isNaN(year)) return null;
    return { month, year };
}

function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * Parse events from the lectures.org/events/ HTML page.
 * Each event card has a `data-in-month="month-year"` attribute giving
 * the month and year, and a `<span class="short-date">DOW DD</span>` giving
 * the day of the month.
 */
export function parseEventsFromHtml(html: HTMLElement): RipperEvent[] {
    const events: RipperEvent[] = [];

    // querySelectorAll with compound classes can be finicky; use a broader
    // selector and filter manually to stay compatible with node-html-parser.
    const allItems = html.querySelectorAll(".grid-item");

    for (const item of allItems) {
        const classList = item.classNames;
        if (!classList.includes("event")) continue;
        if (classList.includes("grid-header") || classList.includes("grid-separator")) continue;

        const monthKey = item.getAttribute("data-in-month");
        if (!monthKey) continue;

        const parsedMonth = parseMonthKey(monthKey);
        if (!parsedMonth) {
            events.push({
                type: "ParseError",
                reason: `Could not parse data-in-month: "${monthKey}"`,
                context: undefined,
            });
            continue;
        }

        // Day number from short-date span ("TUE 23" → 23)
        const shortDateEl = item.querySelector(".short-date");
        const shortDateText = shortDateEl?.textContent.trim() ?? "";
        const dayMatch = shortDateText.match(/\d+/);
        if (!dayMatch) {
            events.push({
                type: "ParseError",
                reason: `Could not parse day from short-date: "${shortDateText}"`,
                context: monthKey,
            });
            continue;
        }
        const day = parseInt(dayMatch[0]);

        // Title from h3.event-title
        const titleEl = item.querySelector(".event-title");
        if (!titleEl) {
            events.push({
                type: "ParseError",
                reason: "No .event-title element found",
                context: monthKey,
            });
            continue;
        }
        const summary = titleEl.textContent.replace(/ /g, " ").trim();
        if (!summary) { events.push({ type: "ParseError", reason: "Empty event title", context: monthKey }); continue; }

        // URL from the primary anchor (first href to /event/)
        const linkEl = item.querySelector("a[href*='/event/']");
        const url = linkEl?.getAttribute("href") ?? undefined;

        // Series name (e.g. "Literary Arts Series", "Next Gen")
        const seriesEl = item.querySelector(".series-name");
        const series = seriesEl?.textContent.trim();

        // Image from lazy-loaded img
        const imgEl = item.querySelector("img[data-src]");
        const imageUrl = imgEl?.getAttribute("data-src") ?? undefined;

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(
                LocalDate.of(parsedMonth.year, parsedMonth.month, day).atTime(DEFAULT_HOUR, DEFAULT_MINUTE),
                TIMEZONE,
            );
        } catch {
            events.push({
                type: "ParseError",
                reason: `Invalid date: ${parsedMonth.year}-${parsedMonth.month}-${day}`,
                context: summary,
            });
            continue;
        }

        const id = `sal-${monthKey}-${day}-${simpleHash(summary)}`;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration: DEFAULT_DURATION,
            summary: series ? `${summary} — ${series}` : summary,
            location: "Seattle, WA",
            url,
            imageUrl,
            cost: { min: 0 },
        };

        events.push(event);

        // Time is not available from the listing page — emit an UncertaintyError
        // so the resolver can look up the real start time on the event page.
        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            reason: `Start time not available on listing page for "${summary}"`,
            source: "seattle_arts_lectures",
            unknownFields: ["startTime"],
            event,
            partialFingerprint: simpleHash(`${monthKey}-${day}-${summary}`),
        };
        events.push(uncertainty);
    }

    return events;
}

export default class SeattleArtsLecturesRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn: FetchFn = getFetchForConfig(ripper.config);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const htmlStr = await res.text();
        const doc = parse(htmlStr);
        const allEvents = parseEventsFromHtml(doc);

        const cal = ripper.config.calendars[0];
        if (!cal) {
            throw new Error("No calendars configured for seattle-arts-lectures ripper");
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: allEvents.filter(e => "type" in e) as RipperError[],
            parent: ripper.config,
            tags: cal.tags || [],
        }];
    }
}
