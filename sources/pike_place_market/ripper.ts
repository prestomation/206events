import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const VENUE_ADDRESS = "Pike Place Market, 85 Pike St, Seattle, WA 98101";
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

interface WpPostSummary {
    id: number;
    link: string;
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
            const url = `${REST_API_URL}?per_page=${PER_PAGE}&page=${page}&_fields=id,link&status=publish`;
            const res = await this.fetchFn(url);
            if (!res.ok) {
                if (page === 1) {
                    throw new Error(`WP REST API error: ${res.status} ${res.statusText}`);
                }
                break; // page beyond the last one (HTTP 400 rest_post_invalid_page_number)
            }
            const posts: WpPostSummary[] = await res.json();
            all.push(...posts);
            if (posts.length < PER_PAGE) break; // short page — no more to fetch
        }
        return all;
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

        let startDate: LocalDate;
        try {
            startDate = LocalDate.parse(startDateStr.split('T')[0]);
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

        const timeEl = html.querySelector('div.mec-single-event-time abbr.mec-events-abbr');
        const timeText = timeEl?.textContent?.trim() || '';
        const parsedTime = this.parseTime(timeText);

        let eventDate: ZonedDateTime;
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
            duration: Duration.ofMinutes(parsedTime.durationMinutes),
            summary: title,
            description,
            location,
            url: (eventData['url'] as string | undefined) || url,
            imageUrl,
            cost,
        };

        return [event];
    }

    private buildLocation(location: { name?: string; address?: string } | undefined): string {
        const parts = [location?.name?.trim(), location?.address?.trim()].filter(Boolean);
        if (parts.length === 0) return "Pike Place Market";
        return parts.join(", ");
    }

    private extractCost(offers: { price?: string } | undefined): EventCost {
        const priceStr = offers?.price?.trim();
        if (priceStr) {
            const price = parseFloat(priceStr);
            if (!isNaN(price) && price > 0) return { min: price };
        }
        return { min: 0 };
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
     * Falls back to 7 pm / 2-hour duration when the format is unrecognised.
     */
    public parseTime(timeText: string): { hour: number; minute: number; durationMinutes: number } {
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
            return { hour: startHour, minute: startMin, durationMinutes };
        }

        const singleMatch = timeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
        if (singleMatch) {
            let hour = parseInt(singleMatch[1], 10);
            const minute = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
            const period = singleMatch[3].toLowerCase();
            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
            return { hour, minute, durationMinutes: 120 };
        }

        return { hour: 19, minute: 0, durationMinutes: 120 };
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
