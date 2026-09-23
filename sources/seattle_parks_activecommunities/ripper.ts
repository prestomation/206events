import { DayOfWeek, Duration, LocalDate, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import '@js-joda/timezone';
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, EventCost } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";

/**
 * Seattle Parks & Recreation programs on ActiveCommunities (ActiveNet).
 *
 * The public ActiveNet site is backed by a JSON API that needs no auth:
 *
 *   POST /seattle/rest/activities/list        — paged activity search
 *   GET  /seattle/rest/activity/detail/{id}   — detail (center address + lat/lng)
 *   GET  /seattle/rest/activity/detail/meetingandregistrationdates/{id}
 *                                             — meeting pattern + exception dates
 *
 * Most of the ~2,600 activities are multi-week registration-only classes, so
 * this ripper publishes only two narrow, public slices:
 *
 *   - `special-events`: single-day items in the "Field Trips, Special Events &
 *     Overnights" category (festivals, carnivals, tea ceremonies, bingo…),
 *     minus out-of-town field trips and outings, tournaments, transportation, childcare drop-off
 *     ("Parents Night") and closed Specialized Programs socials.
 *   - `drop-in`: the "Drop-In Activities" category's community programs
 *     (mahjong, bridge, board games, craft circles, poetry, improv…), minus
 *     aquatics/athletics lap-swim-style facility schedules and supervised
 *     tot/teen rooms. Their weekly (or nth-weekday) meeting pattern is expanded
 *     from the meeting-dates endpoint, honoring its exception dates, over a
 *     bounded horizon.
 *
 * Request volume per build: ~6 + ~20 list pages, one detail call per distinct
 * location label (~40), and one meeting-dates call per kept drop-in (~45).
 * All paging is bounded and concurrency is capped at 4.
 */

const BASE = "https://anc.apm.activecommunities.com/seattle";
const LIST_URL = `${BASE}/rest/activities/list?locale=en-US`;
const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";

export const CATEGORY_SPECIAL_EVENTS = "31";
export const CATEGORY_DROP_IN = "39";

const MAX_PAGES = 40;
const CONCURRENCY = 4;
/** How far ahead recurring drop-in patterns are expanded. */
export const DROP_IN_HORIZON_DAYS = 60;
/** How far ahead single-day special events are published. */
export const SPECIAL_HORIZON_DAYS = 180;

// Special-events items that aren't public events a Seattle resident can just
// attend: bus trips out of the city, rides to another program, parent
// drop-off childcare, and closed socials for enrolled participants.
const SPECIAL_EXCLUDE = /^\s*(field trip|transportation\b)|\bouting\b|\btournament\b|specialized programs|parents?'? night|kids'? night out/i;

// Drop-in items that are facility schedules or supervised rooms rather than
// community programs — lap swim, pickleball courts, gym time, tot/teen rooms.
const DROP_IN_EXCLUDE = new RegExp([
    "swim", "pool", "water fitness", "water polo", "aquatic", "lifeguard", "masters",
    "pickleball", "basketball", "volleyball", "badminton", "soccer", "futsal", "tennis",
    "handball", "frisbee", "dodgeball", "hockey", "double dutch", "\\bgym\\b", "fitness",
    "weight room", "\\blap\\b", "aerobic", "yoga", "zumba", "walking",
    "tot room", "toddler", "\\bteens?\\b", "tween", "afterschool", "homework", "tutoring",
    "late night", "registration support",
].join("|"), "i");

export interface ActivityItem {
    id: number;
    name: string;
    desc?: string;
    only_one_day: boolean;
    date_range_start: string;
    date_range_end?: string;
    time_range?: string;
    days_of_week?: string;
    detail_url?: string;
    location?: { label?: string };
    fee?: { label?: string };
}

export interface MeetingPattern {
    beginning_date: string;
    ending_date: string;
    weeks_of_month?: string;
    exception_dates?: string[];
    pattern_dates: { weekdays: string; starting_time: string; ending_time: string }[];
}

export interface MeetingDates {
    no_meeting_dates?: boolean;
    additional_dates?: any[];
    activity_patterns: MeetingPattern[];
}

export interface CenterInfo {
    name: string;
    address1?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}

export interface ActivityDetail {
    location_description?: string;
    centers?: CenterInfo[];
}

/** Everything the parser needs; the shape of sample-data.json. */
export interface ActiveNetBundle {
    specialItems: ActivityItem[];
    dropInItems: ActivityItem[];
    /** Meeting dates keyed by activity id (drop-ins only). */
    meetings: Record<string, MeetingDates>;
    /** Activity detail keyed by the list's `location.label`. */
    locations: Record<string, ActivityDetail>;
}

const DOW: Record<string, DayOfWeek> = {
    mon: DayOfWeek.MONDAY, tue: DayOfWeek.TUESDAY, wed: DayOfWeek.WEDNESDAY,
    thu: DayOfWeek.THURSDAY, fri: DayOfWeek.FRIDAY, sat: DayOfWeek.SATURDAY, sun: DayOfWeek.SUNDAY,
};

const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function isPublicSpecialEvent(item: ActivityItem): boolean {
    if (!item.only_one_day) return false;
    if (SPECIAL_EXCLUDE.test(item.name)) return false;
    const label = item.location?.label?.trim() ?? "";
    return label !== "" && label !== "N/A";
}

export function isCommunityDropIn(item: ActivityItem): boolean {
    return !DROP_IN_EXCLUDE.test(item.name);
}

/** Parse one clock string like "10:00 AM", "Noon", "Midnight". */
export function parseClock(s: string): LocalTime | null {
    const t = s.trim().toLowerCase();
    if (t === "noon") return LocalTime.NOON;
    if (t === "midnight") return LocalTime.MIDNIGHT;
    const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (h < 1 || h > 12 || min > 59) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return LocalTime.of(h, min);
}

/** Parse a list `time_range` like "10:00 AM - Noon". */
export function parseTimeRange(s: string | undefined): { start: LocalTime; end: LocalTime } | null {
    if (!s) return null;
    const parts = s.split(/\s+-\s+/);
    if (parts.length !== 2) return null;
    const start = parseClock(parts[0]);
    const end = parseClock(parts[1]);
    if (!start || !end) return null;
    return { start, end };
}

/** Parse a meeting-dates "HH:MM:SS" time. */
function parseIsoTime(s: string): LocalTime | null {
    const m = s?.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return LocalTime.of(h, min);
}

/**
 * Parse an exception-date entry. ActiveNet groups same-month dates:
 * "27 Oct 2026", "11,25 Nov 2026", "11,26,27 Nov 2026". Returns null if any
 * part is unparseable.
 */
export function parseExceptionDates(s: string): LocalDate[] | null {
    const m = s.trim().match(/^(\d{1,2}(?:\s*,\s*\d{1,2})*)\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
    if (!m) return null;
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    const out: LocalDate[] = [];
    for (const day of m[1].split(/\s*,\s*/)) {
        try {
            out.push(LocalDate.of(parseInt(m[3], 10), month, parseInt(day, 10)));
        } catch {
            return null;
        }
    }
    return out;
}

const DOW_ORDER = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];

/**
 * Parse a meeting pattern's `weekdays` ("Tue", "Mon,Wed", "Weekdays",
 * "Weekends", "Daily", "Mon-Fri"). Returns null if any token is unknown.
 */
export function parseWeekdays(s: string | undefined): DayOfWeek[] | null {
    const out: DayOfWeek[] = [];
    for (const raw of (s ?? "").split(/\s*,\s*/)) {
        const tok = raw.trim().toLowerCase();
        if (!tok) continue;
        if (tok === "weekdays") out.push(...DOW_ORDER.slice(0, 5));
        else if (tok === "weekends") out.push(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY);
        else if (tok === "daily" || tok === "everyday" || tok === "every day") out.push(...DOW_ORDER);
        else if (/^[a-z]{3}\w*\s*-\s*[a-z]{3}\w*$/.test(tok)) {
            const [a, b] = tok.split(/\s*-\s*/).map(t => DOW[t.slice(0, 3)]);
            if (!a || !b) return null;
            const ai = DOW_ORDER.findIndex(d => d.equals(a));
            const bi = DOW_ORDER.findIndex(d => d.equals(b));
            for (let i = ai; ; i = (i + 1) % 7) {
                out.push(DOW_ORDER[i]);
                if (i === bi) break;
            }
        } else {
            const d = DOW[tok.slice(0, 3)];
            if (!d) return null;
            out.push(d);
        }
    }
    return out.length ? out : null;
}

function durationBetween(start: LocalTime, end: LocalTime): Duration {
    // "7:00 PM - Midnight" ends at the next day's 00:00.
    if (end.equals(LocalTime.MIDNIGHT) && !start.equals(LocalTime.MIDNIGHT)) {
        return Duration.between(start, LocalTime.MAX).plusNanos(1);
    }
    const d = Duration.between(start, end);
    // Degenerate ranges ("10:30 AM - 10:30 AM") — publish a nominal hour.
    return d.isNegative() || d.isZero() ? Duration.ofHours(1) : d;
}

/**
 * Parse ActiveNet's "weeks_of_month" ("1st week of every month",
 * "2nd, 4th week of every month", "Last week of every month") into the set of
 * nth-weekday ordinals it selects (-1 = last). Empty string = every week.
 * Returns null for an unrecognized value.
 */
export function parseWeeksOfMonth(s: string | undefined): Set<number> | null | "all" {
    const t = (s ?? "").trim().toLowerCase();
    if (t === "") return "all";
    const head = t.replace(/\s*weeks?\s+of\s+every\s+month\s*$/, "");
    if (head === t) return null;
    const out = new Set<number>();
    for (const tok of head.split(/\s*,\s*|\s+and\s+/)) {
        const m = tok.match(/^(\d)(st|nd|rd|th)$/);
        if (m) out.add(parseInt(m[1], 10));
        else if (tok === "last") out.add(-1);
        else return null;
    }
    return out.size ? out : null;
}

function nthOfMonth(d: LocalDate): { nth: number; last: boolean } {
    const nth = Math.floor((d.dayOfMonth() - 1) / 7) + 1;
    const last = d.plusDays(7).month() !== d.month();
    return { nth, last };
}

/** Strip HTML tags/entities from a catalog description. */
export function cleanText(html: string | undefined): string {
    if (!html) return "";
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
}

export function parseCost(label: string | undefined): EventCost | undefined {
    if (!label) return undefined;
    const t = label.trim();
    if (/^free$/i.test(t)) return { min: 0 };
    const m = t.match(/^\$(\d+(?:\.\d{1,2})?)$/);
    if (m) return { min: parseFloat(m[1]) };
    return undefined;
}

function publicUrl(item: ActivityItem): string {
    if (item.detail_url && /^https:\/\//.test(item.detail_url)) return item.detail_url;
    return `${BASE}/activity/search/detail/${item.id}?onlineSiteId=0`;
}

/** Location text + coordinates for an activity's list label. */
export function resolveLocation(label: string | undefined, locations: Record<string, ActivityDetail>): { location?: string; lat?: number; lng?: number } {
    const l = (label ?? "").trim();
    if (!l || l === "N/A") return {};
    const detail = locations[l];
    const center = detail?.centers?.[0];
    if (center && center.address1) {
        const city = center.city || "Seattle";
        const state = center.state || "WA";
        const zip = center.zip_code ? ` ${center.zip_code}` : "";
        const out: { location: string; lat?: number; lng?: number } = {
            location: `${center.name}, ${center.address1}, ${city}, ${state}${zip}`,
        };
        if (typeof center.latitude === "number" && typeof center.longitude === "number" && center.latitude !== 0) {
            out.lat = center.latitude;
            out.lng = center.longitude;
        }
        return out;
    }
    const desc = detail?.location_description?.trim();
    return { location: desc || `${l}, Seattle, WA` };
}

function makeEvent(
    item: ActivityItem, date: LocalDate, start: LocalTime, end: LocalTime,
    zone: ZoneId, locations: Record<string, ActivityDetail>, idSuffix: string,
): RipperCalendarEvent {
    const loc = resolveLocation(item.location?.label, locations);
    const desc = cleanText(item.desc);
    const event: RipperCalendarEvent = {
        id: `sprac-${item.id}-${date.toString()}${idSuffix}`,
        ripped: new Date(),
        date: ZonedDateTime.of(date, start, zone),
        duration: durationBetween(start, end),
        summary: item.name.trim(),
        description: desc || undefined,
        location: loc.location,
        url: publicUrl(item),
    };
    if (loc.lat !== undefined && loc.lng !== undefined) {
        event.lat = loc.lat;
        event.lng = loc.lng;
    }
    const cost = parseCost(item.fee?.label);
    if (cost) event.cost = cost;
    return event;
}

export function parseSpecialEvents(items: ActivityItem[], locations: Record<string, ActivityDetail>, zone: ZoneId, today: LocalDate): RipperEvent[] {
    const out: RipperEvent[] = [];
    const seen = new Set<string>();
    const horizon = today.plusDays(SPECIAL_HORIZON_DAYS);
    for (const item of items) {
        if (!isPublicSpecialEvent(item)) continue;
        let date: LocalDate;
        try {
            date = LocalDate.parse(item.date_range_start);
        } catch {
            out.push({ type: "ParseError", reason: `Unparseable date "${item.date_range_start}" for "${item.name}"`, context: String(item.id) });
            continue;
        }
        if (date.isBefore(today) || date.isAfter(horizon)) continue;
        const range = parseTimeRange(item.time_range);
        if (!range) {
            out.push({ type: "ParseError", reason: `Unparseable time range "${item.time_range}" for "${item.name}"`, context: String(item.id) });
            continue;
        }
        const ev = makeEvent(item, date, range.start, range.end, zone, locations, "");
        if (seen.has(ev.id!)) continue;
        seen.add(ev.id!);
        out.push(ev);
    }
    return out;
}

export function parseDropIns(
    items: ActivityItem[], meetings: Record<string, MeetingDates>,
    locations: Record<string, ActivityDetail>, zone: ZoneId, today: LocalDate,
): RipperEvent[] {
    const out: RipperEvent[] = [];
    const seen = new Set<string>();
    const horizon = today.plusDays(DROP_IN_HORIZON_DAYS);
    for (const item of items) {
        if (!isCommunityDropIn(item)) continue;
        const md = meetings[String(item.id)];
        if (!md) {
            out.push({ type: "ParseError", reason: `No meeting dates fetched for "${item.name}"`, context: String(item.id) });
            continue;
        }
        if (md.no_meeting_dates) continue; // "by appointment"-style listing, nothing dated
        if (md.additional_dates && md.additional_dates.length > 0) {
            out.push({ type: "ParseError", reason: `Unsupported additional_dates on "${item.name}"`, context: JSON.stringify(md.additional_dates).slice(0, 200) });
        }
        // Collect occurrences first so multi-slot days get a time suffix.
        const occ: { date: LocalDate; start: LocalTime; end: LocalTime }[] = [];
        for (const p of md.activity_patterns ?? []) {
            let begin: LocalDate, finish: LocalDate;
            try {
                begin = LocalDate.parse(p.beginning_date);
                finish = LocalDate.parse(p.ending_date);
            } catch {
                out.push({ type: "ParseError", reason: `Unparseable pattern range for "${item.name}"`, context: `${p.beginning_date}..${p.ending_date}` });
                continue;
            }
            const weeks = parseWeeksOfMonth(p.weeks_of_month);
            if (weeks === null) {
                out.push({ type: "ParseError", reason: `Unrecognized weeks_of_month "${p.weeks_of_month}" for "${item.name}"`, context: String(item.id) });
                continue;
            }
            const exceptions = new Set<string>();
            for (const e of p.exception_dates ?? []) {
                const ds = parseExceptionDates(e);
                if (ds) for (const d of ds) exceptions.add(d.toString());
                else out.push({ type: "ParseError", reason: `Unparseable exception date "${e}" for "${item.name}"`, context: String(item.id) });
            }
            for (const pd of p.pattern_dates ?? []) {
                const start = parseIsoTime(pd.starting_time);
                const end = parseIsoTime(pd.ending_time);
                const days = parseWeekdays(pd.weekdays);
                if (!start || !end || !days) {
                    out.push({ type: "ParseError", reason: `Unparseable meeting pattern for "${item.name}"`, context: JSON.stringify(pd) });
                    continue;
                }
                const from = begin.isBefore(today) ? today : begin;
                const to = finish.isAfter(horizon) ? horizon : finish;
                for (let d = from; !d.isAfter(to); d = d.plusDays(1)) {
                    if (!days.some(dow => dow.equals(d.dayOfWeek()))) continue;
                    if (exceptions.has(d.toString())) continue;
                    if (weeks !== "all") {
                        const { nth, last } = nthOfMonth(d);
                        if (!weeks.has(nth) && !(last && weeks.has(-1))) continue;
                    }
                    occ.push({ date: d, start, end });
                }
            }
        }
        const perDay = new Map<string, number>();
        for (const o of occ) perDay.set(o.date.toString(), (perDay.get(o.date.toString()) ?? 0) + 1);
        for (const o of occ) {
            const suffix = (perDay.get(o.date.toString()) ?? 0) > 1
                ? `-${o.start.toString().replace(":", "").slice(0, 4)}` : "";
            const ev = makeEvent(item, o.date, o.start, o.end, zone, locations, suffix);
            if (seen.has(ev.id!)) continue;
            seen.add(ev.id!);
            out.push(ev);
        }
    }
    return out;
}

async function pool<T, R>(inputs: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(inputs.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, inputs.length) }, async () => {
        while (next < inputs.length) {
            const i = next++;
            results[i] = await fn(inputs[i]);
        }
    });
    await Promise.all(workers);
    return results;
}

export default class SeattleParksActiveCommunitiesRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    private async listPage(category: string, page: number): Promise<{ items: ActivityItem[]; totalPages: number }> {
        // The page number travels in a `page_info` header, which the fetch
        // cache does not key on — so it is mirrored in the query string to
        // keep each page a distinct cache entry. The server ignores `page`.
        const url = `${LIST_URL}&category=${category}&page=${page}`;
        const res = await this.fetchFn(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
                "page_info": JSON.stringify({ order_by: "Date range", page_number: page, total_records_per_page: 20 }),
            },
            body: JSON.stringify({ activity_search_pattern: { activity_category_ids: [category] }, activity_transfer_pattern: {} }),
        });
        if (!res.ok) throw new Error(`ActiveNet list (category ${category}, page ${page}) returned HTTP ${res.status}`);
        const json: any = await res.json();
        if (json?.headers?.response_code !== "0000") {
            throw new Error(`ActiveNet list returned ${json?.headers?.response_code}: ${json?.headers?.response_message}`);
        }
        return {
            items: json.body?.activity_items ?? [],
            totalPages: json.headers?.page_info?.total_page ?? 1,
        };
    }

    private async listCategory(category: string): Promise<ActivityItem[]> {
        const first = await this.listPage(category, 1);
        const pages = Math.min(first.totalPages, MAX_PAGES);
        const rest = await pool(
            Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2),
            CONCURRENCY,
            p => this.listPage(category, p),
        );
        return [...first.items, ...rest.flatMap(r => r.items)];
    }

    private async getJson(url: string): Promise<any> {
        const res = await this.fetchFn(url, { headers: { "Accept": "application/json", "User-Agent": USER_AGENT } });
        if (!res.ok) throw new Error(`ActiveNet ${url} returned HTTP ${res.status}`);
        return res.json();
    }

    public async fetchBundle(): Promise<{ bundle: ActiveNetBundle; errors: RipperError[] }> {
        const errors: RipperError[] = [];
        const specialItems = await this.listCategory(CATEGORY_SPECIAL_EVENTS);
        const dropInItems = await this.listCategory(CATEGORY_DROP_IN);

        const keptSpecial = specialItems.filter(isPublicSpecialEvent);
        const keptDropIns = dropInItems.filter(isCommunityDropIn);

        // One detail lookup per distinct location label.
        const labelToId = new Map<string, number>();
        for (const it of [...keptSpecial, ...keptDropIns]) {
            const label = it.location?.label?.trim();
            if (label && label !== "N/A" && !labelToId.has(label)) labelToId.set(label, it.id);
        }
        const locations: Record<string, ActivityDetail> = {};
        await pool([...labelToId.entries()], CONCURRENCY, async ([label, id]) => {
            try {
                const json = await this.getJson(`${BASE}/rest/activity/detail/${id}?locale=en-US`);
                const d = json?.body?.detail;
                if (d) locations[label] = { location_description: d.location_description, centers: d.centers };
            } catch (e) {
                errors.push({ type: "ParseError", reason: `Location lookup failed for "${label}": ${e}`, context: String(id) });
            }
        });

        const meetings: Record<string, MeetingDates> = {};
        await pool(keptDropIns, CONCURRENCY, async it => {
            try {
                const json = await this.getJson(`${BASE}/rest/activity/detail/meetingandregistrationdates/${it.id}?locale=en-US`);
                const md = json?.body?.meeting_and_registration_dates;
                if (md) meetings[String(it.id)] = md;
            } catch (e) {
                errors.push({ type: "ParseError", reason: `Meeting dates fetch failed for "${it.name}": ${e}`, context: String(it.id) });
            }
        });

        return { bundle: { specialItems, dropInItems, meetings, locations }, errors };
    }

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const { bundle, errors: fetchErrors } = await this.fetchBundle();

        const calendars: RipperCalendar[] = [];
        for (const cal of ripper.config.calendars) {
            const zone = ZoneId.of(cal.timezone.id());
            const today = ZonedDateTime.now(zone).toLocalDate();
            let events: RipperEvent[];
            if (cal.name === "special-events") {
                events = parseSpecialEvents(bundle.specialItems, bundle.locations, zone, today);
            } else if (cal.name === "drop-in") {
                events = parseDropIns(bundle.dropInItems, bundle.meetings, bundle.locations, zone, today);
            } else {
                events = [{ type: "ParseError", reason: `Unknown calendar "${cal.name}"`, context: cal.name }];
            }
            // Attribute shared fetch errors to the first calendar only.
            const errs = calendars.length === 0 ? [...fetchErrors] : [];
            calendars.push({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: events.filter((e): e is RipperCalendarEvent => "date" in e),
                errors: [...errs, ...events.filter((e): e is RipperError => "type" in e)],
                parent: ripper.config,
                tags: cal.tags || [],
            });
        }
        return calendars;
    }
}
