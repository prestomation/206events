import { Duration, Instant, ZonedDateTime, ZoneId } from "@js-joda/core";
import {
    EventCost,
    IRipper,
    Ripper,
    RipperCalendar,
    RipperCalendarEvent,
    RipperError,
} from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Dragonfly Yoga Pilates Dance (West Seattle) runs its class schedule and
// one-off workshops through Momence, a class-booking SaaS. Its site embeds
// a Momence widget (momence.com/u/dragonfly-jz7h6Z) whose "Book Now" iframe
// calls a public, unauthenticated JSON endpoint — found by watching the
// network requests the embedded widget makes when the page loads:
//   https://readonly-api.momence.com/host-plugins/host/<hostId>/host-schedule/sessions
// `hostId` (40118) is a stable numeric id specific to this studio, not a
// credential — the endpoint is designed to be called from any website that
// embeds the studio's schedule widget, with no auth and permissive CORS.
//
// The feed mixes two shapes:
//  - `special-event-new` / `special-event` / `retreat`: genuine one-off
//    dated workshops/socials — passed through as individual events.
//  - `fitness` / `course-class`: the regular weekly class grid, where the
//    same class (e.g. "Vinyasa Flow") recurs on the same weekday/time for
//    months at a stretch. Publishing every raw occurrence would flood the
//    calendar with hundreds of near-duplicate entries, so these are
//    deduplicated into one event per distinct (class name, weekday, local
//    time) series, anchored on its earliest fetched occurrence and given a
//    weekly `RRULE` — the same approach `lib/config/recurring.ts` uses for
//    hand-authored recurring venues.

const HOST_ID = 40118;
const API_BASE = `https://readonly-api.momence.com/host-plugins/host/${HOST_ID}/host-schedule/sessions`;
const SESSION_TYPES = ["course-class", "fitness", "retreat", "special-event", "special-event-new"];
const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
const VENUE_LOCATION = "Dragonfly Yoga Pilates Dance, 3270 California Ave SW, Seattle, WA 98116";
const VENUE_URL = "https://www.dragonflywestseattle.com/";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const SOURCE_ID = "dragonfly-west-seattle";
const PAGE_SIZE = 200;
// Safety cap on pagination (~4000 sessions) in case the feed's totalCount
// is ever wrong and the loop would otherwise never terminate.
const MAX_PAGES = 20;

const ONE_OFF_TYPES = new Set(["special-event", "special-event-new", "retreat"]);
const RECURRING_TYPES = new Set(["fitness", "course-class"]);

const DAY_ABBR: Record<number, string> = {
    1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA", 7: "SU",
};

export interface MomenceSession {
    id: number;
    sessionName: string;
    level?: string; // free-text class/event description, despite the name
    type: string;
    image?: string;
    startsAt: string; // ISO instant, e.g. "2026-09-17T03:00:00.000Z"
    durationMinutes: number;
    link?: string;
    teacher?: string;
    fixedTicketPrice?: number | null;
    dynamicTicketPriceMin?: number | null;
    freeEvent: boolean;
    isCancelled: boolean;
}

interface MomenceSessionsResponse {
    payload: MomenceSession[];
    pagination: { page: number; pageSize: number; totalCount: number };
}

export function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function toZoned(isoInstant: string): ZonedDateTime | null {
    try {
        return Instant.parse(isoInstant).atZone(TIMEZONE);
    } catch {
        return null;
    }
}

function buildDescription(s: MomenceSession): string | undefined {
    const parts: string[] = [];
    if (s.level) parts.push(s.level.trim());
    if (s.teacher) parts.push(`Instructor: ${s.teacher}`);
    return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function costFromSession(s: MomenceSession): EventCost | undefined {
    if (s.freeEvent) return { min: 0 };
    if (typeof s.fixedTicketPrice === "number" && s.fixedTicketPrice > 0) {
        return { min: s.fixedTicketPrice };
    }
    if (typeof s.dynamicTicketPriceMin === "number" && s.dynamicTicketPriceMin > 0) {
        return { min: s.dynamicTicketPriceMin };
    }
    return { paid: true };
}

/**
 * Builds one discrete `RipperCalendarEvent` per one-off workshop/social
 * session. Public for testing.
 */
export function parseOneOffSession(s: MomenceSession): RipperCalendarEvent | RipperError {
    const start = toZoned(s.startsAt);
    if (!start) {
        return { type: "ParseError", reason: `Could not parse startsAt "${s.startsAt}" for session ${s.id}`, context: String(s.id) };
    }
    return {
        id: `${SOURCE_ID}-${s.id}`,
        ripped: new Date(),
        date: start,
        duration: Duration.ofMinutes(s.durationMinutes > 0 ? s.durationMinutes : 60),
        summary: `${s.sessionName} at Dragonfly`,
        description: buildDescription(s),
        location: VENUE_LOCATION,
        url: s.link ?? VENUE_URL,
        imageUrl: s.image,
        cost: costFromSession(s),
    };
}

/**
 * Deduplicates the raw weekly class grid into one event per distinct
 * (class name, weekday, local start time) series, anchored on the earliest
 * fetched occurrence and marked with a weekly `RRULE`. Public for testing.
 */
export function buildRecurringEvents(sessions: MomenceSession[]): (RipperCalendarEvent | RipperError)[] {
    const groups = new Map<string, { first: MomenceSession; firstStart: ZonedDateTime }>();
    const errors: RipperError[] = [];

    for (const s of sessions) {
        const start = toZoned(s.startsAt);
        if (!start) {
            errors.push({ type: "ParseError", reason: `Could not parse startsAt "${s.startsAt}" for session ${s.id}`, context: String(s.id) });
            continue;
        }
        const key = `${slugify(s.sessionName)}-${start.dayOfWeek().value()}-${start.toLocalTime().toString()}`;
        const existing = groups.get(key);
        if (!existing || start.isBefore(existing.firstStart)) {
            groups.set(key, { first: s, firstStart: start });
        }
    }

    const events: RipperCalendarEvent[] = [];
    for (const [key, { first, firstStart }] of groups) {
        const dayAbbr = DAY_ABBR[firstStart.dayOfWeek().value()];
        events.push({
            id: `${SOURCE_ID}-${key}`,
            ripped: new Date(),
            date: firstStart,
            duration: Duration.ofMinutes(first.durationMinutes > 0 ? first.durationMinutes : 60),
            summary: `${first.sessionName} at Dragonfly`,
            description: buildDescription(first),
            location: VENUE_LOCATION,
            url: VENUE_URL,
            imageUrl: first.image,
            cost: costFromSession(first),
            rrule: `FREQ=WEEKLY;BYDAY=${dayAbbr}`,
        });
    }

    return [...events, ...errors];
}

export default class DragonflyWestSeattleRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    private async fetchAllSessions(): Promise<MomenceSession[]> {
        const all: MomenceSession[] = [];
        const fromDate = new Date().toISOString();
        const typeParams = SESSION_TYPES.map(t => `sessionTypes[]=${encodeURIComponent(t)}`).join("&");

        for (let page = 0; page < MAX_PAGES; page++) {
            const url = `${API_BASE}?${typeParams}&fromDate=${encodeURIComponent(fromDate)}&pageSize=${PAGE_SIZE}&page=${page}&timeZone=UTC`;
            const res = await this.fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} fetching Dragonfly West Seattle schedule (page ${page})`);
            }
            const data = await res.json() as MomenceSessionsResponse;
            all.push(...data.payload);
            if (all.length >= data.pagination.totalCount || data.payload.length < PAGE_SIZE) {
                break;
            }
        }

        return all;
    }

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error("No calendars configured for dragonfly-west-seattle ripper");
        }
        const calConfig = ripper.config.calendars[0];

        let sessions: MomenceSession[];
        try {
            sessions = await this.fetchAllSessions();
        } catch (error) {
            throw new Error(`Failed to fetch Dragonfly West Seattle schedule: ${error}`);
        }

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        const seenOneOff = new Set<number>();
        for (const s of sessions) {
            if (s.isCancelled || !ONE_OFF_TYPES.has(s.type) || seenOneOff.has(s.id)) continue;
            seenOneOff.add(s.id);
            const result = parseOneOffSession(s);
            if ("date" in result) events.push(result);
            else errors.push(result);
        }

        const recurringSource = sessions.filter(s => !s.isCancelled && RECURRING_TYPES.has(s.type));
        for (const result of buildRecurringEvents(recurringSource)) {
            if ("date" in result) events.push(result);
            else errors.push(result);
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
