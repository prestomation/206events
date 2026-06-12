import { Duration, LocalDate, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

export interface RSSItem {
    title: string;
    link: string;
}

export interface ParsedEventDate {
    startDate: LocalDate;
    endDate: LocalDate;
    location: string;
}

function decodeHtmlEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

export function parseRSSItems(xml: string): RSSItem[] {
    const items: RSSItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
        const item = match[1];
        const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
        if (titleMatch && linkMatch) {
            items.push({
                title: decodeHtmlEntities(titleMatch[1].trim()),
                link: linkMatch[1].trim(),
            });
        }
    }
    return items;
}

// Parses the event date/location from a Visit Seattle event page.
// Matches: <h4><span>M/D/YYYY through M/D/YYYY</span> | <span> Location</span></h4>
// or:      <h4><span>M/D/YYYY</span> | <span> Location</span></h4>
export function parseEventPage(html: string): ParsedEventDate | RipperError {
    const h4Match = html.match(/<h4><span>([\d/]+(?: through [\d/]+)?)<\/span>\s*\|\s*<span>\s*([^<]+)<\/span><\/h4>/);
    if (!h4Match) {
        return { type: 'ParseError', reason: 'No date/location h4 found on event page', context: html.slice(0, 200) };
    }

    const dateStr = h4Match[1].trim();
    const location = decodeHtmlEntities(h4Match[2].trim());

    const rangeMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) through (\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const singleMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (rangeMatch) {
        const [, sm, sd, sy, em, ed, ey] = rangeMatch;
        try {
            return {
                startDate: LocalDate.of(parseInt(sy), parseInt(sm), parseInt(sd)),
                endDate: LocalDate.of(parseInt(ey), parseInt(em), parseInt(ed)),
                location,
            };
        } catch {
            return { type: 'ParseError', reason: `Invalid date in range: ${dateStr}`, context: dateStr };
        }
    } else if (singleMatch) {
        const [, m, d, y] = singleMatch;
        try {
            const date = LocalDate.of(parseInt(y), parseInt(m), parseInt(d));
            return { startDate: date, endDate: date, location };
        } catch {
            return { type: 'ParseError', reason: `Invalid date: ${dateStr}`, context: dateStr };
        }
    } else {
        return { type: 'ParseError', reason: `Unrecognized date format: ${dateStr}`, context: dateStr };
    }
}

export default class VisitSeattleRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of('America/Los_Angeles');
        const now = ZonedDateTime.now(zone);
        const today = now.toLocalDate();

        const rssRes = await this.fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!rssRes.ok) {
            throw new Error(`RSS feed returned ${rssRes.status} ${rssRes.statusText}`);
        }
        const rssXml = await rssRes.text();
        const items = parseRSSItems(rssXml);

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (const item of items) {
            try {
                const pageRes = await this.fetchFn(item.link, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
                });
                if (!pageRes.ok) {
                    errors.push({ type: 'ParseError', reason: `Event page returned ${pageRes.status}`, context: item.link });
                    continue;
                }
                const html = await pageRes.text();
                const parsed = parseEventPage(html);

                if ('type' in parsed) {
                    errors.push(parsed);
                    continue;
                }

                if (parsed.endDate.isBefore(today)) continue;

                // Start at noon on the first day; duration spans through end of last day
                const startDateTime = ZonedDateTime.of(
                    LocalDateTime.of(
                        parsed.startDate.year(), parsed.startDate.monthValue(),
                        parsed.startDate.dayOfMonth(), 12, 0
                    ),
                    zone
                );
                const numDays = parsed.endDate.toEpochDay() - parsed.startDate.toEpochDay() + 1;
                const durationHours = numDays * 24 - 12;

                const slug = item.link.split('/').filter(Boolean).pop() ?? item.link;
                events.push({
                    id: `visit-seattle-${slug}`,
                    ripped: new Date(),
                    date: startDateTime,
                    duration: Duration.ofHours(durationHours),
                    summary: item.title,
                    location: parsed.location,
                    url: item.link,
                });
            } catch (e) {
                errors.push({ type: 'ParseError', reason: `Failed to fetch/parse ${item.link}: ${e}`, context: item.title });
            }
        }

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
