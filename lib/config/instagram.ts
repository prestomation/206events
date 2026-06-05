import { Duration, ZonedDateTime, ZoneId, LocalDate } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "./schema.js";
import { InstagramCache, InstagramCacheEntry, entriesForUsername, loadInstagramCache } from "../instagram-cache.js";
import '@js-joda/timezone';

const CACHE_PATH = "instagram-cache.json";

// Placeholder time used when the agent recorded an event but couldn't pin its
// start time. The event still shows up (flagged uncertain) so the
// event-uncertainty-resolver can fill the real time on a later build — same
// discipline as sources/events12.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * Built-in ripper for Instagram accounts.
 *
 * Instagram has no parseable feed and can't be fetched from CI, so this ripper
 * does NOT touch Instagram or any LLM at build time. It is a pure reader of
 * instagram-cache.json, which the `instagram-source` skill populates by reading
 * each post's flyer image + caption with vision (out of band, or via a Claude
 * routine fired from CI). See docs/instagram-source.md and lib/instagram-cache.ts.
 *
 * Each calendar entry in ripper.yaml must include a `config` block with:
 *   - username: the Instagram handle (the cache key prefix)
 *   - defaultLocation: (optional) fallback venue address
 *   - defaultDurationHours: (optional) fallback duration in hours (default: 2)
 */
export class InstagramRipper implements IRipper {
    // Overridable so tests can inject a fixture cache without touching disk.
    protected async loadCache(): Promise<InstagramCache> {
        return loadInstagramCache(CACHE_PATH);
    }

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const cache = await this.loadCache();

        return ripper.config.calendars.map(cal => {
            const username = cal.config?.username as string | undefined;
            const defaultLocation = cal.config?.defaultLocation as string | undefined;
            const defaultDurationHours = (cal.config?.defaultDurationHours as number | undefined) ?? 2;

            const base = {
                name: cal.name,
                friendlyname: cal.friendlyname,
                parent: ripper.config,
                tags: cal.tags || [],
            };

            if (!username) {
                return {
                    ...base,
                    events: [],
                    errors: [{ type: "ParseError" as const, reason: "Missing required config field: username", context: cal.name }],
                };
            }

            const ripped = entriesForUsername(cache, username).flatMap(({ postId, entry }) =>
                this.toEvents(username, postId, entry, cal.timezone, defaultLocation, defaultDurationHours, ripper.config.name, cal.name),
            );

            return {
                ...base,
                events: ripped.filter(e => "date" in e) as RipperCalendarEvent[],
                errors: ripped.filter(e => "type" in e) as RipperError[],
            };
        });
    }

    // Turn one cache entry into 0, 1, or 2 results (the event, plus an optional
    // UncertaintyError for any field the agent left unknown). Never returns null
    // — non-events and undated entries produce an empty array.
    public toEvents(
        username: string,
        postId: string,
        entry: InstagramCacheEntry,
        timezone: ZoneId,
        defaultLocation: string | undefined,
        defaultDurationHours: number,
        source: string,
        calendarName: string,
    ): RipperEvent[] {
        if (!entry.isEvent) return [];      // promo / recap / not an event
        if (!entry.date) return [];         // can't place on a calendar without a date

        const title = entry.title?.trim();
        if (!title) {
            return [{
                type: "ParseError",
                reason: `Instagram post marked isEvent but has no title`,
                context: instagramId(username, postId),
            }];
        }

        let day: LocalDate;
        try {
            day = LocalDate.parse(entry.date);
        } catch {
            return [{
                type: "ParseError",
                reason: `Instagram event has an unparseable date "${entry.date}"`,
                context: instagramId(username, postId),
            }];
        }

        const unknownFields: UncertaintyField[] = [];

        // Start time — placeholder + uncertainty when the agent couldn't read a
        // valid one. parseLocalTime rejects NaN and out-of-range values so a
        // malformed cache entry falls back to the placeholder instead of
        // producing an invalid (or throwing) ZonedDateTime.
        let hour = DEFAULT_UNKNOWN_TIME_HOUR;
        let minute = DEFAULT_UNKNOWN_TIME_MINUTE;
        const parsedTime = entry.startTime ? parseLocalTime(entry.startTime) : null;
        if (parsedTime) {
            hour = parsedTime.hour;
            minute = parsedTime.minute;
        } else {
            unknownFields.push("startTime");
        }

        const date = ZonedDateTime.of(day.year(), day.monthValue(), day.dayOfMonth(), hour, minute, 0, 0, timezone);

        const duration = typeof entry.durationSeconds === 'number' && entry.durationSeconds > 0
            ? Duration.ofSeconds(entry.durationSeconds)
            : Duration.ofHours(defaultDurationHours);

        // Location — prefer the agent's reading, then the calendar default;
        // only flag uncertain when neither exists.
        const location = entry.location ?? defaultLocation;
        if (!location) unknownFields.push("location");

        const event: RipperCalendarEvent = {
            id: instagramId(username, postId),
            ripped: new Date(),
            date,
            duration,
            summary: title,
            description: entry.description,
            location,
            url: entry.permalink,
            imageUrl: entry.imageUrl,
        };

        const results: RipperEvent[] = [event];

        if (unknownFields.length > 0) {
            const uncertainty: UncertaintyError = {
                type: "Uncertainty",
                reason: `Instagram post details were not fully readable from the flyer/caption (${unknownFields.join(', ')})`,
                source,
                calendar: calendarName,
                unknownFields,
                event,
                // Re-investigate if the post is edited (caption/image change).
                partialFingerprint: entry.postFingerprint ?? simpleHash(`${entry.date}|${entry.startTime ?? ''}|${location ?? ''}`),
            };
            results.push(uncertainty);
        }

        return results;
    }
}

// Stable, source-derived event id: `<username>-<postId>`. The post id is fixed
// per post, so this never churns across builds.
function instagramId(username: string, postId: string): string {
    return `${username}-${postId}`;
}

// Parse a local "HH:MM" / "HH:MM:SS" time string. Returns null for anything
// non-numeric or out of range so the caller can fall back to the placeholder
// (and flag the field uncertain) rather than building an invalid ZonedDateTime.
function parseLocalTime(raw: string): { hour: number; minute: number } | null {
    const parts = raw.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1] ?? '0', 10);
    if (isNaN(hour) || isNaN(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
}
