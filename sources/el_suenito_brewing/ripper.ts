import { Duration, ZoneId, ChronoUnit, ZonedDateTime } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from "node-html-parser";

// The Seattle/Fremont taproom's freeform `location.name`/`location.address`
// text is occasionally mislabeled upstream as Bellingham even on events whose
// structured `fullAddress` (city, zip, street, geocode) is unambiguously this
// address — see isSeattleEvent below. Since this feed has exactly one Seattle
// location, use a fixed, known-correct string rather than propagating
// whichever freeform label the source attached to a given event.
const LOCATION = "El Sueñito & Frelard Tamales, 106 N 36th St Suite 100, Seattle, WA 98103";
const BASE_URL = "https://www.elsuenitobrewing.com";
const TIMEZONE = ZoneId.of("America/Los_Angeles");

interface WixEventLocation {
    fullAddress?: { city?: string };
}

interface WixEvent {
    id: string;
    title?: string;
    description?: string;
    slug?: string;
    location?: WixEventLocation;
    mainImage?: { url?: string };
    scheduling?: {
        config?: {
            startDate?: string;
            endDate?: string;
        };
    };
}

/**
 * El Sueñito Brewing runs one shared Wix Events calendar across its
 * Bellingham flagship and its Seattle/Fremont taproom. The calendar page
 * doesn't expose a REST API, but Wix server-renders every upcoming event
 * (including full location and scheduling data) into a `<script
 * type="application/json" id="wix-warmup-data">` blob used to hydrate the
 * page client-side — no JS execution needed to read it.
 */
export function extractWixEvents(warmupData: any): WixEvent[] {
    const apps = warmupData?.appsWarmupData;
    if (!apps || typeof apps !== "object") return [];
    for (const widgetData of Object.values(apps)) {
        if (!widgetData || typeof widgetData !== "object") continue;
        for (const widget of Object.values(widgetData as Record<string, any>)) {
            const events = widget?.events?.events;
            if (Array.isArray(events)) return events;
        }
    }
    return [];
}

/**
 * The structured `location.fullAddress.city` field is more reliable than
 * the freeform `location.name`/`location.address` text for telling Seattle
 * events apart from Bellingham ones: at least one event has been observed
 * with a Bellingham-labeled name/address string despite every structured
 * field (city, zip, street, geocode) matching the Seattle taproom exactly —
 * an apparent data-entry mistake on the source's end. We trust the
 * structured field, matching the `browne_family_vineyards_seattle` pattern
 * of filtering a shared multi-location feed by geocoded city rather than by
 * venue name or title text.
 */
export function isSeattleEvent(event: WixEvent): boolean {
    return event.location?.fullAddress?.city?.trim().toLowerCase() === "seattle";
}

export default class ElSuenitoBrewingRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const script = html.querySelector("#wix-warmup-data");
        if (!script) {
            return [{ type: "ParseError", reason: "wix-warmup-data script tag not found on events page", context: undefined }];
        }

        let warmupData: any;
        try {
            warmupData = JSON.parse(script.rawText);
        } catch (error) {
            return [{ type: "ParseError", reason: `Failed to parse wix-warmup-data JSON: ${error}`, context: undefined }];
        }

        const wixEvents = extractWixEvents(warmupData);
        const results: RipperEvent[] = [];

        for (const wixEvent of wixEvents) {
            if (this.seenEvents.has(wixEvent.id)) continue;
            if (!isSeattleEvent(wixEvent)) continue;
            this.seenEvents.add(wixEvent.id);

            const title = wixEvent.title?.trim();
            if (!title) {
                results.push({ type: "ParseError", reason: `Event ${wixEvent.id} has no title`, context: wixEvent.id });
                continue;
            }

            const startDateRaw = wixEvent.scheduling?.config?.startDate;
            if (!startDateRaw) {
                results.push({ type: "ParseError", reason: `No start time for event "${title}"`, context: wixEvent.id });
                continue;
            }

            const startDate = ZonedDateTime.parse(startDateRaw).withZoneSameInstant(TIMEZONE);

            let duration = Duration.ofHours(2);
            const endDateRaw = wixEvent.scheduling?.config?.endDate;
            if (endDateRaw) {
                const endDate = ZonedDateTime.parse(endDateRaw).withZoneSameInstant(TIMEZONE);
                const seconds = startDate.until(endDate, ChronoUnit.SECONDS);
                if (seconds > 0) {
                    duration = Duration.ofSeconds(seconds);
                }
            }

            const event: RipperCalendarEvent = {
                id: `el-suenito-brewing-${wixEvent.id}`,
                ripped: new Date(),
                date: startDate,
                duration,
                summary: title,
                description: wixEvent.description?.trim() || undefined,
                location: LOCATION,
                url: wixEvent.slug ? `${BASE_URL}/event-details/${wixEvent.slug}` : BASE_URL,
                imageUrl: wixEvent.mainImage?.url,
            };

            results.push(event);
        }

        return results;
    }
}
