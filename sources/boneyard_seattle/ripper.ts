import { Duration, LocalDate, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const SOURCE_NAME = "boneyard-seattle";
const LOCATION = "BoneYard Seattle, 2603 S Jackson St, Seattle, WA 98144";
const DEFAULT_DURATION = Duration.ofHours(2);
// Placeholder start used only when the listing's time text has no parseable
// time (e.g. a multi-day "09/04-06" entry). Always paired with an
// UncertaintyError so the resolver can fill in the real value.
const PLACEHOLDER_START = LocalTime.of(18, 0);

// The events page (a Wix site) lists its events through a Wix CMS repeater
// bound to the "EventsAtTavern" collection. Wix server-renders the bound
// records into the page's `<script type="application/json"
// id="wix-warmup-data">` blob. We only ever read the records at this fixed
// path — sibling keys can carry internal Wix tokens and must never be read,
// logged, or copied into fixtures.
const COLLECTION_ID = "EventsAtTavern";

const WARMUP_SCRIPT_REGEX = /<script\b(?=[^>]*\btype=["']application\/json["'])(?=[^>]*\bid=["']wix-warmup-data["'])[^>]*>([\s\S]*?)<\/script>/i;

export interface BoneyardRecord {
    _id?: string;
    eventName?: string;
    category?: string;
    // ISO calendar date, e.g. "2026-09-11" (Wix CMS "date" field).
    date?: string;
    // Free-text date/time line as shown on the page, e.g. "09/11, 7-9pm",
    // "09/19, 7pm", "09/04-06".
    time1?: string;
    // Wix media reference, e.g. "wix:image://v1/<mediaId>/<name>#originWidth=..".
    image?: string;
}

function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function extractWarmupDataJson(html: string): string | undefined {
    const match = html.match(WARMUP_SCRIPT_REGEX);
    return match ? match[1] : undefined;
}

/** Converts a `wix:image://v1/<mediaId>/...` reference to a public static URL. */
export function wixImageToUrl(ref: string | undefined): string | undefined {
    if (!ref) return undefined;
    const m = ref.match(/^wix:image:\/\/v1\/([^/#]+)/);
    return m ? `https://static.wixstatic.com/media/${m[1]}` : undefined;
}

function to24h(hour: number, meridiem: string): number {
    const pm = meridiem.toLowerCase() === "pm";
    if (hour === 12) return pm ? 12 : 0;
    return pm ? hour + 12 : hour;
}

/**
 * Parses the free-text time portion of a listing, e.g. "09/11, 7-9pm" →
 * 19:00 for 2h, "09/19, 7pm" → 19:00 (no end), "09/12, 12-1pm" → 12:00 for
 * 1h. Returns undefined when no time is present (e.g. "09/04-06").
 */
export function parseTimeText(text: string): { start: LocalTime; duration?: Duration } | undefined {
    // Drop the leading "MM/DD" (and optional "-DD" range) so its digits are
    // not mistaken for hours.
    const rest = text.replace(/^\s*\d{1,2}\/\d{1,2}(?:\s*-\s*\d{1,2}(?:\/\d{1,2})?)?\s*,?/, "");

    const range = rest.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (range) {
        const endMer = range[6];
        const endH = to24h(parseInt(range[4], 10), endMer);
        const endM = range[5] ? parseInt(range[5], 10) : 0;
        let startH: number;
        if (range[3]) {
            startH = to24h(parseInt(range[1], 10), range[3]);
        } else {
            startH = to24h(parseInt(range[1], 10), endMer);
            // "11-1pm" → the start is 11am, not 11pm.
            if (startH > endH) startH = to24h(parseInt(range[1], 10), "am");
        }
        const startM = range[2] ? parseInt(range[2], 10) : 0;
        if (startH > 23 || endH > 23 || startM > 59 || endM > 59) return undefined;
        const start = LocalTime.of(startH, startM);
        let minutes = (endH * 60 + endM) - (startH * 60 + startM);
        if (minutes <= 0) minutes += 24 * 60; // crosses midnight
        return { start, duration: Duration.ofMinutes(minutes) };
    }

    const single = rest.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (single) {
        const h = to24h(parseInt(single[1], 10), single[3]);
        const m = single[2] ? parseInt(single[2], 10) : 0;
        if (h > 23 || m > 59) return undefined;
        return { start: LocalTime.of(h, m) };
    }
    return undefined;
}

export function parseBoneyardRecord(
    raw: BoneyardRecord,
    timezone: ZoneId,
): { event: RipperCalendarEvent; timeKnown: boolean } | RipperError {
    const title = raw.eventName ? decode(raw.eventName).replace(/\s+/g, " ").trim() : "";
    if (!title || !raw.date) {
        return {
            type: "ParseError",
            reason: "BoneYard event record missing eventName or date",
            context: JSON.stringify({ eventName: raw.eventName, date: raw.date, time1: raw.time1 }),
        };
    }

    let day: LocalDate;
    try {
        day = LocalDate.parse(raw.date.substring(0, 10));
    } catch (error) {
        return { type: "ParseError", reason: `Invalid date "${raw.date}": ${error}`, context: title };
    }

    const time = raw.time1 ? parseTimeText(raw.time1) : undefined;
    const start = ZonedDateTime.of(day, time?.start ?? PLACEHOLDER_START, timezone);

    const category = raw.category ? decode(raw.category).trim() : "";
    // The CMS "category" is used as a short subtitle; skip placeholders like
    // "." and ones that just repeat the title.
    const subtitle = category.length > 1 && category.toLowerCase() !== title.toLowerCase() ? category : undefined;
    const descParts = [subtitle, raw.time1 ? `As listed: ${raw.time1.trim()}` : undefined].filter(Boolean);

    const slot = time ? `-${start.toLocalTime().toString().replace(":", "")}` : "";
    return {
        timeKnown: time !== undefined,
        event: {
            id: `${SOURCE_NAME}-${slugify(title)}-${day.toString()}${slot}`,
            ripped: new Date(),
            date: start,
            duration: time?.duration ?? DEFAULT_DURATION,
            summary: title,
            description: descParts.length ? descParts.join("\n") : undefined,
            location: LOCATION,
            url: "https://www.boneyardseattle.com/events",
            imageUrl: wixImageToUrl(raw.image),
        },
    };
}

/**
 * Reads the EventsAtTavern CMS records out of the wix-warmup-data JSON and
 * produces upcoming events. Past events, duplicates, and "bar closed"
 * notices (listed in the same repeater but not events) are skipped here in
 * the caller rather than in the parse method.
 */
export function extractBoneyardEvents(
    warmupDataJson: string,
    timezone: ZoneId,
    now: ZonedDateTime = ZonedDateTime.now(timezone),
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    let parsed: unknown;
    try {
        parsed = JSON.parse(warmupDataJson);
    } catch (error) {
        return { events, errors: [{ type: "ParseError", reason: `Failed to parse wix-warmup-data JSON: ${error}`, context: undefined }] };
    }

    const records = (parsed as any)?.appsWarmupData?.dataBinding?.dataStore?.recordsByCollectionId?.[COLLECTION_ID];
    if (!records || typeof records !== "object") {
        return {
            events,
            errors: [{
                type: "ParseError",
                reason: `Expected object at appsWarmupData.dataBinding.dataStore.recordsByCollectionId["${COLLECTION_ID}"] but found ${typeof records}`,
                context: undefined,
            }],
        };
    }

    const today = now.toLocalDate();
    for (const raw of Object.values(records) as BoneyardRecord[]) {
        if (raw.eventName && /\bclosed\b/i.test(raw.eventName)) continue; // hours notice, not an event
        const result = parseBoneyardRecord(raw, timezone);
        if (!("timeKnown" in result)) {
            errors.push(result);
            continue;
        }
        const { event, timeKnown } = result;
        if (event.date.toLocalDate().isBefore(today)) continue;
        if (event.id && seen.has(event.id)) continue;
        if (event.id) seen.add(event.id);
        events.push(event);

        if (!timeKnown) {
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: `No start time in BoneYard listing text "${raw.time1 ?? ""}"`,
                source: SOURCE_NAME,
                unknownFields: ["startTime"],
                event,
                partialFingerprint: simpleHash(`${raw.date}|${raw.time1 ?? ""}`),
            };
            errors.push(uncertainty);
        }
    }

    events.sort((a, b) => a.date.compareTo(b.date));
    return { events, errors };
}

export default class BoneyardSeattleRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const timezone: ZoneId = calConfig.timezone;

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`BoneYard Seattle returned HTTP ${res.status}`);

        const html = await res.text();
        const warmupDataJson = extractWarmupDataJson(html);
        const { events, errors } = warmupDataJson
            ? extractBoneyardEvents(warmupDataJson, timezone)
            : { events: [], errors: [{ type: "ParseError", reason: "wix-warmup-data script tag not found on page", context: undefined } as RipperError] };

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
