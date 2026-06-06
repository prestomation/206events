import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of('America/Los_Angeles');
const BASE_URL = 'https://danceforjoy.biz/dancingtildusk/';

const PARK_ADDRESSES: Record<string, string> = {
    'Westlake Park': 'Westlake Park, 401 Pine St, Seattle, WA 98101',
    'Hing Hay Park': 'Hing Hay Park, 423 Maynard Ave S, Seattle, WA 98104',
    'Freeway Park': 'Freeway Park, 700 Seneca St, Seattle, WA 98101',
    'South Park Plaza': 'South Park Plaza, 8th Ave S & S Sullivan St, Seattle, WA 98108',
    'Occidental Park': 'Occidental Park, Occidental Ave S & S Main St, Seattle, WA 98104',
    'Lake City Mini Park': 'Lake City Mini Park, NE 127th St, Seattle, WA 98125',
    'Ballard Commons': 'Ballard Commons Park, 5701 22nd Ave NW, Seattle, WA 98107',
    'South Lake Union Park': 'South Lake Union Park, 860 Terry Ave N, Seattle, WA 98109',
    'Volunteer Park': 'Volunteer Park, 1247 15th Ave E, Seattle, WA 98112',
    'Golden Gardens Bathhouse': 'Golden Gardens Park, 8498 Seaview Pl NW, Seattle, WA 98117',
};

const MONTH_MAP: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function decodeHtml(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/&ldquo;/g, '“')
        .replace(/&rdquo;/g, '”')
        .replace(/ /g, ' ');
}

// Parses "July 7", "Aug 4, Tues", "Aug 30", "Sunday, Aug 30" → {month, day}
export function parseMonthDay(text: string): { month: number; day: number } | null {
    const m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
    if (!m) return null;
    const key = m[1].toLowerCase();
    const month = MONTH_MAP[key];
    if (!month) return null;
    return { month, day: parseInt(m[2], 10) };
}

// Parses "6-9:30pm", "6-9pm", "6–9:30pm" → {startHour, startMinute, durationMinutes}
export function parseTimeRange(text: string): { startHour: number; startMinute: number; durationMinutes: number } | null {
    const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?(?:pm)/i);
    if (!m) return null;
    const startH = parseInt(m[1], 10);
    const startM = parseInt(m[2] ?? '0', 10);
    const endH = parseInt(m[3], 10);
    const endM = parseInt(m[4] ?? '0', 10);
    const startHour = startH < 12 ? startH + 12 : startH;
    const endHour = endH < 12 ? endH + 12 : endH;
    const durationMinutes = (endHour * 60 + endM) - (startHour * 60 + startM);
    if (durationMinutes <= 0) return null;
    return { startHour, startMinute: startM, durationMinutes };
}

export default class DancingTilDuskRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await this.fetchFn(BASE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) throw new Error(`Dancing Til Dusk returned HTTP ${res.status}`);
        const html = await res.text();
        const events = this.parsePageHtml(html);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing
    parsePageHtml(html: string): RipperEvent[] {
        const doc = parseHtml(html);
        const results: RipperEvent[] = [];

        let currentLocation = '';
        let currentTime = { startHour: 18, startMinute: 0, durationMinutes: 180 };

        for (const divId of ['#content1', '#content2']) {
            const div = doc.querySelector(divId);
            if (!div) continue;

            for (const child of div.childNodes) {
                const el = child as HTMLElement;
                const tag = el.tagName?.toLowerCase();
                if (!tag) continue;

                if (tag === 'h2') {
                    const parsed = this.parseLocationH2(el);
                    if (parsed) {
                        currentLocation = parsed.location;
                        currentTime = parsed.time;
                    }
                } else if (tag === 'p') {
                    // Only process p elements that have a .gold span (event paragraphs)
                    const goldSpan = el.querySelector('.gold');
                    if (!goldSpan || !currentLocation) continue;
                    const parsedDate = parseMonthDay(goldSpan.text.trim());
                    if (!parsedDate) continue;
                    results.push(this.buildEventFromParagraph(el, goldSpan, currentLocation, currentTime, parsedDate));
                } else if (tag === 'div') {
                    // benefit_box: date is inside the h2, not in a p .gold span
                    const cls = el.getAttribute('class') ?? '';
                    if (cls.includes('benefit_box')) {
                        results.push(this.parseBenefitBox(el));
                    }
                }
            }
        }

        return results;
    }

    // Parses "Location<br>Days, 6-9pm" h2 element
    private parseLocationH2(el: HTMLElement): { location: string; time: { startHour: number; startMinute: number; durationMinutes: number } } | null {
        const innerHTML = el.innerHTML ?? '';
        // Split on <br> tags to separate location from days/time
        const parts = innerHTML.split(/<br\s*\/?>/i);
        if (!parts[0]) return null;

        // Location is the first part, stripped of any HTML tags
        const location = decodeHtml(parts[0]).replace(/<[^>]+>/g, '').trim();
        if (!location) return null;

        // Time range is somewhere in the remaining parts
        const restText = parts.slice(1).join(' ');
        const time = parseTimeRange(restText) ?? { startHour: 18, startMinute: 0, durationMinutes: 180 };

        return { location, time };
    }

    // Parses the benefit_box special case where the date is inside the <h2>
    private parseBenefitBox(box: HTMLElement): RipperCalendarEvent | RipperError {
        const h2 = box.querySelector('h2');
        const p = box.querySelector('p');
        if (!h2 || !p) return { type: 'ParseError', reason: 'benefit_box missing h2 or p', context: box.outerHTML.substring(0, 200) };

        const goldSpan = h2.querySelector('.gold');
        if (!goldSpan) return { type: 'ParseError', reason: 'benefit_box h2 missing .gold date span', context: h2.text.substring(0, 100) };

        const parsedDate = parseMonthDay(goldSpan.text.trim());
        if (!parsedDate) return { type: 'ParseError', reason: `Could not parse date from: ${goldSpan.text.trim()}`, context: h2.text.substring(0, 100) };

        // Extract location and time from h2 (after the gold span)
        const h2Html = h2.innerHTML ?? '';
        const parts = h2Html.split(/<br\s*\/?>/i);
        // First part is the gold span (date), subsequent parts are location and time
        const textParts = parts.slice(1).map(s => decodeHtml(s.replace(/<[^>]+>/g, '')).trim()).filter(Boolean);
        const location = textParts.find(s => !s.match(/^\d/)) ?? 'Golden Gardens Bathhouse';
        const timeText = textParts.find(s => s.match(/\d.*pm/i)) ?? '';
        const time = parseTimeRange(timeText) ?? { startHour: 18, startMinute: 0, durationMinutes: 180 };

        const pText = decodeHtml(p.text).replace(/\s+/g, ' ').trim();
        const pipeParts = pText.split('|');
        // Band name is the first part (before em-dash separator if present, else the whole thing)
        const bandRaw = pipeParts[0].trim();
        const dashIdx = bandRaw.indexOf('—');
        const bandName = (dashIdx >= 0 ? bandRaw.substring(0, dashIdx) : bandRaw).trim();
        const style = pipeParts[1]?.trim().replace(/\s*—.*$/, '').trim() ?? '';

        if (!bandName) return { type: 'ParseError', reason: 'Could not extract band name from benefit_box p', context: pText.substring(0, 100) };

        return this.buildEvent(bandName, style, location, time, parsedDate.month, parsedDate.day);
    }

    private buildEventFromParagraph(
        el: HTMLElement,
        goldSpan: HTMLElement,
        location: string,
        time: { startHour: number; startMinute: number; durationMinutes: number },
        parsedDate: { month: number; day: number },
    ): RipperCalendarEvent | RipperError {
        const pText = decodeHtml(el.text).replace(/\s+/g, ' ').trim();
        const dateText = decodeHtml(goldSpan.text).trim();

        // Remove date text from the start, then strip leading dash
        let remainder = pText.slice(pText.indexOf(dateText) + dateText.length).replace(/^\s*[—–-]\s*/, '').trim();

        const parts = remainder.split('|');
        const bandName = parts[0].trim().replace(/\s+/g, ' ');
        if (!bandName) return { type: 'ParseError', reason: 'No band name in paragraph', context: pText.substring(0, 100) };

        // Strip parenthetical notes like "(This is a Ball Rouge; wear red!)" from style
        const style = (parts[1]?.trim() ?? '').replace(/\s*\(.*$/, '').trim();

        return this.buildEvent(bandName, style, location, time, parsedDate.month, parsedDate.day);
    }

    private buildEvent(
        bandName: string,
        style: string,
        locationName: string,
        time: { startHour: number; startMinute: number; durationMinutes: number },
        month: number,
        day: number,
    ): RipperCalendarEvent {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const year = month < currentMonth ? currentYear + 1 : currentYear;
        const locationStr = PARK_ADDRESSES[locationName.trim()] ?? `${locationName.trim()}, Seattle, WA`;
        const description = style ? `${bandName} – ${style}` : bandName;
        const id = `dancing-til-dusk-${slugify(bandName)}-${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, time.startHour, time.startMinute),
            TIMEZONE,
        );

        return {
            id,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(time.durationMinutes),
            summary: `Dancing Til Dusk: ${bandName}`,
            description,
            location: locationStr,
            url: BASE_URL,
        };
    }
}
