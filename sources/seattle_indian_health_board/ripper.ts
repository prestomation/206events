import { ZoneId, ZonedDateTime, Duration, LocalDate, LocalTime, LocalDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import '@js-joda/timezone';

const EVENTS_URL = "https://www.sihb.org/events/";

const MONTH_MAP: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4,
    May: 5, June: 6, July: 7, August: 8,
    September: 9, October: 10, November: 11, December: 12,
};

function parseTime(timeStr: string): LocalTime | null {
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const ampm = m[3].toLowerCase();
    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    return LocalTime.of(hour, minute);
}

function parseDate(dateStr: string): LocalDate | null {
    const m = dateStr.trim().match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!m) return null;
    const month = MONTH_MAP[m[1]];
    if (!month) return null;
    try {
        return LocalDate.of(parseInt(m[3], 10), month, parseInt(m[2], 10));
    } catch {
        return null;
    }
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildLocation(locationDiv: ReturnType<typeof parse>): string {
    // Structure: <div>Venue/Org Name</div><span>Street</span><br/><span>City</span>,<span>State</span><span>Zip</span>
    const parts: string[] = [];

    const venueDiv = locationDiv.querySelector('div');
    const venueName = venueDiv?.textContent?.trim();
    if (venueName) parts.push(venueName);

    const spans = locationDiv.querySelectorAll('span');
    const spanTexts = spans
        .map(s => s.textContent?.trim() ?? '')
        .filter(t => t.length > 0 && t !== '–');

    // spanTexts: [street?, city, state, zip?]
    if (spanTexts.length >= 1) parts.push(spanTexts[0]);
    if (spanTexts.length >= 2) {
        let cityState = spanTexts[1];
        if (spanTexts[2]) cityState += ', ' + spanTexts[2];
        if (spanTexts[3]) cityState += ' ' + spanTexts[3];
        parts.push(cityState);
    }

    return parts.join(', ');
}

export default class SIHBRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        let html: string;
        try {
            const res = await this.fetchFn(EVENTS_URL, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            html = await res.text();
        } catch (error) {
            return ripper.config.calendars.map(c => ({
                name: c.name,
                friendlyname: c.friendlyname,
                events: [],
                errors: [{ type: "ParseError" as const, reason: `Failed to fetch page: ${error}`, context: EVENTS_URL }],
                parent: ripper.config,
                tags: c.tags ?? [],
            }));
        }

        const events = this.parseEvents(html, now, timezone);

        return ripper.config.calendars.map(c => ({
            name: c.name,
            friendlyname: c.friendlyname,
            events: events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: c.tags ?? [],
        }));
    }

    public parseEvents(html: string, now: ZonedDateTime, timezone: ZoneId): RipperEvent[] {
        const root = parse(html);
        const events: RipperEvent[] = [];

        // Only parse the "Upcoming Events" grid section to avoid past events
        const gridAreas = root.querySelectorAll('div.grid-area');
        let upcomingGrid: ReturnType<typeof parse> | null = null;
        for (const grid of gridAreas) {
            const title = grid.querySelector('h2.grid-area-title');
            if (title?.textContent?.includes('Upcoming')) {
                upcomingGrid = grid as unknown as ReturnType<typeof parse>;
                break;
            }
        }

        if (!upcomingGrid) return events;

        const articles = (upcomingGrid as any).querySelectorAll('article[class*="sihb_event"]');

        for (const article of articles) {
            try {
                const titleEl = article.querySelector('h1.entry-title a, h2.entry-title a');
                const title = titleEl?.textContent?.trim();
                if (!title) continue;

                const url = titleEl?.getAttribute('href') ?? EVENTS_URL;

                const footer = article.querySelector('footer.entry-footer');
                if (!footer) continue;

                const footerDivs = footer.querySelectorAll(':scope > div');
                if (footerDivs.length < 2) continue;

                const dateSpan = footerDivs[0].querySelector('span');
                const dateStr = dateSpan?.textContent?.trim();
                if (!dateStr) continue;

                const localDate = parseDate(dateStr);
                if (!localDate) {
                    events.push({ type: "ParseError", reason: `Unparseable date: ${dateStr}`, context: title });
                    continue;
                }

                // Time spans (excluding separator spans)
                const timeSpans = footerDivs[1]
                    .querySelectorAll('span')
                    .filter((s: any) => !s.classList?.contains('sep'));
                const startTimeStr = timeSpans[0]?.textContent?.trim();
                const endTimeStr = timeSpans[1]?.textContent?.trim();

                const parsedStartTime = startTimeStr ? parseTime(startTimeStr) : null;
                if (startTimeStr && !parsedStartTime) {
                    events.push({ type: "ParseError", reason: `Unparseable time: ${startTimeStr}`, context: title });
                    continue;
                }
                const startTime: LocalTime = parsedStartTime ?? LocalTime.of(12, 0);

                const startDt = ZonedDateTime.of(LocalDateTime.of(localDate, startTime), timezone);

                if (startDt.isBefore(now)) continue;

                let duration = Duration.ofHours(2);
                if (endTimeStr) {
                    const endTime = parseTime(endTimeStr);
                    if (endTime && !endTime.equals(startTime)) {
                        let mins = endTime.toSecondOfDay() / 60 - startTime.toSecondOfDay() / 60;
                        if (mins <= 0) mins += 24 * 60;
                        duration = Duration.ofMinutes(mins);
                    }
                }

                const location = footerDivs.length >= 3
                    ? buildLocation(footerDivs[2]) || undefined
                    : undefined;

                const id = `sihb-${slugify(title)}-${localDate.toString()}`;

                // Per-event featured image (WordPress post thumbnail). Already an
                // absolute https URL on this source.
                const imgEl = article.querySelector('a.post-thumbnail img, img.wp-post-image');
                const imgSrc = imgEl?.getAttribute('src')?.trim();
                const imageUrl = imgSrc ? new URL(imgSrc, EVENTS_URL).href : undefined;

                events.push({
                    id,
                    ripped: new Date(),
                    date: startDt,
                    duration,
                    summary: title,
                    location,
                    url,
                    imageUrl,
                });
            } catch (err) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${err}`,
                    context: "article.sihb_event",
                });
            }
        }

        return events;
    }
}
