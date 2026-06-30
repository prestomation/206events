import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { parse } from "node-html-parser";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const EVENTS_URL = 'https://www.seafolklore.org/events/';
const DEFAULT_LOCATION = 'Phinney Center Concert Hall, 6532 Phinney Ave N, Seattle, WA 98103';

const MONTH_ABBREVS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Parse "Jul 29, 2026 (Wed), 7:30 pm - 10:00 pm" → start LocalDateTime + duration
export function parseDateTimeStr(dateStr: string): { start: LocalDateTime; duration: Duration } | null {
    const m = dateStr.match(
        /^(\w+)\s+(\d+),\s+(\d{4})\s+\([A-Za-z]+\),\s+(\d+):(\d{2})\s+(am|pm)\s*-\s*(\d+):(\d{2})\s+(am|pm)/i
    );
    if (!m) return null;

    const [, monthStr, dayStr, yearStr, startHrStr, startMinStr, startAmpm,
           endHrStr, endMinStr, endAmpm] = m;

    const month = MONTH_ABBREVS[monthStr.toLowerCase().slice(0, 3)];
    if (!month) return null;

    const toHour = (hr: string, ampm: string) => {
        let h = parseInt(hr, 10);
        const isAm = ampm.toLowerCase() === 'am';
        if (isAm && h === 12) h = 0;
        if (!isAm && h !== 12) h += 12;
        return h;
    };

    const year = parseInt(yearStr, 10);
    const day = parseInt(dayStr, 10);
    const startHour = toHour(startHrStr, startAmpm);
    const startMin = parseInt(startMinStr, 10);
    const endHour = toHour(endHrStr, endAmpm);
    const endMin = parseInt(endMinStr, 10);

    try {
        const start = LocalDateTime.of(year, month, day, startHour, startMin, 0);
        const endTotal = endHour * 60 + endMin;
        const startTotal = startHour * 60 + startMin;
        let diffMin = endTotal - startTotal;
        if (diffMin <= 0) diffMin += 24 * 60; // handles midnight crossover
        const duration = Duration.ofMinutes(diffMin);
        return { start, duration };
    } catch {
        return null;
    }
}

// Combine URL slug + date for a stable, collision-free event ID
function eventId(url: string, date: LocalDateTime): string {
    const slug = url.replace(/\/$/, '').split('/').pop() ?? url;
    return `seattle-folklore-society-${slug}-${date.toLocalDate().toString()}`;
}

export default class SeattleFolkloreSocietyRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of('America/Los_Angeles');
        const now = ZonedDateTime.now(timezone);
        const today = now.toLocalDate();

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        let html: string;
        try {
            const res = await fetchFn(EVENTS_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            html = await res.text();
        } catch (e) {
            errors.push({
                type: "ParseError",
                reason: `Failed to fetch ${EVENTS_URL}: ${e instanceof Error ? e.message : String(e)}`,
                context: 'seattle-folklore-society',
            });
            return this.buildCalendar(ripper, events, errors);
        }

        const root = parse(html);
        // Events Manager plugin renders a list widget with class "em-events-list".
        // The trailing numeric ID (#em-events-list-1) is a widget instance counter
        // that can change if the page is edited — match by class for resilience.
        const eventsList = root.querySelector('.em-events-list');
        if (!eventsList) {
            errors.push({
                type: "ParseError",
                reason: 'Could not find .em-events-list — page layout may have changed',
                context: 'seattle-folklore-society',
            });
            return this.buildCalendar(ripper, events, errors);
        }

        // Each event is a direct child div with inline padding-top style
        const eventBlocks = eventsList.querySelectorAll('div > div');
        for (const block of eventBlocks) {
            // Title and URL from the bold span's anchor
            const titleAnchor = block.querySelector('span[style*="font-weight: bold"] a, span[style*="font-weight:bold"] a');
            if (!titleAnchor) continue;

            const title = titleAnchor.text.trim();
            const url = titleAnchor.getAttribute('href')?.trim() ?? EVENTS_URL;

            // Date/time from the italic span
            const dateSpan = block.querySelector('span[style*="font-style: italic"], span[style*="font-style:italic"]');
            if (!dateSpan) {
                errors.push({ type: "ParseError", reason: `No date span found`, context: title });
                continue;
            }
            const dateStr = dateSpan.text.trim();
            const parsed = parseDateTimeStr(dateStr);
            if (!parsed) {
                errors.push({ type: "ParseError", reason: `Could not parse date: "${dateStr}"`, context: title });
                continue;
            }

            const { start, duration } = parsed;

            // Skip past events
            if (start.toLocalDate().isBefore(today)) continue;

            // Location: look for a <span> containing "Venue:"
            let location: string | undefined;
            for (const span of block.querySelectorAll('span')) {
                const text = span.text.trim();
                if (text.startsWith('Venue:')) {
                    location = text.replace(/^Venue:\s*/, '').trim();
                    break;
                }
            }

            const startZdt = start.atZone(timezone);
            const id = eventId(url, start);

            const event: RipperCalendarEvent = {
                id,
                ripped: new Date(),
                date: startZdt,
                duration,
                summary: title,
                url,
                location: location ?? DEFAULT_LOCATION,
            };
            events.push(event);

            // When no explicit Venue: span is present, the location may be wrong
            // (events are sometimes hosted at Fremont Abbey or other venues).
            // Signal the gap so the uncertainty resolver can confirm the address.
            if (!location) {
                const unknownFields: UncertaintyField[] = ['location'];
                errors.push({
                    type: 'Uncertainty',
                    source: 'seattle-folklore-society',
                    reason: `No "Venue:" span found — location defaulted to Phinney Center Concert Hall`,
                    unknownFields,
                    event,
                });
            }
        }

        return this.buildCalendar(ripper, events, errors);
    }

    private buildCalendar(ripper: Ripper, events: RipperCalendarEvent[], errors: RipperError[]): RipperCalendar[] {
        const calConfig = ripper.config.calendars[0];
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
