import { Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const BASE_URL = "https://nwtrailruns.com";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
// No end time is published on the source page (registration/results are
// handled off-site via WebScorer) — a typical Saturday-morning trail race
// wraps up well within a couple hours of its start.
const DEFAULT_DURATION = Duration.ofHours(2);

export function parseDateDiv(text: string): { year: number; month: number; day: number } | null {
    const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return { month: parseInt(m[1], 10), day: parseInt(m[2], 10), year: parseInt(m[3], 10) };
}

export function parseTimeText(text: string): { hour: number; minute: number } | null {
    const m = text.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const period = m[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return { hour, minute };
}

// Pulls the plain text of every heading (h1-h4) inside the event's content
// block, in document order. The page template puts distance, date, start
// time, and location in headings before the first descriptive paragraph,
// but which heading level (h1 vs h3 vs h4) each one uses varies per event
// page — so callers match by content (a time pattern, a ", WA" location)
// rather than by position or tag name.
//
// Only headings before the first <p>/<hr> are considered — that's where the
// template puts the distance/date/time/location quartet; the real prose
// (and any further re-use of h1-h4 deeper in the article, e.g. the "SERIES
// SWAG"/"SERIES COMPETITION" headings on some pages) lives after it. This
// avoids needing an arbitrary heading-count cap.
export function extractContentHeadings(contentHtml: string): string[] {
    const boundary = contentHtml.search(/<(p|hr)[\s>]/i);
    const relevantHtml = boundary === -1 ? contentHtml : contentHtml.slice(0, boundary);

    const headings: string[] = [];
    const re = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(relevantHtml)) !== null) {
        // Parse each heading's inner markup so entities (curly quotes,
        // ampersands, etc.) decode the same way node-html-parser's own
        // `.text` getter decodes them elsewhere in this file, rather than
        // hand-rolling a partial entity table.
        const text = parse(m[1]).text.trim();
        if (text) headings.push(text);
    }
    return headings;
}

export function parseEventPage(slug: string, html: HTMLElement, url: string): RipperCalendarEvent | RipperError {
    const title = html.querySelector("h1.entry-title")?.text?.trim();
    if (!title) {
        return { type: "ParseError", reason: "No title (h1.entry-title) found for event page", context: slug };
    }

    const dateDivText = html.querySelector(".date")?.text?.trim();
    if (!dateDivText) {
        return { type: "ParseError", reason: `No .date element found for event: ${title}`, context: slug };
    }
    const parsedDate = parseDateDiv(dateDivText);
    if (!parsedDate) {
        return { type: "ParseError", reason: `Could not parse date "${dateDivText}" for event: ${title}`, context: slug };
    }

    const contentEl = html.querySelector(".the-content");
    if (!contentEl) {
        return { type: "ParseError", reason: `No .the-content element found for event: ${title}`, context: slug };
    }
    const headings = extractContentHeadings(contentEl.innerHTML ?? "");
    const timeHeading = headings.find(h => /\d{1,2}:\d{2}\s*[ap]m/i.test(h));
    const locationHeading = headings.find(h => /,\s*WA\b/.test(h));

    if (!locationHeading) {
        return { type: "ParseError", reason: `No location heading (ending ", WA") found for event: ${title}`, context: slug };
    }

    const parsedTime = timeHeading ? parseTimeText(timeHeading) : null;
    // Every event observed so far publishes a start time; fall back to a
    // typical trail-race start rather than dropping the event if a future
    // page ever omits it.
    const hour = parsedTime?.hour ?? 9;
    const minute = parsedTime?.minute ?? 0;

    let date: ZonedDateTime;
    try {
        date = ZonedDateTime.of(
            LocalDateTime.of(parsedDate.year, parsedDate.month, parsedDate.day, hour, minute),
            TIMEZONE
        );
    } catch (error) {
        return { type: "ParseError", reason: `Invalid date for event "${title}": ${error}`, context: slug };
    }

    const description = contentEl.querySelector("p")?.text?.trim() || undefined;
    const imgSrc = html.querySelector(".the-image img")?.getAttribute("src")?.trim();
    const localDateStr = LocalDate.of(parsedDate.year, parsedDate.month, parsedDate.day).toString();

    return {
        id: `${slug}-${localDateStr}`,
        ripped: new Date(),
        date,
        duration: DEFAULT_DURATION,
        summary: title,
        description,
        location: locationHeading,
        url,
        ...(imgSrc ? { imageUrl: imgSrc } : {}),
    };
}

export default class NorthwestTrailRunsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        if (!calConfig) throw new Error("No calendars configured");

        const eventSlugs = (calConfig.config as { eventSlugs?: unknown } | undefined)?.eventSlugs;
        if (!Array.isArray(eventSlugs) || eventSlugs.length === 0 || !eventSlugs.every((s): s is string => typeof s === "string")) {
            throw new Error(`calendar "${calConfig.name}" config.eventSlugs must be a non-empty string[]`);
        }

        const results: RipperEvent[] = [];
        for (const slug of eventSlugs) {
            const url = `${BASE_URL}/events/${slug}/`;
            try {
                const res = await fetchFn(url, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
                });
                if (!res.ok) {
                    results.push({ type: "ParseError", reason: `HTTP ${res.status} fetching event ${url}`, context: slug });
                    continue;
                }
                const html = parse(await res.text());
                results.push(parseEventPage(slug, html, url));
            } catch (error) {
                results.push({ type: "ParseError", reason: `Error fetching event ${slug}: ${error}`, context: slug });
            }
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => "date" in e),
            errors: results.filter((e): e is RipperError => "type" in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
