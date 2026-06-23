import { Duration, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse as parseHtml } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const BASE_URL = "https://meanycenter.org";
const LOCATION = "Meany Hall, University of Washington, Seattle, WA 98195";

export interface SeasonEvent {
    slug: string;
    url: string;
    title: string;
    imageUrl?: string;
    description?: string;
}

export function parseSeasonPage(html: string): SeasonEvent[] {
    const root = parseHtml(html);
    const events: SeasonEvent[] = [];

    for (const row of root.querySelectorAll('div.listing.production')) {
        const link = row.querySelector('div.listing-title a');
        if (!link) continue;

        const href = link.getAttribute('href') ?? '';
        if (!href) continue;

        const slug = href.split('/').filter(Boolean).pop() ?? '';
        if (!slug) continue;

        const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        const title = decode(link.innerText.trim());

        const img = row.querySelector('img');
        const imageUrl = img?.getAttribute('src') ?? undefined;

        const descEl = row.querySelector('div.field--name-field-event-description p');
        const description = descEl ? decode(descEl.innerText.trim()).substring(0, 500) : undefined;

        events.push({ slug, url, title, imageUrl, description });
    }

    return events;
}

export function parseCalendarPage(
    html: string,
    seasonMap: Map<string, SeasonEvent>,
    now: ZonedDateTime,
    timezone: ZoneId,
): { events: RipperCalendarEvent[]; errors: ParseError[] } {
    const root = parseHtml(html);
    const events: RipperCalendarEvent[] = [];
    const errors: ParseError[] = [];

    for (const table of root.querySelectorAll('table.views-table')) {
        const dateSpan = table.querySelector('caption span[content]');
        const link = table.querySelector('td a');

        if (!dateSpan || !link) continue;

        const content = dateSpan.getAttribute('content');
        if (!content) continue;

        let startZdt: ZonedDateTime;
        try {
            startZdt = ZonedDateTime.parse(content).withZoneSameInstant(timezone);
        } catch {
            errors.push({
                type: 'ParseError',
                reason: `Invalid date: ${content}`,
                context: link.innerText.trim(),
            });
            continue;
        }

        if (startZdt.isBefore(now)) continue;

        const href = link.getAttribute('href') ?? '';
        const slug = href.split('/').filter(Boolean).pop() ?? '';
        const title = decode(link.innerText.trim());
        const dateStr = startZdt.toLocalDate().toString().replace(/-/g, '');
        const id = `meany-center-${slug}-${dateStr}`;
        const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

        const meta = seasonMap.get(slug);

        events.push({
            id,
            ripped: new Date(),
            date: startZdt,
            duration: Duration.ofHours(2),
            summary: meta?.title ?? title,
            description: meta?.description,
            location: LOCATION,
            url,
            imageUrl: meta?.imageUrl,
            cost: { paid: true },
        });
    }

    return { events, errors };
}

export default class MeanyCenterRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const timezone = ZoneId.of("America/Los_Angeles");
        const now = ZonedDateTime.now(timezone);

        const seasonRes = await fetchFn(`${BASE_URL}/tickets/season`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!seasonRes.ok) throw new Error(`Meany Center season page returned HTTP ${seasonRes.status}`);

        const seasonHtml = await seasonRes.text();
        const seasonEvents = parseSeasonPage(seasonHtml);
        const seasonMap = new Map(seasonEvents.map(e => [e.slug, e]));

        const months = new Set<string>();
        for (const event of seasonEvents) {
            const match = event.url.match(/tickets\/(\d{4}-\d{2})\/production\//);
            if (match) months.add(match[1]);
        }

        const events: RipperCalendarEvent[] = [];
        const errors: ParseError[] = [];

        for (const month of [...months].sort()) {
            const calRes = await fetchFn(`${BASE_URL}/tickets/events/calendar?date=${month}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!calRes.ok) {
                errors.push({
                    type: 'ParseError',
                    reason: `Calendar page returned HTTP ${calRes.status}`,
                    context: month,
                });
                continue;
            }

            const calHtml = await calRes.text();
            const { events: monthEvents, errors: monthErrors } = parseCalendarPage(calHtml, seasonMap, now, timezone);
            events.push(...monthEvents);
            errors.push(...monthErrors);
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
