import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId, OffsetDateTime } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const SOURCE_NAME = "pike-place-market";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

// The Pike Place Market events calendar (Modern Events Calendar plugin) only
// server-renders a few days of upcoming events on /events/ — the rest load via
// a JS "Load More" button, and annual signature events (Daffodil Day, Flower
// Festival, Magic in the Market, ...) live on a separate page entirely. The
// WordPress REST API exposes every published event post directly, each with
// the same schema.org JSON-LD our previous single-page scrape already parsed.
const REST_API_URL = "https://www.pikeplacemarket.org/wp-json/wp/v2/mec-events";
const PER_PAGE = 100;
const CONCURRENCY = 6;

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/** Returns true for errors that are worth retrying (network errors, 429, 5xx). */
function isTransient(error: unknown): boolean {
    if (error instanceof TransientHttpError) return true;
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

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

interface WpPostSummary {
    id: number;
    link: string;
}

interface PageResult {
    posts: WpPostSummary[];
    isLastPage: boolean;
}

export default class PikePlaceMarketRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const posts = await this.fetchAllPostLinks();

        const today = LocalDate.now(TIMEZONE);
        const results = await this.parallelMap(
            posts,
            p => this.fetchAndParseEvent(p.link, today),
            CONCURRENCY
        );
        const allEvents = results.flat();

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

    /**
     * Enumerate every published mec-events post via the paginated WP REST API.
     *
     * The shared fetch cache (`withCache` in proxy-fetch.ts) reconstructs each
     * Response with only its Content-Type header preserved, so `x-wp-totalpages`
     * is never available here. Pagination instead terminates naturally: the API
     * returns HTTP 400 once `page` exceeds the real page count, and a page
     * shorter than `per_page` is always the last one.
     */
    private async fetchAllPostLinks(): Promise<WpPostSummary[]> {
        const MAX_PAGES = 50; // safety cap (~5000 posts) against unbounded loops
        const all: WpPostSummary[] = [];

        for (let page = 1; page <= MAX_PAGES; page++) {
            const { posts, isLastPage } = await this.fetchPostsPage(page);
            all.push(...posts);
            if (isLastPage) break;
        }
        return all;
    }

    /** Fetches one page of the post-listing endpoint, retrying transient errors. */
    private async fetchPostsPage(page: number): Promise<PageResult> {
        const url = `${REST_API_URL}?per_page=${PER_PAGE}&page=${page}&_fields=id,link&status=publish`;
        let lastError: unknown = new Error("unknown error");

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
            }

            try {
                const res = await this.fetchFn(url);

                // HTTP 400 (rest_post_invalid_page_number) beyond page 1 means we've
                // walked past the last page — that's expected termination, not an error.
                if (res.status === 400 && page > 1) {
                    return { posts: [], isLastPage: true };
                }

                if (!res.ok) {
                    if (res.status === 429 || res.status >= 500) {
                        lastError = new TransientHttpError(res.status, `HTTP ${res.status} fetching page ${page}`);
                        continue;
                    }
                    throw new Error(`WP REST API error (page ${page}): ${res.status} ${res.statusText}`);
                }

                const posts: WpPostSummary[] = await res.json();
                return { posts, isLastPage: posts.length < PER_PAGE };
            } catch (error) {
                if (isTransient(error)) {
                    lastError = error;
                    continue;
                }
                throw error;
            }
        }

        throw new Error(`WP REST API error (page ${page}) after ${MAX_RETRIES} retries: ${lastError}`);
    }

    /** Runs async operations over an array with bounded concurrency. */
    private async parallelMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
        const results: R[] = new Array(items.length);
        let index = 0;

        async function worker() {
            while (true) {
                const i = index++;
                if (i >= items.length) break;
                results[i] = await fn(items[i]);
            }
        }

        const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
        await Promise.all(workers);
        return results;
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
                    if (res.status === 429 || res.status >= 500) {
                        lastError = new TransientHttpError(res.status, `HTTP ${res.status} fetching ${url}`);
                        continue;
                    }
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
                return [{
                    type: "ParseError" as const,
                    reason: `Failed to fetch event page ${url}: ${error}`,
                    context: url,
                }];
            }
        }

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
     * MEC recurring events (weekly tours, monthly shows) resolve their JSON-LD
     * to a single "next occurrence" date per post — later occurrences of the
     * same show are not enumerated separately.
     */
    public parseEventPage(htmlText: string, url: string, today: LocalDate): RipperEvent[] {
        const html = parse(htmlText);

        const ldScripts = html.querySelectorAll('script[type="application/ld+json"]');
        let eventData: Record<string, any> | null = null;
        for (const script of ldScripts) {
            if (script.getAttribute('class') === 'yoast-schema-graph') continue;
            try {
                // innerHTML (not textContent): the description field embeds
                // HTML-entity-escaped markup (&quot;, &lt;, ...) as literal JSON
                // string content. textContent decodes entities before we ever see
                // them, turning e.g. &quot; into a bare " that breaks JSON.parse.
                const raw = script.innerHTML;
                if (!raw) continue;
                const parsed = JSON.parse(raw);
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

        const startDateStr = eventData['startDate'] as string | undefined;
        if (!startDateStr) {
            return [{
                type: "ParseError" as const,
                reason: "No startDate in schema.org Event data",
                context: url,
            }];
        }

        const title = this.decodeHtmlEntities((eventData['name'] as string | undefined)?.trim() || '');
        if (!title) {
            return [{
                type: "ParseError" as const,
                reason: "No event name in schema.org Event data",
                context: url,
            }];
        }

        const titleLower = title.toLowerCase();
        if (titleLower.startsWith('cancelled:') || titleLower.startsWith('canceled:')) {
            return [];
        }

        let eventDate: ZonedDateTime;
        let durationMinutes: number;
        const unknownFields: UncertaintyField[] = [];
        let uncertaintyReason = "";
        let uncertaintyFingerprintInput = startDateStr;

        const endDateStr = eventData['endDate'] as string | undefined;

        if (startDateStr.includes('T')) {
            // ISO datetime format, e.g. "2026-04-04T13:00:00-07:00"
            try {
                const startOdt = OffsetDateTime.parse(startDateStr);
                eventDate = startOdt.atZoneSameInstant(TIMEZONE);
            } catch (e) {
                return [{
                    type: "ParseError" as const,
                    reason: `Could not parse ISO datetime "${startDateStr}": ${e}`,
                    context: url,
                }];
            }

            if (eventDate.toLocalDate().isBefore(today)) {
                return [];
            }

            if (endDateStr && endDateStr.includes('T')) {
                try {
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
                } catch {
                    durationMinutes = 120;
                    unknownFields.push("duration");
                    uncertaintyReason = `Could not parse endDate "${endDateStr}"`;
                }
            } else {
                durationMinutes = 120;
                unknownFields.push("duration");
                uncertaintyReason = "schema.org Event did not include a parseable endDate";
            }
            uncertaintyFingerprintInput = `${startDateStr}|${endDateStr ?? ''}`;
        } else {
            // Date-only format, e.g. "2026-07-10" — MEC's canonical JSON-LD for
            // this site never carries a time, so fall back to the rendered
            // "8:00 am - 10:30 am" text next to the date.
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

            const timeEl = html.querySelector('div.mec-single-event-time abbr.mec-events-abbr');
            const timeText = timeEl?.textContent?.trim() || '';
            const parsedTime = this.parseTime(timeText);

            try {
                eventDate = ZonedDateTime.of(
                    LocalDateTime.of(startDate.year(), startDate.monthValue(), startDate.dayOfMonth(), parsedTime.hour, parsedTime.minute),
                    TIMEZONE
                );
            } catch (e) {
                return [{
                    type: "ParseError" as const,
                    reason: `Invalid datetime for event at ${url}: ${e}`,
                    context: startDateStr,
                }];
            }
            durationMinutes = parsedTime.durationMinutes;
            if (parsedTime.startTimeGuessed) unknownFields.push("startTime");
            if (parsedTime.durationGuessed) unknownFields.push("duration");
            if (unknownFields.length > 0) {
                uncertaintyReason = parsedTime.startTimeGuessed
                    ? `MEC time text unrecognised: "${timeText}"`
                    : `MEC time text had a start but no end: "${timeText}"`;
            }
            uncertaintyFingerprintInput = `${startDateStr}|${timeText}`;
        }

        const rawDesc = this.decodeHtmlEntities((eventData['description'] as string | undefined) || '');
        const description = this.cleanDescription(rawDesc) || undefined;

        const location = this.buildLocation(eventData['location']);
        const imageUrl = this.extractImageUrl(eventData['image']);
        const cost = this.extractCost(eventData['offers']);

        const slugMatch = url.match(/\/events-calendar\/([^/]+)\/?(?:\?|$)/);
        const id = slugMatch ? `ppm-${slugMatch[1]}` : `ppm-${startDateStr}`;

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
            cost,
        };

        const results: RipperEvent[] = [event];
        if (unknownFields.length > 0) {
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: uncertaintyReason || "Schema.org Event omitted one or more fields",
                source: SOURCE_NAME,
                unknownFields,
                event,
                partialFingerprint: simpleHash(uncertaintyFingerprintInput),
            };
            results.push(uncertainty);
        }
        return results;
    }

    private buildLocation(location: { name?: string; address?: string } | undefined): string {
        const parts = [location?.name?.trim(), location?.address?.trim()].filter(Boolean);
        if (parts.length === 0) return "Pike Place Market";
        return parts.join(", ");
    }

    /**
     * Extracts a cost from schema.org `offers.price` when it's a real positive
     * number. Leaves cost undefined (unknown, not "free") when price is blank
     * or unparseable, so the event surfaces in the costGaps queue instead of
     * silently publishing a guess — see AGENTS.md "uncertainty is the default
     * pattern for unparsable data".
     */
    private extractCost(offers: { price?: string } | undefined): EventCost | undefined {
        const priceStr = offers?.price?.trim();
        if (!priceStr) return undefined;
        const price = parseFloat(priceStr);
        if (isNaN(price) || price < 0) return undefined;
        return { min: price };
    }

    /**
     * Extract a usable image URL from a schema.org Event `image` value, which may be
     * a string, an array of strings/ImageObjects, or a single ImageObject.
     */
    private extractImageUrl(image: unknown): string | undefined {
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

    /**
     * Parse a time range like "8:00 am - 10:30 am" into start hour/minute and duration.
     * Falls back to 7 pm / 2-hour duration when the format is unrecognised, flagging
     * which parts were guessed so the caller can raise an UncertaintyError.
     */
    public parseTime(timeText: string): { hour: number; minute: number; durationMinutes: number; startTimeGuessed: boolean; durationGuessed: boolean } {
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
            if (durationMinutes < 0) durationMinutes += 24 * 60; // midnight-spanning events
            durationMinutes = Math.max(durationMinutes, 30);
            return { hour: startHour, minute: startMin, durationMinutes, startTimeGuessed: false, durationGuessed: false };
        }

        const singleMatch = timeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
        if (singleMatch) {
            let hour = parseInt(singleMatch[1], 10);
            const minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
            const period = singleMatch[3].toLowerCase();
            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
            return { hour, minute, durationMinutes: 120, startTimeGuessed: false, durationGuessed: true };
        }

        return { hour: 19, minute: 0, durationMinutes: 120, startTimeGuessed: true, durationGuessed: true };
    }

    public decodeHtmlEntities(text: string): string {
        return text
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }

    public cleanDescription(descHtml: string): string {
        return descHtml
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 1000);
    }
}
