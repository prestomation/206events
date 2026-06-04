import { DateTimeFormatter, Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { IRipper, ParseError, Ripper, RipperCalendar, RipperCalendarEvent } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const BASE_URL = "https://www.kexp.org";
const DEFAULT_LOCATION = "KEXP Studio NW Rooms, 472 1st Ave N, Seattle, WA 98109";
// Format used in the addeventatc calendar widget: MM/DD/YYYY HH:mm
const DATE_FMT = DateTimeFormatter.ofPattern("MM/dd/uuuu HH:mm");

export function parseArticle(article: HTMLElement): RipperCalendarEvent | ParseError {
    const titleEl = article.querySelector('.EventItem-body h3.u-mb0 a');
    if (!titleEl) {
        return { type: 'ParseError', reason: 'Missing title element', context: article.outerHTML.substring(0, 100) };
    }

    const title = titleEl.textContent.trim();
    const href = titleEl.getAttribute('href');
    if (!href) {
        return { type: 'ParseError', reason: 'Missing event href', context: title };
    }

    const url = `${BASE_URL}${href}`;
    const slug = href.split('/').filter(Boolean).pop() ?? '';

    // Per-event thumbnail in the event card. KEXP serves a root-relative path
    // (e.g. /media/filer_public_thumbnails/.../foo.jpg) which we resolve to an
    // absolute URL. The 1x1 transparent placeholder used by some lazy-load
    // setups is skipped, as is anything that isn't a real path.
    const imgSrc = article.querySelector('.EventItem-image img')?.getAttribute('src')?.trim();
    let imageUrl: string | undefined;
    if (imgSrc && !imgSrc.startsWith('data:')) {
        if (imgSrc.startsWith('http')) {
            imageUrl = imgSrc;
        } else if (imgSrc.startsWith('/')) {
            imageUrl = `${BASE_URL}${imgSrc}`;
        }
    }

    // The addeventatc widget provides structured start/end/timezone data
    const calWidget = article.querySelector('a.addeventatc');
    if (!calWidget) {
        return { type: 'ParseError', reason: 'Missing calendar widget', context: title };
    }

    const startText = calWidget.querySelector('span.start')?.textContent?.trim();
    const endText = calWidget.querySelector('span.end')?.textContent?.trim();
    const timezoneText = calWidget.querySelector('span.timezone')?.textContent?.trim() ?? 'America/Los_Angeles';

    if (!startText) {
        return { type: 'ParseError', reason: 'Missing start time in calendar widget', context: title };
    }

    let startDate: ZonedDateTime;
    try {
        startDate = LocalDateTime.parse(startText, DATE_FMT).atZone(ZoneId.of(timezoneText));
    } catch {
        return { type: 'ParseError', reason: `Unparseable start date: "${startText}"`, context: title };
    }

    let duration = Duration.ofMinutes(30);
    if (endText) {
        try {
            const endDate = LocalDateTime.parse(endText, DATE_FMT).atZone(ZoneId.of(timezoneText));
            const diffMs = endDate.toInstant().toEpochMilli() - startDate.toInstant().toEpochMilli();
            if (diffMs > 0) {
                duration = Duration.ofMillis(diffMs);
            }
        } catch {
            // keep default duration
        }
    }

    return {
        id: `kexp-${slug}`,
        summary: title,
        location: DEFAULT_LOCATION,
        date: startDate,
        duration,
        url,
        imageUrl,
        ripped: new Date(),
    };
}

export default class KexpRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`KEXP events page returned ${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const root = parseHtml(html);
        const articles = root.querySelectorAll('article.aldryn-events-article');

        const events: RipperCalendarEvent[] = [];
        const errors: ParseError[] = [];
        const seen = new Set<string | undefined>();

        for (const article of articles) {
            const result = parseArticle(article);
            if ('date' in result) {
                const key = result.id ?? result.url;
                // Only public sessions appear on the event calendar; private recordings are excluded
                if (result.summary.includes('(OPEN TO THE PUBLIC)') && !seen.has(key)) {
                    seen.add(key);
                    events.push(result);
                }
            } else {
                errors.push(result);
            }
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
}
