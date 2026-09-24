import { EventCost, IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, LocalDate, ZonedDateTime, ZoneId } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

/**
 * The Pantry (Ballard community kitchen) — cooking classes and family dinners.
 *
 * The site's calendar widget (Craft CMS + Vue bundle) reads a paginated JSON
 * endpoint:
 *   GET /api/events.json?dateRange=YYYY-MM-DD,YYYY-MM-DD&page=N
 * returning `{ data: [...], meta: { pagination: { current_page, total_pages } } }`.
 * Each item is one dated session (a "classdate") with start/end datetimes in
 * `YYYY-MM-DDTHH:mm:ss-0700` form and a `relatedEvent` describing the class.
 *
 * `relatedEvent.imageUrl` is currently always empty in this JSON API (a data
 * gap on The Pantry's end, confirmed 2026-09), but the class/dinner's own
 * page (`relatedEvent.url`) does carry a real hero photo in its markup. Many
 * classdates share one class page, so we fetch each *distinct* class page at
 * most once per build (bounded, small concurrency) and backfill the image
 * onto every classdate event that lacks one.
 */

const API = "https://thepantryseattle.com/api/events.json";
const LOOKAHEAD_DAYS = 120;
const MAX_PAGES = 60;
const VENUE = "The Pantry, 1417 NW 70th St, Seattle, WA 98117";
const IMAGE_FETCH_CONCURRENCY = 4;

export interface PantryItem {
    id: number | string;
    title?: string | null;
    additionalDetails?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    url?: string | null;
    availableCapacity?: number | null;
    relatedEvent?: {
        title?: string | null;
        url?: string | null;
        isDinner?: boolean | null;
        imageUrl?: string | null;
        teamMembers?: Array<{ title?: string | null }> | null;
        classType?: { label?: string | null; value?: string | null } | null;
    } | null;
}

/** Extracts admission cost from a Pantry class/dinner page HTML. Pattern: `Price: <b>$NNN</b>`. */
export function extractPantryPrice(html: string): EventCost | undefined {
    const m = html.match(/Price:\s*<b>\$(\d[\d,]*)<\/b>/i);
    if (m) return { min: parseFloat(m[1].replace(/,/g, "")) };
    if (/Price:\s*<b>Free<\/b>/i.test(html)) return { min: 0 };
    return undefined;
}

/** `2026-09-23T18:00:00-0700` → `2026-09-23T18:00:00-07:00` (js-joda needs the colon). */
export function parsePantryDate(s: string): ZonedDateTime {
    const fixed = s.trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    return ZonedDateTime.parse(fixed);
}

function isOnline(item: PantryItem): boolean {
    const ct = item.relatedEvent?.classType;
    return /online|virtual/i.test(`${ct?.value ?? ""} ${ct?.label ?? ""}`);
}

export function parsePantryItem(item: PantryItem, cost?: EventCost): RipperCalendarEvent | RipperError {
    const summary = decode(item.title ?? item.relatedEvent?.title ?? "").replace(/\s+/g, " ").trim();
    if (!summary) return { type: "ParseError", reason: "Pantry event missing title", context: String(item.id) };
    if (!item.startDate) return { type: "ParseError", reason: "Pantry event missing startDate", context: summary };

    let start: ZonedDateTime;
    try {
        start = parsePantryDate(item.startDate);
    } catch {
        return { type: "ParseError", reason: `Unparseable startDate: ${item.startDate}`, context: summary };
    }

    let duration = Duration.ofHours(3);
    if (item.endDate) {
        try {
            const ms = parsePantryDate(item.endDate).toInstant().toEpochMilli() - start.toInstant().toEpochMilli();
            if (ms > 0) duration = Duration.ofMillis(ms);
        } catch {
            // keep default
        }
    }

    const rel = item.relatedEvent;
    const descParts: string[] = [];
    const instructors = (rel?.teamMembers ?? []).map(t => t?.title?.trim()).filter(Boolean);
    if (instructors.length) descParts.push(`With ${instructors.join(", ")}`);
    if (rel?.isDinner) descParts.push("Family-style dinner");
    if (item.additionalDetails) descParts.push(decode(item.additionalDetails.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
    if (typeof item.availableCapacity === "number" && item.availableCapacity <= 0) descParts.push("Currently full (waitlist may be available).");

    return {
        id: `pantry-${item.id}`,
        ripped: new Date(),
        date: start,
        duration,
        summary,
        description: descParts.filter(Boolean).join("\n\n") || undefined,
        location: isOnline(item) ? "Online" : VENUE,
        url: item.url || rel?.url || "https://thepantryseattle.com/calendar",
        imageUrl: rel?.imageUrl || undefined,
        cost,
    };
}

export function parsePantryItems(
    items: PantryItem[],
    prices: Map<string, EventCost> = new Map(),
): Array<RipperCalendarEvent | RipperError> {
    const seen = new Set<string>();
    const out: Array<RipperCalendarEvent | RipperError> = [];
    for (const item of items) {
        const key = String(item.id);
        if (seen.has(key)) continue;
        seen.add(key);
        const classUrl = item.relatedEvent?.url ?? undefined;
        const cost = classUrl ? prices.get(classUrl) : undefined;
        out.push(parsePantryItem(item, cost));
    }
    return out;
}

async function fetchClassPrices(classUrls: string[], fetchFn: FetchFn): Promise<Map<string, EventCost>> {
    const prices = new Map<string, EventCost>();
    const BATCH = 8;
    const headers = { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" };
    for (let i = 0; i < classUrls.length; i += BATCH) {
        const batch = classUrls.slice(i, i + BATCH);
        await Promise.all(batch.map(async (url) => {
            try {
                const res = await fetchFn(url, { headers });
                if (!res.ok) return;
                const html = await res.text();
                const cost = extractPantryPrice(html);
                if (cost) prices.set(url, cost);
            } catch {
                // leave unparsed — event still published without cost
            }
        }));
    }
    return prices;
}

/**
 * Extracts the class/dinner hero photo from a thepantryseattle.com class
 * page. The hero always renders inside a `<figure class="image is-5by3 …">`
 * (ahead of any instructor headshot, which uses `is-square`), so matching on
 * that class is enough to avoid picking up a headshot instead. Public for
 * testing.
 */
export function extractClassHeroImage(html: string): string | undefined {
    const root = parse(html);
    const img = root.querySelector("figure.is-5by3 img");
    const src = img?.getAttribute("src")?.trim();
    return src || undefined;
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

/**
 * Fetches each distinct class/dinner page in `urls` at most once and returns
 * the extracted hero image per URL. A page that fails to fetch or parse is
 * simply omitted — the caller leaves that event's `imageUrl` unset rather
 * than failing the build over a best-effort backfill.
 */
async function fetchClassHeroImages(urls: string[], fetchFn: FetchFn): Promise<Map<string, string>> {
    const byUrl = new Map<string, string>();
    await pool(urls, IMAGE_FETCH_CONCURRENCY, async url => {
        try {
            const res = await fetchFn(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" } });
            if (!res.ok) return;
            const img = extractClassHeroImage(await res.text());
            if (img) byUrl.set(url, img);
        } catch {
            // Best-effort backfill; a fetch failure just leaves the gap for
            // the next build (or the photo-resolver) to pick up.
        }
    });
    return byUrl;
}

export default class ThePantrySeattleRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];

        const today = LocalDate.now(ZoneId.of("America/Los_Angeles"));
        const range = `${today.toString()},${today.plusDays(LOOKAHEAD_DAYS).toString()}`;

        const items: PantryItem[] = [];
        let totalPages = 1;
        for (let page = 1; page <= totalPages && page <= MAX_PAGES; page++) {
            const url = `${API}?dateRange=${encodeURIComponent(range)}&page=${page}`;
            const res = await fetchFn(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" } });
            if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
            const json = await res.json() as { data?: PantryItem[]; meta?: { pagination?: { total_pages?: number } } };
            const data = json.data ?? [];
            if (page === 1) totalPages = json.meta?.pagination?.total_pages ?? 1;
            if (data.length === 0) break;
            items.push(...data);
        }

        // Fetch prices from unique class/dinner pages (prices aren't in the API response).
        const classUrls = [...new Set(items.map(it => it.relatedEvent?.url).filter((u): u is string => !!u))];
        const prices = await fetchClassPrices(classUrls, fetchFn);

        const parsed = parsePantryItems(items, prices);
        const now = ZonedDateTime.now();
        const events = parsed.filter((r): r is RipperCalendarEvent => "date" in r && !r.date.isBefore(now.minusHours(3)));
        const errors = parsed.filter((r): r is RipperError => "type" in r);

        // Backfill the class/dinner hero image for events the JSON API left
        // imageless (see module doc). Only fetch each distinct class page
        // once, and only for pages we'll actually use.
        const classUrlByEventId = new Map<string, string>();
        for (const item of items) {
            if (item.relatedEvent?.imageUrl) continue;
            const classUrl = item.relatedEvent?.url;
            if (classUrl) classUrlByEventId.set(`pantry-${item.id}`, classUrl);
        }
        const neededUrls = [...new Set(
            events.filter(e => !e.imageUrl && classUrlByEventId.has(e.id!)).map(e => classUrlByEventId.get(e.id!)!),
        )];
        if (neededUrls.length > 0) {
            const imageByClassUrl = await fetchClassHeroImages(neededUrls, fetchFn);
            for (const event of events) {
                if (event.imageUrl) continue;
                const classUrl = classUrlByEventId.get(event.id!);
                const image = classUrl ? imageByClassUrl.get(classUrl) : undefined;
                if (image) event.imageUrl = image;
            }
        }

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
