import { LocalDateTime, ZoneId, ZonedDateTime, Duration } from "@js-joda/core";
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

        const cal = ripper.config.calendars[0];
        const timezone = cal.timezone;
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const entry of jsonEntries) {
            if (!entry?.title || !entry?.id || !entry?.date) continue;
            const { id, title, date } = entry;

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

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            tags: cal.tags ?? [],
            parent: ripper.config,
        }];
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
                .replace(/&#8217;/g, '’')
                .replace(/&#8230;/g, '…')
                .replace(/&#8220;/g, '“')
                .replace(/&#8221;/g, '”')
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
        const ids = [...new Map(
            [...html.matchAll(/e-loop-item-(\d+)/g)].map(m => [m[1], true])
        ).keys()];
        const times = [...html.matchAll(/event_item_info_date_time'>([^<]+)</g)].map(m => m[1].trim());
        const urls = [...html.matchAll(/event_item_link' href='([^']+)'/g)].map(m => m[1]);

        ids.forEach((id, i) => {
            if (!cardData.has(id)) cardData.set(id, {});
            const entry = cardData.get(id)!;
            if (times[i] && !entry.time) entry.time = times[i];
            if (urls[i] && !entry.url) entry.url = urls[i];
        });
    }

    private parseTime(timeStr: string): { hour: number; minute: number } | null {
        const match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
        if (!match) return null;
        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        const period = match[3].toUpperCase();
        if (period === 'PM' && hour !== 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;
        return { hour, minute };
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
