import { LocalDateTime, ZonedDateTime, Duration, ZoneId, LocalDate } from "@js-joda/core";
import { decode } from "html-entities";
import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Stroum JCC (Mercer Island) runs WordPress + The Events Calendar (Tribe
// Events). The full calendar is dominated by member fitness classes and pool
// hours, so each calendar restricts the Tribe REST API to one event category
// (`config.category`, e.g. "adult-gatherings": author talks, concerts,
// comedy, film, exhibits, cooking demos).
//
// We use the JSON REST API rather than the site's `?ical=1` ICS export
// because the host's bot check serves a "Checking your browser" page to the
// Chrome User-Agent that the external-ICS fetcher sends.
export default class StroumJccRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const results: RipperCalendar[] = [];

        for (const cal of ripper.config.calendars) {
            const category = (cal.config as { category?: string } | undefined)?.category;
            const allEvents: RipperEvent[] = [];
            let page = 1;
            let totalPages = 1;
            const MAX_PAGES = 20;
            while (page <= totalPages && page <= MAX_PAGES) {
                const params = new URLSearchParams({ per_page: "50", page: String(page) });
                if (category) params.set("categories", category);
                const url = `${ripper.config.url}?${params}`;
                const res = await fetchFn(url);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);

                const jsonData = await res.json();
                totalPages = jsonData.total_pages ?? 1;
                allEvents.push(...this.parseEvents(jsonData, ZonedDateTime.now(cal.timezone)));
                page++;
            }

            results.push({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: allEvents.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
                errors: allEvents.filter(e => "type" in e).map(e => e as RipperError),
                parent: ripper.config,
                tags: cal.tags || [],
            });
        }
        return results;
    }

    public parseEvents(jsonData: any, date: ZonedDateTime): RipperEvent[] {
        if (!jsonData?.events || !Array.isArray(jsonData.events)) {
            return [{
                type: "ParseError",
                reason: "Invalid JSON structure: missing events array",
                context: JSON.stringify(jsonData).substring(0, 100) + "...",
            }];
        }
        return jsonData.events.map((event: any) => this.parseEvent(event, date));
    }

    private parseEvent(event: any, date: ZonedDateTime): RipperCalendarEvent | RipperError {
        try {
            const zone = ZoneId.of(event.timezone || date.zone().toString());
            const start = event.start_date_details;
            const end = event.end_date_details;
            const startLocal = LocalDateTime.of(
                parseInt(start.year), parseInt(start.month), parseInt(start.day),
                parseInt(start.hour), parseInt(start.minutes), parseInt(start.seconds),
            );
            const endLocal = LocalDateTime.of(
                parseInt(end.year), parseInt(end.month), parseInt(end.day),
                parseInt(end.hour), parseInt(end.minutes), parseInt(end.seconds),
            );

            let description = event.description ? this.cleanHtml(event.description) : "";
            let eventDate: ZonedDateTime;
            let duration: Duration;
            if (event.all_day) {
                // All-day items are gallery exhibits that run for months.
                // Publish them on their opening day rather than as a
                // months-long block, and say how long they are on view.
                // An exhibit that opened before today but is still running is
                // published on today's date, so it shows as current.
                const today = date.withZoneSameInstant(zone).toLocalDate();
                const endDay: LocalDate = endLocal.toLocalDate();
                const openDay = startLocal.toLocalDate();
                const showDay = openDay.isBefore(today) && !endDay.isBefore(today) ? today : openDay;
                eventDate = showDay.atStartOfDay(zone);
                duration = Duration.ofDays(1);
                if (endDay.isAfter(startLocal.toLocalDate())) {
                    const note = `On view through ${endDay.toString()}.`;
                    description = description ? `${note}\n\n${description}` : note;
                }
            } else {
                eventDate = startLocal.atZone(zone);
                const endDate = endLocal.atZone(zone);
                const seconds = endDate.toEpochSecond() - eventDate.toEpochSecond();
                duration = seconds > 0 ? Duration.ofSeconds(seconds) : Duration.ofHours(2);
            }

            return {
                id: String(event.id),
                ripped: new Date(),
                date: eventDate,
                duration,
                summary: this.cleanHtml(event.title ?? ""),
                description: description || undefined,
                location: this.parseLocation(event.venue),
                url: event.url,
                imageUrl: event.image?.url || undefined,
                cost: this.parseCost(event.cost_details),
            };
        } catch (error) {
            return {
                type: "ParseError",
                reason: `Failed to parse event: ${error}`,
                context: JSON.stringify(event).substring(0, 100) + "...",
            };
        }
    }

    // Tribe returns `venue: []` when no venue is set and a "TBA" venue with
    // no address when the location isn't announced; leave location unset in
    // both cases (the source-level geo still places it at the JCC).
    private parseLocation(venue: any): string | undefined {
        if (!venue || Array.isArray(venue) || !venue.address) return undefined;
        const parts = [venue.venue, venue.address, venue.city].filter(Boolean).map((p: string) => decode(p));
        const stateZip = [venue.stateprovince, venue.zip].filter(Boolean).join(" ");
        if (stateZip) parts.push(stateZip);
        return parts.join(", ");
    }

    private parseCost(costDetails: any): EventCost | undefined {
        const values: string[] = costDetails?.values ?? [];
        const parsed = values.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
        if (parsed.length === 0) return undefined;
        const min = Math.min(...parsed);
        const max = Math.max(...parsed);
        return max > min ? { min, max } : { min };
    }

    private cleanHtml(html: string): string {
        return decode(html.replace(/<\/?[^>]+(>|$)/g, " ")).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
    }
}
