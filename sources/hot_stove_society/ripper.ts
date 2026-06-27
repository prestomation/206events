import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import { parse as parseHtml } from "node-html-parser";
import "@js-joda/timezone";

const BASE_URL = "https://www.hotstovesociety.com";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_LOCATION = "2000 4th Ave, Seattle, WA 98121";
const DEFAULT_DURATION_HOURS = 2;

interface BentoboxEventSchema {
    "@type": string;
    url?: string;
    name?: string;
    description?: string;
    image?: string;
    startDate?: string;
    endDate?: string;
    location?: {
        streetAddress?: string;
        addressLocality?: string;
        addressRegion?: string;
        postalCode?: string;
    };
}

export function extractEventUrls(html: string): string[] {
    const root = parseHtml(html);
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const a of root.querySelectorAll("li.card a.card__btn")) {
        const href = a.getAttribute("href");
        if (href && href.startsWith("/store/event/") && !seen.has(href)) {
            seen.add(href);
            urls.push(`${BASE_URL}${href}`);
        }
    }
    return urls;
}

export function parseEventPage(html: string, pageUrl: string): RipperEvent {
    const root = parseHtml(html);
    const scripts = root.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
        let data: BentoboxEventSchema;
        try {
            data = JSON.parse(script.text) as BentoboxEventSchema;
        } catch {
            continue;
        }

        if (data["@type"] !== "Event") continue;

        const name = data.name;
        const rawStart = data.startDate;

        if (!name || !rawStart) continue;

        // BentoBox stores local Pacific time with a Z suffix as if it were UTC.
        // Strip the Z and parse as a local datetime, then apply the Pacific timezone.
        const localStart = rawStart.replace(/Z$/, "");
        let startZdt: ZonedDateTime;
        try {
            startZdt = ZonedDateTime.of(LocalDateTime.parse(localStart), TIMEZONE);
        } catch (e) {
            return {
                type: "ParseError" as const,
                reason: `Cannot parse startDate "${rawStart}": ${e}`,
                context: pageUrl,
            };
        }

        let duration = Duration.ofHours(DEFAULT_DURATION_HOURS);
        const rawEnd = data.endDate;
        if (rawEnd) {
            try {
                const localEnd = rawEnd.replace(/Z$/, "");
                const endZdt = ZonedDateTime.of(LocalDateTime.parse(localEnd), TIMEZONE);
                const mins = Duration.between(startZdt, endZdt).toMinutes();
                if (mins > 0) duration = Duration.ofMinutes(mins);
            } catch {
                // keep default duration
            }
        }

        const loc = data.location;
        const location = loc?.streetAddress
            ? `${loc.streetAddress}, ${loc.addressLocality}, ${loc.addressRegion} ${loc.postalCode}`
            : DEFAULT_LOCATION;

        const slug = pageUrl.replace(/\/$/, "").split("/").pop() ?? pageUrl;
        const description = data.description
            ? decode(data.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 1500)
            : undefined;

        const event: RipperCalendarEvent = {
            id: `hot-stove-society-${slug}`,
            ripped: new Date(),
            date: startZdt,
            duration,
            summary: decode(name),
            description: description || undefined,
            location,
            url: data.url ?? pageUrl,
            imageUrl: data.image || undefined,
            cost: { paid: true },
        };

        return event;
    }

    return {
        type: "ParseError" as const,
        reason: "No Event LD+JSON found on page",
        context: pageUrl,
    };
}

export default class HotStoveSocietyRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const listingRes = await this.fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!listingRes.ok) {
            throw new Error(`Hot Stove Society returned HTTP ${listingRes.status}`);
        }

        const listingHtml = await listingRes.text();
        const eventUrls = extractEventUrls(listingHtml);

        const results: RipperEvent[] = await Promise.all(
            eventUrls.map(url => this.fetchEvent(url))
        );

        const events = results.filter((e): e is RipperCalendarEvent => "date" in e);
        const errors = results.filter((e): e is RipperError => "type" in e);

        const cal = ripper.config.calendars[0];
        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            tags: cal.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    private async fetchEvent(url: string): Promise<RipperEvent> {
        try {
            const res = await this.fetchFn(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
            });
            if (!res.ok) {
                return {
                    type: "ParseError" as const,
                    reason: `HTTP ${res.status} fetching ${url}`,
                    context: url,
                };
            }
            return parseEventPage(await res.text(), url);
        } catch (err) {
            return {
                type: "ParseError" as const,
                reason: `Fetch error for ${url}: ${err}`,
                context: url,
            };
        }
    }
}
