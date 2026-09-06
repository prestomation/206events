import { Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

const BASE_URL = "https://www.sct.org";
const CALENDAR_URL = `${BASE_URL}/tickets-shows/calendar`;
const VENUE_ADDRESS = "Seattle Children's Theatre, 201 Thomas St, Seattle, WA 98109";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const MONTHS_AHEAD = 6;
// Running time isn't published for workshops/donor events (only mainstage
// productions list one on their detail page) — fall back to a reasonable
// default rather than leaving duration unset.
const DEFAULT_DURATION_MINUTES = 90;
// Event types shown on the calendar grid; "sct-class" entries are paid
// registration classes (recurring sessions), not one-off public events.
const SKIPPED_EVENT_TYPES = new Set(["sct-class"]);

const MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
];
const MONTH_INDEX: Record<string, number> = Object.fromEntries(
    MONTH_NAMES.map((name, i) => [name, i + 1])
);

export interface ParsedCalendarEvent {
    title: string;
    href: string;
    year: number;
    month: number;
    day: number;
    timeText: string;
    eventType: string;
}

export interface ProductionDetail {
    imageUrl?: string;
    description?: string;
    location?: string;
    durationMinutes?: number;
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function resolveUrl(href: string): string {
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("/")) return `${BASE_URL}${href}`;
    return `${BASE_URL}/${href}`;
}

// Calendar grid pages pad the first/last week with days from the adjacent
// month (e.g. the October page's first row includes "Wednesday, September
// 30"). The day cell's own text names its real month, so resolve the year
// relative to the page's requested (year, month) rather than trusting the URL.
export function resolveGridYear(requestedYear: number, requestedMonth: number, cellMonth: number): number {
    if (cellMonth === requestedMonth) return requestedYear;
    const prevMonth = requestedMonth === 1 ? 12 : requestedMonth - 1;
    const nextMonth = requestedMonth === 12 ? 1 : requestedMonth + 1;
    if (cellMonth === prevMonth) return requestedMonth === 1 ? requestedYear - 1 : requestedYear;
    if (cellMonth === nextMonth) return requestedMonth === 12 ? requestedYear + 1 : requestedYear;
    return requestedYear;
}

export function parseCalendarPage(html: HTMLElement, requestedYear: number, requestedMonth: number): ParsedCalendarEvent[] {
    const results: ParsedCalendarEvent[] = [];

    for (const dayCell of html.querySelectorAll("li.list-item-day")) {
        const dateEl = dayCell.querySelector(".day-of-the-month-full");
        if (!dateEl) continue; // header labels / blank padding cells carry no date

        const dateMatch = dateEl.text.trim().match(/^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2})$/);
        if (!dateMatch) continue;
        const cellMonth = MONTH_INDEX[dateMatch[1].toLowerCase()];
        if (!cellMonth) continue;
        const day = parseInt(dateMatch[2], 10);
        const year = resolveGridYear(requestedYear, requestedMonth, cellMonth);

        for (const eventEl of dayCell.querySelectorAll("li.event")) {
            const typeEl = eventEl.querySelector(".event-type span");
            const eventType = typeEl?.getAttribute("class")?.trim() ?? "";
            if (SKIPPED_EVENT_TYPES.has(eventType)) continue;

            const linkEl = eventEl.querySelector(".event-name a");
            const title = linkEl?.text?.trim();
            const href = linkEl?.getAttribute("href")?.trim();
            const timeText = eventEl.querySelector(".event-time")?.text?.trim() ?? "";
            if (!title || !href) continue;

            results.push({ title, href, year, month: cellMonth, day, timeText, eventType });
        }
    }

    return results;
}

// Parses a single time like "6:00 PM" or "11:00 AM". Returns null if the
// text doesn't match — the calendar grid never shows time ranges.
export function parseTime(timeText: string): { hour: number; minute: number } | null {
    const match = timeText.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;
    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const period = match[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return { hour, minute };
}

export function parseProductionDetail(html: HTMLElement): ProductionDetail {
    const imageUrl = html.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim();
    const description = html.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim();

    // The "Location"/"Running Time" fields are plain <p><strong>Label</strong><br>Value</p>
    // blocks with no id/class to hook — match against the rendered text instead.
    const bodyText = html.text;
    const locationMatch = bodyText.match(/Location\s*\n?\s*([^\n]+?)(?:\s*Age Recommendation|\s*Running Time|$)/);
    const runningTimeMatch = bodyText.match(/Running Time\s*\n?\s*Approx\.\s*(\d+)\s*minutes?/i);

    return {
        imageUrl: imageUrl || undefined,
        description: description || undefined,
        location: locationMatch?.[1]?.trim() || undefined,
        durationMinutes: runningTimeMatch ? parseInt(runningTimeMatch[1], 10) : undefined,
    };
}

export default class SeattleChildrensTheatreRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn: FetchFn = getFetchForConfig(ripper.config);
        const now = ZonedDateTime.now(TIMEZONE);
        const today = LocalDate.now(TIMEZONE);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];
        const seenIds = new Set<string>();
        const productionCache = new Map<string, ProductionDetail | null>();

        for (let i = 0; i < MONTHS_AHEAD; i++) {
            const target = today.plusMonths(i).withDayOfMonth(1);
            const year = target.year();
            const month = target.monthValue();
            const monthName = MONTH_NAMES[month - 1];
            const pageUrl = `${CALENDAR_URL}/${year}/${monthName}/`;

            let parsedEvents: ParsedCalendarEvent[];
            try {
                const res = await fetchFn(pageUrl, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                parsedEvents = parseCalendarPage(parse(await res.text()), year, month);
            } catch (e) {
                errors.push({
                    type: "ParseError",
                    reason: `Failed to fetch or parse calendar page for ${year}-${monthName}: ${e instanceof Error ? e.message : String(e)}`,
                    context: pageUrl,
                });
                continue;
            }

            for (const parsedEvent of parsedEvents) {
                const time = parseTime(parsedEvent.timeText);
                if (!time) {
                    errors.push({
                        type: "ParseError",
                        reason: `Could not parse event time "${parsedEvent.timeText}"`,
                        context: parsedEvent.title,
                    });
                    continue;
                }

                let date: ZonedDateTime;
                try {
                    date = ZonedDateTime.of(
                        LocalDateTime.of(parsedEvent.year, parsedEvent.month, parsedEvent.day, time.hour, time.minute),
                        TIMEZONE
                    );
                } catch (e) {
                    errors.push({
                        type: "ParseError",
                        reason: `Invalid date for event "${parsedEvent.title}": ${e}`,
                        context: `${parsedEvent.year}-${parsedEvent.month}-${parsedEvent.day}`,
                    });
                    continue;
                }
                if (date.isBefore(now)) continue;

                const id = `sct-${slugify(parsedEvent.title)}-${date.toLocalDate().toString().replace(/-/g, "")}-${String(time.hour).padStart(2, "0")}${String(time.minute).padStart(2, "0")}`;
                if (seenIds.has(id)) continue; // month-grid padding can repeat the same day across two fetches
                seenIds.add(id);

                const productionUrl = resolveUrl(parsedEvent.href);
                if (!productionCache.has(productionUrl)) {
                    productionCache.set(productionUrl, await this.fetchProductionDetail(fetchFn, productionUrl));
                }
                const detail = productionCache.get(productionUrl) ?? null;

                events.push({
                    id,
                    ripped: new Date(),
                    date,
                    duration: Duration.ofMinutes(detail?.durationMinutes ?? DEFAULT_DURATION_MINUTES),
                    summary: parsedEvent.title,
                    description: detail?.description,
                    location: detail?.location ? `${detail.location}, ${VENUE_ADDRESS}` : VENUE_ADDRESS,
                    url: productionUrl,
                    imageUrl: detail?.imageUrl,
                });
            }
        }

        const calConfig = ripper.config.calendars[0];
        if (!calConfig) {
            throw new Error("No calendars configured for seattle-childrens-theatre");
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

    private async fetchProductionDetail(fetchFn: FetchFn, url: string): Promise<ProductionDetail | null> {
        try {
            const res = await fetchFn(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
            });
            if (!res.ok) return null;
            return parseProductionDetail(parse(await res.text()));
        } catch {
            return null;
        }
    }
}
