import { ZonedDateTime, ZoneId, Instant, Duration } from "@js-joda/core";
import { Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

/**
 * Seattle Indivisible publishes its events on Mobilize
 * (https://www.mobilize.us/seattleindivisible/). The public Mobilize API
 * endpoint for the organization also returns events *promoted* by the org but
 * hosted by other organizations nationwide (e.g. Swing Left letter-writing in
 * other states), so the caller keeps only events whose sponsor is Seattle
 * Indivisible itself, that are in person, and that are located in Seattle.
 */
export const SEATTLE_INDIVISIBLE_ORG_ID = 904;

export function isIncluded(event: any, orgId: number = SEATTLE_INDIVISIBLE_ORG_ID): boolean {
    if (event?.sponsor?.id !== orgId) return false;
    if (event.is_virtual) return false;
    const locality = String(event.location?.locality ?? "").trim().toLowerCase();
    return locality === "seattle";
}

export default class SeattleIndivisibleRipper extends JSONRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const allEvents: RipperEvent[] = [];
        let nextUrl: string | null = `${ripper.config.url}?per_page=50&timeslot_start=gte_now`;
        let pages = 0;
        const MAX_PAGES = 20;

        while (nextUrl && pages < MAX_PAGES) {
            pages++;
            const res = await fetchFn(nextUrl);
            if (!res.ok) throw new Error(`${res.url} returned HTTP ${res.status}`);
            const json = await res.json();
            const page = await this.parseEvents(json, null as any, null);
            allEvents.push(...page);
            nextUrl = json.next ?? null;
        }

        const cal = ripper.config.calendars[0];
        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events: allEvents.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: allEvents.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: cal.tags || [],
        }];
    }

    public async parseEvents(json: any, _date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        if (!Array.isArray(json?.data)) {
            return [{
                type: "ParseError",
                reason: "Missing data array in Mobilize response",
                context: JSON.stringify(json).substring(0, 200),
            }];
        }

        const events: RipperEvent[] = [];
        const nowEpoch = Math.floor(Date.now() / 1000);

        for (const event of json.data) {
            // Intentional filter: promoted events from other orgs, virtual
            // meetings, and events outside Seattle are skipped.
            if (!isIncluded(event)) continue;
            events.push(...this.parseEvent(event, nowEpoch));
        }

        return events;
    }

    public parseEvent(event: any, nowEpoch: number): RipperEvent[] {
        if (!Array.isArray(event.timeslots) || event.timeslots.length === 0) {
            return [{
                type: "ParseError",
                reason: "Event has no timeslots",
                context: String(event.id),
            }];
        }

        const out: RipperEvent[] = [];
        const location = buildLocation(event.location);
        const imageUrl: string | undefined = event.featured_image_url || undefined;
        const description: string | undefined = event.description || undefined;
        const zone = ZoneId.of(event.timezone || "America/Los_Angeles");

        for (const slot of event.timeslots) {
            // Past slots of a still-running series are skipped.
            if (typeof slot.end_date === "number" && slot.end_date < nowEpoch) continue;
            try {
                const start = ZonedDateTime.ofInstant(Instant.ofEpochSecond(slot.start_date), zone);
                const end = ZonedDateTime.ofInstant(Instant.ofEpochSecond(slot.end_date), zone);
                const seconds = end.toEpochSecond() - start.toEpochSecond();
                out.push({
                    id: `seattle-indivisible-${event.id}-${slot.id}`,
                    ripped: new Date(),
                    date: start,
                    duration: Duration.ofSeconds(seconds > 0 ? seconds : 7200),
                    summary: String(event.title ?? "").trim(),
                    description,
                    location,
                    url: event.browser_url,
                    imageUrl,
                    cost: { min: 0 },
                });
            } catch (err) {
                out.push({
                    type: "ParseError",
                    reason: `Failed to parse timeslot: ${err}`,
                    context: `event=${event.id} slot=${slot.id}`,
                });
            }
        }
        return out;
    }
}

export function buildLocation(loc: any): string {
    if (!loc) return "Seattle, WA";
    const isPrivate = (s: string) => /address is private/i.test(s);
    const parts: string[] = [];
    if (loc.venue && !isPrivate(loc.venue)) parts.push(loc.venue.trim());
    const lines = (loc.address_lines ?? [])
        .filter((l: string) => l?.trim() && !isPrivate(l))
        .map((l: string) => l.trim());
    parts.push(...lines);
    if (loc.locality) {
        const region = loc.region ? `, ${loc.region}` : "";
        const zip = loc.postal_code ? ` ${loc.postal_code}` : "";
        parts.push(`${loc.locality}${region}${zip}`);
    }
    return parts.join(", ");
}
