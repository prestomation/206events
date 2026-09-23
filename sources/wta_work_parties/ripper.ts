import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

/**
 * Washington Trails Association trail work parties.
 *
 * WTA's volunteer scheduler (https://www.wta.org/volunteer/schedule) is a
 * React app backed by a paginated JSON endpoint:
 *   GET /volunteer/schedule/workparties.json?batch_num=N   (0-based, 10 per page)
 * Each response carries `results.last` (the last batch index) and
 * `results.items` (work parties with start/end ISO datetimes and a trailhead
 * with lat/lng).
 *
 * WTA's programming is statewide; only work parties whose trailhead falls
 * inside Seattle city limits (approximated by a bounding box) are kept.
 */

const BASE = "https://www.wta.org/volunteer/schedule/";
const MAX_BATCHES = 50;

// Approximate Seattle city-limits bounding box. Keeps West Seattle/Discovery
// Park/Carkeek etc.; excludes Burien, Shoreline, Mercer Island and the
// Cascades trailheads that make up most of WTA's schedule.
export const SEATTLE_BBOX = { minLat: 47.495, maxLat: 47.734, minLng: -122.44, maxLng: -122.245 };

export interface WtaWorkParty {
    _id: string;
    name: string;
    start_date_time: string;
    end_date_time?: string | null;
    work_party_status?: string | null;
    work_party_groups?: unknown[] | null;
    group_wp_open_to_public?: boolean | null;
    internal_work_party?: boolean | null;
    image_url?: string | null;
    overview?: string | null;
    age_restriction?: string | null;
    work_party_type?: { name?: string | null } | null;
    trailhead?: {
        name?: string | null;
        location?: { latitude?: number | null; longitude?: number | null } | null;
    } | null;
}

function stripHtml(html: string): string {
    return decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " "))
        .replace(/[ \t ]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim();
}

export function isInSeattle(wp: WtaWorkParty): boolean {
    const loc = wp.trailhead?.location;
    const lat = loc?.latitude;
    const lng = loc?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return false;
    return lat >= SEATTLE_BBOX.minLat && lat <= SEATTLE_BBOX.maxLat
        && lng >= SEATTLE_BBOX.minLng && lng <= SEATTLE_BBOX.maxLng;
}

/** Group-only (private) or unpublished work parties aren't public events. */
export function isPublic(wp: WtaWorkParty): boolean {
    if (wp.work_party_status && wp.work_party_status !== "Published") return false;
    if (wp.internal_work_party) return false;
    const hasGroups = Array.isArray(wp.work_party_groups) && wp.work_party_groups.length > 0;
    if (hasGroups && !wp.group_wp_open_to_public) return false;
    return true;
}

export function parseWorkParty(wp: WtaWorkParty): RipperCalendarEvent | RipperError {
    const summaryBase = decode(wp.name ?? "").trim();
    if (!wp._id || !summaryBase) {
        return { type: "ParseError", reason: "Work party missing id or name", context: JSON.stringify(wp).slice(0, 200) };
    }

    let start: ZonedDateTime;
    try {
        start = ZonedDateTime.parse(wp.start_date_time);
    } catch {
        return { type: "ParseError", reason: `Unparseable start_date_time: ${wp.start_date_time}`, context: summaryBase };
    }

    let duration = Duration.ofHours(6);
    if (wp.end_date_time) {
        try {
            const end = ZonedDateTime.parse(wp.end_date_time);
            const ms = end.toInstant().toEpochMilli() - start.toInstant().toEpochMilli();
            if (ms > 0) duration = Duration.ofMillis(ms);
        } catch {
            // keep default duration
        }
    }

    const trailhead = wp.trailhead?.name?.trim();
    const lat = wp.trailhead?.location?.latitude ?? undefined;
    const lng = wp.trailhead?.location?.longitude ?? undefined;

    const descParts: string[] = [];
    if (wp.overview) descParts.push(stripHtml(wp.overview));
    if (wp.work_party_type?.name) descParts.push(`Type: ${wp.work_party_type.name}`);
    if (wp.age_restriction) descParts.push(`Ages: ${wp.age_restriction}`);
    descParts.push("Free; advance registration required.");

    return {
        id: `wta-${wp._id}`,
        ripped: new Date(),
        date: start,
        duration,
        summary: `WTA Trail Work Party: ${summaryBase}`,
        description: descParts.filter(Boolean).join("\n\n"),
        // The bounding box is only approximate, so do not claim "Seattle"; lat/lng carry the place.
        location: trailhead ? `${trailhead}, WA` : "Seattle area, WA",
        url: `${BASE}workparty/${wp._id}`,
        imageUrl: wp.image_url || undefined,
        cost: { min: 0 },
        lat: typeof lat === "number" ? lat : undefined,
        lng: typeof lng === "number" ? lng : undefined,
    };
}

/** Filter + parse one page of work parties (exported for tests). */
export function parseWorkParties(items: WtaWorkParty[]): Array<RipperCalendarEvent | RipperError> {
    return items
        .filter(wp => isInSeattle(wp) && isPublic(wp))
        .map(wp => parseWorkParty(wp));
}

export default class WtaWorkPartiesRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];

        const items: WtaWorkParty[] = [];
        let last = 0;
        for (let batch = 0; batch <= last && batch < MAX_BATCHES; batch++) {
            const url = `${BASE}workparties.json?batch_num=${batch}`;
            const res = await fetchFn(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" } });
            if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
            const json = await res.json() as { results?: { last?: number; items?: WtaWorkParty[] } };
            const page = json.results?.items ?? [];
            if (batch === 0) last = typeof json.results?.last === "number" ? json.results.last : 0;
            if (page.length === 0) break;
            items.push(...page);
        }

        const seen = new Set<string>();
        const unique = items.filter(wp => {
            if (!wp._id || seen.has(wp._id)) return false;
            seen.add(wp._id);
            return true;
        });

        const parsed = parseWorkParties(unique);
        const now = ZonedDateTime.now();
        const events = parsed.filter((r): r is RipperCalendarEvent => "date" in r && !r.date.isBefore(now.minusHours(6)));
        const errors = parsed.filter((r): r is RipperError => "type" in r);

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            tags: cal.tags ?? [],
            parent: ripper.config,
        }];
    }
}
