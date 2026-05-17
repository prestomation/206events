import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, ParseError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const DEFAULT_LOCATION = "5000 Rainier Ave S, Seattle, WA 98118";
const DEFAULT_DURATION_MINUTES = 120;

export interface EventLink {
    url: string;
    title: string;
    startDate: string;
}

function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

export function parseRSSFeed(xml: string): EventLink[] {
    const links: EventLink[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
        const item = match[1];
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
        const startDateMatch = item.match(/<event_listing:start_date><!\[CDATA\[(.*?)\]\]><\/event_listing:start_date>/);
        if (titleMatch && linkMatch && startDateMatch) {
            links.push({
                title: decodeHtmlEntities(titleMatch[1].trim()),
                url: linkMatch[1].trim(),
                startDate: startDateMatch[1].trim(),
            });
        }
    }
    return links;
}

export default class RoyalRoomRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const zone = ZoneId.of(ripper.config.calendars[0].timezone.toString());
        const now = ZonedDateTime.now(zone);

        const rssRes = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!rssRes.ok) {
            throw Error(`RSS feed returned ${rssRes.status} ${rssRes.statusText}`);
        }
        const rssXml = await rssRes.text();
        const eventLinks = parseRSSFeed(rssXml);

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (const link of eventLinks) {
            if (!link.startDate) {
                errors.push({ type: 'ParseError', reason: 'No start_date in RSS item', context: link.title });
                continue;
            }

            const m = link.startDate.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
            if (!m) {
                errors.push({ type: 'ParseError', reason: `Unparseable start_date: ${link.startDate}`, context: link.title });
                continue;
            }

            const eventDate = ZonedDateTime.of(
                LocalDateTime.of(
                    parseInt(m[1]), parseInt(m[2]), parseInt(m[3]),
                    parseInt(m[4]), parseInt(m[5]), parseInt(m[6])
                ),
                zone
            );

            if (eventDate.isBefore(now)) continue; // Past event — intentional skip

            const slug = link.url.split('/').filter(Boolean).pop() ?? link.url;
            events.push({
                id: `royal-room-${slug}`,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofMinutes(DEFAULT_DURATION_MINUTES),
                summary: link.title,
                location: DEFAULT_LOCATION,
                url: link.url,
            });
        }

        return ripper.config.calendars.map(cal => ({
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            parent: ripper.config,
            tags: cal.tags || [],
        }));
    }
}
