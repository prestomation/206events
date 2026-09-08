import { Duration, Instant, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// STYC races/cruises are almost always posted without a specific start time
// in WildApricot (only the date is set) — WildApricot then serializes the
// item's <pubDate> as local midnight for that date. Genuinely-timed items
// (e.g. evening board meetings) come through with a real, DST-correct local
// time. Midnight is therefore a reliable "no time given" signal, not a real
// start time — treating it as fact would publish "races start at 12am".
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
const DEFAULT_DURATION = Duration.ofHours(3);

// Board meetings are internal club business, not public sailing events —
// filtered before parsing (a content filter, not a parse failure).
const NON_PUBLIC_TITLE_PREFIXES = ["board meeting"];

// Races and cruises happen at various spots around Puget Sound near the
// club's Ballard home base, not one fixed address — kept intentionally
// generic so it's never wrong for a specific event (e.g. an occasional
// cruise to a marina outside Seattle).
const GENERIC_LOCATION = "Puget Sound, Seattle, WA";

// Deterministic hash for partialFingerprint — only needs stability, not
// crypto strength. Invalidates a cached uncertainty resolution if the
// source later changes what it published for this event (e.g. finally
// posts a real start time, changing timeUnknown from true to false).
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

export interface RawStycItem {
    title?: string;
    link?: string;
    guid?: string;
    pubDate?: string;
    description?: string;
}

function decodeHtmlEntitiesOnce(str: string): string {
    return str
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

// WildApricot's RSS <description> is HTML that was itself entity-encoded
// before being XML-encoded for the feed, so a literal "&" survives as
// "&amp;amp;" — one decode pass only unwraps the outer (XML) layer, leaving
// "&amp;" behind. Decoding to a fixed point resolves both layers without
// assuming a specific nesting depth.
export function decodeHtmlEntities(str: string): string {
    let current = str;
    for (let i = 0; i < 4; i++) {
        const next = decodeHtmlEntitiesOnce(current);
        if (next === current) return next;
        current = next;
    }
    return current;
}

// Finds <item>...</item> boundaries with plain indexOf scans rather than a
// global backtracking regex. A regex like /<item>([\s\S]*?)<\/item>/g is
// O(n^2) worst-case on adversarial input with many "<item>" occurrences and
// no closing tag (each failed lazy scan restarts from the next "<item>" and
// rescans to the end of the string) — indexOf has no such restart-position
// blowup, since each search starts where the last one left off. Field
// extraction below then runs its own small (still delimiter-bounded, but
// now single-item-sized rather than whole-feed-sized) regexes only against
// one item's block, keeping the same worst case bounded and negligible.
export function extractFeedItems(xml: string): RawStycItem[] {
    const items: RawStycItem[] = [];
    let searchFrom = 0;
    while (true) {
        const start = xml.indexOf('<item>', searchFrom);
        if (start === -1) break;
        const end = xml.indexOf('</item>', start + '<item>'.length);
        if (end === -1) break;
        const block = xml.slice(start + '<item>'.length, end);
        searchFrom = end + '</item>'.length;

        const field = (re: RegExp): string | undefined => block.match(re)?.[1]?.trim();
        items.push({
            title: field(/<title>([\s\S]*?)<\/title>/),
            link: field(/<link>([\s\S]*?)<\/link>/),
            guid: field(/<guid[^>]*>([\s\S]*?)<\/guid>/),
            pubDate: field(/<pubDate>([\s\S]*?)<\/pubDate>/),
            description: field(/<description>([\s\S]*?)<\/description>/),
        });
    }
    return items;
}

export function isNonPublicEvent(title: string): boolean {
    const normalized = decodeHtmlEntities(title).trim().toLowerCase();
    return NON_PUBLIC_TITLE_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

// Strips the redundant "(DD Mon YYYY)" date suffix WildApricot appends to
// every event title — the date is already carried in the event's own date
// field, so repeating it in the summary text is just noise.
export function stripDateSuffix(title: string): string {
    return title.replace(/\s*\(\d{1,2}\s+\w{3}\s+\d{4}\)\s*$/, '').trim();
}

export function extractIdFromGuid(guid: string): string | undefined {
    const match = guid.match(/event-(\d+)/);
    return match ? `sloop-tavern-yc-${match[1]}` : undefined;
}

export function extractImageAndDescription(raw: string | undefined): { imageUrl?: string; description?: string } {
    if (!raw) return {};
    const decoded = decodeHtmlEntities(raw);
    const imgMatch = decoded.match(/<img[^>]*\ssrc="([^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : undefined;
    const withoutTags = decoded.replace(/<[^>]*>/g, " ");
    const description = withoutTags.replace(/\s+/g, " ").trim();
    return { imageUrl, description: description.length > 0 ? description : undefined };
}

// Parses an RSS <pubDate> into the calendar's local time and reports
// whether WildApricot serialized it as local midnight — its signal for
// "no time was ever entered for this event" (see the module-level comment).
// Exported so the caller can decide whether to pair the parsed event with
// an UncertaintyError without re-deriving the same check from the final
// (possibly noon-shifted) event date.
export function parsePubDate(pubDate: string, zone: ZoneId): { date: ZonedDateTime; timeUnknown: boolean } | null {
    const epochMillis = Date.parse(pubDate);
    if (Number.isNaN(epochMillis)) return null;
    const parsed = Instant.ofEpochMilli(epochMillis).atZone(zone);
    return { date: parsed, timeUnknown: parsed.hour() === 0 && parsed.minute() === 0 };
}

export function parseFeedItem(raw: RawStycItem, zone: ZoneId): RipperEvent {
    const { title, link, guid, pubDate } = raw;
    if (!title || !link || !guid || !pubDate) {
        return {
            type: "ParseError",
            reason: "Missing a required field (title/link/guid/pubDate) in Sloop Tavern Yacht Club RSS item",
            context: title ?? link ?? guid,
        };
    }

    const parsedPubDate = parsePubDate(pubDate, zone);
    if (!parsedPubDate) {
        return { type: "ParseError", reason: `Could not parse pubDate: "${pubDate}"`, context: title };
    }

    const id = extractIdFromGuid(guid);
    if (!id) {
        return { type: "ParseError", reason: `Could not extract an event id from guid: "${guid}"`, context: title };
    }

    const date = parsedPubDate.timeUnknown
        ? parsedPubDate.date.withHour(DEFAULT_UNKNOWN_TIME_HOUR).withMinute(DEFAULT_UNKNOWN_TIME_MINUTE)
        : parsedPubDate.date;

    const { imageUrl, description } = extractImageAndDescription(raw.description);

    return {
        id,
        ripped: new Date(),
        date,
        duration: DEFAULT_DURATION,
        summary: stripDateSuffix(decodeHtmlEntities(title)),
        description,
        location: GENERIC_LOCATION,
        url: link,
        imageUrl,
    };
}

export default class SloopTavernYachtClubRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`RSS feed returned ${res.status} ${res.statusText}`);
        }

        const xml = await res.text();
        const rawItems = extractFeedItems(xml).filter(raw => !raw.title || !isNonPublicEvent(raw.title));

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        for (const raw of rawItems) {
            const result = parseFeedItem(raw, zone);
            if (!("date" in result)) {
                errors.push(result);
                continue;
            }
            if (result.date.isBefore(now)) continue;
            events.push(result);

            if (raw.pubDate && parsePubDate(raw.pubDate, zone)?.timeUnknown) {
                const unknownFields: UncertaintyField[] = ["startTime", "duration"];
                const uncertainty: UncertaintyError = {
                    type: "Uncertainty",
                    reason: `Sloop Tavern Yacht Club's calendar did not include a start time for "${result.summary}"`,
                    source: ripper.config.name,
                    unknownFields,
                    event: result,
                    partialFingerprint: simpleHash(`${result.id}:${result.summary}:${raw.pubDate}`),
                };
                errors.push(uncertainty);
            }
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }
}
