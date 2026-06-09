import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const BASE_URL = "https://www.museumofflight.org";
const AJAX_PATH = "/CMSAjax/CalendarListing";
const MUSEUM_ADDRESS = "Museum of Flight, 9404 E. Marginal Way S, Seattle, WA 98108";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const MAX_PAGES = 20;

// Stable hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

function makeId(title: string, date: LocalDate, suffix?: string): string {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `mof-${slug}-${date.toString()}${suffix ?? ''}`;
}

// Parse a date string like "11 Jun 2026" or "02 Jul 2026".
function parseHeaderDate(text: string): LocalDate | null {
    const m = text.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!m) return null;
    const MONTHS: Record<string, number> = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
        Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };
    const month = MONTHS[m[2].substring(0, 3)];
    if (!month) return null;
    try {
        return LocalDate.of(parseInt(m[3], 10), month, parseInt(m[1], 10));
    } catch {
        return null;
    }
}

// Convert "H:MM AM/PM" into { hour, minute } in 24h.
// Returns null if unparseable.
function parseTime12(s: string): { hour: number; minute: number } | null {
    const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const period = m[3]?.toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
}

// Format 24h time as 4-digit slot suffix, e.g. 10:30 → "-1030".
function makeSlotSuffix(hour: number, minute: number): string {
    return `-${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
}

export interface ParsedTime {
    slots: Array<{ hour: number; minute: number }>;
    // When both start and end are known, endMinuteOfDay is set.
    endMinuteOfDay?: number;
    unknownDuration: boolean;
}

/**
 * Parse the time string from the event card (after stripping the "Mon DD | " prefix).
 *
 * Handles:
 *   "7:00 PM"                 → single slot, unknown duration
 *   "11:00 AM to 12:00 PM"   → single slot, duration known
 *   "8:00 - 10:00 AM"        → single slot, duration known (same AM/PM)
 *   "11:00 AM; 1:00 PM"      → two slots, unknown duration each
 *   "10:30 AM & 1:00 PM"     → two slots, unknown duration each
 *   "Dads FREE all day"       → default to noon, unknown duration
 */
export function parseTimeString(raw: string): ParsedTime {
    const s = raw.trim();

    // "H:MM AM to H:MM PM" — explicit range with "to"
    const toMatch = s.match(/^(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))$/i);
    if (toMatch) {
        const start = parseTime12(toMatch[1]);
        const end = parseTime12(toMatch[2]);
        if (start && end) {
            return { slots: [start], endMinuteOfDay: end.hour * 60 + end.minute, unknownDuration: false };
        }
    }

    // "H:MM - H:MM AM/PM" — hyphen range, single period at end (or each side)
    // e.g. "8:00 - 10:00 AM" or "3:00 PM - 4:00 PM"
    const hyphenMatch = s.match(/^(\d{1,2}(?::\d{2})?)\s*(AM|PM)?\s*-\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)$/i);
    if (hyphenMatch) {
        const startPeriodRaw = hyphenMatch[2] || hyphenMatch[4];
        const endPeriod = hyphenMatch[4];
        const start = parseTime12(`${hyphenMatch[1]} ${startPeriodRaw}`);
        const end = parseTime12(`${hyphenMatch[3]} ${endPeriod}`);
        if (start && end) {
            let startH = start.hour;
            const endMoD = end.hour * 60 + end.minute;
            // If start resolved after end (e.g. "8:00 - 10:00 AM" with no start period),
            // lower start hour: "8 PM" → "8 AM"
            if (startH > end.hour && endPeriod?.toUpperCase() === 'AM') {
                startH -= 12;
            }
            return { slots: [{ hour: startH, minute: start.minute }], endMinuteOfDay: endMoD, unknownDuration: false };
        }
    }

    // "H:MM AM; H:MM PM[; H:MM PM]" or "H:MM AM & H:MM PM" — multiple showings (2 or more)
    // Split on semicolons or ampersands and parse each part
    if (/[;&]/.test(s)) {
        const parts = s.split(/\s*[;&]\s*/);
        const parsed = parts.map(p => parseTime12(p.trim()));
        if (parsed.every(t => t !== null)) {
            return { slots: parsed as Array<{ hour: number; minute: number }>, unknownDuration: true };
        }
    }

    // Single time "H:MM AM/PM"
    const singleMatch = parseTime12(s);
    if (singleMatch) {
        return { slots: [singleMatch], unknownDuration: true };
    }

    // Unparseable — default to noon, unknown duration
    return { slots: [{ hour: 12, minute: 0 }], unknownDuration: true };
}

export function extractImageUrl(eventEl: HTMLElement): string | undefined {
    const imgDiv = eventEl.querySelector('.imagehandler');
    if (!imgDiv) return undefined;
    const style = imgDiv.getAttribute('style') || '';
    const m = style.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/);
    if (!m) return undefined;
    const raw = m[1];
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('/')) return `${BASE_URL}${raw}`;
    return undefined;
}

/**
 * Parse a single `.row.event` div given the current date context.
 * Returns one or more RipperEvent entries (event + optional UncertaintyError,
 * or ParseError if the element is malformed).
 */
export function parseEventElement(
    eventEl: HTMLElement,
    currentDate: LocalDate,
    ripperName: string
): RipperEvent[] {
    // Use only the FIRST content div (not the duplicate "abstract d-none tile-N" div).
    // The real content div has col-lg-6 (not col-lg-12) and does NOT have "abstract" in its class list.
    const contentDivs = eventEl.querySelectorAll('div.col-lg-6.order-1.order-lg-0.bg-white');
    let contentDiv: HTMLElement | undefined;
    for (const div of contentDivs) {
        if (!div.classNames.includes('abstract')) {
            contentDiv = div;
            break;
        }
    }
    if (!contentDiv) {
        return [{
            type: "ParseError" as const,
            reason: "No content div found in event element",
            context: eventEl.outerHTML.substring(0, 200),
        }];
    }

    // Title: text of h2.h5.mb-2, stripping the sr-only span.
    const titleEl = contentDiv.querySelector('h2.h5.mb-2');
    if (!titleEl) {
        return [{
            type: "ParseError" as const,
            reason: "No title element found",
            context: contentDiv.outerHTML.substring(0, 200),
        }];
    }
    // Remove the sr-only span before reading text
    titleEl.querySelector('span.sr-only')?.remove();
    const title = titleEl.text.trim();
    if (!title) {
        return [{
            type: "ParseError" as const,
            reason: "Empty title",
            context: contentDiv.outerHTML.substring(0, 200),
        }];
    }

    // Time: text of <p>, strip the "Mon DD | " bold prefix (e.g. "Jun 11 | ")
    const timeParaText = contentDiv.querySelector('p')?.text?.trim() ?? '';
    const timeRaw = timeParaText.replace(/^[A-Za-z]{3}\s+\d{1,2}\s*\|\s*/, '').trim();

    // Description: text of span.abstract
    const description = contentDiv.querySelector('span.abstract')?.text?.trim() || undefined;

    // URL: href of a.btn.btn--blue
    const href = contentDiv.querySelector('a.btn.btn--blue')?.getAttribute('href') ?? '';
    const url = href
        ? (href.startsWith('http') ? href : `${BASE_URL}${href}`)
        : `${BASE_URL}/exhibits-and-events/calendar-of-events`;

    // Image URL from the imagehandler div (sibling of content divs)
    const imageUrl = extractImageUrl(eventEl);

    const parsedTime = parseTimeString(timeRaw);
    const results: RipperEvent[] = [];
    const multiSlot = parsedTime.slots.length > 1;

    for (const slot of parsedTime.slots) {
        const suffix = multiSlot ? makeSlotSuffix(slot.hour, slot.minute) : undefined;
        const id = makeId(title, currentDate, suffix);

        let duration: Duration;
        if (!parsedTime.unknownDuration && parsedTime.endMinuteOfDay !== undefined) {
            const diffMinutes = parsedTime.endMinuteOfDay - (slot.hour * 60 + slot.minute);
            if (diffMinutes < 0) {
                results.push({
                    type: "ParseError" as const,
                    reason: `Invalid time range for "${title}": end time before start time (${timeRaw})`,
                    context: `${currentDate} ${slot.hour}:${slot.minute} to ${parsedTime.endMinuteOfDay}`,
                });
                continue;
            }
            duration = Duration.ofMinutes(Math.max(diffMinutes, 30));
        } else {
            // Placeholder — resolved by uncertainty system.
            duration = Duration.ofHours(1);
        }

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.of(
                LocalDateTime.of(currentDate.year(), currentDate.monthValue(), currentDate.dayOfMonth(), slot.hour, slot.minute),
                TIMEZONE
            );
        } catch (err) {
            results.push({
                type: "ParseError" as const,
                reason: `Invalid date/time for "${title}": ${err}`,
                context: `${currentDate} ${slot.hour}:${slot.minute}`,
            });
            continue;
        }

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration,
            summary: title,
            description,
            location: MUSEUM_ADDRESS,
            url,
            imageUrl,
        };
        results.push(event);

        if (parsedTime.unknownDuration) {
            const ue: UncertaintyError = {
                type: "Uncertainty",
                reason: `Unknown duration for "${title}" — time field was "${timeRaw}"`,
                source: ripperName,
                unknownFields: ["duration"],
                event,
                partialFingerprint: simpleHash(`${currentDate}|${title}|${timeRaw}`),
            };
            results.push(ue);
        }
    }

    return results;
}

/**
 * Parse a full page of AJAX HTML and return all events plus any parse errors.
 * Also returns whether there is a "Load More" link (for pagination).
 */
export function parsePage(html: HTMLElement, ripperName: string): {
    events: RipperEvent[];
    hasMore: boolean;
} {
    const events: RipperEvent[] = [];
    let currentDate: LocalDate | null = null;

    // The page is a flat sequence of .event-header divs and .row.event divs.
    for (const node of html.childNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Date header — sets context for following event rows
        if (node.classNames.includes('event-header') && node.classNames.includes('date')) {
            const srH2 = node.querySelector('h2.sr-only');
            if (srH2) {
                const parsed = parseHeaderDate(srH2.text.trim());
                if (parsed) currentDate = parsed;
            }
            continue;
        }

        // Event row
        if (node.classNames.includes('row') && node.classNames.includes('event')) {
            if (!currentDate) {
                events.push({
                    type: "ParseError" as const,
                    reason: "Event element encountered before any date header",
                    context: node.outerHTML.substring(0, 200),
                });
                continue;
            }
            events.push(...parseEventElement(node, currentDate, ripperName));
        }
    }

    const hasMore = !!html.querySelector('a.btn.btn--blue[href*="p="]');
    return { events, hasMore };
}

export default class MuseumOfFlightRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const allEvents: RipperEvent[] = [];
        // The endpoint is cumulative — each page re-includes all prior events plus new
        // ones appended at the bottom. Track seen calendar-event IDs (prefixed "e:") and
        // uncertainty-error IDs (prefixed "u:") separately so a calendar event and its
        // paired UncertaintyError (which share the same id) don't clobber each other.
        const seenKeys = new Set<string>();

        for (let page = 1; page <= MAX_PAGES; page++) {
            const url = page === 1
                ? ripper.config.url.toString()
                : `${BASE_URL}${AJAX_PATH}?p=${page}`;

            const res = await this.fetchFn(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; CalendarRipper/1.0)" }
            });
            if (!res.ok) {
                throw new Error(`${url} returned HTTP ${res.status}: ${res.statusText}`);
            }

            const html = parse(await res.text());
            const { events, hasMore } = parsePage(html, ripper.config.name);

            let addedNew = false;
            for (const event of events) {
                let key: string | undefined;
                if ('date' in event) {
                    key = `e:${(event as RipperCalendarEvent).id}`;
                } else if ('event' in event) {
                    key = `u:${(event as UncertaintyError).event.id}`;
                }
                // ParseErrors have no stable key — always include
                if (key === undefined) {
                    allEvents.push(event);
                } else if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allEvents.push(event);
                    if ('date' in event) addedNew = true;
                }
            }

            if (!hasMore || !addedNew) break;
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: allEvents.filter((e): e is RipperError => 'type' in e),
            tags: cal.tags ?? [],
            parent: ripper.config,
        }));
    }
}
