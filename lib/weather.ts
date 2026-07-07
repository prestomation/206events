/**
 * Weather badges for outdoor events — build-time forecast fetch + per-event
 * aggregation. See docs/weather-badges.md for the full design.
 *
 * The build (lib/calendar_ripper.ts) calls `applyWeatherBadges` once, after the
 * events index is fully assembled: events from channels tagged `Outdoors` that
 * start within the badge window get a compact `weather` field stamped onto
 * their index row. The forecast comes from Open-Meteo in a single batched
 * request (one lat/lng pair per occupied ~5 km grid cell), routed through the
 * shared fetch cache so it is fetched live at most once per UTC day
 * (`start_date`/`end_date` in the URL bucket the cache key by day).
 *
 * Failure policy: this module never throws into the build. A failed or
 * malformed fetch logs a warning and leaves every row unbadged — badge absence
 * is the designed degraded state. A live failure with a warm cache is served
 * stale by the fetch layer and surfaces through the existing
 * `proxyStaleServes` reporting category; no new build-errors category exists
 * for weather.
 */

import type { FetchFn } from "./config/proxy-fetch.js";
import { keyFor, getFetchCache, lookupAnyEntry } from "./fetch-cache.js";
import { PAST_EVENT_GRACE_HOURS } from "./discovery.js";

/** Channel tag that opts a source's events into weather badges. */
export const OUTDOORS_TAG = "Outdoors";

/** Only events starting within this many days of the build get a badge —
 *  hourly forecasts are meaningfully skillful out to about a week. */
export const WEATHER_WINDOW_DAYS = 7;

/** Grid cell size in degrees (~5 km N-S) — matches the resolution of the
 *  underlying forecast models, so finer would be false precision. */
export const WEATHER_CELL_DEG = 0.05;

/** Cap on the hours aggregated per event, so an all-day festival's badge
 *  reflects its opening stretch rather than averaging in overnight hours. */
export const EVENT_WINDOW_CAP_HOURS = 6;

/** Defensive bound on distinct grid cells in one request (URL length). If
 *  exceeded, the overflow cells are dropped and logged — never silently. */
export const MAX_WEATHER_CELLS = 60;

/** Confidence tiers by lead time to event start (docs/weather-badges.md,
 *  Decision 5): < 72h high, 3–5 days medium, 6–7 days low. */
export const HIGH_CONFIDENCE_MAX_HOURS = 72;
export const MEDIUM_CONFIDENCE_MAX_HOURS = 144;

/** Compact per-event weather stamped onto events-index rows. Keys are terse
 *  because the index ships to every visitor. Temps are in the display unit
 *  configured in city.config.ts (`weather.temperatureUnit`) — unit-neutral key
 *  names so a °C city isn't shipping Celsius in a key named "F". */
export interface EventWeather {
  /** Max temperature over the event window. */
  hi: number;
  /** Min temperature over the event window. */
  lo: number;
  /** Max hourly precipitation probability (%) over the window. */
  pop: number;
  /** Worst-weather WMO code over the window (icon lookup). */
  code: number;
  /** ISO timestamp of the forecast fetch (cache-aware, not build time). */
  asOf: string;
  /** Lead-time confidence tier. */
  conf: "high" | "medium" | "low";
}

/** The subset of an events-index row this module reads/writes. */
export interface WeatherIndexRow {
  icsUrl: string;
  date: string;
  endDate?: string;
  lat?: number;
  lng?: number;
  weather?: EventWeather;
}

export type TemperatureUnit = "fahrenheit" | "celsius";

/** Hourly series for one forecast location, as returned by Open-Meteo. */
export interface HourlySeries {
  /** Unix seconds (start of each hour, `timeformat=unixtime`). */
  time: number[];
  temperature_2m: Array<number | null>;
  precipitation_probability: Array<number | null>;
  weather_code: Array<number | null>;
}

/**
 * Parse an events-index date string to epoch ms. Index dates are js-joda
 * `toString()` output (`2026-02-15T19:00:00-08:00[America/Los_Angeles]`);
 * strip the bracketed IANA zone and parse the offset-bearing ISO string —
 * mirroring `buildEventsIndexSoon` in lib/discovery.ts and the client.
 * Returns NaN when unparseable.
 */
export function parseIndexInstant(s: string | undefined): number {
  if (!s) return NaN;
  return new Date(String(s).replace(/\[.*\]$/, "")).getTime();
}

/**
 * Snap a coordinate to the center of its grid cell. Returns a stable string
 * key (`"47.60,-122.35"`) usable both for dedup and as the request coordinate.
 * Multiples of 0.05° always render exactly at two decimals.
 */
export function cellKeyFor(lat: number, lng: number, cellDeg: number = WEATHER_CELL_DEG): string {
  const snap = (x: number) => (Math.round(x / cellDeg) * cellDeg).toFixed(2);
  return `${snap(lat)},${snap(lng)}`;
}

/** Lead-time confidence tier. Negative lead (event already started) is high. */
export function confidenceForLead(leadMs: number): EventWeather["conf"] {
  const hours = leadMs / 3_600_000;
  if (hours < HIGH_CONFIDENCE_MAX_HOURS) return "high";
  if (hours < MEDIUM_CONFIDENCE_MAX_HOURS) return "medium";
  return "low";
}

/**
 * Severity rank for "worst weather wins" aggregation across an event window
 * (a picnic that's sunny at 2pm and thundery at 4pm badges as thunder).
 * WMO weather interpretation codes; unknown codes rank between fog and
 * drizzle so a new code neither dominates nor disappears.
 */
export function codeRank(code: number): number {
  if (code >= 95) return 8; // thunderstorm (95, 96, 99)
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 7; // snow
  if (code === 56 || code === 57 || code === 66 || code === 67) return 6; // freezing drizzle/rain
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return 5; // rain / showers
  if (code >= 51 && code <= 55) return 4; // drizzle
  if (code === 45 || code === 48) return 2; // fog
  if (code === 3) return 1.5; // overcast
  if (code >= 1 && code <= 2) return 1; // partly cloudy
  if (code === 0) return 0; // clear
  return 3; // unknown code — between fog and drizzle
}

/**
 * Aggregate an hourly series over an event's time window: hours overlapping
 * [start, min(end, start + EVENT_WINDOW_CAP_HOURS)]. Returns undefined when no
 * usable hours fall in the window (event beyond the forecast horizon, or the
 * series has no non-null samples there). Null-sample policy: `hi`/`lo` and
 * `code` each require at least one non-null sample; a window with no non-null
 * precipitation probability aggregates as `pop: 0` (Open-Meteo populates PoP
 * throughout the 7-day window in practice).
 */
export function aggregateEventWindow(
  hourly: HourlySeries,
  startMs: number,
  endMs: number,
): Pick<EventWeather, "hi" | "lo" | "pop" | "code"> | undefined {
  const effEndMs = Math.min(
    endMs > startMs ? endMs : startMs + 1,
    startMs + EVENT_WINDOW_CAP_HOURS * 3_600_000,
  );
  let hi = -Infinity;
  let lo = Infinity;
  let pop = -1;
  let code: number | undefined;
  for (let i = 0; i < hourly.time.length; i++) {
    const hourStartMs = hourly.time[i] * 1000;
    const hourEndMs = hourStartMs + 3_600_000;
    if (hourEndMs <= startMs || hourStartMs >= effEndMs) continue;
    const t = hourly.temperature_2m[i];
    if (t !== null && t !== undefined) {
      if (t > hi) hi = t;
      if (t < lo) lo = t;
    }
    const p = hourly.precipitation_probability[i];
    if (p !== null && p !== undefined && p > pop) pop = p;
    const c = hourly.weather_code[i];
    if (c !== null && c !== undefined && (code === undefined || codeRank(c) > codeRank(code))) {
      code = c;
    }
  }
  if (!Number.isFinite(hi) || code === undefined) return undefined;
  // Whole degrees: forecast models don't support sub-degree precision, and
  // rounding here keeps the published index compact.
  return { hi: Math.round(hi), lo: Math.round(lo), pop: Math.max(pop, 0), code };
}

/**
 * Build the batched Open-Meteo forecast URL for a set of cell keys. Cells are
 * sorted so the URL — and therefore the fetch-cache key — is deterministic
 * across builds regardless of event iteration order. `startDate`/`endDate`
 * (UTC calendar dates) both scope the forecast window and bucket the cache
 * key by day: the first build of each UTC day fetches live, the rest hit the
 * cache.
 */
export function buildForecastUrl(
  cellKeys: string[],
  opts: { temperatureUnit: TemperatureUnit; startDate: string; endDate: string },
): string {
  const sorted = [...cellKeys].sort();
  const lats = sorted.map(k => k.split(",")[0]).join(",");
  const lngs = sorted.map(k => k.split(",")[1]).join(",");
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lngs,
    hourly: "temperature_2m,precipitation_probability,weather_code",
    temperature_unit: opts.temperatureUnit,
    timezone: "UTC",
    timeformat: "unixtime",
    start_date: opts.startDate,
    end_date: opts.endDate,
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/**
 * Normalize the Open-Meteo response body into one HourlySeries per requested
 * cell, in request (sorted-cell) order. Open-Meteo returns an array for
 * multi-location requests and a bare object for a single location; response
 * order matches request order (returned coordinates are snapped to the model
 * grid, so matching by value is not possible). Throws on shape mismatch —
 * the orchestrator catches it.
 */
export function parseForecastResponse(body: unknown, expectedCells: number): HourlySeries[] {
  const locations = Array.isArray(body) ? body : [body];
  if (locations.length !== expectedCells) {
    throw new Error(`Open-Meteo returned ${locations.length} locations, expected ${expectedCells}`);
  }
  return locations.map((loc: any, i: number) => {
    const h = loc?.hourly;
    if (
      !h ||
      !Array.isArray(h.time) ||
      !Array.isArray(h.temperature_2m) ||
      !Array.isArray(h.precipitation_probability) ||
      !Array.isArray(h.weather_code)
    ) {
      throw new Error(`Open-Meteo location ${i} is missing hourly series`);
    }
    return {
      time: h.time,
      temperature_2m: h.temperature_2m,
      precipitation_probability: h.precipitation_probability,
      weather_code: h.weather_code,
    };
  });
}

/** UTC calendar date (YYYY-MM-DD) for an epoch ms. */
function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface WeatherBadgeResult {
  /** Events selected for badging (outdoor channel, coords, within the
   *  window). Excludes rows refused at the MAX_WEATHER_CELLS cap, which are
   *  logged separately. */
  eligible: number;
  /** Events that actually received a `weather` field. */
  badged: number;
  /** Distinct grid cells requested. */
  cells: number;
}

/**
 * Stamp `weather` onto every badge-eligible events-index row. One batched
 * Open-Meteo request covers all rows. Returns counts for the build log, or
 * null when nothing was badged (no eligible events, fetch failed, or the
 * response was malformed). Never throws.
 *
 * `asOf` is taken from the fetch-cache entry's `fetchedAt` when a cache is
 * injected — a cache hit reports the true (older) forecast time rather than
 * masquerading as fresh. The client suppresses badges whose `asOf` is too old.
 */
export async function applyWeatherBadges(
  rows: WeatherIndexRow[],
  opts: {
    isOutdoorChannel: (icsUrl: string) => boolean;
    fetchFn: FetchFn;
    nowMs: number;
    temperatureUnit: TemperatureUnit;
  },
): Promise<WeatherBadgeResult | null> {
  try {
    const windowMs = WEATHER_WINDOW_DAYS * 24 * 3_600_000;
    // Match the index's own past-event grace: an event that ended within the
    // last day is still displayed, so badge it.
    const graceMs = PAST_EVENT_GRACE_HOURS * 3_600_000;

    const eligible: Array<{ row: WeatherIndexRow; cellKey: string; startMs: number; endMs: number }> = [];
    const cellKeys = new Set<string>();
    let droppedCellRows = 0;

    for (const row of rows) {
      if (row.lat === undefined || row.lng === undefined) continue;
      if (!opts.isOutdoorChannel(row.icsUrl)) continue;
      const startMs = parseIndexInstant(row.date);
      if (Number.isNaN(startMs)) continue;
      const endParsed = parseIndexInstant(row.endDate);
      const endMs = Number.isNaN(endParsed) ? startMs : endParsed;
      if (startMs - opts.nowMs > windowMs) continue; // too far out — no badge
      if (Math.max(startMs, endMs) < opts.nowMs - graceMs) continue; // already over
      const cellKey = cellKeyFor(row.lat, row.lng);
      if (!cellKeys.has(cellKey) && cellKeys.size >= MAX_WEATHER_CELLS) {
        droppedCellRows++;
        continue;
      }
      cellKeys.add(cellKey);
      eligible.push({ row, cellKey, startMs, endMs });
    }

    if (droppedCellRows > 0) {
      console.warn(
        `[weather] Cell cap (${MAX_WEATHER_CELLS}) reached — ${droppedCellRows} eligible event(s) left unbadged`,
      );
    }
    if (eligible.length === 0) return null;

    const sortedCells = [...cellKeys].sort();
    const url = buildForecastUrl(sortedCells, {
      temperatureUnit: opts.temperatureUnit,
      startDate: utcDate(opts.nowMs),
      endDate: utcDate(opts.nowMs + windowMs),
    });

    const res = await opts.fetchFn(url);
    if (res.status < 200 || res.status >= 300) {
      console.warn(`[weather] Open-Meteo returned HTTP ${res.status} — events left unbadged`);
      return null;
    }
    const series = parseForecastResponse(await res.json(), sortedCells.length);
    const seriesByCell = new Map(sortedCells.map((key, i) => [key, series[i]]));

    // True forecast time: the cache entry's fetchedAt when the body came from
    // (or was just written to) the injected fetch cache; build time otherwise.
    const asOf =
      (getFetchCache() ? lookupAnyEntry(keyFor(url))?.fetchedAt : undefined) ??
      new Date(opts.nowMs).toISOString();

    let badged = 0;
    for (const { row, cellKey, startMs, endMs } of eligible) {
      const hourly = seriesByCell.get(cellKey);
      if (!hourly) continue;
      const agg = aggregateEventWindow(hourly, startMs, endMs);
      if (!agg) continue;
      row.weather = { ...agg, asOf, conf: confidenceForLead(startMs - opts.nowMs) };
      badged++;
    }
    return { eligible: eligible.length, badged, cells: sortedCells.length };
  } catch (err) {
    console.warn(
      `[weather] Forecast fetch/parse failed — events left unbadged: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
