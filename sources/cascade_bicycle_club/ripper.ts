import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

export function parseEventsFromHtml(html: string): Array<RipperCalendarEvent | RipperError> {
    const root = parse(html);
    const results: Array<RipperCalendarEvent | RipperError> = [];

    // Events are in the featured rides/events listing section
    const eventList = root.querySelector('.cards--list.events');
    if (!eventList) return results;

    const cards = eventList.querySelectorAll('.card-sm-event');
    for (const card of cards) {
        const times = card.querySelectorAll('time[datetime]');
        if (times.length < 1) continue;

        const startStr = times[0].getAttribute('datetime');
        if (!startStr) continue;

        let startDate: ZonedDateTime;
        try {
            startDate = ZonedDateTime.parse(startStr);
        } catch {
            results.push({
                type: 'ParseError',
                reason: `Unparseable datetime: ${startStr}`,
                context: card.querySelector('h3')?.text ?? '',
            });
            continue;
        }

        const titleEl = card.querySelector('h3');
        if (!titleEl) continue;
        const summary = decode(titleEl.text.trim());
        if (!summary) continue;

        // Default 3 hours — typical for Cascade group rides and short community events
        let duration = Duration.ofHours(3);
        if (times.length >= 2) {
            const endStr = times[1].getAttribute('datetime');
            if (endStr) {
                try {
                    const endDate = ZonedDateTime.parse(endStr);
                    const diffMillis = endDate.toInstant().toEpochMilli() - startDate.toInstant().toEpochMilli();
                    if (diffMillis > 0) {
                        duration = Duration.ofMillis(diffMillis);
                    } else {
                        results.push({
                            type: 'ParseError',
                            reason: `End time ${endStr} is not after start time ${startStr}`,
                            context: summary,
                        });
                        continue;
                    }
                } catch {
                    // use default duration when end time is unparseable
                }
            }
        }

        const linkEl = card.querySelector('a.card-overlay-link');
        const href = linkEl?.getAttribute('href') ?? '';
        const url = href ? `https://cascade.org${href}` : 'https://cascade.org/rides-events';

        // Stable ID from URL slug; sanitize summary fallback to safe chars only
        const slug = href.split('/').filter(Boolean).pop() ?? '';
        const fallbackSlug = summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const id = slug ? `cascade-${slug}` : `cascade-${fallbackSlug}`;

        results.push({
            id,
            ripped: new Date(),
            date: startDate,
            duration,
            summary,
            url,
        });
    }

    return results;
}

export default class CascadeBicycleClubRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`cascade.org returned ${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const parsed = parseEventsFromHtml(html);

        const now = ZonedDateTime.now();
        const events = parsed.filter((r): r is RipperCalendarEvent => 'date' in r && !r.date.isBefore(now));
        const errors = parsed.filter((r): r is RipperError => 'type' in r);

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
