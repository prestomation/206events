import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, EventCost } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const API_BASE = "https://runsignup.com/Rest/race/";
// RunSignUp doesn't always give every heat/distance an end_time (e.g. a run
// with staggered wave starts but no recorded finish cutoff) — fall back to a
// typical race-morning window rather than leaving duration unset.
const DEFAULT_DURATION = Duration.ofHours(3);

interface RunSignUpRegistrationPeriod {
    registration_opens?: string;
    registration_closes?: string;
    race_fee?: string;
}

interface RunSignUpEvent {
    name: string;
    start_time?: string;
    end_time?: string;
    registration_periods?: RunSignUpRegistrationPeriod[];
}

interface RunSignUpAddress {
    street?: string | null;
    street2?: string | null;
    city?: string | null;
    state?: string | null;
    zipcode?: string | null;
}

interface RunSignUpRace {
    name: string;
    url: string;
    external_race_url?: string | null;
    address?: RunSignUpAddress;
    events?: RunSignUpEvent[];
    // The race's own logo/banner image — already present in every race
    // response sampled live, so no extra fetch is needed to backfill
    // event photos (see RipperCalendarEvent.imageUrl below).
    logo_url?: string | null;
}

interface RunSignUpRaceResponse {
    race?: RunSignUpRace;
}

// RunSignUp dates look like "9/24/2025 03:00" or "9/9/2026 8:30" — no
// zero-padding guaranteed on month/day/hour.
const DATETIME_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;

export function parseRunSignUpDateTime(raw: string | undefined): LocalDateTime | undefined {
    if (!raw) return undefined;
    const match = raw.trim().match(DATETIME_RE);
    if (!match) return undefined;
    const [, month, day, year, hour, minute] = match;
    try {
        return LocalDateTime.of(
            parseInt(year, 10),
            parseInt(month, 10),
            parseInt(day, 10),
            parseInt(hour, 10),
            parseInt(minute, 10)
        );
    } catch {
        return undefined;
    }
}

export function parseRaceFee(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : undefined;
}

// Picks the fee a visitor would pay today: the currently-open registration
// window if there is one, otherwise the soonest upcoming window, otherwise
// (registration fully closed) the last/onsite price as a best-effort figure.
export function currentFee(periods: RunSignUpRegistrationPeriod[] | undefined, now: LocalDateTime): number | undefined {
    if (!periods || periods.length === 0) return undefined;

    const parsed = periods
        .map(p => ({
            opens: parseRunSignUpDateTime(p.registration_opens),
            closes: parseRunSignUpDateTime(p.registration_closes),
            fee: parseRaceFee(p.race_fee),
        }))
        .filter((p): p is { opens: LocalDateTime; closes: LocalDateTime; fee: number } =>
            p.fee !== undefined && p.opens !== undefined && p.closes !== undefined
        );
    if (parsed.length === 0) return undefined;

    const active = parsed.find(p => !now.isBefore(p.opens) && !now.isAfter(p.closes));
    if (active) return active.fee;

    const future = parsed.filter(p => now.isBefore(p.opens)).sort((a, b) => a.opens.compareTo(b.opens));
    if (future.length > 0) return future[0].fee;

    return parsed[parsed.length - 1].fee;
}

function buildLocation(address: RunSignUpAddress | undefined): string | undefined {
    if (!address) return undefined;
    const cityStateZip = [address.city, address.state].filter(Boolean).join(", ");
    const parts = [address.street, address.street2, [cityStateZip, address.zipcode].filter(Boolean).join(" ")]
        .map(p => p?.trim())
        .filter((p): p is string => !!p);
    return parts.length > 0 ? parts.join(", ") : undefined;
}

// Public for testing. `raceId` is only used to label errors — the race's own
// identity for event ids comes from the response body.
export function parseRace(raceId: number, response: RunSignUpRaceResponse, now: ZonedDateTime): (RipperCalendarEvent | RipperError)[] {
    const race = response?.race;
    if (!race) {
        return [{ type: "ParseError", reason: `RunSignUp API returned no race data for race ${raceId}`, context: String(raceId) }];
    }

    const nowLocal = now.toLocalDateTime();
    const future: { event: RunSignUpEvent; start: LocalDateTime; end?: LocalDateTime }[] = [];
    for (const event of race.events ?? []) {
        // "Virtual"/"Challenge" entries are self-paced, run-it-on-your-own-time
        // options (some span a full day or more) rather than a real gathering
        // at the printed start time — including them would blow up the
        // in-person race's computed duration. Skip them; the in-person heats
        // for the same race day still produce a normal event.
        if (/virtual|challenge/i.test(event.name)) continue;
        const start = parseRunSignUpDateTime(event.start_time);
        if (!start || !start.isAfter(nowLocal)) continue;
        future.push({ event, start, end: parseRunSignUpDateTime(event.end_time) });
    }
    if (future.length === 0) return [];

    // Multiple heats/distances share the same race day — group them into one
    // calendar event per date rather than one per heat.
    const byDate = new Map<string, typeof future>();
    for (const f of future) {
        const key = f.start.toLocalDate().toString();
        const list = byDate.get(key) ?? [];
        list.push(f);
        byDate.set(key, list);
    }

    const results: (RipperCalendarEvent | RipperError)[] = [];
    for (const [dateKey, group] of byDate) {
        const earliestStart = group.reduce((min, f) => (f.start.isBefore(min) ? f.start : min), group[0].start);
        const latestEnd = group.reduce<LocalDateTime | undefined>((max, f) => {
            if (!f.end) return max;
            return !max || f.end.isAfter(max) ? f.end : max;
        }, undefined);

        const duration = latestEnd && latestEnd.isAfter(earliestStart)
            ? Duration.between(earliestStart, latestEnd)
            : DEFAULT_DURATION;

        const fees = group
            .map(f => currentFee(f.event.registration_periods, nowLocal))
            .filter((fee): fee is number => fee !== undefined);
        let cost: EventCost | undefined;
        if (fees.length > 0) {
            const min = Math.min(...fees);
            const max = Math.max(...fees);
            cost = max > min ? { min, max } : { min };
        }

        const heatNames = Array.from(new Set(group.map(f => f.event.name).filter(Boolean)));
        const description = heatNames.length > 1 ? `Includes: ${heatNames.join(", ")}` : undefined;

        results.push({
            id: `orca-running-${raceId}-${dateKey}`,
            ripped: new Date(),
            date: ZonedDateTime.of(earliestStart, TIMEZONE),
            duration,
            summary: race.name,
            description,
            location: buildLocation(race.address),
            url: race.external_race_url || race.url,
            ...(cost ? { cost } : {}),
            ...(race.logo_url ? { imageUrl: race.logo_url } : {}),
        });
    }

    return results;
}

export default class OrcaRunningRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        if (!calConfig) throw new Error("No calendars configured");

        const raceIds = (calConfig.config as { raceIds?: unknown } | undefined)?.raceIds;
        if (!Array.isArray(raceIds) || raceIds.length === 0 || !raceIds.every((id): id is number => typeof id === "number")) {
            // A missing/malformed raceIds config would otherwise silently
            // produce 0 events with no diagnosable cause — fail loudly
            // instead, the same way a missing calendar config does above.
            throw new Error(`calendar "${calConfig.name}" config.raceIds must be a non-empty number[]`);
        }
        const now = ZonedDateTime.now(TIMEZONE);

        const results: (RipperCalendarEvent | RipperError)[] = [];
        for (const raceId of raceIds) {
            try {
                const res = await this.fetchFn(`${API_BASE}${raceId}?format=json`, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
                    signal: AbortSignal.timeout(30000),
                });
                if (!res.ok) {
                    results.push({ type: "ParseError", reason: `RunSignUp API returned ${res.status} for race ${raceId}`, context: String(raceId) });
                    continue;
                }
                const json = (await res.json()) as RunSignUpRaceResponse;
                results.push(...parseRace(raceId, json, now));
            } catch (err) {
                results.push({
                    type: "ParseError",
                    reason: `Failed to fetch RunSignUp race ${raceId}: ${err instanceof Error ? err.message : String(err)}`,
                    context: String(raceId),
                });
            }
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => "date" in e),
            errors: results.filter((e): e is RipperError => "type" in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }
}
