import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { lookupKnownVenue } from "../../lib/geocoder.js";
import '@js-joda/timezone';

const LOCATION = "Book Larder, 4252 Fremont Ave N, Seattle, WA 98103";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DEFAULT_DURATION_MINUTES = 120;
// Placeholder hour used only when neither the body text nor the Evey product
// page yields a confident start time. The event is still published (so it
// appears on the calendar) but paired with a startTime UncertaintyError rather
// than silently presenting the placeholder as fact — see docs/event-uncertainty.md.
const DEFAULT_START_HOUR = 18;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

interface ShopifyImage {
    src: string;
}

interface ShopifyVariant {
    price: string;
}

interface ShopifyProduct {
    id: number;
    title: string;
    handle: string;
    body_html: string;
    product_type: string;
    images?: ShopifyImage[];
    variants?: ShopifyVariant[];
}

interface ParsedDate {
    month: number; day: number; hour: number; minute: number;
    endHour?: number; endMinute?: number; year?: number;
    // True when a start time was actually found in the source (a real
    // "at 6:30pm" / "10am-2pm"), false when the hour fell back to
    // DEFAULT_START_HOUR because the source gave a date but no time. Drives
    // whether we consult Evey (authoritative) and whether we emit a
    // startTime UncertaintyError instead of publishing a silent default.
    timeConfident: boolean;
    // Off-site venue extracted from the Evey product page (Book Larder hosts
    // some events at other venues, e.g. The Triple Door). Absent for in-store
    // events, which use the hardcoded store LOCATION.
    location?: string;
}

interface ShopifyResponse {
    products: ShopifyProduct[];
}

export default class BookLarderRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString() + '?limit=250', {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' }
        });
        if (!res.ok) throw new Error(`Shopify API returned ${res.status}`);

        const data: ShopifyResponse = await res.json();

        const now = ZonedDateTime.now(TIMEZONE);
        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (const product of data.products) {
            if (product.product_type !== 'Event') continue;
            try {
                const results = await this.parseProduct(product, fetchFn);
                // parseProduct returns the event plus any paired UncertaintyError.
                // Filter past events in rip() (not parseProduct); dropping a past
                // event also drops its uncertainty.
                const event = results.find((r): r is RipperCalendarEvent => 'date' in r);
                if (event && event.date.isBefore(now)) continue;
                for (const r of results) {
                    if ('date' in r) events.push(r);
                    else errors.push(r);
                }
            } catch (err) {
                errors.push({
                    type: 'ParseError',
                    reason: `Failed to parse product ${product.id}: ${err}`,
                    context: product.title,
                });
            }
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    async parseProduct(product: ShopifyProduct, fetchFn?: FetchFn): Promise<RipperEvent[]> {
        const plainText = this.stripHtml(product.body_html);
        let parsed = this.parseDateFromText(plainText);

        // Consult the Evey Events product page — which carries structured
        // date/time/location metadata injected by the Evey Shopify app (the
        // products.json API omits it) — whenever the body text gave us no date
        // at all, OR a date but no confident start time. The latter is the
        // important case: the body often names a date ("July 6") with no time,
        // and Evey holds the authoritative time (and, for off-site events, the
        // real venue). Without this we would stamp DEFAULT_START_HOUR and never
        // look, silently publishing the wrong time at the wrong place.
        if ((!parsed || !parsed.timeConfident) && fetchFn) {
            const evey = await this.fetchEveyDate(product.handle, fetchFn);
            if (evey) parsed = evey;
        }

        if (!parsed) {
            return [{
                type: 'ParseError',
                reason: `No parseable date found in product description`,
                context: product.title,
            }];
        }

        const { month, day, hour, minute, endHour, endMinute, year: parsedYear } = parsed;

        let durationMinutes = DEFAULT_DURATION_MINUTES;
        if (endHour !== undefined) {
            const end = endHour * 60 + (endMinute ?? 0);
            const start = hour * 60 + minute;
            if (end > start) durationMinutes = end - start;
        }

        const year = parsedYear ?? new Date().getFullYear();

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, hour, minute),
            TIMEZONE
        );

        // Shopify product images are per-event (book cover / event flyer) and
        // already absolute CDN URLs.
        const imageUrl = product.images?.[0]?.src || undefined;

        // Shopify variant price: "0.00" = free, ">0" = paid (USD face value).
        let cost: EventCost | undefined;
        const priceStr = product.variants?.[0]?.price;
        if (priceStr !== undefined) {
            const price = parseFloat(priceStr);
            cost = isNaN(price) ? undefined : { min: price };
        }

        // Off-site venue: Book Larder hosts some events elsewhere (e.g. author
        // events at The Triple Door). When Evey reports a venue that isn't the
        // store, publish that location and resolve its coordinates so the map
        // pin isn't stuck in Fremont. Falls back to the store otherwise.
        const event: RipperCalendarEvent = {
            id: `book-larder-${product.id}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: product.title,
            location: LOCATION,
            url: `https://booklarder.com/products/${product.handle}`,
            imageUrl,
            cost,
        };

        if (parsed.location && !/^\s*book larder/i.test(parsed.location)) {
            event.location = parsed.location;
            const coords = lookupKnownVenue(parsed.location);
            if (coords) {
                event.lat = coords.lat;
                event.lng = coords.lng;
                event.osmType = coords.osmType;
                event.osmId = coords.osmId;
                event.geocodeSource = 'ripper';
            }
        }

        const out: RipperEvent[] = [event];

        // No confident time anywhere (body had a date but no time, and Evey
        // didn't supply one). Publish with the placeholder hour but pair an
        // UncertaintyError so the resolver can fill in the real time later,
        // instead of passing off DEFAULT_START_HOUR as fact.
        if (!parsed.timeConfident) {
            const unknownFields: UncertaintyField[] = ['startTime', 'duration'];
            const uncertainty: UncertaintyError = {
                type: 'Uncertainty',
                reason: `Book Larder listing for "${product.title}" had a date but no start time; Evey did not supply one`,
                source: 'book-larder',
                unknownFields,
                event,
                partialFingerprint: this.fingerprint(product, year, month, day),
            };
            out.push(uncertainty);
        }

        return out;
    }

    // Stable hash of what we actually parsed, so the uncertainty-cache entry is
    // invalidated when the source later changes (e.g. upstream adds a start
    // time, or the date moves). djb2 over the id + resolved date + body text.
    fingerprint(product: ShopifyProduct, year: number, month: number, day: number): string {
        const material = `book-larder-${product.id}|${year}-${month}-${day}|${this.stripHtml(product.body_html)}`;
        let h = 5381;
        for (let i = 0; i < material.length; i++) {
            h = ((h << 5) + h + material.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(16);
    }

    // Public for testing
    parseDateFromText(text: string): ParsedDate | null {
        const monthNames = MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|');

        const dateRe = new RegExp(
            `(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s+)?` +
            `(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?`,
            'i'
        );
        const dateMatch = text.match(dateRe);
        if (!dateMatch) return null;

        const monthIdx = MONTHS.findIndex(m => m === dateMatch[1].toLowerCase());
        if (monthIdx === -1) return null;

        const month = monthIdx + 1;
        const day = parseInt(dateMatch[2], 10);

        // Try to find a time range "from Xam-Ypm" or "from X-Ypm"
        const rangeRe = /(?:from|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
        const rangeMatch = text.match(rangeRe);

        // Try to find a simple start time "at X:XXpm"
        const timeRe = /(?:from|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
        const timeMatch = text.match(timeRe);

        let hour = DEFAULT_START_HOUR;
        let minute = 0;
        let endHour: number | undefined;
        let endMinute: number | undefined;
        // Confident only when we actually matched a time; a bare date leaves
        // the hour at DEFAULT_START_HOUR, which callers must not treat as fact.
        const timeConfident = !!(rangeMatch || timeMatch);

        if (rangeMatch) {
            hour = parseInt(rangeMatch[1], 10);
            minute = parseInt(rangeMatch[2] ?? '0', 10);
            const startAmPm = rangeMatch[3]?.toLowerCase();
            endHour = parseInt(rangeMatch[4], 10);
            endMinute = parseInt(rangeMatch[5] ?? '0', 10);
            const endAmPm = rangeMatch[6].toLowerCase();

            if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
            else if (endAmPm === 'am' && endHour === 12) endHour = 0;

            if (startAmPm === 'pm' && hour !== 12) hour += 12;
            else if (startAmPm === 'am' && hour === 12) hour = 0;
            else if (!startAmPm) {
                // Infer am/pm: if hour < 12 and end is PM, assume start is also PM
                // when that would produce a valid (non-negative) range.
                // e.g. "2-5pm": endHour=17, hour=2, 2<12 && 2<(17-12=5) → 2pm ✓
                // "11-1pm": endHour=13, hour=11, 11<12 but 11≮(13-12=1) → stays 11am ✓
                if (endAmPm === 'pm' && hour < 12 && hour < (endHour > 12 ? endHour - 12 : endHour)) {
                    hour += 12;
                }
            }
        } else if (timeMatch) {
            hour = parseInt(timeMatch[1], 10);
            minute = parseInt(timeMatch[2] ?? '0', 10);
            const ampm = timeMatch[3].toLowerCase();
            if (ampm === 'pm' && hour !== 12) hour += 12;
            else if (ampm === 'am' && hour === 12) hour = 0;
        }

        return { month, day, hour, minute, endHour, endMinute, timeConfident };
    }

    /**
     * Fetch the product page HTML and extract the Evey Events date/time/venue.
     * Evey injects a hidden input like: <input id="event-date" name="properties[Event-Date]" value="May 30, 2026 10:00 AM">
     * and visible blocks (each label and value in separate flex columns, so the
     * label and value are separated by </p></div><div><p>):
     *   <p><strong>Event Time:</strong></p> ... <p>10:00 am - 11:00 am</p>
     *   <p><strong>Location:</strong></p> ... <p>The Triple Door, 216 Union St, Seattle, WA 98101</p>
     * The hidden input is authoritative for the start time, so a match here is
     * always timeConfident.
     */
    async fetchEveyDate(handle: string, fetchFn: FetchFn): Promise<ParsedDate | null> {
        const url = `https://booklarder.com/collections/evey-events/products/${handle}`;
        try {
            const res = await fetchFn(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            });
            if (!res.ok) return null;

            const html = await res.text();

            // Extract from hidden input: value="May 30, 2026 10:00 AM"
            const hiddenInputRe = /name="properties\[Event-Date\]"\s+value="([^"]+)"/i;
            const hiddenMatch = html.match(hiddenInputRe);
            if (!hiddenMatch) return null;

            const dateStr = hiddenMatch[1];
            // Parse format like "May 30, 2026 10:00 AM" or "Jun 27, 2026 10:00 AM"
            const eveyRe = /(\w{3,})\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;
            const eveyMatch = dateStr.match(eveyRe);
            if (!eveyMatch) return null;

            const eveyMonth = eveyMatch[1].toLowerCase();
            let monthIdx = MONTHS.findIndex(m => m === eveyMonth);
            // Evey uses abbreviated months (Jun, Sep) — match by prefix if full name not found
            if (monthIdx === -1) {
                monthIdx = MONTHS.findIndex(m => m.startsWith(eveyMonth));
            }
            if (monthIdx === -1) return null;

            const month = monthIdx + 1;
            const day = parseInt(eveyMatch[2], 10);
            const eveyYear = parseInt(eveyMatch[3], 10);
            let hour = parseInt(eveyMatch[4], 10);
            const minute = parseInt(eveyMatch[5], 10);
            const ampm = eveyMatch[6].toUpperCase();

            if (ampm === 'PM' && hour !== 12) hour += 12;
            else if (ampm === 'AM' && hour === 12) hour = 0;

            let endHour: number | undefined;
            let endMinute: number | undefined;

            // Try to get end time from the visible "Event Time" block. The
            // label and value sit in separate flex columns, so allow arbitrary
            // markup (</p></div><div ...><p>) between "Event Time:" and the
            // range rather than assuming they're adjacent.
            const timeBlockRe = /Event Time:[\s\S]{0,400}?(\d{1,2}):(\d{2})\s*(am|pm)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i;
            const timeMatch = html.match(timeBlockRe);

            if (timeMatch) {
                // The range gives us both start and end; use the end time for duration
                let finalEndHour = parseInt(timeMatch[4], 10);
                const finalEndMinute = parseInt(timeMatch[5], 10);
                const finalEndAmpm = timeMatch[6].toLowerCase();
                if (finalEndAmpm === 'pm' && finalEndHour !== 12) finalEndHour += 12;
                else if (finalEndAmpm === 'am' && finalEndHour === 12) finalEndHour = 0;
                endHour = finalEndHour;
                endMinute = finalEndMinute;
            }

            // Extract the venue from the visible "Location:" block (same
            // label/value-in-separate-columns layout). Off-site events (e.g.
            // The Triple Door) carry a real address here; in-store events name
            // Book Larder, which parseProduct ignores in favor of the store
            // constant.
            let location: string | undefined;
            const locBlockRe = /Location:\s*<\/strong>\s*<\/p>[\s\S]{0,300}?<p[^>]*>([\s\S]*?)<\/p>/i;
            const locMatch = html.match(locBlockRe);
            if (locMatch) {
                const loc = this.stripHtml(locMatch[1]);
                if (loc) location = loc;
            }

            return { month, day, hour, minute, endHour, endMinute, year: eveyYear, timeConfident: true, location };
        } catch {
            return null;
        }
    }

    // Public for testing
    stripHtml(html: string): string {
        return html
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
}
