import { Duration, Instant, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// The RSS feed almost always carries a real start time, but WildApricot's
// "no time entered" signal (an item serialized at local midnight) is the
// same one used by sources/sloop_tavern_yacht_club — keep the same
// detection here in case a future item is posted without a time.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;

// Sessions run for the evening/afternoon the clubhouse is open; the feed
// gives no end time, so this is a flat estimate rather than a per-event fact.
const DEFAULT_DURATION = Duration.ofHours(4);

// Club-internal business (board meetings, the annual general meeting) is not
// an attendable public event — filtered before parsing, same intent as
// sources/sloop_tavern_yacht_club's NON_PUBLIC_TITLE_PREFIXES. This club's
// actual titles ("Q3 Board Meeting - Red Room", "Club Annual General
// Meeting (AGM)") don't put the phrase at the start, so this matches
// anywhere in the (lowercased) title rather than only as a prefix — accepted
// tradeoff: a public event that happens to discuss one of these phrases in
// its title would also be filtered, but no such title has appeared in the
// feed.
const NON_PUBLIC_TITLE_SUBSTRINGS = ["board meeting", "annual general meeting"];

// Every session happens at the club's single physical clubhouse.
const CLUBHOUSE_LOCATION = "Nickerson Marina Building, Suite 301, 1080 W Ewing Pl, Seattle, WA 98119";

// Deterministic hash for partialFingerprint — only needs stability, not
// crypto strength.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

export interface RawMsgItem {
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
// before being XML-encoded for the feed, so decoding to a fixed point
// unwraps both layers without assuming a specific nesting depth.
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
// global backtracking regex, matching sources/sloop_tavern_yacht_club's
// approach for the same WildApricot RSS shape.
export function extractFeedItems(xml: string): RawMsgItem[] {
    const items: RawMsgItem[] = [];
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
    return NON_PUBLIC_TITLE_SUBSTRINGS.some(substring => normalized.includes(substring));
}

// Strips the redundant "(DD Mon YYYY)" date suffix WildApricot appends to
// every event title — the date is already carried in the event's own date
// field.
export function stripDateSuffix(title: string): string {
    return title.replace(/\s*\(\d{1,2}\s+\w{3}\s+\d{4}\)\s*$/, '').trim();
}

// WildApricot gives every occurrence of a recurring event (e.g. "Thursday
// night Euros" happening most Thursdays) the SAME guid/link — it identifies
// the series, not the occurrence. Appending the occurrence's own local
// date+time keeps ids unique per occurrence, the same slot-suffix approach
// the repo uses for same-day double features (see AGENTS.md "Ripper Design:
// Stable Event IDs") — the time component additionally disambiguates a rare
// same-series makeup/second session posted on the same calendar date.
export function extractSeriesIdFromGuid(guid: string): string | undefined {
    const match = guid.match(/event-(\d+)/);
    return match ? match[1] : undefined;
}

function pad2(n: number): string {
    return n.toString().padStart(2, '0');
}

export function occurrenceSlug(date: ZonedDateTime): string {
    return `${date.toLocalDate().toString()}-${pad2(date.hour())}${pad2(date.minute())}`;
}

export function extractDescription(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const decoded = decodeHtmlEntities(raw);
    const withoutTags = decoded.replace(/<[^>]*>/g, " ");
    const description = withoutTags.replace(/\s+/g, " ").trim();
    return description.length > 0 ? description : undefined;
}

// Parses an RSS <pubDate> into the calendar's local time and reports
// whether WildApricot serialized it as local midnight — its signal for
// "no time was ever entered for this event".
export function parsePubDate(pubDate: string, zone: ZoneId): { date: ZonedDateTime; timeUnknown: boolean } | null {
    const epochMillis = Date.parse(pubDate);
    if (Number.isNaN(epochMillis)) return null;
    const parsed = Instant.ofEpochMilli(epochMillis).atZone(zone);
    return { date: parsed, timeUnknown: parsed.hour() === 0 && parsed.minute() === 0 };
}

export function parseFeedItem(raw: RawMsgItem, zone: ZoneId): RipperEvent {
    const { title, link, guid, pubDate } = raw;
    if (!title || !link || !guid || !pubDate) {
        return {
            type: "ParseError",
            reason: "Missing a required field (title/link/guid/pubDate) in Metro Seattle Gamers RSS item",
            context: title ?? link ?? guid,
        };
    }

    const parsedPubDate = parsePubDate(pubDate, zone);
    if (!parsedPubDate) {
        return { type: "ParseError", reason: `Could not parse pubDate: "${pubDate}"`, context: title };
    }

    const seriesId = extractSeriesIdFromGuid(guid);
    if (!seriesId) {
        return { type: "ParseError", reason: `Could not extract an event id from guid: "${guid}"`, context: title };
    }

    const date = parsedPubDate.timeUnknown
        ? parsedPubDate.date.withHour(DEFAULT_UNKNOWN_TIME_HOUR).withMinute(DEFAULT_UNKNOWN_TIME_MINUTE)
        : parsedPubDate.date;

    const id = `metro-seattle-gamers-${seriesId}-${occurrenceSlug(date)}`;

    return {
        id,
        ripped: new Date(),
        date,
        duration: DEFAULT_DURATION,
        summary: stripDateSuffix(decodeHtmlEntities(title)),
        description: extractDescription(raw.description),
        location: CLUBHOUSE_LOCATION,
        url: link,
    };
}

export default class MetroSeattleGamersRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);
        const cutoff = ripper.config.lookahead ? now.plus(ripper.config.lookahead) : undefined;

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
            if (cutoff && result.date.isAfter(cutoff)) continue;
            events.push(result);

            if (raw.pubDate && parsePubDate(raw.pubDate, zone)?.timeUnknown) {
                const unknownFields: UncertaintyField[] = ["startTime", "duration"];
                const uncertainty: UncertaintyError = {
                    type: "Uncertainty",
                    reason: `Metro Seattle Gamers' calendar did not include a start time for "${result.summary}"`,
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
