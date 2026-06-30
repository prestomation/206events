import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const AJAX_URL = 'https://seattlemakers.org/wp-admin/admin-ajax.php';
const LOCATION = '3012 16th Ave W, Seattle, WA 98119';
const MONTHS_AHEAD = 3;

const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Parse "July 1, 2026 6:00 pm" → LocalDateTime, or null on failure
export function parseEventDate(dateStr: string): LocalDateTime | null {
    const cleaned = dateStr.replace(/\*\d+\*$/, '').trim();
    const m = cleaned.match(/^(\w+)\s+(\d+),\s+(\d{4})\s+(\d+):(\d{2})\s+(am|pm)$/i);
    if (!m) return null;
    const [, monthName, dayStr, yearStr, hrStr, minStr, ampm] = m;
    const month = MONTH_NAMES[monthName.toLowerCase()];
    if (!month) return null;
    let hour = parseInt(hrStr, 10);
    const minute = parseInt(minStr, 10);
    if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
    if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
    try {
        return LocalDateTime.of(parseInt(yearStr, 10), month, parseInt(dayStr, 10), hour, minute);
    } catch {
        return null;
    }
}

// Parse the HTML stored in the anchor's title attribute.
// Returns the event name (decoded, availability count stripped) and raw date strings,
// or an error if required fields are missing.
export function parseTitleHtml(titleHtml: string, postId: string, url: string): {
    id: string;
    summary: string;
    url: string;
    startStr: string;
    endStr: string | null;
} | { error: RipperError } {
    const nameMatch = titleHtml.match(/<div class=pe-hover-title>(.*?)<\/div>/);
    const dateMatches = [...titleHtml.matchAll(/<div class=pe-hover-date>(.*?)<\/div>/g)];

    if (!nameMatch || dateMatches.length === 0) {
        return {
            error: {
                type: "ParseError",
                reason: "Missing title or date in title HTML",
                context: titleHtml.slice(0, 100),
            },
        };
    }

    const rawName = decode(nameMatch[1]);
    const summary = rawName.replace(/\s*\(\d+ avail\)$/, '').trim();
    const startStr = dateMatches[0][1];
    const endRaw = dateMatches[1]?.[1] ?? null;
    const endStr = endRaw ? endRaw.replace(/\*\d+\*$/, '').trim() : null;

    return { id: `seattle-makers-${postId}`, summary, url, startStr, endStr };
}

// Extract events from one month's AJAX HTML response.
// Deduplicates by post ID (same event may appear on multiple calendar days).
export function parseMonthHtml(html: string): Array<{ postId: string; url: string; titleHtml: string }> {
    const results: Array<{ postId: string; url: string; titleHtml: string }> = [];
    const seen = new Set<string>();

    // Title attributes in EventPrime AJAX HTML don't use quotes inside the attribute value,
    // so the outer double-quote boundary is reliable.
    const anchorPattern = /<li class="wpost"><a title="(.*?)" href="(.*?)" rel="(\d+)"/g;
    let m: RegExpExecArray | null;
    while ((m = anchorPattern.exec(html)) !== null) {
        const [, titleHtml, url, postId] = m;
        if (seen.has(postId)) continue;
        seen.add(postId);
        results.push({ postId, url, titleHtml });
    }

    return results;
}

export default class SeattleMakersRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of('America/Los_Angeles');
        const now = ZonedDateTime.now(timezone);
        const today = now.toLocalDate();

        const seenPostIds = new Set<string>();
        const allErrors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (let i = 0; i < MONTHS_AHEAD; i++) {
            const d = today.plusMonths(i).withDayOfMonth(1);
            const monthStr = `${d.year()}-${String(d.monthValue()).padStart(2, '0')}-01`;

            let html: string;
            try {
                const body = new URLSearchParams({
                    ajax: '1',
                    show: 'page',
                    view: 'public',
                    'post_type[]': 'pp_event',
                    pe_show: 'list',
                    pe_date: monthStr,
                    pe_type: 'month',
                    action: 'paupress_events_wrap',
                });
                const res = await fetchFn(AJAX_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)',
                        'Referer': 'https://seattlemakers.org/events/',
                    },
                    body: body.toString(),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                html = await res.text();
            } catch (e) {
                allErrors.push({
                    type: "ParseError",
                    reason: `Failed to fetch ${monthStr}: ${e instanceof Error ? e.message : String(e)}`,
                    context: 'seattle-makers',
                });
                continue;
            }

            for (const { postId, url, titleHtml } of parseMonthHtml(html)) {
                if (seenPostIds.has(postId)) continue;
                seenPostIds.add(postId);

                const parsed = parseTitleHtml(titleHtml, postId, url);
                if ('error' in parsed) {
                    allErrors.push(parsed.error);
                    continue;
                }

                const { id, summary, url: eventUrl, startStr, endStr } = parsed;

                // Skip closure notices
                if (summary.toLowerCase() === 'closed') continue;

                const startLdt = parseEventDate(startStr);
                if (!startLdt) {
                    allErrors.push({
                        type: "ParseError",
                        reason: `Could not parse start date: ${startStr}`,
                        context: summary,
                    });
                    continue;
                }

                const startZdt = startLdt.atZone(timezone);
                if (startZdt.isBefore(now)) continue;

                // Use actual duration for single-session events; for multi-session series
                // (endStr spans days/weeks), cap at 2h and note it in the description so
                // subscribers know to check the source for individual session times.
                let duration = Duration.ofHours(2);
                let description: string | undefined;
                if (endStr) {
                    const endLdt = parseEventDate(endStr);
                    if (endLdt) {
                        const endZdt = endLdt.atZone(timezone);
                        const diffMinutes = Duration.between(startZdt, endZdt).toMinutes();
                        if (diffMinutes > 0 && diffMinutes <= 8 * 60) {
                            duration = Duration.ofMinutes(diffMinutes);
                        } else if (diffMinutes > 8 * 60) {
                            description = `Multi-session series — see ${eventUrl} for individual session times.`;
                        }
                    }
                }

                events.push({
                    id,
                    ripped: new Date(),
                    date: startZdt,
                    duration,
                    summary,
                    url: eventUrl,
                    location: LOCATION,
                    ...(description ? { description } : {}),
                });
            }
        }

        const calConfig = ripper.config.calendars[0];
        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors: allErrors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
