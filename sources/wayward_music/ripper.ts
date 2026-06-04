import { Duration, LocalDateTime, ZonedDateTime, ZoneRegion } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, ParseError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { decode } from "html-entities";
import '@js-joda/timezone';

const WP_API_URL = "https://www.waywardmusic.org/wp-json/wp/v2/posts";
const EVENT_CATEGORY_ID = 1;
const DEFAULT_DURATION_HOURS = 2;
const DEFAULT_LOCATION = "Chapel Performance Space at Good Shepherd Center, 4649 Sunnyside Ave N, Seattle, WA 98103";

interface WPMedia {
    media_type?: string;
    source_url?: string;
}

interface WPPost {
    id: number;
    date: string;
    link: string;
    title: { rendered: string };
    excerpt: { rendered: string };
    // Populated when the request asks for _embed=wp:featuredmedia
    _embedded?: { "wp:featuredmedia"?: WPMedia[] };
}

/**
 * Extract the post's featured image URL from the embedded media, if present.
 * Only returns image media; returns undefined when there is no featured image.
 */
export function extractImageUrl(post: WPPost): string | undefined {
    const media = post._embedded?.["wp:featuredmedia"]?.[0];
    if (!media || (media.media_type && media.media_type !== "image")) return undefined;
    const src = media.source_url?.trim();
    return src || undefined;
}

export function parseDescription(excerpt: string): string {
    return decode(
        excerpt
            .replace(/<a[^>]*class="read-more"[^>]*>[\s\S]*?<\/a>/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
    );
}

export function parseEvent(post: WPPost, timezone: ZoneRegion): RipperCalendarEvent | ParseError {
    let date: ZonedDateTime;
    try {
        date = ZonedDateTime.of(LocalDateTime.parse(post.date), timezone);
    } catch {
        return {
            type: "ParseError",
            reason: `Unparseable date: ${post.date}`,
            context: post.title.rendered,
        };
    }

    return {
        id: `wayward-music-${post.id}`,
        ripped: new Date(),
        date,
        duration: Duration.ofHours(DEFAULT_DURATION_HOURS),
        summary: decode(post.title.rendered),
        description: parseDescription(post.excerpt.rendered),
        location: DEFAULT_LOCATION,
        url: post.link,
        imageUrl: extractImageUrl(post),
    };
}

export default class WaywardMusicRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error('No calendars configured for Wayward Music ripper');
        }
        const calConfig = ripper.config.calendars[0];
        const timezone = calConfig.timezone;

        const after = new Date().toISOString().replace(/\.\d{3}Z$/, '');
        const posts = await this.fetchEvents(fetchFn, after);

        const events: RipperCalendarEvent[] = [];
        const errors: ParseError[] = [];

        for (const post of posts) {
            const result = parseEvent(post, timezone);
            if ('date' in result) {
                events.push(result);
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

    private async fetchEvents(fetchFn: FetchFn, after: string): Promise<WPPost[]> {
        const posts: WPPost[] = [];
        let page = 1;
        while (true) {
            const url = `${WP_API_URL}?categories=${EVENT_CATEGORY_ID}&per_page=100&order=asc&orderby=date&after=${encodeURIComponent(after)}&_embed=wp:featuredmedia&_fields=id,title,date,link,excerpt,featured_media,_links,_embedded&page=${page}`;
            const res = await fetchFn(url);
            if (!res.ok) {
                // WordPress returns 400 when requesting a page beyond the last available;
                // only treat it as end-of-results on page 2+ (page 1 400 is a real error).
                if (res.status === 400 && page > 1) break;
                throw new Error(`WP REST API returned ${res.status} ${res.statusText}`);
            }
            const batch: WPPost[] = await res.json();
            if (batch.length === 0) break;
            posts.push(...batch);
            if (batch.length < 100) break;
            page++;
        }
        return posts;
    }
}
