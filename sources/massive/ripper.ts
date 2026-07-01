import { DateTimeFormatter, Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { Locale } from "@js-joda/locale_en-us";
import { parse } from "node-html-parser";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import "@js-joda/timezone";

const LOCATION = "Massive, 619 E Pine St, Seattle, WA 98122";
const DEFAULT_DURATION = Duration.ofHours(4);

// "Jul 3, 2026 10:00 PM" — the hidden `.infotext.hide` div on each event card.
const DATE_TIME_FMT = DateTimeFormatter.ofPattern("MMM d, uuuu h:mm a").withLocale(Locale.US);

interface MassiveJsonLdEvent {
    "@type"?: string;
    name?: string;
    image?: string;
    offers?: {
        price?: string | number;
        url?: string;
    };
}

export function extractMassiveEvents(
    html: string,
    timezone: ZoneId,
    now: ZonedDateTime = ZonedDateTime.now(timezone),
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    const root = parse(html);
    const items = root.querySelectorAll(".event-item");

    for (const item of items) {
        const script = item.querySelector('script[type="application/ld+json"]');
        const timeText = item.querySelector(".infotext.hide")?.text?.trim();

        if (!script || !timeText) {
            errors.push({
                type: "ParseError",
                reason: "Event card missing JSON-LD schema or date/time text",
                context: item.text.trim().substring(0, 100),
            });
            continue;
        }

        let data: MassiveJsonLdEvent;
        try {
            data = JSON.parse(script.rawText);
        } catch (error) {
            errors.push({ type: "ParseError", reason: `Failed to parse JSON-LD: ${error}`, context: script.rawText.substring(0, 200) });
            continue;
        }

        if (data["@type"] !== "Event") continue;

        if (!data.name) {
            errors.push({ type: "ParseError", reason: "JSON-LD Event missing name", context: JSON.stringify(data).substring(0, 200) });
            continue;
        }

        let date: ZonedDateTime;
        try {
            date = LocalDateTime.parse(timeText, DATE_TIME_FMT).atZone(timezone);
        } catch (error) {
            errors.push({ type: "ParseError", reason: `Could not parse date/time "${timeText}": ${error}`, context: data.name });
            continue;
        }

        if (date.isBefore(now)) continue;

        const url = data.offers?.url;
        const id = extractEventId(url, data.name, date);
        if (seen.has(id)) continue;
        seen.add(id);

        let cost: EventCost = { paid: true };
        const rawPrice = data.offers?.price;
        if (rawPrice != null && rawPrice !== "") {
            const price = typeof rawPrice === "number" ? rawPrice : parseFloat(rawPrice);
            if (Number.isFinite(price)) cost = { min: price };
        }

        events.push({
            id,
            ripped: new Date(),
            date,
            duration: DEFAULT_DURATION,
            summary: decode(data.name),
            location: LOCATION,
            url: url || undefined,
            imageUrl: data.image || undefined,
            cost,
        });
    }

    return { events, errors };
}

function extractEventId(url: string | undefined, name: string, date: ZonedDateTime): string {
    if (url) {
        // "https://tixr.com/e/197329" -> "massive-197329"
        const match = url.match(/\/e\/([^/?]+)/);
        if (match) return `massive-${match[1]}`;
        return `massive-${url}`;
    }
    // No Tixr URL: fall back to a stable hash of name + date so ids don't
    // change between builds (see AGENTS.md "Ripper Design: Stable Event IDs").
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `massive-${slug}-${date.toLocalDate().toString()}`;
}

export default class MassiveRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`Massive returned HTTP ${res.status}`);

        const html = await res.text();
        const { events, errors } = extractMassiveEvents(html, timezone, now);

        const calConfig = ripper.config.calendars[0];
        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
