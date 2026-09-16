import { ChronoUnit, Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decodeEntities } from "../../lib/text-normalize.js";
import '@js-joda/timezone';

const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";

// Most PSMS listings (ID clinics, general meetings) carry a real
// start/end time. A handful (the annual Wild Mushroom Show, multi-day
// forays) are published with a date-only startDate/endDate — the actual
// hours only appear as free text in the description ("Open to the
// public 12-6"), which we don't parse to avoid publishing a guess as
// fact. Those go through the uncertainty system instead (noon
// placeholder + UncertaintyError) so the resolver can fill in the real
// time later.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
const DEFAULT_DURATION = Duration.ofHours(3);

export interface PsmsListItem {
    eventid: string;
    detailUrl: string;
}

export interface PsmsPlace {
    name?: string;
    address?: {
        streetAddress?: string;
        addressLocality?: string;
        postalCode?: string;
        addressRegion?: string;
    };
}

export interface PsmsEventJsonLd {
    "@type"?: string;
    name?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    // PSMS's own template capitalizes this field ("Location", not the
    // schema.org-standard "location") — kept verbatim rather than
    // normalized, since that's what the source actually emits.
    Location?: PsmsPlace;
}

/** Extract the detail-page links from the "all events" list page's feed-item cards. */
export function extractListItems(html: string): PsmsListItem[] {
    const items: PsmsListItem[] = [];
    const sectionRegex = /<section class="feed-item">([\s\S]*?)<\/section>/g;
    let match: RegExpExecArray | null;
    while ((match = sectionRegex.exec(html)) !== null) {
        const hrefMatch = match[1].match(/class="ev-title-link"\s+href="([^"]+)"/);
        if (!hrefMatch) continue;
        const detailUrl = decodeEntities(hrefMatch[1]);
        const idMatch = detailUrl.match(/[?&]eventid=(\d+)/);
        if (idMatch) items.push({ eventid: idMatch[1], detailUrl });
    }
    return items;
}

/** Extract the schema.org/Event JSON-LD object from a PSMS event detail page. */
export function extractEventJsonLd(html: string): PsmsEventJsonLd | null {
    const match = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return null;
    try {
        const data: unknown = JSON.parse(match[1]);
        const arr = Array.isArray(data) ? data : [data];
        const event = arr.find(d => d && typeof d === "object" && (d as PsmsEventJsonLd)["@type"] === "Event");
        return (event as PsmsEventJsonLd) ?? null;
    } catch {
        return null;
    }
}

export function hasTimeComponent(dateStr: string): boolean {
    return dateStr.includes("T");
}

// Internal club business, not a public event — filtered before parsing
// rather than surfaced as a parse gap. Detected from the data PSMS itself
// publishes (a "Zoom" location, or "members only" in the name/description)
// rather than guessed title prefixes, so it still catches a future
// internal listing worded differently.
export function isPublicEvent(jsonLd: PsmsEventJsonLd): boolean {
    if (jsonLd.Location?.name?.trim().toLowerCase().includes("zoom")) return false;
    const text = `${jsonLd.name ?? ""} ${jsonLd.description ?? ""}`.toLowerCase();
    if (text.includes("members only")) return false;
    return true;
}

function buildLocation(place: PsmsPlace | undefined): string | undefined {
    const parts = [
        place?.name?.trim(),
        place?.address?.streetAddress?.trim(),
        place?.address?.addressLocality?.trim(),
        place?.address?.addressRegion?.trim(),
    ].filter((p): p is string => !!p && p.length > 0);
    return parts.length > 0 ? parts.join(", ") : undefined;
}

export function parseEventFromJsonLd(jsonLd: PsmsEventJsonLd, eventUrl: string, eventid: string, zone: ZoneId): RipperEvent {
    const { name, startDate, endDate } = jsonLd;
    if (!name || !startDate) {
        return { type: "ParseError", reason: "Missing name or startDate in PSMS event JSON-LD", context: eventUrl };
    }

    const startHasTime = hasTimeComponent(startDate);
    let startZdt: ZonedDateTime;
    try {
        startZdt = startHasTime
            ? LocalDateTime.parse(startDate).atZone(zone)
            : LocalDate.parse(startDate).atTime(DEFAULT_UNKNOWN_TIME_HOUR, DEFAULT_UNKNOWN_TIME_MINUTE).atZone(zone);
    } catch (error) {
        return { type: "ParseError", reason: `Invalid startDate "${startDate}": ${error}`, context: name };
    }

    let duration = DEFAULT_DURATION;
    if (endDate) {
        try {
            if (startHasTime && hasTimeComponent(endDate)) {
                const endZdt = LocalDateTime.parse(endDate).atZone(zone);
                const minutes = Duration.between(startZdt, endZdt).toMinutes();
                if (minutes > 0) duration = Duration.ofMinutes(minutes);
            } else if (!startHasTime) {
                const days = ChronoUnit.DAYS.between(LocalDate.parse(startDate), LocalDate.parse(endDate));
                if (days > 0) duration = Duration.ofDays(days + 1);
            }
        } catch {
            // Keep the default duration — endDate was malformed.
        }
    }

    const location = buildLocation(jsonLd.Location);
    if (!location) {
        return { type: "ParseError", reason: `Missing location for event "${name}"`, context: eventUrl };
    }

    return {
        id: `psms-${eventid}`,
        ripped: new Date(),
        date: startZdt,
        duration,
        summary: decodeEntities(name),
        description: jsonLd.description ? decodeEntities(jsonLd.description) : undefined,
        location,
        url: eventUrl,
    };
}

export default class PsmsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);
        const listUrl = ripper.config.url.toString();

        const listRes = await fetchFn(listUrl, { headers: { "User-Agent": USER_AGENT } });
        if (!listRes.ok) throw new Error(`PSMS events list fetch failed: HTTP ${listRes.status}`);
        const listItems = extractListItems(await listRes.text());

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const item of listItems) {
            const detailRes = await fetchFn(item.detailUrl, {
                headers: { "User-Agent": USER_AGENT, "Referer": listUrl },
            });
            if (!detailRes.ok) {
                errors.push({ type: "ParseError", reason: `HTTP ${detailRes.status} fetching event detail`, context: item.detailUrl });
                continue;
            }

            const jsonLd = extractEventJsonLd(await detailRes.text());
            if (!jsonLd) {
                errors.push({ type: "ParseError", reason: "No JSON-LD Event found on detail page", context: item.detailUrl });
                continue;
            }
            if (!isPublicEvent(jsonLd)) continue;

            const result = parseEventFromJsonLd(jsonLd, item.detailUrl, item.eventid, zone);
            if (!("date" in result)) {
                errors.push(result);
                continue;
            }
            if (result.date.isBefore(now)) continue;
            events.push(result);

            if (jsonLd.startDate && !hasTimeComponent(jsonLd.startDate)) {
                const unknownFields: UncertaintyField[] = ["startTime", "duration"];
                errors.push({
                    type: "Uncertainty",
                    reason: `PSMS listing "${result.summary}" did not include a start time`,
                    source: ripper.config.name,
                    unknownFields,
                    event: result,
                    partialFingerprint: simpleHash(`${result.id}:${jsonLd.startDate}:${jsonLd.endDate ?? ""}`),
                });
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

// Deterministic hash for partialFingerprint — only needs stability, not
// crypto strength. Invalidates a cached uncertainty resolution if PSMS
// later publishes a real time for the event.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
