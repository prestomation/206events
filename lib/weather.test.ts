import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  aggregateEventWindow,
  applyWeatherBadges,
  buildForecastUrl,
  cellKeyFor,
  codeRank,
  confidenceForLead,
  parseForecastResponse,
  parseIndexInstant,
  resolveEventSetting,
  EVENT_WINDOW_CAP_HOURS,
  MAX_WEATHER_CELLS,
  type HourlySeries,
  type WeatherIndexRow,
} from "./weather.js";
import { initFetchCache, resetFetchCache, emptyFetchCache } from "./fetch-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Real Open-Meteo response for two Seattle cells (47.60/-122.35, 47.55/-122.30),
// hourly temperature/PoP/weather-code, 2026-07-07 → 2026-07-14 UTC, unixtime.
// First hourly timestamp is 2026-07-07T00:00:00Z (1783382400).
const FIXTURE_PATH = join(__dirname, "weather-sample-data.json");
const FIXTURE_START_MS = 1783382400 * 1000;
const HOUR_MS = 3_600_000;

async function loadFixture(): Promise<unknown> {
  return JSON.parse(await readFile(FIXTURE_PATH, "utf-8"));
}

describe("parseIndexInstant", () => {
  it("parses js-joda toString output with bracketed zone", () => {
    const ms = parseIndexInstant("2026-07-07T19:00:00-07:00[America/Los_Angeles]");
    expect(ms).toBe(Date.parse("2026-07-08T02:00:00Z"));
  });

  it("returns NaN for missing or unparseable input", () => {
    expect(parseIndexInstant(undefined)).toBeNaN();
    expect(parseIndexInstant("not a date")).toBeNaN();
  });
});

describe("cellKeyFor", () => {
  it("snaps coordinates to the cell grid", () => {
    expect(cellKeyFor(47.612, -122.337)).toBe("47.60,-122.35");
    expect(cellKeyFor(47.626, -122.32)).toBe("47.65,-122.30");
  });

  it("maps nearby venues to the same cell", () => {
    expect(cellKeyFor(47.601, -122.351)).toBe(cellKeyFor(47.598, -122.349));
  });
});

describe("confidenceForLead", () => {
  it("tiers by lead time with contiguous boundaries", () => {
    expect(confidenceForLead(-2 * HOUR_MS)).toBe("high"); // already started
    expect(confidenceForLead(71 * HOUR_MS)).toBe("high");
    expect(confidenceForLead(72 * HOUR_MS)).toBe("medium");
    expect(confidenceForLead(143 * HOUR_MS)).toBe("medium");
    expect(confidenceForLead(144 * HOUR_MS)).toBe("low");
    expect(confidenceForLead(167 * HOUR_MS)).toBe("low");
  });
});

describe("codeRank", () => {
  it("orders thunder > snow > rain > drizzle > fog > cloud > clear", () => {
    expect(codeRank(95)).toBeGreaterThan(codeRank(71));
    expect(codeRank(71)).toBeGreaterThan(codeRank(61));
    expect(codeRank(61)).toBeGreaterThan(codeRank(51));
    expect(codeRank(51)).toBeGreaterThan(codeRank(45));
    expect(codeRank(45)).toBeGreaterThan(codeRank(3));
    expect(codeRank(3)).toBeGreaterThan(codeRank(1));
    expect(codeRank(1)).toBeGreaterThan(codeRank(0));
  });

  it("ranks freezing rain and showers with precipitation", () => {
    expect(codeRank(66)).toBeGreaterThan(codeRank(61));
    expect(codeRank(80)).toBe(codeRank(61));
  });
});

describe("aggregateEventWindow", () => {
  const series: HourlySeries = {
    // Hours 0..9 starting at t=0 for easy math.
    time: Array.from({ length: 10 }, (_, i) => i * 3600),
    temperature_2m: [50, 52, 54, 56, 58, 60, 62, 64, 66, 68],
    precipitation_probability: [0, 10, 40, 20, 0, 0, 0, 0, 90, 90],
    weather_code: [0, 2, 61, 3, 0, 0, 0, 0, 95, 95],
  };

  it("aggregates max/min temp, max pop, and worst code over the window", () => {
    // Event hours 1..3 (start 1h, end 4h): temps 52/54/56, pops 10/40/20, codes 2/61/3.
    const agg = aggregateEventWindow(series, 1 * HOUR_MS, 4 * HOUR_MS);
    expect(agg).toEqual({ hi: 56, lo: 52, pop: 40, code: 61 });
  });

  it("caps the window so a long event ignores hours past the cap", () => {
    // Event start 0h, end 10h — cap keeps hours 0..(cap-1); hour 8's
    // thunderstorm (rank above everything) must NOT leak in.
    const agg = aggregateEventWindow(series, 0, 10 * HOUR_MS);
    expect(EVENT_WINDOW_CAP_HOURS).toBeLessThanOrEqual(8);
    expect(agg?.code).not.toBe(95);
    expect(agg?.hi).toBe(series.temperature_2m[EVENT_WINDOW_CAP_HOURS - 1]);
  });

  it("treats a zero-length event as its starting hour", () => {
    const agg = aggregateEventWindow(series, 2 * HOUR_MS, 2 * HOUR_MS);
    expect(agg).toEqual({ hi: 54, lo: 54, pop: 40, code: 61 });
  });

  it("includes the partial hour containing the event start", () => {
    // Start 2.5h: hour 2 overlaps [2.5h, 3.5h).
    const agg = aggregateEventWindow(series, 2.5 * HOUR_MS, 3.5 * HOUR_MS);
    expect(agg?.pop).toBe(40);
  });

  it("returns undefined outside the forecast horizon", () => {
    expect(aggregateEventWindow(series, 100 * HOUR_MS, 101 * HOUR_MS)).toBeUndefined();
  });

  it("skips null samples and defaults pop to 0 when all pops are null", () => {
    const gappy: HourlySeries = {
      time: [0, 3600],
      temperature_2m: [null, 60],
      precipitation_probability: [null, null],
      weather_code: [null, 3],
    };
    expect(aggregateEventWindow(gappy, 0, 2 * HOUR_MS)).toEqual({ hi: 60, lo: 60, pop: 0, code: 3 });
  });

  it("returns undefined when the window has no usable temperature or code", () => {
    const empty: HourlySeries = {
      time: [0],
      temperature_2m: [null],
      precipitation_probability: [50],
      weather_code: [null],
    };
    expect(aggregateEventWindow(empty, 0, HOUR_MS)).toBeUndefined();
  });
});

describe("buildForecastUrl", () => {
  const opts = { temperatureUnit: "fahrenheit" as const, startDate: "2026-07-07", endDate: "2026-07-14" };

  it("is deterministic regardless of cell order (stable fetch-cache key)", () => {
    const a = buildForecastUrl(["47.60,-122.35", "47.55,-122.30"], opts);
    const b = buildForecastUrl(["47.55,-122.30", "47.60,-122.35"], opts);
    expect(a).toBe(b);
  });

  it("batches all cells into one URL with date-bucketed params", () => {
    const url = new URL(buildForecastUrl(["47.60,-122.35", "47.55,-122.30"], opts));
    expect(url.searchParams.get("latitude")).toBe("47.55,47.60");
    expect(url.searchParams.get("longitude")).toBe("-122.30,-122.35");
    expect(url.searchParams.get("start_date")).toBe("2026-07-07");
    expect(url.searchParams.get("end_date")).toBe("2026-07-14");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");
  });
});

describe("parseForecastResponse", () => {
  it("parses the real multi-location fixture in request order", async () => {
    const series = parseForecastResponse(await loadFixture(), 2);
    expect(series).toHaveLength(2);
    expect(series[0].time[0]).toBe(1783382400);
    expect(series[0].temperature_2m.length).toBe(series[0].time.length);
  });

  it("accepts a bare object for a single location", async () => {
    const fixture = (await loadFixture()) as unknown[];
    expect(parseForecastResponse(fixture[0], 1)).toHaveLength(1);
  });

  it("throws on location-count mismatch and missing series", async () => {
    const fixture = await loadFixture();
    expect(() => parseForecastResponse(fixture, 3)).toThrow(/expected 3/);
    expect(() => parseForecastResponse([{ hourly: { time: [] } }], 1)).toThrow(/missing hourly/);
  });
});

describe("applyWeatherBadges", () => {
  const NOW_MS = FIXTURE_START_MS; // 2026-07-07T00:00:00Z
  const settingFor = (row: WeatherIndexRow) => (row.icsUrl.startsWith("recurring-") ? "outdoor" as const : undefined);

  const fixtureFetch = (calls?: string[]) => (async (url: string | URL) => {
    calls?.push(String(url));
    return new Response(await readFile(FIXTURE_PATH, "utf-8"), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as (url: string | URL, init?: RequestInit) => Promise<Response>;

  // Rows use the two fixture cells: 47.60,-122.35 and 47.55,-122.30.
  const makeRows = (): WeatherIndexRow[] => [
    {
      // Outdoor, tomorrow 18:00–21:00 UTC → high confidence.
      icsUrl: "recurring-ballard-farmers-market.ics",
      date: "2026-07-08T18:00:00Z",
      endDate: "2026-07-08T21:00:00Z",
      lat: 47.601,
      lng: -122.351,
    },
    {
      // Outdoor, 4 days out → medium confidence, second cell.
      icsUrl: "recurring-fremont-sunday-market.ics",
      date: "2026-07-11T17:00:00Z",
      endDate: "2026-07-11T22:00:00Z",
      lat: 47.549,
      lng: -122.301,
    },
    {
      // Outdoor but beyond the 7-day window → no badge.
      icsUrl: "recurring-ballard-farmers-market.ics",
      date: "2026-07-19T18:00:00Z",
      lat: 47.601,
      lng: -122.351,
    },
    {
      // Indoor channel → never badged.
      icsUrl: "neumos-all.ics",
      date: "2026-07-08T19:00:00Z",
      lat: 47.601,
      lng: -122.351,
    },
    {
      // Outdoor but no coordinates → no badge.
      icsUrl: "recurring-ballard-farmers-market.ics",
      date: "2026-07-08T18:00:00Z",
    },
  ];

  beforeEach(() => resetFetchCache());
  afterEach(() => {
    resetFetchCache();
    vi.restoreAllMocks();
  });

  it("badges eligible rows with one batched fetch and leaves the rest untouched", async () => {
    const rows = makeRows();
    const calls: string[] = [];
    const result = await applyWeatherBadges(rows, {
      settingFor,
      fetchFn: fixtureFetch(calls),
      nowMs: NOW_MS,
      temperatureUnit: "fahrenheit",
    });

    expect(calls).toHaveLength(1); // one batched request for both cells
    expect(result).toEqual({ eligible: 2, badged: 2, cells: 2 });

    // Tomorrow's market: fixture hours 42–44 of cell 47.60,-122.35.
    const w = rows[0].weather!;
    expect(w.conf).toBe("high");
    expect(w.hi).toBeGreaterThan(w.lo - 1);
    expect(w.pop).toBeGreaterThanOrEqual(0);
    expect(typeof w.code).toBe("number");
    expect(Date.parse(w.asOf)).not.toBeNaN();

    expect(rows[1].weather?.conf).toBe("medium");
    expect(rows[2].weather).toBeUndefined();
    expect(rows[3].weather).toBeUndefined();
    expect(rows[4].weather).toBeUndefined();
  });

  it("returns null and leaves rows unbadged when the fetch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = makeRows();
    const result = await applyWeatherBadges(rows, {
      settingFor,
      fetchFn: async () => { throw new Error("network down"); },
      nowMs: NOW_MS,
      temperatureUnit: "fahrenheit",
    });
    expect(result).toBeNull();
    expect(rows.every(r => r.weather === undefined)).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("network down"));
  });

  it("returns null on a non-2xx response and on malformed bodies", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const badStatus = await applyWeatherBadges(makeRows(), {
      settingFor,
      fetchFn: async () => new Response("rate limited", { status: 429 }),
      nowMs: NOW_MS,
      temperatureUnit: "fahrenheit",
    });
    expect(badStatus).toBeNull();

    const badBody = await applyWeatherBadges(makeRows(), {
      settingFor,
      fetchFn: async () => new Response("{}", { status: 200 }),
      nowMs: NOW_MS,
      temperatureUnit: "fahrenheit",
    });
    expect(badBody).toBeNull();
  });

  it("returns null without fetching when no rows are eligible", async () => {
    const calls: string[] = [];
    const result = await applyWeatherBadges(
      [{ icsUrl: "neumos-all.ics", date: "2026-07-08T19:00:00Z", lat: 47.6, lng: -122.35 }],
      { settingFor, fetchFn: fixtureFetch(calls), nowMs: NOW_MS, temperatureUnit: "fahrenheit" },
    );
    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("stamps asOf from the fetch-cache entry when a cache is injected", async () => {
    initFetchCache(emptyFetchCache());
    const rows = makeRows();
    // Route the fixture fetch through the real cache wrapper so the entry's
    // fetchedAt (written at fetch time) becomes the badge's asOf.
    const { withCache } = await import("./config/proxy-fetch.js");
    const result = await applyWeatherBadges(rows, {
      settingFor,
      fetchFn: withCache(fixtureFetch()),
      nowMs: NOW_MS,
      temperatureUnit: "fahrenheit",
    });
    expect(result?.badged).toBe(2);
    // fetchedAt is stamped by the cache at real wall-clock time.
    expect(Math.abs(Date.parse(rows[0].weather!.asOf) - Date.now())).toBeLessThan(60_000);
  });

  it("caps distinct cells and logs the drop instead of failing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // One row per distinct cell, spread far apart — more than the cap.
    const rows: WeatherIndexRow[] = Array.from({ length: MAX_WEATHER_CELLS + 5 }, (_, i) => ({
      icsUrl: "recurring-x.ics",
      date: "2026-07-08T18:00:00Z",
      lat: 40 + i * 0.1,
      lng: -120,
    }));
    // The fetch would need MAX_WEATHER_CELLS locations; return a mismatched
    // body so the orchestrator bails after the cap logic (the cap is what's
    // under test, not the fetch).
    const result = await applyWeatherBadges(rows, {
      settingFor: () => "outdoor" as const,
      fetchFn: async () => new Response("[]", { status: 200 }),
      nowMs: NOW_MS,
      temperatureUnit: "fahrenheit",
    });
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Cell cap"));
  });
});

describe("resolveEventSetting", () => {
  const entry = (setting: "outdoor" | "indoor" | "covered") => ({
    fields: { setting }, resolvedAt: "2026-07-01", source: "agent" as const,
  });
  const cache = {
    version: 1,
    entries: {
      "venue:osm:way:123": entry("outdoor"),
      "venue:osm:node:99": entry("indoor"),
      "venue:loc:volunteer park amphitheater, seattle": entry("outdoor"),
      "venue:osm:way:777": { unresolvable: true, resolvedAt: "2026-07-01", source: "agent" as const },
    },
  };
  const outdoorIcsUrls = new Set(["recurring-ballard-farmers-market.ics"]);

  it("prefers the per-event setting over everything", () => {
    const s = resolveEventSetting(
      { icsUrl: "recurring-ballard-farmers-market.ics", setting: "indoor", osmType: "way", osmId: 123 },
      { cache, outdoorIcsUrls },
    );
    expect(s).toBe("indoor"); // beats both the outdoor venue and the Outdoors tag
  });

  it("resolves via the venue OSM key, overriding the channel tag", () => {
    const s = resolveEventSetting(
      { icsUrl: "recurring-ballard-farmers-market.ics", osmType: "node", osmId: 99 },
      { cache, outdoorIcsUrls },
    );
    expect(s).toBe("indoor"); // venue-level indoor beats the source Outdoors tag
  });

  it("falls back to the normalized-location venue key when there is no OSM id", () => {
    const s = resolveEventSetting(
      { icsUrl: "events12-seattle.ics", location: "Volunteer Park Amphitheater, Seattle" },
      { cache, outdoorIcsUrls },
    );
    expect(s).toBe("outdoor");
  });

  it("falls back to the Outdoors tag, and to undefined for unknown channels", () => {
    expect(resolveEventSetting(
      { icsUrl: "recurring-ballard-farmers-market.ics", location: "somewhere new" },
      { cache, outdoorIcsUrls },
    )).toBe("outdoor");
    expect(resolveEventSetting(
      { icsUrl: "neumos-all.ics", location: "somewhere new" },
      { cache, outdoorIcsUrls },
    )).toBeUndefined();
  });

  it("lets an unresolvable venue fall through to the channel tag", () => {
    expect(resolveEventSetting(
      { icsUrl: "recurring-ballard-farmers-market.ics", osmType: "way", osmId: 777 },
      { cache, outdoorIcsUrls },
    )).toBe("outdoor");
  });

  it("reports touched venue keys for lastSeen stamping", () => {
    const touched: string[] = [];
    resolveEventSetting(
      { icsUrl: "x.ics", osmType: "way", osmId: 123 },
      { cache, outdoorIcsUrls, touchedVenueKeys: touched },
    );
    expect(touched).toEqual(["venue:osm:way:123"]);
  });
});
