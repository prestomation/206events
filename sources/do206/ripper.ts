import { ChronoUnit, Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const BASE_URL = "https://do206.com";

// Do206 (DoStuff Media) is a Puget Sound-wide events aggregator, not
// Seattle-only — most events are in Seattle, but a minority (e.g. a
// McMenamins in Bothell) are elsewhere in the metro. Each event card
// carries a structured addressLocality field, so filtering to Seattle
// proper is exact rather than a guess.
const SEATTLE_LOCALITY = "seattle";

function pad(n: number): string {
    return n.toString().padStart(2, "0");
}

// "/events/2026/9/15/lido-pimienta-tickets" -> "lido-pimienta-tickets"
function slugFromPermalink(permalink: string): string {
    const parts = permalink.split("/").filter(Boolean);
    return parts[parts.length - 1];
}

export default class Do206Ripper implements IRipper {
    private seenIds = new Set<string>();

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        // CI runs in UTC; do206's day-path URLs must be computed against the
        // site's own Pacific "today", not the runner's UTC date, or the
        // lookahead window silently shifts by a day for part of each 24h.
        const now = ZonedDateTime.now(ZoneId.of("America/Los_Angeles")).toLocalDateTime();
        const lookaheadDays = ripper.config.lookahead
            ? now.until(now.plus(ripper.config.lookahead), ChronoUnit.DAYS)
            : 30;

        const allEvents: RipperEvent[] = [];

        for (let i = 0; i < lookaheadDays; i++) {
            const day = now.plusDays(i);
            const url = `${BASE_URL}/events/${day.year()}/${pad(day.monthValue())}/${pad(day.dayOfMonth())}`;

            try {
                const res = await fetchFn(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    },
                });
                if (!res.ok) {
                    allEvents.push({ type: "ParseError", reason: `HTTP ${res.status} ${res.statusText} fetching ${url}`, context: url });
                    continue;
                }
                const html = parse(await res.text());
                allEvents.push(...this.parseDayEvents(html));
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                allEvents.push({ type: "ParseError", reason: `Failed to fetch ${url}: ${msg}`, context: url });
            }
        }

        const cal = ripper.config.calendars[0];
        if (!cal) {
            throw new Error("No calendars configured for do206 ripper");
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter(e => "date" in e) as RipperCalendarEvent[],
            errors: allEvents.filter(e => "type" in e) as RipperError[],
            parent: ripper.config,
            tags: cal.tags || [],
        }];
    }

    // Exported behavior for testing: parse one day's listing page.
    public parseDayEvents(html: HTMLElement): RipperEvent[] {
        const events: RipperEvent[] = [];
        const cards = html.querySelectorAll('div.ds-listing.event-card');

        for (const card of cards) {
            // Do206 covers the whole Puget Sound metro; keep Seattle-proper
            // events only (see SEATTLE_LOCALITY above). A present-but-other
            // locality (e.g. "Bothell") is filtered here, before parsing —
            // not an error, just out of scope for this calendar. A missing
            // locality is kept rather than guessed away.
            const locality = card.querySelector('[itemprop="addressLocality"]')?.getAttribute("content");
            if (locality && locality.trim().toLowerCase() !== SEATTLE_LOCALITY) {
                continue;
            }

            const parsed = this.parseCard(card);

            if ("type" in parsed) {
                events.push(parsed);
                continue;
            }

            if (this.seenIds.has(parsed.id!)) continue;
            this.seenIds.add(parsed.id!);
            events.push(parsed);
        }

        return events;
    }

    private parseCard(card: HTMLElement): RipperEvent {
        const permalink = card.getAttribute("data-permalink");
        const titleEl = card.querySelector('.ds-listing-event-title-text[itemprop="name"]');
        const title = titleEl?.textContent?.trim();

        if (!permalink || !title) {
            return { type: "ParseError", reason: "Event card missing permalink or title", context: card.toString().substring(0, 200) };
        }

        const slug = slugFromPermalink(permalink);

        const startMeta = card.querySelector('meta[itemprop="startDate"]');
        const datetimeAttr = startMeta?.getAttribute("datetime");
        if (!datetimeAttr) {
            return { type: "ParseError", reason: `No startDate found for "${title}"`, context: permalink };
        }

        // "2026-09-15T19:00-0700" - the UTC offset is dropped; do206 events
        // are always local Puget Sound time, matched by the calendar's own
        // America/Los_Angeles zone.
        const dateMatch = datetimeAttr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (!dateMatch) {
            return { type: "ParseError", reason: `Could not parse startDate "${datetimeAttr}" for "${title}"`, context: permalink };
        }
        const [, y, mo, d, h, mi] = dateMatch;
        const date = ZonedDateTime.of(
            LocalDateTime.of(parseInt(y), parseInt(mo), parseInt(d), parseInt(h), parseInt(mi)),
            ZoneId.of("America/Los_Angeles"),
        );

        const id = `do206-${date.toLocalDate().toString()}-${slug}`;

        const venueEl = card.querySelector('[itemprop="location"]');
        const venueName = venueEl?.querySelector('[itemprop="name"]')?.textContent?.trim();
        const streetAddress = venueEl?.querySelector('[itemprop="streetAddress"]')?.getAttribute("content");
        const locality = venueEl?.querySelector('[itemprop="addressLocality"]')?.getAttribute("content");
        const region = venueEl?.querySelector('[itemprop="addressRegion"]')?.getAttribute("content");
        const postalCode = venueEl?.querySelector('[itemprop="postalCode"]')?.getAttribute("content");

        const cityLine = [locality, region].filter(Boolean).join(", ");
        const locationParts = [venueName, streetAddress, [cityLine, postalCode].filter(Boolean).join(" ")].filter(Boolean);
        const location = locationParts.length > 0 ? locationParts.join(", ") : undefined;

        const latStr = venueEl?.querySelector('[itemprop="latitude"]')?.getAttribute("content");
        const lngStr = venueEl?.querySelector('[itemprop="longitude"]')?.getAttribute("content");
        const lat = latStr ? parseFloat(latStr) : NaN;
        const lng = lngStr ? parseFloat(lngStr) : NaN;

        const coverStyle = card.querySelector('.ds-cover-image')?.getAttribute("style");
        const imageMatch = coverStyle?.match(/url\(['"]?([^'")]+)['"]?\)/);
        const imageUrl = imageMatch ? imageMatch[1] : undefined;

        const byline = card.querySelector('.ds-byline')?.textContent?.trim();

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date,
            duration: Duration.ofHours(3),
            summary: decode(title),
            description: byline ? decode(byline) : undefined,
            location,
            url: `${BASE_URL}${permalink}`,
            imageUrl,
        };

        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            event.lat = lat;
            event.lng = lng;
            event.geocodeSource = 'ripper';
        }

        // Permalinks ending in "-tickets" or "-tickets-XXXX" are ticketed paid events.
        if (/-tickets(-[a-z0-9]+)?$/.test(permalink)) {
            const cost: EventCost = { paid: true };
            event.cost = cost;
        }

        return event;
    }
}
