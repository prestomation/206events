import { LocalDateTime, ZonedDateTime, Duration, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export default class DowntownSeattleRipper extends JSONRipper {
    // Override rip() to fetch the full upcoming event list once (paginated), then bucket
    // events into calendars client-side. A single unfiltered, fully-paginated fetch sees
    // every event exactly once — including ones with no venue at all (e.g. "Belltown
    // Blast", a neighborhood-wide street festival not tied to one of DSA's tracked parks)
    // or a venue_id not yet configured here — so a `catchAll` calendar can pick those up
    // instead of silently dropping them. (An earlier version fetched per-venue with a
    // server-side `?venue=` filter specifically to avoid truncating multi-page results;
    // fully paginating the single unfiltered fetch here avoids that same truncation while
    // also seeing events outside the tracked venue list.)
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const startDate = LocalDateTime.now().toLocalDate().toString();

        const allRawEvents: any[] = [];
        // Surfaced on every calendar below rather than thrown — a single malformed page
        // shouldn't zero out every calendar's events when other pages parsed fine.
        const fetchErrors: RipperError[] = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
            const params = new URLSearchParams({
                start_date: startDate,
                per_page: "50",
                page: String(page),
            });
            const url = `${ripper.config.url}?${params}`;
            const res = await fetchFn(url);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

            const jsonData = await res.json();
            totalPages = jsonData.total_pages ?? 1;
            if (Array.isArray(jsonData.events)) {
                allRawEvents.push(...jsonData.events);
            } else {
                fetchErrors.push({
                    type: "ParseError",
                    reason: `Invalid JSON structure on page ${page}: missing events array`,
                    context: JSON.stringify(jsonData).substring(0, 100) + "...",
                });
            }
            page++;
        }
        const combinedJsonData = { events: allRawEvents };

        const knownVenueIds = ripper.config.calendars
            .map(cal => (cal.config as any)?.venue_id)
            .filter((id: unknown): id is number | string => id !== undefined && id !== null)
            .map((id: number | string) => parseInt(String(id), 10));

        const results: RipperCalendar[] = [];
        for (const cal of ripper.config.calendars) {
            const calConfig: any = { ...(cal.config as any) };
            if (calConfig.catchAll) calConfig.excludeVenueIds = knownVenueIds;

            const calEvents = await this.parseEvents(
                combinedJsonData,
                ZonedDateTime.of(LocalDateTime.now(), cal.timezone),
                calConfig,
            );

            results.push({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: calEvents.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
                errors: [...fetchErrors, ...calEvents.filter(e => "type" in e).map(e => e as RipperError)],
                parent: ripper.config,
                tags: cal.tags || [],
            });
        }

        return results;
    }

    public async parseEvents(jsonData: any, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        if (!jsonData.events || !Array.isArray(jsonData.events)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing events array",
                context: JSON.stringify(jsonData).substring(0, 100) + "..."
            }];
        }

        // DSA marks internal, members-only gatherings (roundtables, member receptions)
        // with a "DSA Member-Only" category, distinct from its "Public" category. These
        // aren't events the public can attend, so they're excluded from every calendar
        // regardless of venue — publishing them would misrepresent them as open events.
        const publicEvents = jsonData.events.filter((event: any) => !this.isMemberOnly(event));

        // Client-side venue filter — rip() fetches the full unfiltered event list once,
        // so every calendar (including tests calling parseEvents directly) filters here.
        let rawEvents = publicEvents;
        if (config?.venue_id) {
            const targetId = parseInt(config.venue_id);
            rawEvents = rawEvents.filter((event: any) => {
                const venue = this.getVenue(event);
                return venue && venue.id === targetId;
            });
        } else if (Array.isArray(config?.excludeVenueIds)) {
            // Catch-all calendar: events with no venue at all, or a venue not tracked by
            // any other calendar (e.g. one-off event venues, or a neighborhood-wide event
            // like "Belltown Blast" that isn't tied to a single physical DSA venue).
            const excluded = new Set(config.excludeVenueIds.map((id: any) => parseInt(String(id), 10)));
            rawEvents = rawEvents.filter((event: any) => {
                const venue = this.getVenue(event);
                return !venue || !excluded.has(venue.id);
            });
        }

        const events: RipperEvent[] = [];
        for (const event of rawEvents) {
            try {
                const startDetails = event.start_date_details;
                const eventZone = event.timezone || date.zone().toString();

                const eventLocalDateTime = LocalDateTime.of(
                    parseInt(startDetails.year),
                    parseInt(startDetails.month),
                    parseInt(startDetails.day),
                    parseInt(startDetails.hour),
                    parseInt(startDetails.minutes),
                    parseInt(startDetails.seconds)
                );
                const eventDate = eventLocalDateTime.atZone(ZoneId.of(eventZone));

                const endDetails = event.end_date_details;
                const endLocalDateTime = LocalDateTime.of(
                    parseInt(endDetails.year),
                    parseInt(endDetails.month),
                    parseInt(endDetails.day),
                    parseInt(endDetails.hour),
                    parseInt(endDetails.minutes),
                    parseInt(endDetails.seconds)
                );
                const durationSeconds =
                    endLocalDateTime.atZone(ZoneId.of(eventZone)).toEpochSecond() -
                    eventLocalDateTime.atZone(ZoneId.of(eventZone)).toEpochSecond();
                const duration = Duration.ofSeconds(durationSeconds);

                const venueObj = this.getVenue(event);
                const location = venueObj
                    ? `${venueObj.venue}, ${venueObj.address}, ${venueObj.city}, ${venueObj.stateprovince} ${venueObj.zip}`
                    : undefined;

                let description = event.description ? this.stripHtml(event.description) : undefined;
                let imageUrl: string | undefined;
                if (event.image?.url) {
                    imageUrl = event.image.url.startsWith("http")
                        ? event.image.url
                        : `https://downtownseattle.org${event.image.url}`;
                    description = description ? `${description}\n\nEvent image: ${imageUrl}` : `Event image: ${imageUrl}`;
                }

                events.push({
                    id: event.id.toString(),
                    ripped: new Date(),
                    date: eventDate,
                    duration,
                    summary: event.title,
                    description,
                    location,
                    url: event.url,
                    imageUrl: imageUrl,
                });
            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: JSON.stringify(event).substring(0, 100) + "..."
                });
            }
        }
        return events;
    }

    private isMemberOnly(event: any): boolean {
        const categories = Array.isArray(event.categories) ? event.categories : [];
        return categories.some((cat: any) => cat?.slug === "member");
    }

    // Only considers the first venue for events the API tags with more than one (e.g.
    // "Community Blood Drives at Downtown Parks" listing both Westlake Park and Occidental
    // Square). Such an event is routed to only its first venue's calendar, not both, and
    // not the catch-all. Pre-existing limitation, not introduced by the catch-all/bucketing
    // rework — a real fix requires deciding how a multi-venue event should be represented
    // across calendars, which is out of scope here.
    private getVenue(event: any): any | null {
        if (!event.venue) return null;
        if (Array.isArray(event.venue)) return event.venue[0] ?? null;
        return event.venue;
    }

    private stripHtml(html: string): string {
        return html.replace(/<\/?[^>]+(>|$)/g, "");
    }
}
