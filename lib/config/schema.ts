import { Duration, Period, ZoneOffset, ZoneRegion, ZonedDateTime, convert } from "@js-joda/core";
import { z } from "zod";
import { promisify } from 'util';
import * as icsOriginal from 'ics';
import { containsHtmlEntity } from "../url-entities.js";
import { CITY } from "./city.js";

import '@js-joda/timezone'

const createICSEvents = promisify(icsOriginal.createEvents);


export const geoSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    label: z.string().optional(),
    // OpenStreetMap feature identity. Both must be set together or neither —
    // consumers key off the (osmType, osmId) pair. Absent means "we positioned
    // this venue manually, no OSM join available."
    osmType: z.enum(["node", "way", "relation"]).optional(),
    osmId: z.number().int().positive().optional(),
    // ISO date (YYYY-MM-DD) recording the last time the OSM-resolver skill
    // looked at this venue and rejected every Nominatim candidate (a Tier D/F
    // verdict — wrong feature, or no feature at all). `buildOsmGaps` skips
    // venues whose `osmChecked` is within the last ~60 days so the same
    // wrong matches don't re-propose every day. After the cooldown, the
    // skill retries — OSM grows, and venues that weren't indexed last
    // quarter may be there now.
    osmChecked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().refine(
    g => (g.osmId === undefined) === (g.osmType === undefined),
    { message: "osmId and osmType must be set together or both omitted" },
);

export type Geo = z.infer<typeof geoSchema>;

/**
 * How many days a Tier D/F rejection (recorded as `osmChecked`) silences a
 * venue from `osmGaps`. After the cooldown the venue surfaces again so the
 * skill can retry — OSM grows over time and a feature missing six months
 * ago may exist today.
 */
export const OSM_CHECKED_COOLDOWN_DAYS = 60;

// An event's admission cost in USD. `min: 0` means free; `max` is present
// when the source exposes a price range. `{ paid: true }` means "definitely
// not free, amount unknown" (e.g. Eventbrite `is_free: false` without ticket
// price data). Prices are face value, excluding service fees.
export type EventCost = { min: number; max?: number } | { paid: true };

// YAML sugar for source-level cost declarations: `cost: free` or `cost: 10`
// (flat USD amount). Normalized to the EventCost object form. Applied as a
// default to events the ripper didn't price — a ripper-parsed cost wins.
export const costConfigSchema = z.union([z.literal("free"), z.number().min(0)])
    .transform((c): EventCost => c === "free" ? { min: 0 } : { min: c });

export const calendarConfigSchema = z.object({
    name: z.string().regex(/^[a-zA-Z0-9.-]+$/),
    config: z.object({}).passthrough().optional(),
    timezone: z.string().transform(ZoneRegion.of),
    friendlyname: z.string(),
    tags: z.array(z.string()).optional(),
    expectEmpty: z.boolean().optional(),
    // Optional per-calendar override for multi-branch sources (e.g. SPL).
    // When present, this wins over ripper-level `geo`. When absent, the
    // calendar inherits `geo` from its parent ripper.
    geo: geoSchema.nullable().optional(),
    // Optional per-calendar venue photo URL (a link, never image bytes).
    // Overrides the ripper-level `imageUrl` for this branch's venue entry.
    imageUrl: z.string().url().optional(),
    // Optional per-calendar cost default; wins over ripper-level `cost`.
    cost: costConfigSchema.optional(),
});

export const externalCalendarSchema = z.object({
    name: z.string().regex(/^[a-zA-Z0-9.-]+$/),
    friendlyname: z.string(),
    icsUrl: z.string(),
    infoUrl: z.string().optional(),
    description: z.string().optional(),
    disabled: z.boolean().default(false),
    expectEmpty: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
    // When set to "outofband", the ICS feed is fetched by the out-of-band
    // runner (home server with a residential IP) instead of GitHub Actions,
    // for feeds that block GHA IPs. The main build skips its live fetch and
    // picks up the pre-fetched .ics via the outofband report.
    proxy: z.enum(["outofband", "browserbase"]).or(z.literal(false)).default(false),
    // Required: every external calendar must explicitly state whether it is
    // a single-location venue (geo object) or not (null). Single-venue feeds
    // like a brewery's Google Calendar are venues; multi-location feeds
    // (aggregators, cross-city calendars) are not.
    geo: geoSchema.nullable(),
    // Optional venue photo URL (a link, never image bytes) surfaced in
    // venues.json for single-location feeds.
    imageUrl: z.string().url().optional(),
    // Optional cost default applied to every event in this feed (ICS has no
    // standard price property, so external events are priced via this only).
    cost: costConfigSchema.optional(),
});

export const externalConfigSchema = z.array(externalCalendarSchema);

export const BUILTIN_RIPPER_TYPES = ["squarespace", "ticketmaster", "axs", "eventbrite", "dice", "styledcalendar", "spothopper"] as const;
export type BuiltinRipperType = typeof BUILTIN_RIPPER_TYPES[number];

export const configSchema = z.object({
    name: z.string(),
    friendlyname: z.string().optional(),
    description: z.string(),
    url: z.string().transform(u => new URL(u)),
    friendlyLink: z.string(),
    disabled: z.boolean().default(false),
    proxy: z.enum(["outofband", "browserbase"]).or(z.literal(false)).default(false),
    needsBrowser: z.boolean().default(false),
    expectEmpty: z.boolean().default(false),
    type: z.enum(BUILTIN_RIPPER_TYPES).optional(),
    tags: z.array(z.string()).optional(),
    calendars: z.array(calendarConfigSchema),
    // We use refine to provide our own error message
    // and Transform to parse it into a Period
    lookahead: z.string().refine(p => {
        try {
            Period.parse(p);
            return true;
        }
        catch (e) { return false; }
    }, { message: "Must parse as valid ISO-8601 period. e.g. P1M" }).transform(p => Period.parse(p)).optional(),
    // Required: every ripper must explicitly declare whether it is a
    // venue (single fixed location, `geo: {lat, lng, label}`) or not
    // (`geo: null`, e.g. community calendars / multi-location sources).
    // Multi-branch rippers like SPL can declare ripper-level `geo: null`
    // and set `geo` per calendar instead.
    geo: geoSchema.nullable(),
    // Optional venue photo URL (a link, never image bytes) surfaced in
    // venues.json. Per-calendar `imageUrl` overrides this for that branch.
    imageUrl: z.string().url().optional(),
    // Optional source-level cost default for events the ripper didn't price.
    // Per-calendar `cost` overrides this, mirroring `geo` precedence.
    cost: costConfigSchema.optional(),
}).strict();


export type RipperConfig = z.infer<typeof configSchema>;

export type RipperError = FileParseError | InvalidDateError | ImportError | ParseError | GeocodeError | UncertaintyError;
type ErrorBase = { type: string, reason: string; };

export type FileParseError = ErrorBase & {
    type: "FileParseError",
    path: string
};

export type ParseError = ErrorBase & {
    type: "ParseError",
    context: string | undefined;
};

export type ImportError = ErrorBase & {
    type: "ImportError",
    error: any,
    path: string
};

export type InvalidDateError = ErrorBase & {
    type: "InvalidDateError",
};

export type GeocodeError = ErrorBase & {
    type: "GeocodeError";
    location: string;
    source: string;
    reason: string;
};

// Fields a ripper may declare uncertain. Keep this in sync with the
// resolver script's CLI choices (skills/event-uncertainty-resolver).
// When adding a new field, also teach `applyUncertaintyResolutions` how
// to apply it to a RipperCalendarEvent.
export type UncertaintyField = "startTime" | "duration" | "location" | "imageUrl" | "cost";

// Signal from a ripper that it produced an event but isn't certain about
// one or more of its fields. The infrastructure layer merges these against
// `event-uncertainty-cache.json` between rip and ICS write — see
// docs/event-uncertainty.md and lib/uncertainty-merge.ts.
//
// The full event is embedded (not a flattened subset) so that adding new
// RipperCalendarEvent fields later automatically makes them available to
// the resolver agent without a schema change here.
export type UncertaintyError = ErrorBase & {
    type: "Uncertainty";
    source: string;              // ripper name, e.g. "events12"
    calendar?: string;           // calendar slug within the ripper
    unknownFields: UncertaintyField[];
    event: RipperCalendarEvent;  // the event the ripper produced (with placeholder values for unknown fields)
    // Optional hash of whatever the ripper *did* parse from the source.
    // When the source data later changes (e.g., upstream adds a start
    // time), the fingerprint changes and the cache entry is invalidated.
    partialFingerprint?: string;
};


export interface RipperCalendarEvent {
    // Do not add Type, type is how we guard against RipperError
    id?: string;
    ripped: Date;
    date: ZonedDateTime;
    duration: Duration,
    summary: string;
    description?: string;
    location?: string;
    url?: string;
    imageUrl?: string;  // URL to the event image (never image bytes)
    cost?: EventCost;   // Admission cost (USD face value); absent = unknown
    rrule?: string;  // RFC 5545 RRULE for recurring events
    lat?: number;    // Latitude (resolved via geocoder or source-level geo)
    lng?: number;    // Longitude (resolved via geocoder or source-level geo)
    // OSM feature identity + provenance, attached alongside lat/lng by the
    // single coordinate-resolution pass (attachEventCoords) so the events-index
    // builder can read them without re-resolving.
    osmType?: 'node' | 'way' | 'relation';
    osmId?: number;
    geocodeSource?: 'ripper' | 'cached' | 'none';
    sourceCalendar?: string;      // Source calendar friendly name (set during aggregation)
    sourceCalendarName?: string;  // Source calendar slug (set during aggregation)
};

export type RipperEvent = RipperCalendarEvent | RipperError;


export interface RipperCalendar {
    name: string;
    friendlyname: string;
    events: RipperCalendarEvent[];
    errors: RipperError[];
    tags: string[];
    parent?: RipperConfig
};


export interface Ripper {
    config: RipperConfig;
    ripperImpl: IRipper;
};

export interface IRipper {
    rip(ripper: Ripper): Promise<RipperCalendar[]>
}


function safeUrl(raw: string): string | undefined {
    // Defense in depth: the build's URL-entity gate (lib/calendar_ripper.ts)
    // already fails on entities in URL fields, but if one ever reaches here we
    // omit it rather than emit a broken `&amp;` link into the ICS.
    if (containsHtmlEntity(raw)) return undefined;
    try {
        return new URL(raw).toString();
    } catch {
        return undefined;
    }
}

// Guess a MIME type from a URL's file extension for the ATTACH FMTTYPE param.
// Defaults to image/jpeg when the extension is missing or unrecognized.
function imageMimeFromUrl(url: string): string {
    const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'avif': return 'image/avif';
        case 'svg': return 'image/svg+xml';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        default: return 'image/jpeg';
    }
}

// Fold a single content line to RFC 5545's 75-octet limit. Continuation
// lines are prefixed with a single space after CRLF. Operates on UTF-8
// byte length so multibyte characters don't overflow the octet budget.
function foldIcsLine(line: string): string {
    const encoder = new TextEncoder();
    if (encoder.encode(line).length <= 75) return line;
    let out = '';
    let current = '';
    let currentBytes = 0;
    let first = true;
    for (const ch of line) {
        const chBytes = encoder.encode(ch).length;
        // First line budget is 75 octets; continuation lines reserve one
        // octet for the leading space, so 74 octets of content.
        const budget = first ? 75 : 74;
        if (currentBytes + chBytes > budget) {
            out += (first ? '' : ' ') + current + '\r\n';
            first = false;
            current = '';
            currentBytes = 0;
        }
        current += ch;
        currentBytes += chBytes;
    }
    out += (first ? '' : ' ') + current;
    return out;
}

export const toICS = async (calendar: RipperCalendar): Promise<string> => {

    const mapped: icsOriginal.EventAttributes[] = calendar.events.map(e => {
        const utcDate = e.date.withZoneSameInstant(ZoneOffset.UTC);
        const m: icsOriginal.EventAttributes = {
            title: e.summary,
            startInputType: "utc",
            start: [utcDate.year(), utcDate.monthValue(), utcDate.dayOfMonth(), utcDate.hour(), utcDate.minute()],
            duration: { hours: e.duration.toHours(), minutes: e.duration.toMinutes() % 60 },
            description: (() => {
                let desc = e.url?.startsWith('http')
                    ? (e.description ? `${e.description}\n\n${e.url}` : e.url)
                    : e.description;
                if (e.sourceCalendar) {
                    const sourceInfo = `From ${e.sourceCalendar}`;
                    desc = desc ? `${desc}\n\n${sourceInfo}` : sourceInfo;
                }
                return desc;
            })(),
            location: e.location,
            // RFC-5545 GEO property (emitted as `GEO:lat;lng`) so calendar
            // apps can drop a pin. Coords are attached to the event upstream
            // by attachEventCoords in calendar_ripper.ts before this runs.
            geo: (typeof e.lat === "number" && typeof e.lng === "number")
                ? { lat: e.lat, lon: e.lng }
                : undefined,
            productId: CITY.ics.prodId,
            transp: "TRANSPARENT",
            calName: calendar.friendlyname,
            url: e.url?.startsWith('http') ? safeUrl(e.url) : undefined,
            categories: e.sourceCalendar ? [e.sourceCalendar] : undefined,
        };
        
        // Add RRULE if present
        if (e.rrule) {
            m.recurrenceRule = e.rrule;
        }
        
        return m;
    });

    let ics = await createICSEvents(mapped) as string;

    // Post-process to add TZID for events with RRULE
    // The ics library outputs UTC times, but RRULE needs local time with TZID.
    // When a calendar has multiple RRULE events (e.g. a recurring event with
    // several schedule entries), this runs once per event. Each non-global
    // replace converts the first remaining unconverted `DTSTART:...Z`; because
    // the ics library emits VEVENTs in the same order as `calendar.events`,
    // iteration N converts VEVENT N. Keep this forEach in `calendar.events`
    // order so the TZID/local-time stays aligned with its VEVENT.
    calendar.events.forEach(e => {
        if (e.rrule) {
            const tzid = e.date.zone().id();
            const localTime = `${e.date.year()}${String(e.date.monthValue()).padStart(2, '0')}${String(e.date.dayOfMonth()).padStart(2, '0')}T${String(e.date.hour()).padStart(2, '0')}${String(e.date.minute()).padStart(2, '0')}00`;
            // Replace UTC DTSTART with local time + TZID
            ics = ics.replace(
                /DTSTART:\d{8}T\d{6}Z/,
                `DTSTART;TZID=${tzid}:${localTime}`
            );
        }
    });

    // Post-process to add X-CALRIPPER-SOURCE for events with source tracking.
    // Match by CATEGORIES line (which we set to sourceCalendar) rather than
    // array index, so the mapping stays correct even if the ICS library
    // filters or reorders events.
    if (calendar.events.some(e => e.sourceCalendarName)) {
        const nameToSlug = new Map<string, string>();
        for (const e of calendar.events) {
            if (e.sourceCalendar && e.sourceCalendarName) {
                nameToSlug.set(e.sourceCalendar, e.sourceCalendarName);
            }
        }

        ics = ics.replace(
            /CATEGORIES:(.+)/g,
            (match, category) => {
                const slug = nameToSlug.get(category.trim());
                return slug
                    ? `X-CALRIPPER-SOURCE:${slug}\r\n${match}`
                    : match;
            }
        );
    }

    // Post-process to add image properties for events with an imageUrl. The
    // `ics` library has no native event ATTACH/IMAGE support (only on alarms),
    // so we inject them as raw lines. We emit both IMAGE;VALUE=URI (RFC 7986,
    // for modern clients) and ATTACH;FMTTYPE (broader client support). URLs
    // only — never base64/inline data.
    //
    // Anchoring: like the TZID pass above, this relies on the ics library
    // emitting one VEVENT per `calendar.events` entry in the same order (every
    // event validates, since createICSEvents would otherwise reject). We walk
    // BEGIN:VEVENT boundaries and inject right after each block's opener for
    // the matching event when it carries an imageUrl.
    if (calendar.events.some(e => e.imageUrl)) {
        const lines = ics.split('\r\n');
        const out: string[] = [];
        let eventIdx = -1;
        for (const line of lines) {
            out.push(line);
            if (line === 'BEGIN:VEVENT') {
                eventIdx++;
                // Defensive: if the ics library ever emits more VEVENTs than we
                // have events (the order/count coupling documented above breaks),
                // warn rather than silently misalign images. Skip injection.
                if (eventIdx >= calendar.events.length) {
                    console.warn(
                        `[toICS] ${calendar.name}: VEVENT count exceeds calendar.events ` +
                        `(${eventIdx + 1} > ${calendar.events.length}) — skipping image injection to avoid misalignment`,
                    );
                    continue;
                }
                const raw = calendar.events[eventIdx]?.imageUrl;
                const url = raw ? safeUrl(raw) : undefined;
                if (url) {
                    const mime = imageMimeFromUrl(url);
                    out.push(foldIcsLine(`IMAGE;VALUE=URI;DISPLAY=BADGE;FMTTYPE=${mime}:${url}`));
                    out.push(foldIcsLine(`ATTACH;FMTTYPE=${mime}:${url}`));
                }
            }
        }
        ics = out.join('\r\n');
    }

    return ics;
}

export function isRipperEvent(item: unknown): item is RipperEvent {
    if (typeof item !== "object" || item === null) {
        return false;
    }

    const maybeError = item as Partial<ErrorBase>;
    if (typeof maybeError.type === "string" && typeof maybeError.reason === "string") {
        return true; // probably an error
    }
    const maybeEvent = item as Partial<RipperCalendarEvent>;
    return maybeEvent.ripped instanceof Date &&
        maybeEvent.date instanceof ZonedDateTime &&
        maybeEvent.duration instanceof Duration &&
        typeof maybeEvent.summary === "string" &&
        (maybeEvent.id === undefined || typeof maybeEvent.id === "string") &&
        (maybeEvent.description === undefined || typeof maybeEvent.description === "string") &&
        (maybeEvent.location === undefined || typeof maybeEvent.location === "string") &&
        (maybeEvent.url === undefined || typeof maybeEvent.url === "string");
}

export type ExternalCalendar = z.infer<typeof externalCalendarSchema>;
export type ExternalConfig = z.infer<typeof externalConfigSchema>;

// JSON-safe view of a RipperCalendarEvent. ZonedDateTime/Duration aren't
// natively serializable, so we project them into stable string/number forms
// for build-errors.json and per-calendar errors.txt files.
export interface SerializedRipperCalendarEvent {
    id?: string;
    rippedAt: string;            // ISO timestamp
    date: string;                // ISO offset date-time, e.g. 2026-02-14T12:00:00-08:00[America/Los_Angeles]
    durationSeconds: number;
    summary: string;
    description?: string;
    location?: string;
    url?: string;
    imageUrl?: string;
    rrule?: string;
    lat?: number;
    lng?: number;
    sourceCalendar?: string;
    sourceCalendarName?: string;
}

export function serializeRipperCalendarEvent(e: RipperCalendarEvent): SerializedRipperCalendarEvent {
    return {
        id: e.id,
        rippedAt: e.ripped.toISOString(),
        date: e.date.toString(),
        durationSeconds: e.duration.seconds(),
        summary: e.summary,
        description: e.description,
        location: e.location,
        url: e.url,
        imageUrl: e.imageUrl,
        rrule: e.rrule,
        lat: e.lat,
        lng: e.lng,
        sourceCalendar: e.sourceCalendar,
        sourceCalendarName: e.sourceCalendarName,
    };
}

// Produces a structuredClone-safe view of a RipperError for JSON output.
// Most error types are already plain objects; UncertaintyError contains
// a RipperCalendarEvent that needs its js-joda fields projected.
export function serializeRipperError(e: RipperError): Record<string, unknown> {
    if (e.type === "Uncertainty") {
        return {
            type: e.type,
            reason: e.reason,
            source: e.source,
            calendar: e.calendar,
            unknownFields: e.unknownFields,
            event: serializeRipperCalendarEvent(e.event),
            partialFingerprint: e.partialFingerprint,
        };
    }
    return { ...e };
}

export function serializeRipperErrors(errors: RipperError[]): Record<string, unknown>[] {
    return errors.map(serializeRipperError);
}