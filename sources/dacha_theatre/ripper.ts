import { Duration, LocalDate, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export interface DachaPerformance {
    dateStr: string;  // e.g. "Fri, Jun 5, 7:30pm - 10pm PDT" (year stripped if present)
    dateId: string;   // alphanumeric ID from dateId URL parameter
    year?: number;    // explicitly parsed year, when present in the source HTML
}

export interface DachaEventPage {
    title: string;
    location: string | undefined;
    url: string;
    performances: DachaPerformance[];
}

const MONTH_MAP: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// Parse "7:30pm" or "2pm" into { hour, minute } in 24-hour.
function parseTime(timeStr: string): { hour: number; minute: number } | undefined {
    const m = timeStr.trim().match(/^(\d+)(?::(\d+))?(am|pm)$/i);
    if (!m) return undefined;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const period = m[3].toLowerCase();
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return { hour, minute };
}

// Extract unique Humanitix event page URLs from Dacha homepage HTML.
export function extractHumanitixLinks(html: string): string[] {
    const linkRegex = /https?:\/\/events\.humanitix\.com\/([a-z0-9-]+)/g;
    const seen = new Set<string>();
    const links: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
        const clean = `https://events.humanitix.com/${m[1]}`;
        if (!seen.has(clean)) {
            seen.add(clean);
            links.push(clean);
        }
    }
    return links;
}

// Extract event page data from a Humanitix per-production HTML page.
export function extractDachaEvents(html: string, url: string): { page?: DachaEventPage; parseError?: RipperError } {
    // Extract title from first <h1>
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = h1Match ? h1Match[1].trim() : undefined;

    if (!title) {
        return {
            parseError: {
                type: "ParseError",
                reason: "No <h1> title found on Humanitix event page",
                context: url,
            },
        };
    }

    // Extract venue name from first <h2>
    const h2Match = html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
    const venue = h2Match ? h2Match[1].trim() : undefined;

    // Extract street address
    const addrRegex = /(\d+\s+[\w\s]+(?:Ave|St|Blvd|Way|Dr|Rd|Pl)[^,<"]*,\s*Seattle[^<"]{0,60})/i;
    const addrMatch = html.match(addrRegex);
    const address = addrMatch ? addrMatch[1].trim() : undefined;

    const location = venue && address
        ? `${venue}, ${address}`
        : venue || undefined;

    // Extract performances from ticket links with dateId
    const perfRegex = /<a\b[^>]+href="[^"]+\/tickets\?dateId=([a-zA-Z0-9_-]+)"[^>]*>([^<]+)<\/a>/gi;
    const performances: DachaPerformance[] = [];
    let m: RegExpExecArray | null;
    while ((m = perfRegex.exec(html)) !== null) {
        const dateId = m[1];
        let dateStr = m[2].replace(/\(Opens in new tab\)/gi, '').trim();
        // Extract explicit year if present (e.g. "Fri, Jun 5, 2026, 7:30pm - 10pm PDT")
        const yearMatch = dateStr.match(/,\s*(20\d{2}),/);
        let year: number | undefined;
        if (yearMatch) {
            year = parseInt(yearMatch[1], 10);
            dateStr = dateStr.replace(/,\s*20\d{2}/, '').trim();
        }
        performances.push({ dateId, dateStr, ...(year !== undefined ? { year } : {}) });
    }

    // Return an empty page (not a ParseError) when no ticket links are found.
    // Humanitix is a React SPA: Browserbase's Fetch API executes JS for challenge
    // bypass but does not wait for async React data loading, so the rendered HTML
    // may not contain ticket links even though the show is active.
    return {
        page: { title, location, url, performances },
    };
}

// Parse "Fri, Jun 5, 7:30pm - 10pm PDT" into a ZonedDateTime (start) and Duration.
// Returns parseError if the string cannot be parsed.
// If explicitYear is provided it is used directly; otherwise the function tries
// the current year first and falls back to the next year if the date is already past.
function parseDateString(
    dateStr: string,
    now: ZonedDateTime,
    timezone: ZoneId,
    explicitYear?: number,
): { start: ZonedDateTime; duration: Duration } | { parseError: RipperError } {
    // Pattern: "Dow, Mon Day, StartTime - EndTime TZ"
    // e.g. "Fri, Jun 5, 7:30pm - 10pm PDT"
    const datePattern = /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d+),\s+([^\s]+)\s*-\s*([^\s]+)\s+[A-Z]+$/;
    const m = dateStr.trim().match(datePattern);
    if (!m) {
        return {
            parseError: {
                type: "ParseError",
                reason: `Cannot parse date string: "${dateStr}"`,
                context: "dacha-theatre",
            },
        };
    }

    const monthName = m[1];
    const day = parseInt(m[2], 10);
    const startTimeStr = m[3];
    const endTimeStr = m[4];

    const monthNum = MONTH_MAP[monthName];
    if (!monthNum) {
        return {
            parseError: {
                type: "ParseError",
                reason: `Unknown month "${monthName}" in date string: "${dateStr}"`,
                context: "dacha-theatre",
            },
        };
    }

    const startTimeParts = parseTime(startTimeStr);
    const endTimeParts = parseTime(endTimeStr);
    if (!startTimeParts || !endTimeParts) {
        return {
            parseError: {
                type: "ParseError",
                reason: `Cannot parse time in date string: "${dateStr}"`,
                context: "dacha-theatre",
            },
        };
    }

    // Determine year: use explicit year if provided; otherwise try current year
    // first and fall back to next year if the date is already in the past.
    let startZdt: ZonedDateTime = now;
    if (explicitYear !== undefined) {
        try {
            const localDate = LocalDate.of(explicitYear, monthNum, day);
            const localStart = localDate.atTime(LocalTime.of(startTimeParts.hour, startTimeParts.minute));
            startZdt = localStart.atZone(timezone);
        } catch {
            return {
                parseError: {
                    type: "ParseError",
                    reason: `Invalid date in "${dateStr}"`,
                    context: "dacha-theatre",
                },
            };
        }
    } else {
        const currentYear = now.year();
        let foundValidDate = false;
        for (const yearOffset of [0, 1]) {
            const year = currentYear + yearOffset;
            try {
                const localDate = LocalDate.of(year, monthNum, day);
                const localStart = localDate.atTime(LocalTime.of(startTimeParts.hour, startTimeParts.minute));
                startZdt = localStart.atZone(timezone);
                if (!startZdt.isBefore(now)) {
                    foundValidDate = true;
                    break;
                }
            } catch {
                return {
                    parseError: {
                        type: "ParseError",
                        reason: `Invalid date in "${dateStr}"`,
                        context: "dacha-theatre",
                    },
                };
            }
        }
        if (!foundValidDate) {
            return {
                parseError: {
                    type: "ParseError",
                    reason: `All candidate years are in the past for date string: "${dateStr}"`,
                    context: "dacha-theatre",
                },
            };
        }
    }

    // Compute end time
    let endMinutes = endTimeParts.hour * 60 + endTimeParts.minute;
    const startMinutes = startTimeParts.hour * 60 + startTimeParts.minute;
    if (endMinutes <= startMinutes) {
        // Midnight crossover
        endMinutes += 24 * 60;
    }
    const durationMinutes = endMinutes - startMinutes;
    const duration = Duration.ofMinutes(durationMinutes);

    return { start: startZdt, duration };
}

export function parseDachaEvents(
    page: DachaEventPage,
    now: ZonedDateTime,
    timezone: ZoneId,
): { events: RipperCalendarEvent[]; errors: RipperError[] } {
    const events: RipperCalendarEvent[] = [];
    const errors: RipperError[] = [];

    for (const perf of page.performances) {
        const result = parseDateString(perf.dateStr, now, timezone, perf.year);
        if ('parseError' in result) {
            errors.push(result.parseError);
            continue;
        }

        const { start, duration } = result;
        if (start.isBefore(now)) continue;

        events.push({
            id: `dacha-${perf.dateId}`,
            ripped: new Date(),
            date: start,
            duration,
            summary: page.title,
            location: page.location,
            url: page.url,
        });
    }

    return { events, errors };
}

export default class DachaTheatreRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const homeRes = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!homeRes.ok) throw new Error(`Dacha Theatre homepage returned HTTP ${homeRes.status}`);

        const homeHtml = await homeRes.text();
        const humanitixUrls = extractHumanitixLinks(homeHtml);

        const allEvents: RipperCalendarEvent[] = [];
        const allErrors: RipperError[] = [];

        if (humanitixUrls.length === 0) {
            allErrors.push({
                type: "ParseError",
                reason: "No Humanitix event links found on Dacha homepage",
                context: "dacha-theatre",
            });
        }

        for (const url of humanitixUrls) {
            const res = await fetchFn(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
            });
            if (!res.ok) {
                allErrors.push({
                    type: "ParseError",
                    reason: `Humanitix event page returned HTTP ${res.status}`,
                    context: url,
                });
                continue;
            }
            const html = await res.text();
            const { page, parseError } = extractDachaEvents(html, url);
            if (parseError) {
                allErrors.push(parseError);
                continue;
            }
            if (page) {
                const { events, errors } = parseDachaEvents(page, now, timezone);
                allEvents.push(...events);
                allErrors.push(...errors);
            }
        }

        const calConfig = ripper.config.calendars[0];
        if (!calConfig) throw new Error("Dacha Theatre ripper requires at least one calendar configuration");
        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: allEvents,
            errors: allErrors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
