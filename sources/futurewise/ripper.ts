import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of('America/Los_Angeles');

interface PieCalEvent {
    title: string;
    start: string;
    end: string;
    details?: string;
    permalink: string;
    postType?: string;
    postId?: number;
}

export default class FuturewiseRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        if (!calConfig) {
            throw new Error('Futurewise ripper requires at least one calendar configuration');
        }

        const res = await this.fetchFn(ripper.config.url.href, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) throw new Error(`Futurewise events page returned HTTP ${res.status}`);
        const html = await res.text();

        const events = this.parseEvents(html);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config
        }];
    }

    parseEvents(html: string): RipperEvent[] {
        const raw = this.extractEventSourcesJson(html);
        if (raw === null) {
            return [{ type: 'ParseError', reason: 'Could not find eventSources array in events page HTML', context: 'futurewise' }];
        }

        let parsed: PieCalEvent[];
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            return [{ type: 'ParseError', reason: `Failed to parse eventSources JSON: ${e}`, context: 'futurewise' }];
        }

        const now = new Date();
        const nowMs = now.getTime();
        const out: RipperEvent[] = [];
        for (const pe of parsed) {
            // Pre-parse filter: the events page reserves a placeholder Page-typed entry
            // ("Our Events") that has no real event data. Skip without erroring.
            if (pe.postType === 'Page') continue;

            const result = this.parseEvent(pe, now);

            // Post-parse filter: drop events whose end is already in the past so the ICS
            // stays focused on upcoming. Done in the caller, not parseEvent, so the parse
            // method itself never silently drops items.
            if ('date' in result) {
                const endMs = result.date.toInstant().toEpochMilli() + result.duration.toMillis();
                if (endMs < nowMs) continue;
            }
            out.push(result);
        }
        return out;
    }

    extractEventSourcesJson(html: string): string | null {
        // FullCalendar config: eventSources: [[ {...}, {...} ]]
        // We want the inner array (without the outer wrapping).
        const idx = html.indexOf('eventSources:');
        if (idx === -1) return null;
        const after = html.slice(idx);
        // Match `[[ ... ]]` balanced at the start of the array literal.
        const open = after.indexOf('[[');
        if (open === -1) return null;
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = open; i < after.length; i++) {
            const ch = after[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '[') depth++;
            else if (ch === ']') {
                depth--;
                if (depth === 0) {
                    // i is the position of the outer ']'. The inner array sits inside [[...]];
                    // strip one layer to return the JSON array string.
                    return after.slice(open + 1, i);
                }
            }
        }
        return null;
    }

    parseEvent(pe: PieCalEvent, now: Date): RipperEvent {
        const start = this.parseLocalDateTime(pe.start);
        const end = this.parseLocalDateTime(pe.end);
        if (!start) {
            return { type: 'ParseError', reason: `Could not parse start "${pe.start}"`, context: pe.title };
        }
        if (!end) {
            return { type: 'ParseError', reason: `Could not parse end "${pe.end}"`, context: pe.title };
        }

        const startZdt = ZonedDateTime.of(start, TIMEZONE);
        const endZdt = ZonedDateTime.of(end, TIMEZONE);

        let durationMs = endZdt.toInstant().toEpochMilli() - startZdt.toInstant().toEpochMilli();
        if (durationMs <= 0) {
            // Malformed end (some entries have end < start). Default to one hour so the event still surfaces.
            durationMs = 60 * 60 * 1000;
        }

        const summary = this.decodeHtmlEntities(pe.title);
        const description = pe.details ? this.decodeHtmlEntities(pe.details).trim() : undefined;

        return {
            id: pe.permalink,
            ripped: now,
            date: startZdt,
            duration: Duration.ofMillis(durationMs),
            summary,
            description,
            url: pe.permalink
        };
    }

    parseLocalDateTime(s: string): LocalDateTime | null {
        // Pie Calendar emits ISO-8601 local datetimes, e.g. "2026-05-30T09:30:00".
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
        if (!m) return null;
        const [, y, mo, d, h, mi, se] = m;
        try {
            return LocalDateTime.of(+y, +mo, +d, +h, +mi, +se);
        } catch {
            return null;
        }
    }

    decodeHtmlEntities(text: string): string {
        return text
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&mdash;/g, '—')
            .replace(/&ndash;/g, '–')
            .replace(/&nbsp;/g, ' ');
    }
}
