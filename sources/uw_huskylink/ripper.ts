import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { Duration, Instant, OffsetDateTime, ZonedDateTime } from "@js-joda/core";
import { RipperEvent, RipperCalendarEvent } from "../../lib/config/schema.js";

const IMAGE_BASE = "https://se-images.campuslabs.com/clink/images/";
const EVENT_BASE = "https://huskylink.washington.edu/event/";
const DEFAULT_DURATION_MIN = 60;

// The Engage API returns ISO 8601 timestamps with explicit offsets
// (e.g. `2026-05-23T23:00:00+00:00`). `Instant.parse` only accepts the
// `Z` form, so route through `OffsetDateTime` which accepts both.
function parseToInstant(s: string): Instant {
    return OffsetDateTime.parse(s).toInstant();
}

// Bounded debug description for ParseError `context` — avoid running
// `JSON.stringify` on potentially huge payloads, which would allocate
// before the substring trim.
function describeShape(value: unknown): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (Array.isArray(value)) return `array(len=${value.length})`;
    if (typeof value === "object") {
        const keys = Object.keys(value as object).slice(0, 8).join(",");
        return `object{${keys}}`;
    }
    return `${typeof value}:${String(value).substring(0, 100)}`;
}

export default class HuskyLinkRipper extends JSONRipper {
    private seenIds = new Set<string>();

    public async parseEvents(
        jsonData: any,
        date: ZonedDateTime,
        _config: any
    ): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        if (!jsonData || !Array.isArray(jsonData.value)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: expected an object with a `value` array",
                context: describeShape(jsonData)
            }];
        }

        const zone = date.zone();

        for (const ev of jsonData.value) {
            const result = this.parseEvent(ev, zone);
            if ('date' in result) {
                if (result.id && this.seenIds.has(result.id)) continue;
                if (result.id) this.seenIds.add(result.id);
                events.push(result);
            } else {
                events.push(result);
            }
        }

        return events;
    }

    private parseEvent(ev: any, zone: any): RipperCalendarEvent | { type: "ParseError"; reason: string; context: string | undefined } {
        const id = ev?.id != null ? String(ev.id) : undefined;
        const name = typeof ev?.name === "string" ? ev.name.trim() : "";
        const startsOn = typeof ev?.startsOn === "string" ? ev.startsOn : undefined;

        if (!id || !name || !startsOn) {
            return {
                type: "ParseError",
                reason: "Event is missing required fields (id, name, or startsOn)",
                context: id ? `id=${id}` : describeShape(ev)
            };
        }

        let startInstant: Instant;
        try {
            startInstant = parseToInstant(startsOn);
        } catch {
            return {
                type: "ParseError",
                reason: `Could not parse startsOn: ${startsOn}`,
                context: `id=${id}`
            };
        }
        const startDate = startInstant.atZone(zone);

        let duration = Duration.ofMinutes(DEFAULT_DURATION_MIN);
        if (typeof ev?.endsOn === "string") {
            try {
                const endInstant = parseToInstant(ev.endsOn);
                const ms = endInstant.toEpochMilli() - startInstant.toEpochMilli();
                if (ms > 0) duration = Duration.ofMillis(ms);
            } catch {
                // Fall through to default duration
            }
        }

        const org = typeof ev?.organizationName === "string"
            ? ev.organizationName.trim()
            : "";
        const summary = org ? `${name} — ${org}` : name;

        const description = this.buildDescription(ev);
        const location = typeof ev?.location === "string" && ev.location.trim()
            ? ev.location.trim()
            : undefined;

        const event: RipperCalendarEvent = {
            id,
            ripped: new Date(),
            date: startDate,
            duration,
            summary,
            description,
            location,
            url: `${EVENT_BASE}${id}`,
        };

        if (typeof ev?.imagePath === "string" && ev.imagePath) {
            event.imageUrl = `${IMAGE_BASE}${ev.imagePath}`;
        }

        const lat = this.parseCoord(ev?.latitude);
        const lng = this.parseCoord(ev?.longitude);
        if (lat !== undefined && lng !== undefined) {
            event.lat = lat;
            event.lng = lng;
        }

        return event;
    }

    private parseCoord(value: any): number | undefined {
        if (value === null || value === undefined || value === "") return undefined;
        const n = typeof value === "number" ? value : parseFloat(String(value));
        if (!Number.isFinite(n)) return undefined;
        return n;
    }

    private buildDescription(ev: any): string | undefined {
        const parts: string[] = [];
        const raw = typeof ev?.description === "string" ? ev.description : "";
        const stripped = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (stripped) parts.push(stripped);

        const cats = Array.isArray(ev?.categoryNames)
            ? ev.categoryNames.filter((c: any) => typeof c === "string" && c.trim())
            : [];
        if (cats.length > 0) parts.push(`Categories: ${cats.join(", ")}`);

        const benefits = Array.isArray(ev?.benefitNames)
            ? ev.benefitNames.filter((b: any) => typeof b === "string" && b.trim())
            : [];
        if (benefits.length > 0) parts.push(`Perks: ${benefits.join(", ")}`);

        return parts.length > 0 ? parts.join("\n\n") : undefined;
    }
}
