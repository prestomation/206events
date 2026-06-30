import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DEFAULT_DURATION = Duration.ofHours(2);

interface GsccInstance {
    date: string;
    time: string;
    url: string;
    vid: string;
    vname: string;
    vstreet: string;
    vcity: string;
    vstate: string;
    vzip: string;
    latitude: string;
    longitude: string;
}

interface GsccEvent {
    url: string;
    eid: string;
    name: string;
    subtitle: string | null;
    eurl: string;
    description: string | null;
    prices: string | null;
    type: string;
    status: string;
    nname: string;
    instances: Record<string, GsccInstance>;
}

type CalendarData = Record<string, Record<string, GsccEvent>>;

export function extractCalendarData(html: string): CalendarData | null {
    const marker = 'var calendarData = ';
    const idx = html.indexOf(marker);
    if (idx === -1) return null;

    const start = idx + marker.length;
    let depth = 0;
    let inStr = false;
    let escape = false;

    for (let i = start; i < html.length; i++) {
        const ch = html[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"' && !escape) { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(html.slice(start, i + 1)) as CalendarData;
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

function parseOrgName(nname: string): string {
    // nname is like "Rain City Voices Barbershop Chorus^rain-city-voices..."
    return nname.split('^')[0].trim();
}

function formatLocation(inst: GsccInstance): string {
    const parts = [inst.vname];
    if (inst.vstreet) parts.push(inst.vstreet);
    parts.push(`${inst.vcity}, ${inst.vstate} ${inst.vzip}`.trim());
    return parts.filter(Boolean).join(', ');
}

function parsePriceMin(prices: string | null): number | undefined {
    if (!prices) return undefined;
    if (prices === '.free') return 0;
    if (prices === '.freewill') return 0;
    // Look for "$N" or "$N.NN"
    const match = prices.match(/\$(\d+(?:\.\d+)?)/);
    if (match) return parseFloat(match[1]);
    return undefined;
}

export function parseEvents(html: string, now: ZonedDateTime): RipperEvent[] {
    const data = extractCalendarData(html);
    if (!data) {
        return [{ type: 'ParseError', reason: 'Could not find calendarData in page HTML', context: 'greater-seattle-choral-consortium' }];
    }

    const results: RipperEvent[] = [];
    const seen = new Set<string>();

    for (const weekEvents of Object.values(data)) {
        for (const evt of Object.values(weekEvents)) {
            if (evt.status !== 'Ok') continue;
            // Auditions are appointment-based tryouts for choir members, not public events
            if (evt.type === 'Audition') continue;

            for (const inst of Object.values(evt.instances)) {
                if (inst.vcity !== 'Seattle') continue;

                // Stable ID: eid + date + time (handles multi-showing events uniquely)
                const timeSlug = inst.time.replace(/:/g, '').slice(0, 4);
                const id = `gscc-${evt.eid}-${inst.date}-${timeSlug}`;
                if (seen.has(id)) continue;
                seen.add(id);

                const result = parseInstance(evt, inst, id, now);
                results.push(result);
            }
        }
    }

    return results;
}

function parseInstance(
    evt: GsccEvent,
    inst: GsccInstance,
    id: string,
    now: ZonedDateTime,
): RipperCalendarEvent | RipperError {
    let startZdt: ZonedDateTime;
    try {
        const [year, month, day] = inst.date.split('-').map(Number);
        const [hour, minute] = inst.time.split(':').map(Number);
        startZdt = ZonedDateTime.of(year, month, day, hour, minute, 0, 0, TIMEZONE);
    } catch {
        return { type: 'ParseError', reason: `Invalid date/time: ${inst.date} ${inst.time}`, context: evt.name };
    }

    if (startZdt.isBefore(now)) {
        return { type: 'ParseError', reason: 'Event is in the past', context: evt.name };
    }

    const location = formatLocation(inst);
    const org = parseOrgName(evt.nname);

    // Prefer eurl (organization's event page) over url (ticket link), skip "." placeholder
    const eventUrl = (evt.eurl && evt.eurl !== '.') ? evt.eurl
        : (inst.url && inst.url !== '.') ? inst.url
        : (evt.url && evt.url !== '.') ? evt.url
        : undefined;

    const titleParts = [evt.name];
    if (evt.subtitle) titleParts.push(evt.subtitle);
    const summary = titleParts.join(' — ');

    const descParts: string[] = [];
    if (org) descParts.push(`Presented by ${org}`);
    if (evt.description) descParts.push(evt.description);
    const description = descParts.join('\n\n') || undefined;

    const priceMin = parsePriceMin(evt.prices);

    return {
        id,
        ripped: new Date(),
        summary,
        date: startZdt,
        duration: DEFAULT_DURATION,
        location,
        description,
        url: eventUrl,
        cost: priceMin !== undefined ? { min: priceMin } : undefined,
    };
}

export default class GreaterSeattleChoralRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await this.fetchFn(ripper.config.url.href, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' }
        });
        if (!res.ok) throw new Error(`seattlesings.org returned HTTP ${res.status}`);
        const html = await res.text();

        const now = ZonedDateTime.now(TIMEZONE);
        const results = parseEvents(html, now);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: results.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config
        }];
    }
}
