import { Duration, Instant, ZoneId, ZonedDateTime } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError } from "./schema.js";
import { getFetchForConfig, FetchFn } from "./proxy-fetch.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
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
 * Squarespace event item as returned by the ?format=json endpoint.
 */
export interface SquarespaceEvent {
    id: string;
    title: string;
    startDate: number;
    endDate?: number;
    fullUrl?: string;
    urlId?: string;
    excerpt?: string;
    body?: string;
    sourceUrl?: string;
    assetUrl?: string;
    location?: {
        addressTitle?: string;
        addressLine1?: string;
        addressLine2?: string;
        addressCountry?: string;
    };
    tags?: string[];
    categories?: string[];
}

interface SquarespaceResponse {
    upcoming?: SquarespaceEvent[];
    past?: SquarespaceEvent[];
    items?: SquarespaceEvent[];
    pagination?: {
        nextPage: boolean;
        nextPageOffset: number;
        nextPageUrl: string;
    };
}

const MAX_PAGES = 10;
const MAX_429_RETRIES = 3;

// Squarespace event tags that unambiguously signal free admission.
// "Sliding Scale +/or NOTALOF" triggers the NOTAFLOF rule → free.
const FREE_TAG_FRAGMENTS = ['free + no cover', 'free admission', 'notalof', 'notaflof'];

function extractCostFromTags(tags: string[] | undefined): EventCost | undefined {
    if (!tags) return undefined;
    const lower = tags.map(t => t.toLowerCase());
    if (lower.some(t => FREE_TAG_FRAGMENTS.some(f => t.includes(f)))) {
        return { min: 0 };
    }
    return undefined;
}

// Squarespace event bodies are freeform rich text; the venue frequently writes
// the price directly into the description rather than exposing it as
// structured data (e.g. "Every Tuesday 7-8pm, $25", "Investment: $45",
// "Sliding scale $15-25", "Suggested donation $20"). This is a best-effort,
// conservative extraction — it only fires on a small set of high-precision
// patterns and otherwise returns undefined (falls through to the cost-gap
// queue, same as if this never ran).
//
// IMPORTANT: whatever this returns becomes `event.cost`, which
// `applyCostBackfill` (lib/uncertainty-merge.ts) treats as "ripper already
// priced it" — permanently outranking any later event-uncertainty-cache
// resolution and dropping the event out of the costGaps queue for good.
// Unlike extractCostFromTags (an exact tag match with no ambiguity), this is
// a heuristic over freeform prose, so a wrong extraction here has no correction
// path short of editing this file. That raises the bar for each pattern:
// keep them narrow and specific enough that a false positive is unlikely,
// and prefer returning undefined (leaving it in the gap queue for a human)
// over a plausible-looking guess.
// "Donations ... appreciated/welcome/accepted/encouraged/optional" is a
// pay-what-you-want framing regardless of any dollar amount mentioned in
// between — e.g. "Donations of $10-$15 are deeply appreciated" is still
// free, not a $10 fixed price. The `.{0,60}` gap (rather than requiring the
// terminal word immediately after "are"/"is") tolerates adverbs and other
// phrasing between "donations" and the word that signals it's optional.
const NOTAFLOF_RE = /\b(suggested donation|pay[- ]what[- ]you[- ]can|pwyc|notaflof|no one (?:is |will be )?turned away|donations?\b(?:(?!\.).){0,60}?\b(?:appreciated|welcome|accepted|encouraged|optional))\b/i;
const FREE_PHRASE_RE = /\b(free admission|free event|free entry|free to attend|free class|free workshop|free offering|free community (?:meditation|gathering|event|class|workshop)|no cover)\b/i;
// "Not [a] free ..." / "no longer free" negates an otherwise-matching free
// phrase a few words later (e.g. "This is not a free class — tickets are
// $50"), so check this before trusting NOTAFLOF_RE/FREE_PHRASE_RE.
const FREE_NEGATION_RE = /\bnot\s+(?:a\s+|an\s+)?(?:really\s+)?free\b|\bno longer free\b|\bisn.t free\b/i;
const RANGE_RE = /\$(\d+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*\$?(\d+(?:\.\d{1,2})?)/i;
// Deliberately excludes "fee" — the pricing rubric treats fees (materials,
// processing, registration add-ons) as distinct from and excluded from the
// general-admission price, so a body mentioning "materials fee $5" must not
// be read as the event's $5 admission cost.
const KEYWORD_PRICE_RE = /\b(?:cost|price|admission|tickets?|investment)\s*[:\s]\s*\$(\d+(?:\.\d{1,2})?)/gi;
// A discount-tier word immediately before the matched keyword (e.g. "Member
// price: $15") means this is not the general-admission price the rubric
// calls for — skip it and look for the next match on the page instead (e.g.
// a later "Regular price: $25").
const TIER_PREFIX_RE = /\b(?:member|student|senior|child|kids?|youth|volunteer)\s+$/i;
// Restricted to punctuation/whitespace between the time and the price (no
// letters) so an unrelated dollar amount later in the same sentence — e.g.
// "Doors at 7pm, drinks $8 extra" — can't be mistaken for the admission cost.
const TIME_ADJACENT_PRICE_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b[,\s-]{0,4}\$(\d+(?:\.\d{1,2})?)(?!\d)/i;

/**
 * Strips HTML tags and collapses whitespace, for regex-scanning a Squarespace
 * body field. Squarespace bodies are a sequence of block elements
 * (`<p>...</p><p>...</p>`) with no whitespace between the closing and
 * opening tags, so a naive textContent concatenates adjacent paragraphs with
 * no separator (e.g. "...Spirit" + "Every Tuesday..." → "SpiritEvery...").
 * Inserting a space at every tag boundary first prevents words either side
 * of a block break from fusing into one token.
 */
function toPlainText(html: string | undefined): string {
    if (!html) return "";
    return parse(html.replace(/>\s*</g, "> <")).textContent.replace(/\s+/g, " ").trim();
}

export function extractCostFromBody(body: string | undefined): EventCost | undefined {
    const text = toPlainText(body);
    if (!text) return undefined;
    if (!FREE_NEGATION_RE.test(text) && (NOTAFLOF_RE.test(text) || FREE_PHRASE_RE.test(text))) {
        return { min: 0 };
    }
    const range = text.match(RANGE_RE);
    if (range) {
        const min = parseFloat(range[1]);
        const max = parseFloat(range[2]);
        if (max > min) return { min, max };
    }
    KEYWORD_PRICE_RE.lastIndex = 0;
    let keyword: RegExpExecArray | null;
    while ((keyword = KEYWORD_PRICE_RE.exec(text))) {
        const prefix = text.slice(Math.max(0, keyword.index - 20), keyword.index);
        if (TIER_PREFIX_RE.test(prefix)) continue;
        return { min: parseFloat(keyword[1]) };
    }
    const timeAdjacent = text.match(TIME_ADJACENT_PRICE_RE);
    if (timeAdjacent) return { min: parseFloat(timeAdjacent[1]) };
    return undefined;
}

/**
 * Base ripper for Squarespace-powered event pages.
 *
 * Squarespace sites expose calendar/event data as JSON by appending
 * `?format=json` to the events page URL. The response contains `upcoming`
 * and `past` arrays of event objects plus pagination metadata.
 *
 * Subclasses typically need no overrides — just extend and configure via
 * ripper.yaml with the events page URL.
 */
export class SquarespaceRipper implements IRipper {
    protected fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const baseUrl = ripper.config.url;

        let allEvents: SquarespaceEvent[];
        try {
            allEvents = await this.fetchUpcomingEvents(baseUrl);
        } catch (error) {
            // A 404 on a source that is already expectEmpty means the events
            // collection is gone (e.g. after a site restructure) — treat it
            // the same as returning zero events so the parse-error count stays
            // clean. For sources that should have events, keep surfacing the error.
            const expectEmpty = ripper.config.expectEmpty ||
                ripper.config.calendars.some(c => c.expectEmpty);
            if (expectEmpty && error instanceof Error && error.message.startsWith('404')) {
                allEvents = [];
            } else {
                return ripper.config.calendars.map(c => ({
                    name: c.name,
                    friendlyname: c.friendlyname,
                    events: [],
                    errors: [{
                        type: "ParseError" as const,
                        reason: `Failed to fetch events from Squarespace: ${error}`,
                        context: baseUrl.toString()
                    }],
                    parent: ripper.config,
                    tags: c.tags || []
                }));
            }
        }

        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        for (const cal of ripper.config.calendars) {
            for (const sqEvent of allEvents) {
                try {
                    const event = this.mapEvent(sqEvent, cal.timezone, baseUrl);
                    if (event) {
                        calendars[cal.name].events.push(event);
                        if (sqEvent.endDate === undefined || sqEvent.endDate === null || sqEvent.endDate - sqEvent.startDate <= 0) {
                            const uncertainty: UncertaintyError = {
                                type: "Uncertainty",
                                reason: "Squarespace event omitted endDate",
                                source: ripper.config.name,
                                calendar: cal.name,
                                unknownFields: ["duration"],
                                event,
                                partialFingerprint: simpleHash(`${sqEvent.startDate}|${sqEvent.endDate ?? ''}`),
                            };
                            calendars[cal.name].events.push(uncertainty);
                        }
                    }
                } catch (error) {
                    calendars[cal.name].events.push({
                        type: "ParseError",
                        reason: `Failed to parse Squarespace event: ${error}`,
                        context: sqEvent.title || sqEvent.id
                    });
                }
            }
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags
        }));
    }

    /**
     * Fetch all upcoming events from the Squarespace JSON endpoint,
     * following pagination links up to MAX_PAGES.
     */
    protected async fetchUpcomingEvents(baseUrl: URL): Promise<SquarespaceEvent[]> {
        const allEvents: SquarespaceEvent[] = [];
        const seenUrls = new Set<string>();
        let url = new URL(baseUrl.toString());
        url.searchParams.set('format', 'json');

        for (let page = 0; page < MAX_PAGES; page++) {
            const urlString = url.toString();
            if (seenUrls.has(urlString)) {
                break;
            }
            seenUrls.add(urlString);

            const res = await this.fetchWithRetry(urlString);
            if (!res.ok) {
                throw new Error(`${res.status} ${res.statusText}`);
            }

            const data: SquarespaceResponse = await res.json();

            if (data.upcoming && data.upcoming.length > 0) {
                allEvents.push(...data.upcoming);
            } else if (data.items && data.items.length > 0) {
                allEvents.push(...data.items);
            } else if (data.past && data.past.length > 0) {
                // Some Squarespace sites misconfigure their collection type, causing
                // future events to appear in `data.past`. Fall back to that array and
                // filter to only events that haven't started yet.
                const now = Date.now();
                allEvents.push(...data.past.filter(e => e.startDate > now));
            }

            if (data.pagination?.nextPage && data.pagination.nextPageUrl) {
                url = new URL(data.pagination.nextPageUrl, baseUrl);
                url.searchParams.set('format', 'json');
            } else {
                break;
            }
        }

        return allEvents;
    }

    /**
     * Fetch a Squarespace JSON endpoint, retrying on HTTP 429. The build
     * runs up to CONCURRENCY rippers in parallel, and Squarespace appears to
     * rate-limit by client IP across all customer sites rather than
     * per-domain — so a burst of concurrent requests to *different*
     * Squarespace sites can still trip the limit. A short backoff (honoring
     * Retry-After when present) lets other in-flight requests clear first.
     * The exponential-backoff fallback is jittered so multiple rippers rate
     * limited by the same burst don't retry in lockstep.
     */
    private async fetchWithRetry(url: string): Promise<Response> {
        for (let attempt = 0; ; attempt++) {
            const res = await this.fetchFn(url);
            if (res.status !== 429 || attempt >= MAX_429_RETRIES) {
                return res;
            }
            const retryAfterHeader = res.headers?.get?.('retry-after');
            const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
            const delayMs = Number.isFinite(retryAfterSeconds)
                ? retryAfterSeconds * 1000
                : 1000 * 2 ** attempt * (0.5 + Math.random());
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    /**
     * Convert a Squarespace event object into a RipperCalendarEvent.
     * Returns null if the event lacks required fields (title, startDate).
     */
    protected mapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL): RipperCalendarEvent | null {
        if (!sqEvent.title || !sqEvent.startDate) {
            return null;
        }

        const startInstant = Instant.ofEpochMilli(sqEvent.startDate);
        const eventDate = ZonedDateTime.ofInstant(startInstant, timezone);

        let duration = Duration.ofHours(2);
        if (sqEvent.endDate) {
            const durationMs = sqEvent.endDate - sqEvent.startDate;
            if (durationMs > 0) {
                duration = Duration.ofMillis(durationMs);
            }
        }

        let location: string | undefined;
        if (sqEvent.location) {
            const parts = [
                sqEvent.location.addressTitle,
                sqEvent.location.addressLine1,
                sqEvent.location.addressLine2
            ].filter(Boolean).map(part => decode(part));
            location = parts.length > 0 ? parts.join(', ') : undefined;
        }

        let eventUrl: string | undefined;
        if (sqEvent.fullUrl) {
            eventUrl = new URL(sqEvent.fullUrl, baseUrl).toString();
        }

        let description = sqEvent.excerpt || undefined;
        if (description) {
            description = this.stripHtml(description).trim();
        }

        const cost = extractCostFromTags(sqEvent.tags) ?? extractCostFromBody(sqEvent.body);

        return {
            id: sqEvent.id,
            ripped: new Date(),
            date: eventDate,
            duration,
            summary: sqEvent.title,
            description,
            location,
            url: eventUrl,
            imageUrl: sqEvent.assetUrl || undefined,
            ...(cost !== undefined ? { cost } : {}),
        };
    }

    private stripHtml(html: string): string {
        return parse(html).textContent;
    }
}
