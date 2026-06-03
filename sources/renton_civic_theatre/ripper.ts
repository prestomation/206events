import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, ParseError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDate, LocalTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const LOCATION = "Renton Civic Theatre, 507 S 3rd St, Renton, WA 98057";
const BASE_URL = "https://www.rentoncivictheatre.org";
const DEFAULT_CURTAIN = LocalTime.of(20, 0);
const DEFAULT_DURATION = Duration.ofMinutes(150);

interface OtherDate {
    id: string;
    purpose: string;
    date: string;
    description?: string;
}

interface ShowDates {
    openingDate?: string;
    closingDate?: string;
    otherDates?: OtherDate[];
}

interface ShowInfo {
    showTitle?: string;
    shortDescription?: string;
}

interface ShowMeta {
    image?: { url: string };
}

interface Show {
    id: string;
    slug: string;
    title: string;
    showInfo: ShowInfo;
    dates: ShowDates;
    meta?: ShowMeta;
}

interface ShowsResponse {
    docs: Show[];
}

export function parseShow(show: Show, now: ZonedDateTime): RipperEvent[] {
    const { dates, showInfo, slug, meta } = show;

    if (!dates?.openingDate || !dates?.closingDate) {
        return [{
            type: 'ParseError',
            reason: `Missing dates for show: ${showInfo?.showTitle ?? slug}`,
            context: slug,
        }];
    }

    const closingDate = LocalDate.parse(dates.closingDate.substring(0, 10));
    const todayLocal = now.toLocalDate();

    if (closingDate.isBefore(todayLocal)) return [];

    const openingDate = LocalDate.parse(dates.openingDate.substring(0, 10));
    const title = showInfo?.showTitle ?? show.title;
    const shortDesc = showInfo?.shortDescription ?? '';

    const runDates = openingDate.equals(closingDate)
        ? openingDate.toString()
        : `${openingDate} – ${closingDate}`;
    const description = [shortDesc, `Run: ${runDates}`].filter(Boolean).join('\n');

    const imageUrl = meta?.image?.url;
    const image = imageUrl
        ? (imageUrl.startsWith('http') ? imageUrl : `${BASE_URL}${imageUrl}`)
        : undefined;

    const url = `${BASE_URL}/shows/${slug}`;
    const events: RipperEvent[] = [];

    events.push({
        id: `renton-civic-theatre-${slug}`,
        ripped: new Date(),
        date: ZonedDateTime.of(openingDate, DEFAULT_CURTAIN, now.zone()),
        duration: DEFAULT_DURATION,
        summary: title,
        description,
        location: LOCATION,
        url,
        imageUrl: image,
    });

    for (const other of dates.otherDates ?? []) {
        if (!other.date) continue;
        const otherDate = LocalDate.parse(other.date.substring(0, 10));
        if (otherDate.isBefore(todayLocal)) continue;

        const otherDesc = [other.description, shortDesc].filter(Boolean).join('\n');
        events.push({
            id: `renton-civic-theatre-${slug}-${other.id}`,
            ripped: new Date(),
            date: ZonedDateTime.of(otherDate, DEFAULT_CURTAIN, now.zone()),
            duration: DEFAULT_DURATION,
            summary: `${title} – ${other.purpose}`,
            description: otherDesc,
            location: LOCATION,
            url,
            imageUrl: image,
        });
    }

    return events;
}

export default class RentonCivicTheatreRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const zone = ZoneId.of(calConfig.timezone.toString());
        const now = ZonedDateTime.now(zone);

        const res = await this.fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
        });
        if (!res.ok) {
            throw new Error(`Renton Civic Theatre API returned ${res.status} ${res.statusText}`);
        }

        const data: ShowsResponse = await res.json();

        const events: RipperCalendarEvent[] = [];
        const errors: ParseError[] = [];

        for (const show of data.docs ?? []) {
            for (const result of parseShow(show, now)) {
                if ('date' in result) events.push(result as RipperCalendarEvent);
                else errors.push(result as ParseError);
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
