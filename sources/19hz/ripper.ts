import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { EventCost, Ripper, RipperCalendar, RipperCalendarEvent, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { HTMLElement } from 'node-html-parser';
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";

import '@js-joda/timezone';

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * Parses a time string like "6pm", "6:30pm", "10am" into hours and minutes.
 * Returns null if parsing fails.
 */
function parseTimeComponent(raw: string): { hour: number; minute: number } | null {
    const m = raw.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3].toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return { hour, minute };
}

/**
 * Parses a 19hz.info time cell like "Thu: Feb 19 (6:30pm-9:30pm)" or "(8pm)".
 * Returns start hour/minute, duration in minutes, and flags describing which
 * fields were guessed (so the caller can pair the event with an
 * UncertaintyError). Defaults to 8 pm / 3 hours when the cell is unrecognised
 * — both start time and duration are flagged as uncertain in that case.
 */
export function parseTimeCell(text: string): {
    hour: number;
    minute: number;
    durationMinutes: number;
    startTimeGuessed: boolean;
    durationGuessed: boolean;
} {
    // Match "(start-end)" or "(start)"
    const rangeMatch = text.match(/\((\d{1,2}(?::\d{2})?(?:am|pm))-(\d{1,2}(?::\d{2})?(?:am|pm))\)/i);
    if (rangeMatch) {
        const start = parseTimeComponent(rangeMatch[1]);
        const end = parseTimeComponent(rangeMatch[2]);
        if (start && end) {
            const startMins = start.hour * 60 + start.minute;
            let endMins = end.hour * 60 + end.minute;
            // Handle events crossing midnight (use < to avoid treating equal start/end as 24h)
            if (endMins < startMins) endMins += 24 * 60;
            return {
                hour: start.hour, minute: start.minute,
                durationMinutes: endMins - startMins,
                startTimeGuessed: false, durationGuessed: false,
            };
        }
    }

    // Single time: "(8pm)"
    const singleMatch = text.match(/\((\d{1,2}(?::\d{2})?(?:am|pm))\)/i);
    if (singleMatch) {
        const start = parseTimeComponent(singleMatch[1]);
        if (start) {
            return {
                hour: start.hour, minute: start.minute,
                durationMinutes: 180,
                startTimeGuessed: false, durationGuessed: true,
            };
        }
    }

    // Default: 8pm, 3 hours
    return {
        hour: 20, minute: 0, durationMinutes: 180,
        startTimeGuessed: true, durationGuessed: true,
    };
}

/**
 * Parses a 19hz price cell like "free | 21+", "$26+ | 21+", "$15-25 | 21+", "21+".
 * Returns an EventCost when price information is present, undefined otherwise.
 */
export function parsePriceCell(raw: string): EventCost | undefined {
    const pricePart = raw.split('|')[0].trim().toLowerCase();
    if (!pricePart) return undefined;

    if (/^free/.test(pricePart)) return { min: 0 };

    // "for members" / "member" discount only — no general-admission price visible
    if (pricePart.includes('member')) return { paid: true };

    // "$X-Y" range (e.g., "$15-25")
    const rangeMatch = pricePart.match(/^\$(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
    if (rangeMatch) {
        const min = parseFloat(rangeMatch[1]);
        const max = parseFloat(rangeMatch[2]);
        return { min, ...(max > min ? { max } : {}) };
    }

    // "$X+" floor price (e.g., "$26+", "$18+")
    const floorMatch = pricePart.match(/^\$(\d+(?:\.\d+)?)\+/);
    if (floorMatch) return { min: parseFloat(floorMatch[1]) };

    // "$X" exact or "$X some text" (e.g., "$42", "$10 before 10")
    const exactMatch = pricePart.match(/^\$(\d+(?:\.\d+)?)/);
    if (exactMatch) return { min: parseFloat(exactMatch[1]) };

    // Has $ somewhere but in an unrecognised format
    if (pricePart.includes('$')) return { paid: true };

    // Just "21+" or other non-price text — no cost info available
    return undefined;
}

/**
 * Given the links column cell and an optional event URL, returns the first
 * Instagram post or reel URL found, or null if none. Instagram profile links
 * (no /p/ or /reel/ segment) are ignored.
 */
export function extractInstagramPostUrl(
    linksCell: HTMLElement | null,
    eventUrl: string | undefined,
): string | null {
    const instagramPattern = /instagram\.com\/(p|reel)\//;
    if (linksCell) {
        for (const a of linksCell.querySelectorAll('a')) {
            const href = a.getAttribute('href') ?? '';
            if (instagramPattern.test(href)) return href;
        }
    }
    if (eventUrl && instagramPattern.test(eventUrl)) return eventUrl;
    return null;
}

/**
 * Attempts to retrieve the og:image URL from an Instagram post by fetching its
 * embed endpoint — served without JS and more reliably accessible than the main
 * post page. Returns null on any failure (blocked fetch, missing og:image,
 * network error) so the caller can skip gracefully.
 */
export async function fetchInstagramOgImage(
    fetchFn: FetchFn,
    postUrl: string,
): Promise<string | null> {
    const base = postUrl.replace(/\/+$/, '');
    const embedUrl = `${base}/embed/`;
    try {
        const res = await fetchFn(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        if (!res.ok) return null;
        const html = await res.text();
        const m =
            html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ??
            html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
        if (!m) return null;
        return m[1].replace(/&amp;/g, '&');
    } catch {
        return null;
    }
}

export default class Hz19Ripper extends HTMLRipper {
    private seenEvents = new Set<string>();
    private readonly timezone = ZoneId.of('America/Los_Angeles');
    // Populated during parseEvents; consumed in the rip() post-processing pass.
    private readonly instagramLinks = new Map<string, string>();

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.instagramLinks.clear();
        const calendars = await super.rip(ripper);

        // Best-effort: try to fetch og:image from Instagram post/reel embeds.
        // Instagram frequently blocks headless fetches from CI; any failure is
        // silently skipped so the build never fails on a missing image.
        if (this.instagramLinks.size > 0) {
            const igFetch = getFetchForConfig({ proxy: false });
            for (const calendar of calendars) {
                for (const event of calendar.events) {
                    if (event.imageUrl || !event.id) continue;
                    const igUrl = this.instagramLinks.get(event.id);
                    if (!igUrl) continue;
                    const imageUrl = await fetchInstagramOgImage(igFetch, igUrl);
                    if (imageUrl) event.imageUrl = imageUrl;
                }
            }
        }

        return calendars;
    }

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const rows = html.querySelectorAll('tr');

        for (const row of rows) {
            const cells = row.querySelectorAll('td');

            // Event rows have 7 cells: datetime, event+venue, genre, price, promoter, fb, date
            if (cells.length < 7) continue;

            // Machine-readable date is in the last cell
            const dateDiv = cells[cells.length - 1].querySelector('.shrink');
            if (!dateDiv) continue;

            const dateStr = dateDiv.text?.trim() ?? ''; // "2026/02/19"
            if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) continue;

            const [year, month, day] = dateStr.split('/').map(Number);

            // Event link is in cells[1]
            const link = cells[1].querySelector('a');
            if (!link) continue;

            const title = link.text?.trim() ?? '';
            if (!title) continue;

            const eventUrl = link.getAttribute('href') || undefined;

            // Deduplicate by date + title
            const eventId = `19hz-${dateStr}-${title}`;
            if (this.seenEvents.has(eventId)) continue;
            this.seenEvents.add(eventId);

            // Record any Instagram post/reel link for image backfill in rip().
            // Prefer the links column (cells[5]); fall back to the event URL itself.
            const igUrl = extractInstagramPostUrl(cells[5], eventUrl);
            if (igUrl) this.instagramLinks.set(eventId, igUrl);

            // Parse time from cells[0]
            const timeText = cells[0]?.text ?? '';
            const { hour, minute, durationMinutes, startTimeGuessed, durationGuessed } = parseTimeCell(timeText);

            // Parse price from cells[3]
            const priceText = cells[3]?.text ?? '';
            const cost = parsePriceCell(priceText);

            // Venue: text in cells[1] after the link, before the city in parentheses
            const eventCellText = cells[1]?.text ?? '';
            const atIdx = eventCellText.indexOf(' @ ');
            let location: string | undefined;
            if (atIdx >= 0) {
                const venueAndCity = eventCellText.substring(atIdx + 3);
                // Remove " (Seattle, WA)" or similar trailing city
                const cityIdx = venueAndCity.lastIndexOf(' (');
                location = cityIdx >= 0 ? venueAndCity.substring(0, cityIdx).trim() : venueAndCity.trim();
            }

            try {
                const eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, hour, minute),
                    this.timezone
                );

                const event: RipperCalendarEvent = {
                    id: eventId,
                    ripped: new Date(),
                    date: eventDate,
                    duration: Duration.ofMinutes(durationMinutes),
                    summary: title,
                    location,
                    url: eventUrl,
                    ...(cost ? { cost } : {}),
                };

                events.push(event);

                const costUnknown = cost === undefined;
                if (startTimeGuessed || durationGuessed) {
                    const unknownFields: UncertaintyField[] = startTimeGuessed
                        ? ["startTime", "duration"]
                        : ["duration"];
                    if (costUnknown) unknownFields.push("cost");
                    events.push({
                        type: "Uncertainty",
                        reason: startTimeGuessed
                            ? `19hz time cell unrecognised: "${timeText}"`
                            : "19hz listing has a start time but no end time",
                        source: "19hz",
                        unknownFields,
                        event,
                        partialFingerprint: simpleHash(timeText),
                    });
                } else if (costUnknown) {
                    events.push({
                        type: "Uncertainty",
                        reason: `19hz price cell has no general-admission price: "${priceText}"`,
                        source: "19hz",
                        unknownFields: ["cost"],
                        event,
                        partialFingerprint: simpleHash(priceText),
                    });
                }
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event "${title}": ${error}`,
                    context: dateStr,
                });
            }
        }

        return events;
    }
}
