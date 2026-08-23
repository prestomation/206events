import { ZonedDateTime, Duration, LocalDate, OffsetDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
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

const VENUE_STREET = "109 1st Ave S";
const VENUE_ADDRESS = `Beguiled Books, ${VENUE_STREET}, Seattle, WA 98104`;
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const LISTING_URL = "https://www.beguiledbooks.com/events";
const DETAIL_URL_PREFIX = "https://www.beguiledbooks.com/event-details/";

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

/**
 * Beguiled Books runs on Wix's native events widget, which server-renders a
 * listing page of event cards (title + link, no per-event date/time). Each
 * card links either to a beguiledbooks.com detail page (which embeds a
 * schema.org Event JSON-LD block with the real start/end time) or, for some
 * events, directly out to Eventbrite (no detail page to scrape). We follow
 * the beguiledbooks.com links and skip the external ones.
 */
export default class BeguiledBooksRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const calendars: { [key: string]: { events: RipperEvent[]; friendlyName: string; tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const res = await this.fetchFn(LISTING_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
        }
        const listingHtml = await res.text();
        const eventLinks = this.extractEventLinks(listingHtml);

        const today = LocalDate.now(TIMEZONE);
        const results = await Promise.all(eventLinks.map(link => this.fetchAndParseEvent(link, today)));
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
     * Extract links to individual event detail pages from the events listing
     * page. The Wix events widget renders each event as
     * `<li data-hook="events-card">` containing `<a data-hook="title" href="...">`.
     * Only beguiledbooks.com detail-page links are followed; a few events link
     * straight out to Eventbrite instead of a detail page and are skipped.
     */
    public extractEventLinks(html: string): string[] {
        const root = parse(html);
        const links = new Set<string>();

        const anchors = root.querySelectorAll('li[data-hook="events-card"] a[data-hook="title"]');
        for (const anchor of anchors) {
            const href = anchor.getAttribute('href');
            if (!href || !href.startsWith(DETAIL_URL_PREFIX)) continue;
            links.add(href);
        }

        return Array.from(links);
    }

    private async fetchAndParseEvent(url: string, today: LocalDate): Promise<RipperEvent[]> {
        try {
            const res = await this.fetchFn(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            if (!res.ok) {
                return [{
                    type: "ParseError" as const,
                    reason: `HTTP ${res.status} fetching ${url}`,
                    context: url,
                }];
            }
            return this.parseEventPage(await res.text(), url, today);
        } catch (error) {
            return [{
                type: "ParseError" as const,
                reason: `Failed to fetch event page ${url}: ${error}`,
                context: url,
            }];
        }
    }

    /**
     * Parse a single event detail page and return a RipperCalendarEvent (or an
     * empty array for past events, or a RipperError on parse failure). The
     * page embeds a single schema.org Event JSON-LD block with ISO-8601
     * startDate/endDate (always present on every event checked so far).
     */
    public parseEventPage(htmlText: string, url: string, today: LocalDate): RipperEvent[] {
        const html = parse(htmlText);

        const ldScripts = html.querySelectorAll('script[type="application/ld+json"]');
        let eventData: Record<string, any> | null = null;
        for (const script of ldScripts) {
            try {
                // Use rawText, not textContent: node-html-parser HTML-decodes
                // textContent, which turns numeric entities like `&#010;`
                // (embedded by Wix inside multi-paragraph descriptions) into
                // literal control characters — invalid inside a JSON string
                // and fatal to JSON.parse. rawText leaves entities untouched
                // so the JSON itself parses; the `decode()` call below still
                // resolves them in the extracted description text.
                const parsed = JSON.parse(script.rawText);
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

        let eventDate: ZonedDateTime;
        try {
            const startOdt = OffsetDateTime.parse(startDateStr);
            eventDate = startOdt.atZoneSameInstant(TIMEZONE);
        } catch (e) {
            return [{
                type: "ParseError" as const,
                reason: `Could not parse startDate "${startDateStr}": ${e}`,
                context: url,
            }];
        }

        if (eventDate.toLocalDate().isBefore(today)) {
            return [];
        }

        const title = (eventData['name'] as string | undefined)?.trim() || '';
        if (!title) {
            return [{
                type: "ParseError" as const,
                reason: "No event name in schema.org Event data",
                context: url,
            }];
        }
        const summary = decode(title);

        const endDateStr = eventData['endDate'] as string | undefined;
        const unknownFields: UncertaintyField[] = [];
        let uncertaintyReason = "";
        let durationMinutes = 120;
        if (endDateStr) {
            try {
                const endOdt = OffsetDateTime.parse(endDateStr);
                const endZdt = endOdt.atZoneSameInstant(TIMEZONE);
                const diff = Duration.between(eventDate, endZdt).toMinutes();
                if (diff > 0) {
                    durationMinutes = diff;
                } else {
                    unknownFields.push("duration");
                    uncertaintyReason = `endDate is not after startDate ("${endDateStr}")`;
                }
            } catch (e) {
                unknownFields.push("duration");
                uncertaintyReason = `Could not parse endDate "${endDateStr}": ${e}`;
            }
        } else {
            unknownFields.push("duration");
            uncertaintyReason = "schema.org Event did not include endDate";
        }

        const rawDescription = eventData['description'] as string | undefined;
        const description = rawDescription ? decode(rawDescription).trim() || undefined : undefined;

        const slugMatch = url.match(/\/event-details\/([^/?]+)\/?$/);
        if (!slugMatch) {
            return [{
                type: "ParseError" as const,
                reason: `Could not derive a stable id from URL`,
                context: url,
            }];
        }
        const id = slugMatch[1];

        // Every event checked so far is at the store itself, but a future
        // off-site author appearance would have a different JSON-LD address —
        // trust it over our hardcoded venue address when it clearly diverges.
        // Reading rawText (see JSON-LD extraction above) means nothing in
        // eventData has been HTML-decoded yet, so this needs its own decode()
        // just like title/description above.
        const rawJsonAddress = (eventData['location']?.['address'] as string | undefined)?.trim();
        const jsonAddress = rawJsonAddress ? decode(rawJsonAddress) : undefined;
        const location = jsonAddress && !jsonAddress.includes(VENUE_STREET) ? jsonAddress : VENUE_ADDRESS;

        const rawImageUrl = extractImageUrl(eventData['image']);
        const imageUrl = rawImageUrl ? decode(rawImageUrl) : undefined;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary,
            description,
            location,
            url,
            imageUrl,
        };

        const results: RipperEvent[] = [event];
        if (unknownFields.length > 0) {
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: uncertaintyReason,
                source: "beguiled_books",
                unknownFields,
                event,
                partialFingerprint: simpleHash(`${startDateStr}|${endDateStr ?? ''}`),
            };
            results.push(uncertainty);
        }
        return results;
    }
}
