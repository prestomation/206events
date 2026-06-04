import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId, OffsetDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

const VENUE_ADDRESS = "Rainier Arts Center, 3515 S Alaska St, Seattle, WA 98118";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

// Fetch the 30 most recently published event posts from the WordPress REST API.
// The MEC plugin does not include event dates in the REST response, so we fetch
// each event's individual page and extract the structured data there.
const REST_API_URL =
    "https://rainierartscenter.org/wp-json/wp/v2/mec-events?per_page=30&_fields=id,link&status=publish";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/** Returns true for errors that are worth retrying (network errors, 429, 5xx). */
function isTransient(error: unknown): boolean {
    if (error instanceof TransientHttpError) return true;
    // Network/connection errors (TypeError from fetch, etc.)
    if (error instanceof TypeError) return true;
    return false;
}

class TransientHttpError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'TransientHttpError';
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract a usable image URL from a schema.org Event `image` value, which may be
 * a string, an array of strings/ImageObjects, or a single ImageObject. Returns
 * an absolute http(s) URL or undefined.
 */
function extractImageUrl(image: unknown): string | undefined {
    const first = Array.isArray(image) ? image[0] : image;
    if (!first) return undefined;
    let url: string | undefined;
    if (typeof first === 'string') {
        url = first;
    } else if (typeof first === 'object' && typeof (first as any).url === 'string') {
        url = (first as any).url;
    }
    url = url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) return undefined;
    return url;
}

export default class RainierArtsCenterRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        // 1. Retrieve event page URLs from the WP REST API
        const res = await this.fetchFn(REST_API_URL);
        if (!res.ok) {
            throw new Error(`WP REST API error: ${res.status} ${res.statusText}`);
        }
        const apiData: { id: number; link: string }[] = await res.json();

        // 2. Fetch individual event pages concurrently and parse each one
        const today = LocalDate.now(TIMEZONE);
        const eventResults = await Promise.all(
            apiData.map(e => this.fetchAndParseEvent(e.link, today))
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

    private async fetchAndParseEvent(url: string, today: LocalDate): Promise<RipperEvent[]> {
        let lastError: unknown = new Error("unknown error");

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                await sleep(delayMs);
            }

            try {
                const res = await this.fetchFn(url);

                if (!res.ok) {
                    // Retry on 429 (rate limit) or any 5xx (server error)
                    if (res.status === 429 || res.status >= 500) {
                        lastError = new TransientHttpError(res.status, `HTTP ${res.status} fetching ${url}`);
                        continue;
                    }
                    // Non-retryable HTTP error (4xx other than 429)
                    return [{
                        type: "ParseError" as const,
                        reason: `HTTP ${res.status} fetching ${url}`,
                        context: url,
                    }];
                }

                return this.parseEventPage(await res.text(), url, today);
            } catch (error) {
                if (isTransient(error)) {
                    lastError = error;
                    continue;
                }
                // Non-retryable error
                return [{
                    type: "ParseError" as const,
                    reason: `Failed to fetch event page ${url}: ${error}`,
                    context: url,
                }];
            }
        }

        // All retries exhausted
        return [{
            type: "ParseError" as const,
            reason: `Failed to fetch event page ${url} after ${MAX_RETRIES} retries: ${lastError}`,
            context: url,
        }];
    }

    /**
     * Parse a single event page and return a RipperCalendarEvent (or empty array
     * for past/cancelled events, or a RipperError on parse failure).
     *
     * Event pages embed schema.org Event JSON-LD with startDate, name, description,
     * and location. Start/end time is in the <abbr class="mec-events-abbr"> element
     * (e.g. "8:00 pm - 9:30 pm").
     */
    public parseEventPage(htmlText: string, url: string, today: LocalDate): RipperEvent[] {
        const html = parse(htmlText);

        // Skip expired events — MEC marks past events with a status div
        const statusEl = html.querySelector('div.mec-event-status');
        if (statusEl?.textContent?.trim().toLowerCase().includes('expired')) {
            return [];
        }

        // The page has two JSON-LD blocks: a Yoast WebPage graph and a MEC Event block.
        // Select the one whose @type is "Event".
        const ldScripts = html.querySelectorAll('script[type="application/ld+json"]');
        let eventData: Record<string, any> | null = null;
        for (const script of ldScripts) {
            if (script.getAttribute('class') === 'yoast-schema-graph') continue;
            try {
                const textContent = script.textContent;
                if (!textContent) continue;
                const parsed = JSON.parse(textContent);
                if (parsed['@type'] === 'Event') {
                    eventData = parsed;
                    break;
                }
            } catch {
                // skip malformed scripts
            }
        }

        if (!eventData) {
            return [{
                type: "ParseError" as const,
                reason: "No Event schema.org JSON-LD found",
                context: url,
            }];
        }

        // --- Date & Time ---
        const startDateStr = eventData['startDate'] as string | undefined;
        if (!startDateStr) {
            return [{
                type: "ParseError" as const,
                reason: "No startDate in schema.org Event data",
                context: url,
            }];
        }

        let eventDate: ZonedDateTime;
        let durationMinutes: number;
        const endDateStr = eventData['endDate'] as string | undefined;
        const unknownFields: UncertaintyField[] = [];
        let uncertaintyReason = "";
        let uncertaintyFingerprintInput = startDateStr;

        // ISO datetime format: "2026-04-04T13:00:00-07:00"
        if (startDateStr.includes('T')) {
            try {
                // Parse with offset preserved, then convert to venue timezone
                const startOdt = OffsetDateTime.parse(startDateStr);
                eventDate = startOdt.atZoneSameInstant(TIMEZONE);

                if (eventDate.toLocalDate().isBefore(today)) {
                    return [];
                }

                // Compute duration from endDate if available
                if (endDateStr && endDateStr.includes('T')) {
                    const endOdt = OffsetDateTime.parse(endDateStr);
                    const endZdt = endOdt.atZoneSameInstant(TIMEZONE);
                    const diff = Duration.between(eventDate, endZdt).toMinutes();
                    if (diff > 0) {
                        durationMinutes = diff;
                    } else {
                        durationMinutes = 120;
                        unknownFields.push("duration");
                        uncertaintyReason = `endDate is not after startDate ("${endDateStr}")`;
                    }
                } else {
                    durationMinutes = 120;
                    unknownFields.push("duration");
                    uncertaintyReason = "schema.org Event did not include endDate";
                }
                uncertaintyFingerprintInput = `${startDateStr}|${endDateStr ?? ''}`;
            } catch (e) {
                return [{
                    type: "ParseError" as const,
                    reason: `Could not parse ISO datetime "${startDateStr}": ${e}`,
                    context: url,
                }];
            }
        } else {
            // Date-only format: "2026-04-04"
            let startDate: LocalDate;
            try {
                startDate = LocalDate.parse(startDateStr);
            } catch (e) {
                return [{
                    type: "ParseError" as const,
                    reason: `Could not parse date "${startDateStr}": ${e}`,
                    context: url,
                }];
            }

            if (startDate.isBefore(today)) {
                return [];
            }

            // Fall back to MEC HTML time elements
            const timeEl = html.querySelector('div.mec-single-event-time abbr.mec-events-abbr');
            const timeText = timeEl?.textContent?.trim() || '';
            const parsed = this.parseTime(timeText);

            try {
                eventDate = ZonedDateTime.of(
                    LocalDateTime.of(startDate.year(), startDate.monthValue(), startDate.dayOfMonth(), parsed.hour, parsed.minute),
                    TIMEZONE
                );
            } catch (e) {
                return [{
                    type: "ParseError" as const,
                    reason: `Invalid datetime for event at ${url}: ${e}`,
                    context: startDateStr,
                }];
            }
            durationMinutes = parsed.durationMinutes;
            if (parsed.startTimeGuessed) unknownFields.push("startTime");
            if (parsed.durationGuessed) unknownFields.push("duration");
            if (unknownFields.length > 0) {
                uncertaintyReason = parsed.startTimeGuessed
                    ? `MEC time text unrecognised: "${timeText}"`
                    : `MEC time text had a start but no end: "${timeText}"`;
            }
            uncertaintyFingerprintInput = `${startDateStr}|${timeText}`;
        }

        // --- Title ---
        const title = (eventData['name'] as string | undefined)?.trim() || '';
        if (!title) {
            return [{
                type: "ParseError" as const,
                reason: "No event name in schema.org Event data",
                context: url,
            }];
        }

        // Skip cancelled events
        const titleLower = title.toLowerCase();
        if (titleLower.startsWith('cancelled:') || titleLower.startsWith('canceled:')) {
            return [];
        }

        // --- Description ---
        const rawDesc = (eventData['description'] as string | undefined) || '';
        const description = this.cleanDescription(rawDesc) || undefined;

        // --- Location ---
        // schema.org location.name is the room name (e.g. "Auditorium"); address is always empty.
        const roomName = (eventData['location']?.['name'] as string | undefined)?.trim() || '';
        const location = roomName ? `${roomName}, ${VENUE_ADDRESS}` : VENUE_ADDRESS;

        // --- Image ---
        // schema.org Event "image" is the per-event featured image. It may be a
        // string URL, an array of URLs, or an ImageObject with a `url` field.
        const imageUrl = extractImageUrl(eventData['image']);

        // --- ID ---
        const slugMatch = url.match(/\/events\/([^/]+)\/?$/);
        const id = slugMatch ? `rac-${slugMatch[1]}` : `rac-${startDateStr}`;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            description,
            location,
            url: (eventData['url'] as string | undefined) || url,
            imageUrl,
        };

        const results: RipperEvent[] = [event];
        if (unknownFields.length > 0) {
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: uncertaintyReason || "Schema.org Event omitted one or more fields",
                source: "rainier_arts_center",
                unknownFields,
                event,
                partialFingerprint: simpleHash(uncertaintyFingerprintInput),
            };
            results.push(uncertainty);
        }
        return results;
    }

    /** Strip WordPress shortcodes (e.g. [embed]…[/embed]) and normalise whitespace. */
    public cleanDescription(text: string): string {
        return text
            .replace(/\[\w+\].*?\[\/\w+\]/gs, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Parse a time range like "8:00 pm - 9:30 pm" into start hour/minute and duration.
     * Falls back to 7 pm / 2-hour duration when the format is unrecognised.
     */
    public parseTime(timeText: string): { hour: number; minute: number; durationMinutes: number; startTimeGuessed: boolean; durationGuessed: boolean } {
        // Range: "8:00 pm - 9:30 pm" or "11:00 am - 2:00 pm"
        const rangeMatch = timeText.match(
            /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i
        );
        if (rangeMatch) {
            const [, startHStr, startMStr, startPeriod, endHStr, endMStr, endPeriod] = rangeMatch;

            let startHour = parseInt(startHStr, 10);
            const startMin = startMStr ? parseInt(startMStr, 10) : 0;
            const sp = startPeriod.toLowerCase();
            if (sp === 'pm' && startHour !== 12) startHour += 12;
            if (sp === 'am' && startHour === 12) startHour = 0;

            let endHour = parseInt(endHStr, 10);
            const endMin = endMStr ? parseInt(endMStr, 10) : 0;
            const ep = endPeriod.toLowerCase();
            if (ep === 'pm' && endHour !== 12) endHour += 12;
            if (ep === 'am' && endHour === 12) endHour = 0;

            let durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
            if (durationMinutes < 0) durationMinutes += 24 * 60; // handle midnight-spanning events
            durationMinutes = Math.max(durationMinutes, 30);
            return { hour: startHour, minute: startMin, durationMinutes, startTimeGuessed: false, durationGuessed: false };
        }

        // Single time: "6:30 pm"
        const singleMatch = timeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
        if (singleMatch) {
            let hour = parseInt(singleMatch[1], 10);
            const minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
            const period = singleMatch[3].toLowerCase();
            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
            return { hour, minute, durationMinutes: 120, startTimeGuessed: false, durationGuessed: true };
        }

        // Default for unparseable time: 7 pm, 2 hours
        return { hour: 19, minute: 0, durationMinutes: 120, startTimeGuessed: true, durationGuessed: true };
    }
}
