import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import '@js-joda/timezone';
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { CITY } from "../../lib/config/city.js";

// The WSFTA Food Truck Finder (findfoodtrucks.wafoodtrucks.org) is a classic
// ASP page. It embeds every member truck as a JavaScript array literal:
//
//   const trucks = [{truckName:"...",scheduleHtml:"<div class='scheduleItem'>...</div>",...}, ...];
//
// Each truck's upcoming stops are in `scheduleHtml`, one `.scheduleItem` per
// stop: a Google Maps link with "lat,lng", the location name in <strong>, then
// "<br>address<br>Fri 10/2/2026 4:00:00 pm - Fri 10/2/2026 7:00:00 pm".
//
// The list covers the whole state, so stops outside the city's map bounds are
// dropped.

export interface WaTruck {
    truckName: string;
    description?: string;
    website?: string;
    instagram?: string;
    facebook?: string;
    photo?: string;
    scheduleHtml?: string;
}

export interface WaStop {
    locationName: string;
    address: string;
    start: LocalDateTime;
    end: LocalDateTime;
    lat?: number;
    lng?: number;
}

// Stops longer than this are placeholders like "Catering Events" with a
// four-month window, not a real public service slot.
const MAX_STOP_HOURS = 16;

/**
 * Convert the embedded JS object-literal array to JSON by quoting the bare
 * keys, then JSON.parse it. Never eval: the page is untrusted input.
 */
export function extractTrucks(html: string): WaTruck[] {
    const start = html.indexOf("const trucks = [");
    if (start < 0) throw new Error("trucks array not found in page");
    let i = html.indexOf("[", start);
    let out = "";
    let depth = 0;
    let inString = false;
    for (; i < html.length; i++) {
        const ch = html[i];
        if (inString) {
            out += ch;
            if (ch === "\\") { out += html[++i] ?? ""; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; out += ch; continue; }
        if (ch === "[" || ch === "{") depth++;
        if (ch === "]" || ch === "}") depth--;
        if (ch === "{" || ch === ",") {
            out += ch;
            const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(html.slice(i + 1, i + 80));
            if (m) {
                out += `"${m[1]}":`;
                i += m[0].length;
            }
            continue;
        }
        out += ch;
        if (depth === 0) break;
    }
    const parsed = JSON.parse(out);
    if (!Array.isArray(parsed)) throw new Error("trucks is not an array");
    return parsed as WaTruck[];
}

// "Fri 10/2/2026 4:00:00 pm"
export function parseStopTime(text: string): LocalDateTime | null {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)/i.exec(text);
    if (!m) return null;
    let hour = parseInt(m[4], 10) % 12;
    if (m[6].toLowerCase() === "pm") hour += 12;
    try {
        return LocalDateTime.of(parseInt(m[3], 10), parseInt(m[1], 10), parseInt(m[2], 10), hour, parseInt(m[5], 10));
    } catch {
        return null;
    }
}

export function parseSchedule(scheduleHtml: string): (WaStop | RipperError)[] {
    const root = parse(scheduleHtml);
    const results: (WaStop | RipperError)[] = [];
    for (const item of root.querySelectorAll(".scheduleItem")) {
        const locationName = decode(item.querySelector("strong")?.text ?? "").trim();
        // Lines separated by <br>: [link + name, address, time range]
        const lines = item.innerHTML.split(/<br\s*\/?>/i).map(l => decode(parse(l).text).trim());
        const timeLine = lines[lines.length - 1] ?? "";
        const address = lines.length >= 3 ? lines[1] : "";
        const [startText, endText] = timeLine.split(/\s+-\s+/);
        const start = startText ? parseStopTime(startText) : null;
        const end = endText ? parseStopTime(endText) : null;
        if (!start || !end) {
            results.push({ type: "ParseError", reason: `Unparseable stop time: "${timeLine}"`, context: locationName });
            continue;
        }
        const href = item.querySelector("a")?.getAttribute("href") ?? "";
        const coords = /query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(href);
        results.push({
            locationName,
            address,
            start,
            end,
            lat: coords ? parseFloat(coords[1]) : undefined,
            lng: coords ? parseFloat(coords[2]) : undefined,
        });
    }
    return results;
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function absoluteUrl(url: string | undefined, base: string): string | undefined {
    if (!url) return undefined;
    const u = url.startsWith("www.") ? `https://${url}` : url;
    try {
        const resolved = new URL(u, base);
        return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : undefined;
    } catch {
        return undefined;
    }
}

function inCityBounds(lat: number | undefined, lng: number | undefined): boolean {
    if (lat === undefined || lng === undefined) return false;
    const b = CITY.map.clampBounds;
    return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

export function buildEvents(
    trucks: WaTruck[],
    pageUrl: string,
    zone: ZoneId,
    now: ZonedDateTime,
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];
    const seen = new Set<string>();

    for (const truck of trucks) {
        if (!truck.scheduleHtml || !truck.scheduleHtml.includes("scheduleItem")) continue;
        const truckName = decode(truck.truckName ?? "").trim();
        if (!truckName) continue;

        for (const stop of parseSchedule(truck.scheduleHtml)) {
            if ("type" in stop) { errors.push(stop); continue; }
            if (!inCityBounds(stop.lat, stop.lng)) continue;

            const date = ZonedDateTime.of(stop.start, zone);
            const endDate = ZonedDateTime.of(stop.end, zone);
            const minutes = Duration.between(date, endDate).toMinutes();
            if (minutes <= 0 || minutes > MAX_STOP_HOURS * 60) continue;
            if (endDate.isBefore(now)) continue;

            const id = `wa-food-trucks-${slugify(truckName)}-${stop.start.toLocalDate()}-${String(stop.start.hour()).padStart(2, "0")}${String(stop.start.minute()).padStart(2, "0")}`;
            // The page sometimes lists the same stop twice.
            if (seen.has(id)) continue;
            seen.add(id);

            const location = [stop.locationName, stop.address].filter(Boolean).join(", ");
            const truckUrl = absoluteUrl(truck.website, pageUrl) ?? absoluteUrl(truck.instagram, pageUrl);
            const description = [decode(truck.description ?? "").trim(), truckUrl]
                .filter(Boolean).join("\n\n");

            const event: RipperCalendarEvent = {
                id,
                ripped: new Date(),
                date,
                duration: Duration.ofMinutes(minutes),
                summary: `${truckName} @ ${stop.locationName || "TBA"}`,
                description: description || undefined,
                location: location ? `${location}, WA` : undefined,
                url: truckUrl ?? pageUrl,
                imageUrl: absoluteUrl(truck.photo, pageUrl),
            };
            if (stop.lat !== undefined && stop.lng !== undefined) {
                event.lat = stop.lat;
                event.lng = stop.lng;
            }
            events.push(event);
        }
    }
    return { events, errors };
}

export default class WaFoodTrucksRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const pageUrl = ripper.config.url.toString();
        const res = await fetchFn(pageUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) throw new Error(`WA Food Truck Finder returned HTTP ${res.status}`);
        const html = await res.text();

        const calConfig = ripper.config.calendars[0];
        if (!calConfig) throw new Error("wa-food-trucks: no calendar in ripper.yaml");
        const zone = ZoneId.of(calConfig.timezone.toString());
        let events: RipperCalendarEvent[] = [];
        let errors: RipperError[] = [];
        try {
            ({ events, errors } = buildEvents(extractTrucks(html), pageUrl, zone, ZonedDateTime.now(zone)));
        } catch (e) {
            errors = [{ type: "ParseError", reason: `Could not read trucks list: ${e}`, context: pageUrl }];
        }

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
