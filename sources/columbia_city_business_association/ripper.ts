import { ZonedDateTime, Duration, LocalDateTime, ZoneId, DateTimeFormatter } from "@js-joda/core";
import { Locale } from "@js-joda/locale_en-us";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
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

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const LISTING_URL = "https://columbiacityseattle.com/calendar";
// e.g. "Tue, September 22, 2026 9:00 AM"
const DATE_FMT = DateTimeFormatter.ofPattern("EEE, MMMM d, uuuu h:mm a").withLocale(Locale.US);

/**
 * Columbia City Business Association runs on Wild Apricot. The public
 * `/calendar` page server-renders an "UPCOMING EVENTS" widget with a small,
 * static `<li>` per event (title + link, formatted date/time, location) —
 * everything this ripper needs in one page, no per-event detail-page fetch.
 *
 * This is deliberate: Wild Apricot rate-limits this host aggressively
 * (observed HTTP 429 on the `/event-NNNNNNN` detail pages after just one
 * prior request from the same IP, even tens of seconds apart), so a design
 * that fetched each event's detail page — which briefly existed here and
 * had all-passing tests, but reliably 429'd during a real build — is not
 * viable. The listing page's own event count only tends to be a handful, so
 * losing the finer per-event description text from the detail pages is an
 * acceptable trade for a pipeline that isn't rate-limited into oblivion.
 */
export default class ColumbiaCityBusinessAssociationRipper implements IRipper {
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

        const html = parse(await res.text());
        const allEvents = this.parseEvents(html);

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
     * Parse every event `<li>` from the "UPCOMING EVENTS" gadget. Wild
     * Apricot only ever renders currently-upcoming events here (no past
     * events to filter out), so every item found is included.
     */
    public parseEvents(html: HTMLElement): RipperEvent[] {
        const items = html.querySelectorAll('.WaGadgetUpcomingEvents li');
        const results: RipperEvent[] = [];
        for (const item of items) {
            results.push(...this.parseEventItem(item));
        }
        return results;
    }

    private parseEventItem(item: HTMLElement): RipperEvent[] {
        const anchor = item.querySelector('.title a');
        const href = anchor?.getAttribute('href')?.trim();
        const summary = anchor?.text?.trim();
        const context = href ?? item.text.trim().slice(0, 100);

        if (!href) {
            return [{ type: "ParseError" as const, reason: "No event link found in listing item", context }];
        }
        if (!summary) {
            return [{ type: "ParseError" as const, reason: "No event title found in listing item", context: href }];
        }

        const idMatch = href.match(/\/event-(\d+)/);
        if (!idMatch) {
            return [{ type: "ParseError" as const, reason: `Could not derive a stable id from URL "${href}"`, context: href }];
        }
        const id = `ccba-${idMatch[1]}`;

        const dateText = item.querySelector('.date span[client-tz-display]')?.text?.trim();
        if (!dateText) {
            return [{ type: "ParseError" as const, reason: "No date text found in listing item", context: href }];
        }

        let eventDate: ZonedDateTime;
        try {
            eventDate = LocalDateTime.parse(dateText, DATE_FMT).atZone(TIMEZONE);
        } catch (e) {
            return [{ type: "ParseError" as const, reason: `Could not parse date "${dateText}": ${e}`, context: href }];
        }

        // Wild Apricot's own HTML entity-encodes the location text once
        // (e.g. an apostrophe as `&#39;`); node-html-parser's `.text`
        // already resolves that, but decode() is cheap insurance against a
        // stray double-encoded entity slipping through.
        //
        // Wild Apricot separates venue name from street address with " • "
        // (e.g. "Odessa Brown Children's Clinic • 3939 S Othello St #101,
        // Seattle"). lib/geocoder.ts's extractAddressFromVenuePrefix only
        // recognizes a ":" or "," directly before the address, not "•", so
        // without normalizing this every event would be geocoded as one
        // noisy free-text query instead of falling back to the address
        // alone when the full "venue, address" string fails to resolve.
        const rawLocation = item.querySelector('.location span')?.text?.trim();
        const location = rawLocation ? decode(rawLocation).replace(/\s*•\s*/g, ', ') : undefined;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(60),
            summary: decode(summary),
            location,
            url: href,
        };

        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            reason: "Listing page gives only a start time; end time/duration is not published",
            source: "columbia-city-business-association",
            unknownFields: ["duration"],
            event,
            partialFingerprint: simpleHash(dateText),
        };
        return [event, uncertainty];
    }
}
