import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { JSONRipper } from "../../lib/config/jsonscrapper.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// King County's public events calendar (kingcounty.gov "Events" pages, incl.
// the King County Parks events page) is rendered client-side from a Socrata
// Open Data dataset. The page embeds the query directly:
//   window.SOCRATA_API="https://data.kingcounty.gov/resource/grxi-zqg2.json?..."
// ripper.config.url is the dataset endpoint; rip() adds a SoQL `$where` for
// upcoming events.
//
// Each row carries ~70 boolean category flags (parks, environment, closure,
// courts, ...). The unfiltered dataset mixes public events (park festivals,
// free workshops, resource fairs) with county admin entries (holiday
// closures, inquest hearings, contractor orientations, test rows), so we
// keep only rows in public-facing categories and drop the admin noise.
const FRIENDLY_URL = "https://kingcounty.gov/en/dept/dnrp/nature-recreation/parks-recreation/king-county-parks/get-involved/parks-events";
const DEFAULT_DURATION = Duration.ofHours(2);
const LOOKAHEAD_MONTHS = 6;

// Category flags that mark a row as a public event worth listing.
export const INCLUDE_FLAGS = [
    "parks", "recreation", "arts_culture", "events", "volunteer",
    "environment", "recycling_trash", "health", "local_services",
];

// Titles that are county operations rather than events people attend.
// "Household Hazardous Waste Collection" rows are multi-day drop-off
// service windows (Wastemobile), not events.
const EXCLUDE_TITLE = /hello world|holiday|closed|inquest|orientation|household hazardous waste collection/i;
const ONLINE_LOCATION = /\b(online|teams|zoom|virtual)\b/i;

export interface KCRow {
    event_name?: string;
    start_time?: string;
    end_time?: string;
    event_description_details?: string;
    location_name?: string;
    location_address?: string;
    location_city?: string;
    location_state?: string;
    location_zip?: string;
    location?: { type?: string; coordinates?: [number, number] };
    url?: string;
    closure?: boolean;
    [flag: string]: unknown;
}

export default class KingCountyEventsRipper extends JSONRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calConfig = ripper.config.calendars[0];
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = calConfig.timezone;

        // Socrata floating timestamps are Pacific local time.
        const today = ZonedDateTime.now(zone).toLocalDate();
        const end = today.plusMonths(LOOKAHEAD_MONTHS);
        const params = new URLSearchParams({
            $where: `start_time >= '${today}T00:00:00' AND start_time < '${end}T00:00:00'`,
            $order: "start_time ASC",
            $limit: "1000",
        });
        const url = `${ripper.config.url.href}?${params.toString()}`;
        const res = await fetchFn(url);
        if (!res.ok) {
            throw new Error(`King County events dataset returned ${res.status} ${res.statusText}`);
        }
        const jsonData = await res.json();
        const results = await this.parseEvents(jsonData, ZonedDateTime.now(zone), calConfig.config ?? {});

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: results.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? [],
            parent: ripper.config,
        }];
    }

    public static isPublicEvent(row: KCRow): boolean {
        if (row.closure === true) return false;
        if (!INCLUDE_FLAGS.some(f => row[f] === true)) return false;
        if (row.event_name && EXCLUDE_TITLE.test(row.event_name)) return false;
        if (row.location_name && ONLINE_LOCATION.test(row.location_name)) return false;
        return true;
    }

    public async parseEvents(jsonData: any, date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        if (!Array.isArray(jsonData)) {
            return [{
                type: 'ParseError',
                reason: 'Expected a JSON array of rows from the King County Socrata dataset',
                context: JSON.stringify(jsonData).substring(0, 200),
            }];
        }
        const results: RipperEvent[] = [];
        const seen = new Set<string>();
        for (const row of jsonData as KCRow[]) {
            if (!KingCountyEventsRipper.isPublicEvent(row)) continue;
            const parsed = this.parseRow(row, date.zone());
            if ('date' in parsed) {
                if (seen.has(parsed.id!)) continue;
                seen.add(parsed.id!);
            }
            results.push(parsed);
        }
        return results;
    }

    public parseRow(row: KCRow, zone: ZoneId): RipperCalendarEvent | RipperError {
        const title = row.event_name?.replace(/\s+/g, ' ').trim();
        if (!title) {
            return { type: 'ParseError', reason: 'Row missing event_name', context: JSON.stringify(row).substring(0, 200) };
        }
        if (!row.start_time) {
            return { type: 'ParseError', reason: 'Row missing start_time', context: title };
        }
        let start: ZonedDateTime;
        try {
            start = LocalDateTime.parse(row.start_time.replace(/Z$/, '')).atZone(zone);
        } catch (e) {
            return { type: 'ParseError', reason: `Could not parse start_time "${row.start_time}": ${e}`, context: title };
        }

        let duration = DEFAULT_DURATION;
        if (row.end_time) {
            try {
                const endDt = LocalDateTime.parse(row.end_time.replace(/Z$/, '')).atZone(zone);
                const seconds = endDt.toEpochSecond() - start.toEpochSecond();
                if (seconds > 0) duration = Duration.ofSeconds(seconds);
            } catch {
                // best-effort end time
            }
        }

        const location = this.formatLocation(row);
        const coords = row.location?.coordinates;
        const event: RipperCalendarEvent = {
            id: `king-county-${slugify(title)}-${start.toLocalDateTime().toString().replace(/[^0-9]/g, '').substring(0, 12)}`,
            ripped: new Date(),
            date: start,
            duration,
            summary: title,
            description: row.event_description_details ? htmlToText(row.event_description_details) : undefined,
            location,
            url: row.url || FRIENDLY_URL,
        };
        if (coords && coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
            event.lng = coords[0];
            event.lat = coords[1];
            event.geocodeSource = 'ripper';
        }
        if (/^free\b/i.test(title)) event.cost = { min: 0 };
        return event;
    }

    private formatLocation(row: KCRow): string | undefined {
        const name = row.location_name?.trim();
        // The dataset spells out compass directions ("33rd Avenue North
        // East"), which Nominatim fails to match; abbreviate them.
        const street = row.location_address
            ?.replace(/\b(North|South)\s+(East|West)\b/g, (_m, a: string, b: string) => `${a[0]}${b[0]}`)
            .replace(/\s+/g, ' ')
            .trim();
        const cityLine = [row.location_city?.trim(), [row.location_state?.trim(), row.location_zip?.trim()].filter(Boolean).join(' ')]
            .filter(Boolean).join(', ');
        const placeName = name && name !== 'None' ? name : undefined;
        // A bare state ("WA") with no place, street, or city isn't a location.
        if (!placeName && !street && !row.location_city?.trim()) return undefined;
        return [placeName, street, cityLine || undefined].filter(Boolean).join(', ');
    }
}

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}

function htmlToText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
