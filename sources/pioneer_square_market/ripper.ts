import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, ZonedDateTime, ZoneOffset } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Public anon key — intentionally visible in the site's client-side JS bundle.
// Override via env var to allow key rotation without a code change.
const SUPABASE_URL = process.env.PIONEER_SQUARE_MARKET_SUPABASE_URL || "https://wbgpmtpprcdxfmttrrzv.supabase.co";
const ANON_KEY = process.env.PIONEER_SQUARE_MARKET_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ3BtdHBwcmNkeGZtdHRycnp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEwNDIwMTQsImV4cCI6MjA1NjYxODAxNH0.oC1hP574sRJUXH0VgPnO2BS9SyotaUm8YXIKtgBe508";
const BASE_EVENT_URL = "https://pioneersquaremarket.net/events";
const DEFAULT_DURATION_HOURS = 3;

interface VenueLocation {
    lat?: number;
    lng?: number;
    city?: string;
    state?: string;
    address?: string;
    name?: string;
    venue_name?: string;
}

interface PublicEvent {
    id: string;
    title: string;
    description: string | null;
    start_datetime: string;
    end_datetime: string | null;
    venue_location: VenueLocation | null;
    external_ticket_url: string | null;
    slug: string;
    event_status: string;
    cover_image_url: string | null;
}

export default class PioneerSquareMarketRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const now = ZonedDateTime.now(ZoneOffset.UTC);
        const isoNow = `${now.year()}-${String(now.monthValue()).padStart(2, '0')}-${String(now.dayOfMonth()).padStart(2, '0')}T00:00:00Z`;

        const url = `${SUPABASE_URL}/rest/v1/public_events?select=*&event_status=eq.published&start_datetime=gte.${isoNow}&order=start_datetime.asc&limit=200`;

        const res = await fetchFn(url, {
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`,
            },
        });
        if (!res.ok) throw new Error(`Supabase API returned HTTP ${res.status}`);

        let data: PublicEvent[];
        try {
            data = await res.json();
        } catch (error) {
            throw new Error(`Failed to parse Supabase API response: ${error instanceof Error ? error.message : String(error)}`);
        }

        const errors: RipperError[] = [];
        const events: RipperCalendarEvent[] = [];

        for (const item of data) {
            // Skip non-WA events (e.g. Vancouver BC FIFA World Cup matches) without
            // counting them as parse errors — this is an intentional content filter.
            const state = item.venue_location?.state;
            if (state && state !== 'WA') continue;

            const result = this.parseEvent(item);
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

    parseEvent(item: PublicEvent): RipperCalendarEvent | RipperError {
        const venue = item.venue_location ?? {};

        let date: ZonedDateTime;
        try {
            date = ZonedDateTime.parse(item.start_datetime);
        } catch {
            return {
                type: 'ParseError',
                reason: `Unparseable start_datetime: ${item.start_datetime}`,
                context: item.title,
            };
        }

        let duration: Duration;
        if (item.end_datetime) {
            try {
                const end = ZonedDateTime.parse(item.end_datetime);
                const diffSeconds = end.toEpochSecond() - date.toEpochSecond();
                duration = diffSeconds > 0
                    ? Duration.ofSeconds(diffSeconds)
                    : Duration.ofHours(DEFAULT_DURATION_HOURS);
            } catch {
                duration = Duration.ofHours(DEFAULT_DURATION_HOURS);
            }
        } else {
            duration = Duration.ofHours(DEFAULT_DURATION_HOURS);
        }

        const venueName = venue.name ?? venue.venue_name ?? '';
        const address = venue.address ?? '';
        const location = venueName && address
            ? `${venueName}, ${address}`
            : venueName || address || 'Pioneer Square, Seattle, WA';

        const eventUrl = item.external_ticket_url ?? `${BASE_EVENT_URL}/${item.slug}`;

        // cover_image_url is a per-event, absolute https URL when present.
        const imageUrl = item.cover_image_url?.trim() || undefined;

        return {
            id: `pioneer-square-market-${item.id}`,
            ripped: new Date(),
            date,
            duration,
            summary: item.title,
            description: item.description ?? undefined,
            location,
            url: eventUrl,
            imageUrl,
        };
    }
}
