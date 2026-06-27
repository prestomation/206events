import { LocalDate, LocalDateTime, ZonedDateTime, Duration } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const CENTER_FOR_CHAMBER_MUSIC = "601 Union St, Seattle, WA 98101";
const NORDSTROM_RECITAL_HALL = "Nordstrom Recital Hall at Benaroya Hall, 200 University St, Seattle, WA 98101";
const VOLUNTEER_PARK = "Volunteer Park, 1247 15th Ave E, Seattle, WA 98112";

interface JsonEntry {
    id: string;
    title: string;
    date: string;
    category: string;
}

interface CardData {
    time?: string;
    url?: string;
}

interface TruckEvent {
    id: string;
    dateText: string;
    timeText: string;
    venue: string;
    url: string;
}

export default class SeattleChamberMusicRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const baseUrl = 'https://www.seattlechambermusic.org/events';

        const firstPageHtml = await fetchFn(baseUrl + '/').then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
            return r.text();
        });

        const jsonEntries = this.extractJson(firstPageHtml);

        const pageMatches = [...firstPageHtml.matchAll(/\/events\/page\/(\d+)\//g)];
        const totalPages = pageMatches.length > 0
            ? Math.max(...pageMatches.map(m => parseInt(m[1])))
            : 1;

        const cardData = new Map<string, CardData>();
        this.extractCards(firstPageHtml, cardData);

        for (let page = 2; page <= totalPages; page++) {
            const html = await fetchFn(`${baseUrl}/page/${page}/`).then(r => {
                if (!r.ok) return '';
                return r.text();
            });
            if (html) this.extractCards(html, cardData);
        }

        // Fetch the Concert Truck schedule page — it has accurate dates/times/venues for all
        // truck stops, and covers events not yet visible in the main /events/ JSON (e.g. same-day
        // events that scroll off the top of the upcoming list, or entries the CMS date-stamps
        // incorrectly).
        const truckHtml = await fetchFn('https://www.seattlechambermusic.org/concert-truck/').then(r => {
            if (!r.ok) return '';
            return r.text();
        });
        const truckEvents = this.extractTruckSchedule(truckHtml);

        const cal = ripper.config.calendars[0];
        const timezone = cal.timezone;
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        // When the truck schedule page has events, skip Concert Truck entries from the main
        // events JSON — the schedule page is authoritative and the main JSON can carry wrong dates.
        const skipTruckFromMain = truckEvents.length > 0;

        for (const entry of jsonEntries) {
            if (!entry?.title || !entry?.id || !entry?.date) continue;
            const { id, title, date } = entry;

            if (skipTruckFromMain && title.startsWith('The Concert Truck')) continue;
            if (title.toLowerCase().includes('online')) continue;

            const dateParts = date.split('/').map(Number);
            if (dateParts.length !== 3 || dateParts.some(isNaN)) {
                errors.push({ type: 'ParseError', reason: `Invalid date: ${date}`, context: title });
                continue;
            }
            const [month, day, year] = dateParts;

            const card = cardData.get(id);
            const parsed = card?.time ? this.parseTime(card.time) : null;
            const hour = parsed?.hour ?? 12;
            const minute = parsed?.minute ?? 0;

            let eventDate: ZonedDateTime;
            try {
                eventDate = ZonedDateTime.of(
                    LocalDateTime.of(year, month, day, hour, minute),
                    timezone
                );
            } catch (e) {
                errors.push({ type: 'ParseError', reason: `Invalid date values: ${date}`, context: title });
                continue;
            }

            const location = this.inferLocation(title);

            events.push({
                id: `scms-${id}`,
                ripped: new Date(),
                summary: title,
                date: eventDate,
                duration: Duration.ofHours(2),
                location: location ?? undefined,
                url: card?.url || ripper.config.friendlyLink,
            });
        }

        // Add Concert Truck events from the schedule page
        const now = LocalDate.now();
        for (const te of truckEvents) {
            const parsed = this.parseTruckEventDate(te.dateText, te.timeText, now);
            if (!parsed) {
                errors.push({ type: 'ParseError', reason: `Could not parse truck event: ${te.dateText} ${te.timeText}`, context: te.venue });
                continue;
            }

            let eventDate: ZonedDateTime;
            try {
                eventDate = ZonedDateTime.of(
                    LocalDateTime.of(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute),
                    timezone
                );
            } catch (e) {
                errors.push({ type: 'ParseError', reason: `Invalid truck event date: ${te.dateText}`, context: te.venue });
                continue;
            }

            events.push({
                id: te.id,
                ripped: new Date(),
                summary: `The Concert Truck – ${te.venue}`,
                date: eventDate,
                duration: Duration.ofHours(2),
                location: te.venue,
                url: te.url,
            });
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            tags: cal.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Parse the icon-list schedule on /concert-truck/. Each item is:
    //   <a href="https://...seattlechambermusic.org/events/the-concert-truck-...">
    //     <span class="elementor-icon-list-text">Day. Month Date | Time | Venue</span>
    //   </a>
    public extractTruckSchedule(html: string): TruckEvent[] {
        if (!html) return [];
        const results: TruckEvent[] = [];
        const pattern = /href="(https:\/\/www\.seattlechambermusic\.org\/events\/(the-concert-truck[^"]+))"[^>]*>.*?<span class="elementor-icon-list-text">([^<]+)<\/span>/gs;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(html)) !== null) {
            const url = m[1];
            const slug = m[2].replace(/\/$/, '');
            const text = m[3].trim();
            const parts = text.split('|').map((p: string) => p.trim());
            if (parts.length < 3) continue;

            // "Sat. June 27" → "June 27"
            const monthDayMatch = parts[0].match(/([A-Za-z]+)\s+(\d+)\s*$/);
            if (!monthDayMatch) continue;
            const dateText = `${monthDayMatch[1]} ${monthDayMatch[2]}`;

            const timeText = parts[1];

            // Venue: strip trailing asterisks and parenthetical event-type notes
            const venue = parts[2]
                .replace(/\*/g, '')
                .replace(/\s*\([^)]+\)\s*$/, '')
                .trim();

            results.push({ id: `scms-${slug}`, dateText, timeText, venue, url });
        }
        return results;
    }

    public parseTruckEventDate(
        dateText: string,
        timeText: string,
        now: LocalDate,
    ): { year: number; month: number; day: number; hour: number; minute: number } | null {
        const MONTHS: Record<string, number> = {
            january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
            july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
        };

        const m = dateText.match(/^([A-Za-z]+)\s+(\d+)$/);
        if (!m) return null;

        const month = MONTHS[m[1].toLowerCase()];
        if (!month) return null;
        const day = parseInt(m[2], 10);

        let year = now.year();
        try {
            const candidate = LocalDate.of(year, month, day);
            if (candidate.isBefore(now.minusMonths(6))) year++;
        } catch {
            return null;
        }

        const time = this.parseTime(timeText);
        if (!time) return null;

        return { year, month, day, hour: time.hour, minute: time.minute };
    }

    private extractJson(html: string): JsonEntry[] {
        const idx = html.indexOf('calendars":');
        if (idx === -1) return [];
        const start = html.lastIndexOf('{', idx);
        if (start === -1) return [];
        let count = 0;
        let end = start;
        for (let i = start; i < html.length; i++) {
            if (html[i] === '{') count++;
            else if (html[i] === '}') count--;
            if (count === 0) { end = i + 1; break; }
        }
        try {
            const decoded = html.slice(start, end)
                .replace(/&#8211;/g, '–')
                .replace(/&#8212;/g, '—')
                .replace(/&#8217;/g, "’")
                .replace(/&#8230;/g, '…')
                .replace(/&#8220;/g, '"')
                .replace(/&#8221;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
            const data = JSON.parse(decoded) as { calendars?: Array<{ entries?: JsonEntry[] }> };
            return data?.calendars?.[0]?.entries ?? [];
        } catch {
            return [];
        }
    }

    private extractCards(html: string, cardData: Map<string, CardData>) {
        // Find each event block by its loop-item ID and extract time/URL from within that block.
        // Block-based parsing avoids index-alignment issues when a card is missing a field.
        const blockRe = /e-loop-item-(\d+)/g;
        const positions: Array<{ id: string; pos: number }> = [];
        let m: RegExpExecArray | null;
        while ((m = blockRe.exec(html)) !== null) {
            const id = m[1];
            if (!positions.some(b => b.id === id)) {
                positions.push({ id, pos: m.index });
            }
        }

        for (let i = 0; i < positions.length; i++) {
            const { id, pos } = positions[i];
            const nextPos = positions[i + 1]?.pos ?? html.length;
            const block = html.slice(pos, nextPos);

            if (!cardData.has(id)) cardData.set(id, {});
            const entry = cardData.get(id)!;

            const timeMatch = block.match(/event_item_info_date_time'>([^<]+)</);
            if (timeMatch && !entry.time) entry.time = timeMatch[1].trim();

            const urlMatch = block.match(/event_item_link' href='([^']+)'/);
            if (urlMatch && !entry.url) entry.url = urlMatch[1];
        }
    }

    public parseTime(timeStr: string): { hour: number; minute: number } | null {
        // "H:MM AM/PM" or "HH:MM AM/PM" — from main events page cards
        let match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (match) {
            let hour = parseInt(match[1], 10);
            const minute = parseInt(match[2], 10);
            const period = match[3].toUpperCase();
            if (period === 'PM' && hour !== 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;
            return { hour, minute };
        }

        // "Ham/pm" or "H:MMam/pm" — from Concert Truck schedule page
        match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
        if (match) {
            let hour = parseInt(match[1], 10);
            const minute = match[2] ? parseInt(match[2], 10) : 0;
            const period = match[3].toLowerCase();
            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
            return { hour, minute };
        }

        return null;
    }

    private inferLocation(title: string): string | null {
        const truckMatch = title.match(/^The Concert Truck\s*–\s*(.+)$/);
        if (truckMatch) return truckMatch[1].trim();

        if (title.includes('In-Person') || title.includes('Open Rehearsal') ||
            title.includes('Lecture') || title.includes('Sight Reading')) {
            return CENTER_FOR_CHAMBER_MUSIC;
        }

        if (/Summer Festival Concert #\d+/.test(title)) return NORDSTROM_RECITAL_HALL;

        if (title.includes('Community Play-Along') || title.includes('Chamber Music in the Park')) {
            return VOLUNTEER_PARK;
        }

        const namedFestivalMatch = title.match(/^Summer Festival at (.+)$/);
        if (namedFestivalMatch) return namedFestivalMatch[1].trim();

        return CENTER_FOR_CHAMBER_MUSIC;
    }
}
