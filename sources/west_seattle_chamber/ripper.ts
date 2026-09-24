import { Duration, Instant, LocalDate, ZonedDateTime, ZoneId } from "@js-joda/core";
import {
    EventCost,
    IRipper,
    Ripper,
    RipperCalendar,
    RipperCalendarEvent,
    RipperError,
    RipperEvent,
    UncertaintyError,
    UncertaintyField,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parseDollars, hasUnnegatedMatch } from "../../lib/config/cost-text.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const BASE_URL = "https://westseattle.wschamber.com";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const DEFAULT_DURATION = Duration.ofHours(1);
// Current month plus the next two — the chamber rarely posts further out.
const MONTHS_AHEAD = 3;
const SOURCE_NAME = "west-seattle-chamber";

// Many listings (e.g. recurring in-store game nights) publish no location at
// all on the GrowthZone detail page. Rather than guess a plausible-looking
// address, the event gets a neighborhood-level placeholder so it geocodes to
// somewhere sane, paired with an UncertaintyError so the
// event-uncertainty-resolver skill can fill in the real venue. See
// docs/event-uncertainty.md.
const FALLBACK_LOCATION = "West Seattle, Seattle, WA";

// Chamber members whose recurring listings never publish a location on the
// event page, keyed by the title prefix the chamber uses for them. Addresses
// come from each member's chamber directory entry (verified 2026-09-23:
// westseattle.wschamber.com/list/member/fourth-emerald-games-7295). This
// keeps a weekly in-store series from flooding the uncertainty queue with one
// identical "where is this?" gap per occurrence.
const KNOWN_ORGANIZER_LOCATIONS: { titlePrefix: string; location: string }[] = [
    { titlePrefix: "Fourth Emerald Games", location: "Fourth Emerald Games, 4517 California Ave SW, Seattle, WA 98116" },
];

/**
 * Extracts the unique event slugs from a GrowthZone month-calendar page
 * (`/events/calendar/YYYY-MM-01`). Links look like
 * `/events/details/<slug>?calendarMonth=...`; slugs may contain HTML entities
 * (`pok&#233;mon`), which are decoded. The slug ends in GrowthZone's numeric
 * event id, so it doubles as a stable upstream id. Public for testing.
 */
export function extractDetailSlugs(html: string): string[] {
    const slugs = new Set<string>();
    // `#` is allowed in the raw match because entity-encoded slugs contain
    // `&#233;`; a real URL fragment is stripped after decoding.
    const re = /\/events\/details\/([^"?<>\s']+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const slug = decode(m[1]).split("#")[0];
        if (/-\d+$/.test(slug)) slugs.add(slug);
    }
    return [...slugs];
}

/** Month-calendar page URLs to crawl, starting at `today`'s month. Public for testing. */
export function calendarMonthUrls(today: LocalDate, months: number = MONTHS_AHEAD): string[] {
    const first = today.withDayOfMonth(1);
    const urls: string[] = [];
    for (let i = 0; i < months; i++) {
        urls.push(`${BASE_URL}/events/calendar/${first.plusMonths(i).toString()}`);
    }
    return urls;
}

/**
 * Recurring-series slugs embed the occurrence date (`...-09-24-2026-16806`).
 * Returns that date, or null for one-off slugs without one. Used to skip
 * fetching detail pages for occurrences already past. Public for testing.
 */
export function slugDate(slug: string): LocalDate | null {
    const m = slug.match(/-(\d{2})-(\d{2})-(\d{4})-\d+$/);
    if (!m) return null;
    try {
        return LocalDate.of(parseInt(m[3], 10), parseInt(m[1], 10), parseInt(m[2], 10));
    } catch {
        return null;
    }
}

export function detailUrl(slug: string): string {
    return `${BASE_URL}/events/details/${encodeURIComponent(slug)}`;
}

function cleanText(s: string | undefined): string {
    return decode(s ?? "").replace(/\s+/g, " ").trim();
}

// Cheap deterministic hash; we only need stability, not crypto strength.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

function parseInstant(content: string | undefined): ZonedDateTime | null {
    if (!content) return null;
    try {
        return ZonedDateTime.ofInstant(Instant.parse(content), TIMEZONE);
    } catch {
        return null;
    }
}

function extractLocation(root: HTMLElement): string | undefined {
    const place = root.querySelector('.gz-event-location[itemprop="location"]');
    if (!place) return undefined;
    const name = cleanText(place.querySelector('[itemprop="name"]')?.text);
    const street = cleanText(place.querySelector('[itemprop="streetAddress"]')?.text);
    const city = cleanText(place.querySelector('[itemprop="addressLocality"]')?.text);
    const region = cleanText(place.querySelector('[itemprop="addressRegion"]')?.text);
    const zip = cleanText(place.querySelector('[itemprop="postalCode"]')?.text);

    const regionZip = [region, zip].filter(Boolean).join(" ");
    const address = street
        ? [street, city || "Seattle", regionZip || "WA"].join(", ")
        : "";
    if (name && address) return `${name}, ${address}`;
    if (address) return address;
    // Venue name only (e.g. "Counseling West Seattle") — anchor it to Seattle
    // so the geocoder searches the right city.
    if (name) return `${name}, Seattle, WA`;
    return undefined;
}

// The GrowthZone detail page's dedicated "Fees/Admission" field (verified
// live 2026-09-24, e.g. "WS Chamber Members: $25 General Admission: $35
// Walk-In Rate: $35", "$30/session. 4 sessions for $102...", "Free"). Unlike
// scanning a whole freeform description, this field exists specifically to
// state the price, so a bare "Free" here is high-confidence.
//
// NOTAFLOF/suggested-donation phrasing always means free regardless of any
// dollar amount mentioned alongside it (e.g. "Suggested donation $10-20" is
// still free, not a $10 fixed price) — checked unconditionally, before any
// amount scanning. A bare "free" is checked only when no dollar amount
// competes with it (see parseFeesText), to avoid misreading "Free for
// members, $15 general" as free.
const FEES_NOTAFLOF_RE = /suggested donation|donation[- ]based|pay[- ]what[- ]you[- ]can|pwyc|no one (?:is |will be )?turned away|donations?\b(?:(?!\.).){0,40}?\b(?:appreciated|welcome|accepted|encouraged|optional)/gi;
const FEES_FREE_WORD_RE = /\bfree\b/gi;
// A discount-tier word immediately before a dollar amount (e.g. "Members:
// $25") — excluded from the general-admission price, same rubric as
// firstNonTieredPrice.
const FEES_MEMBER_TIER_RE = /\bmembers?\s*:?\s*$/i;
// An explicitly labeled general-public tier (as opposed to a member/discount
// tier) — the pricing rubric's "anchor on general-admission adult" price.
const FEES_GENERAL_TIER_RE = /\b(?:general admission|general public|non-?member(?:s)?|walk-?in(?: rate)?)\s*:?\s*$/i;
const FEES_AMOUNT_RE = /\$(\d[\d,]*(?:\.\d{1,2})?)/g;

/** Parses the chamber page's "Fees/Admission" field text into an EventCost. Public for testing. */
export function parseFeesText(raw: string | undefined): EventCost | undefined {
    if (!raw) return undefined;
    const text = raw.trim();
    if (!text || /^(n\/a|none|no cost|varies from event to event)$/i.test(text)) return undefined;
    if (hasUnnegatedMatch(text, FEES_NOTAFLOF_RE)) return { min: 0 };

    // Collect every dollar amount on the field along with what its
    // immediately-preceding text labels it as. Order-independent — the
    // cheapest matching amount wins regardless of which tier is listed
    // first (GrowthZone listings aren't consistently ordered).
    FEES_AMOUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    const all: number[] = [];
    const general: number[] = [];
    const nonMember: number[] = [];
    while ((m = FEES_AMOUNT_RE.exec(text))) {
        const amount = parseDollars(m[1]);
        const prefix = text.slice(Math.max(0, m.index - 30), m.index);
        const isGeneral = FEES_GENERAL_TIER_RE.test(prefix);
        const isMember = !isGeneral && FEES_MEMBER_TIER_RE.test(prefix);
        all.push(amount);
        if (isGeneral) general.push(amount);
        if (!isMember) nonMember.push(amount);
    }
    if (general.length > 0) return { min: Math.min(...general) };
    if (all.length === 1) return { min: all[0] };
    if (all.length > 1) {
        // Some amounts were tagged as a member-only discount and excluded —
        // the cheapest of the rest is the general-admission price. If none
        // were tagged (e.g. "$30/session, 4 sessions for $102" — a per-visit
        // price vs. a bulk package, not a tier), the cheapest of all of them
        // is simply the cheapest way in, matching the rubric either way.
        return { min: Math.min(...(nonMember.length < all.length ? nonMember : all)) };
    }

    // No dollar amount anywhere — only now trust a bare "free" claim.
    if (hasUnnegatedMatch(text, FEES_FREE_WORD_RE)) return { min: 0 };
    return undefined;
}

function extractFeesText(root: HTMLElement): string | undefined {
    const text = cleanText(root.querySelector("div.gz-event-fees p")?.text);
    return text.length > 0 ? text : undefined;
}

/**
 * Parses one GrowthZone event-detail page. The page carries schema.org
 * microdata: `itemprop="name"` title, `startDate`/`endDate` UTC instants in
 * `content=`, an optional `location` Place with name + PostalAddress, and an
 * `about` description block. Returns `[event]`, `[event, uncertainty]` when
 * no location is published, or `[error]`. Never returns null. Public for
 * testing.
 */
export function parseDetailPage(html: string, slug: string): RipperEvent[] {
    const root = parseHtml(html);
    const summary = cleanText(root.querySelector("h1.gz-pagetitle")?.text);
    if (!summary) {
        return [{ type: "ParseError", reason: "Event detail page has no title", context: slug }];
    }

    const startEl = root.querySelector('[itemprop="startDate"]');
    const date = parseInstant(startEl?.getAttribute("content"));
    if (!date) {
        return [{
            type: "ParseError",
            reason: `Could not parse startDate "${startEl?.getAttribute("content") ?? ""}" for "${summary}"`,
            context: slug,
        }];
    }

    let duration = DEFAULT_DURATION;
    const end = parseInstant(root.querySelector('[itemprop="endDate"]')?.getAttribute("content"));
    if (end) {
        const between = Duration.between(date, end);
        if (!between.isNegative() && !between.isZero()) duration = between;
    }

    const descEl = root.querySelector('.gz-event-description');
    if (descEl) descEl.querySelectorAll("h3.gz-subtitle").forEach(h => h.remove());
    const description = cleanText(descEl?.text);

    const imgSrc = root.querySelector("img.gz-event-img")?.getAttribute("src");
    const imageUrl = imgSrc && /^https?:\/\//.test(imgSrc) ? imgSrc : undefined;

    const location = extractLocation(root)
        ?? KNOWN_ORGANIZER_LOCATIONS.find(k => summary.startsWith(k.titlePrefix))?.location;
    const cost = parseFeesText(extractFeesText(root));

    const event: RipperCalendarEvent = {
        id: slug,
        ripped: new Date(),
        date,
        duration,
        summary,
        description: description.length > 0 ? description : undefined,
        location: location ?? FALLBACK_LOCATION,
        url: detailUrl(slug),
        imageUrl,
        ...(cost !== undefined ? { cost } : {}),
    };

    if (location) return [event];

    const unknownFields: UncertaintyField[] = ["location"];
    const uncertainty: UncertaintyError = {
        type: "Uncertainty",
        reason: `West Seattle Chamber listing "${summary}" (${slug}) publishes no location`,
        source: SOURCE_NAME,
        unknownFields,
        event,
        partialFingerprint: simpleHash(`${summary}|${date.toLocalDate().toString()}`),
    };
    return [event, uncertainty];
}

/**
 * West Seattle Chamber of Commerce community calendar
 * (westseattle.wschamber.com, a GrowthZone/ChamberMaster site). Crawls the
 * month-calendar pages to discover event slugs, then fetches each event's
 * detail page for authoritative date/time/location via schema.org microdata.
 */
export default class WestSeattleChamberRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    private async fetchText(url: string): Promise<string> {
        const res = await this.fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        return res.text();
    }

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars?.[0];
        if (!calConfig) throw new Error(`No calendars configured for ${SOURCE_NAME} ripper`);
        const now = ZonedDateTime.now(TIMEZONE);

        const allEvents: RipperCalendarEvent[] = [];
        const allErrors: RipperError[] = [];

        const slugs = new Set<string>();
        let listingFailures = 0;
        const monthUrls = calendarMonthUrls(now.toLocalDate());
        for (const url of monthUrls) {
            try {
                extractDetailSlugs(await this.fetchText(url)).forEach(s => slugs.add(s));
            } catch (error) {
                listingFailures++;
                allErrors.push({ type: "ParseError", reason: `Failed to fetch calendar month: ${error}`, context: url });
            }
        }
        if (listingFailures === monthUrls.length) {
            throw new Error(`Failed to fetch every West Seattle Chamber calendar month page`);
        }

        const today = now.toLocalDate();
        for (const slug of slugs) {
            const occurrence = slugDate(slug);
            if (occurrence && occurrence.isBefore(today)) continue;
            let html: string;
            try {
                html = await this.fetchText(detailUrl(slug));
            } catch (error) {
                allErrors.push({ type: "ParseError", reason: `Failed to fetch event detail: ${error}`, context: slug });
                continue;
            }
            for (const result of parseDetailPage(html, slug)) {
                if ("date" in result) allEvents.push(result);
                else allErrors.push(result);
            }
        }

        // Drop past events (and their paired Uncertainty errors) in one pass.
        const events = allEvents.filter(e => !e.date.plus(e.duration).isBefore(now));
        const keptIds = new Set(events.map(e => e.id));
        const errors = allErrors.filter(err => err.type !== "Uncertainty" || keptIds.has(err.event.id));

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
