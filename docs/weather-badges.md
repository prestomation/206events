# Weather Badges for Outdoor Events — Design

Status: **v1 implemented** (same PR as this design). Origin: `ideas.md` →
"Weather Badges for Outdoor Events" (PR #870).

Implementation map: `lib/weather.ts` (+ `lib/weather.test.ts`, fixture
`lib/weather-sample-data.json`), the badge pass in `lib/calendar_ripper.ts`
(after dedup, before index serialization), the curated `Outdoors` tag across
~30 source YAMLs + `TAG_CATEGORIES`, `city.config.ts` →
`weather.temperatureUnit`, and the UI in
`web/src/redesign/weatherModel.js` / `WeatherBadge` in `atoms.jsx`
(e2e: `web/e2e/weather.spec.js`). The v2 per-event `setting` overlay and the
ensemble-confidence upgrade remain future work.

## Summary

Badge outdoor events happening in the next 7 days with the expected weather
(icon, temperature, precipitation chance), fetched **at build time** so no
visitor data ever reaches a weather provider. The badge is honest about being
a forecast: it always carries an as-of timestamp and a confidence level
derived from forecast lead time, following the same philosophy as the event
uncertainty system — never publish a guess that looks like a fact.

## Goals

- A user scanning the Discover list or an event page sees at a glance whether
  Saturday's farmers market is looking sunny or soaked.
- Zero privacy cost: no browser request to any third party (checklist item 1
  of "Privacy & Consent by Design" in AGENTS.md).
- Near-zero build cost: one cached HTTP request per build, no API key, no new
  secret.
- Honest presentation: probabilistic wording, as-of stamp, confidence tier,
  and no badge at all when we can't stand behind the forecast.

## Non-goals

- Weather in the ICS feeds. Calendar apps cache subscribed feeds for hours or
  days on their own schedule; a forecast baked into an event description goes
  stale invisibly and reads as fact. Weather is a **web-UI-only** overlay.
- Severe-weather alerting, historical weather, or "this event may be
  cancelled" inference. Out of scope.
- Badging indoor events ("nice day to be inside") — noise.

## Architectural constraints this design lives inside

1. **Privacy**: the fetch must be server-side (CI runner), never from the
   visitor's browser. A client-side call to a weather API would leak visitor
   IPs to a third party and is rejected outright.
2. **Build cadence**: the main build runs daily at 00:00 UTC
   (`publish_calendars.yml`) *plus* on every push to `main` — which, given the
   automated source/resolver PR flow, is typically several times a day. So
   "build-time freshness" in practice means a forecast a few hours old, worst
   case ~24h.
3. **Reporting parity**: any *new* error category must be plumbed through all
   five reporting surfaces in one PR. This design deliberately avoids creating
   one (see "Failure modes").
4. **Template city**: nothing may hardcode Seattle. Location comes from event
   coordinates and `city.config.ts`; the timezone from the source config.
5. **UI rule**: the badge is a `web/src/**` change, so the implementing PR
   must ship a Playwright e2e spec plus committed screenshots embedded in the
   PR body.

---

## Decision 1: Weather data provider

| Option | Key? | Coverage | Horizon | Confidence signal | Notes |
|---|---|---|---|---|---|
| **Open-Meteo** (recommended) | none | global | hourly, up to 16 days | `precipitation_probability` per hour; separate **ensemble API** (multi-member spread) available later | Free for non-commercial use (10k calls/day — we need ~1/build). Single call, batched multi-location. Requires attribution (CC-BY 4.0 data) — a single "Weather forecasts by Open-Meteo" credit on the You tab (not in every badge popup, which would be noisy). |
| NWS `api.weather.gov` | none (User-Agent header required) | US only | hourly, ~7 days | PoP per period | Authoritative US source, public domain (no attribution). Two-step dance per location (`/points` → `/gridpoints/{wfo}/{x},{y}/forecast/hourly`), one request per gridpoint, known flakiness, and **breaks the city template** for any non-US copy. |
| OpenWeatherMap / Pirate Weather / Tomorrow.io | API key | global | varies | varies | Needs a repo secret + `.env.example` + workflow wiring for no benefit over the keyless options. Rejected. |

**Recommendation: Open-Meteo.** One batched keyless request covers every
location we care about, it works for template-city copies anywhere in the
world, and its ensemble API gives us a real (model-spread) confidence upgrade
path. NWS remains a documented fallback if Open-Meteo's non-commercial terms
ever become a problem; the provider is isolated behind a small module
(`lib/weather.ts`) so swapping is a contained change.

Sources: [Open-Meteo docs](https://open-meteo.com/en/docs),
[Open-Meteo pricing/terms](https://open-meteo.com/en/pricing),
[NWS API FAQ](https://weather-gov.github.io/api/general-faqs),
[NWS gridpoint FAQ](https://weather-gov.github.io/api/gridpoints).

## Decision 2: Fetch topology — how few requests can we get away with?

Seattle has genuine microclimates (convergence zone, rain shadow), so a single
city-centroid forecast is tempting but occasionally *wrong in the way that
erodes trust* (sun badge in Ballard while it pours in Issaquah). Options:

- **(a) Single point** — city centroid from `city.config.ts`. 1 location.
  Cheapest; ignores microclimates across a metro that spans ~50 km.
- **(b) Grid cells (recommended)** — snap each badge-eligible event's
  `lat`/`lng` to a ~0.05° (~5 km) cell; fetch one forecast per distinct
  occupied cell. Open-Meteo accepts comma-separated `latitude=…&longitude=…`
  lists, so *all cells still go out as one HTTP request*. Expect ~10–30 cells.
- **(c) Per-venue** — needless precision; forecast models don't resolve below
  ~2 km anyway.

**Recommendation: (b).** It costs the same one request as (a) and matches the
underlying model resolution. The cell snap is a pure function in
`lib/weather.ts` with unit tests.

### Caching, freshness, and efficiency

Route the request through the existing fetch cache (`withCache` /
`lib/fetch-cache.ts`) like every other source fetch:

- **At most one live fetch per TTL window** regardless of how many builds run;
  every build re-derives badges from the cached body. PR-preview builds read
  main's warm cache and never write — previews get weather for free with no
  extra API traffic.
- **Stale-serve resilience for free**: if Open-Meteo is down, the cache serves
  the last good copy and records a `proxyStaleServes` entry — an existing,
  fully-plumbed reporting category.
- **Cache key must include a date bucket.** The forecast URL is otherwise
  constant, and a constant URL would pin one forecast for the full TTL/prune
  window. Including the UTC date (e.g. `&_day=2026-07-07`) in the request URL
  gives a fresh fetch on the first build of each day and cache hits for the
  rest — aligned with the daily cron. (Alternative: a per-call TTL override in
  `withCache`; the URL bucket avoids touching cache infrastructure.) One
  nuance: PR-preview builds never *save* the cache, so if the first builds of
  a UTC day are previews, each repeats the live fetch until a `main` build
  saves the day's entry — still one request per build, trivially within
  budget.

Worst-case staleness is therefore ~24h + build interval. That is acceptable
**only because** the badge displays its as-of time and the client suppresses
badges whose forecast is too old (see "Staleness guard"). If daily proves too
stale in practice (it shouldn't — day-ahead PoP doesn't swing that fast), the
upgrade path is a tiny scheduled workflow that refreshes a standalone
`weather.json` without a full build (see Decision 3's option B).

## Decision 3: Where the weather data lives

- **(A) Bake per-event `weather` onto `events-index.json` rows (recommended
  for v1).** The index builder (`lib/calendar_ripper.ts`, where `cost` /
  `uncertainty` are conditionally spread) already has everything needed per
  event: `lat`, `lng`, `date`, `endDate`, and the channel's tags via config.
  The UI renders the badge from data it already loads — no new fetch, no join
  logic, works in `events-index-soon.json` and the ndjson stream identically.
- **(B) Standalone `output/weather.json`** keyed by grid cell + hour; client
  joins by event coordinate and start time. Fresher (refreshable by a
  lightweight weather-only job) and keeps the index untouched, but adds a
  client-side join, a new discovery-API file (index.json link +
  `check-discovery-api` / `check-missing-urls` wiring), and duplicate
  cell-snap logic in the browser.
- **(C) Client fetches the weather API directly** — rejected; violates the
  privacy checklist (third-party request with visitor IP).

**Recommendation: A now, B only if observed staleness ever justifies it.**
Design the per-event field so B can be layered in later without breaking the
badge component (the component consumes a resolved `weather` object; where it
came from is invisible to it).

### Per-event schema (compact keys — the index ships to every visitor)

```jsonc
// present only on badge-eligible events (outdoor + starts within 7 days)
"weather": {
  "hi": 74,             // max temp over the event window (display units per city config — unit-neutral keys so °C template cities aren't shipping Celsius in a key named "F")
  "lo": 61,             // min temp over the event window
  "pop": 30,            // max precipitation probability (%) over the window
  "code": 3,            // dominant WMO weather code over the window (icon lookup)
  "asOf": "2026-07-07T00:14:00Z",  // forecast fetch time
  "conf": "high"        // "high" | "medium" | "low" — see Decision 5
}
```

Only outdoor events within the badge window carry the field — on the order of
a few hundred events × ~70 bytes, negligible against the index size.

## Decision 4: Which events are "outdoor"?

The hardest accuracy problem is not the forecast — it's knowing which events
are actually outside. **A weather badge on an indoor event is worse than no
badge**, so precision beats recall at every stage. No `Outdoors` tag exists
today. Options, staged rather than exclusive:

- **(v1) Curated source-level `Outdoors` tag.** Add `"Outdoors"` to the
  `tags:` list of sources that are unambiguously open-air: farmers markets,
  parks sources (`waterfront_park`, `volunteer_park_trust`,
  `seattle-gov-parks-recreation`, …), gardens, outdoor cinema
  (`marymoor_movies`), cycling/running events, GreenStage, etc. (~15–25
  sources). Zero new schema; tags already flow to the UI via the manifest;
  and it produces a `tag-outdoors.ics` aggregate calendar as a free
  user-facing feature (register it under an appropriate `TAG_CATEGORIES`
  group). Badge eligibility = channel has `Outdoors` tag.
  - The tag rename/addition creates a **new** URL, not a removal — no
    `allowed-removals/` entry needed.
- **(v2) Per-event `setting` via the established cache-overlay pattern.**
  Mixed venues (a park's indoor classroom program; a brewery with a beer
  garden) and aggregator sources need per-event resolution. This is exactly
  the "pervasively missing field" flavor from AGENTS.md: extend the
  event-uncertainty-cache with a `setting` field (`outdoor` / `indoor` /
  `covered`), an overlay in `lib/uncertainty-merge.ts` that never overwrites a
  ripper-provided value, a non-fatal gap queue, and a resolver skill — the
  same triad as photos/costs. Per-event `setting: outdoor` adds badges on
  aggregator events; `setting: indoor` *removes* the badge from an
  Outdoors-tagged source's indoor event. This stage is also where the
  "Per-Event Category Tags" idea (same `ideas.md` batch) would land — they
  should share the classification pass if both get built.
- **(rejected) Keyword heuristics** ("outdoor", "hike", "market" in titles) —
  silently mislabels in both directions with no resolution path; contradicts
  the uncertainty-system design rule that unparsable data gets an explicit
  gap, not a guess.

## Decision 5: Accuracy and confidence — what we show and when

### Badge window: 7 days

Hourly forecasts are meaningfully skillful out to about a week; beyond that
Open-Meteo will happily return numbers, but showing them would be exactly the
"guess that looks like a fact" this repo refuses to publish. Events more than
7 days out get **no badge** — absence is the designed state, not a failure.

### Matching forecast to event window

Aggregate the hourly series from event start to `min(end, start + 6h)` (cap so
an all-day festival doesn't average in overnight hours): `pop` = max hourly
precipitation probability, `hi`/`lo` = temp extremes, `code` = the
worst-weather WMO code in the window (precipitation codes outrank cloud codes
outrank clear — a picnic that's sunny at 2pm and thundery at 4pm badges as
thunder). Pure function, heavily unit-tested against a fixture
(`sample-data.json` from a real Open-Meteo response, per repo test rules).

### Confidence tiers (lead time)

Forecast skill decays with lead time in a well-understood way. v1 encodes that
as a static tier on the badge:

| Lead time to event start | `conf` | Presentation |
|---|---|---|
| < 72h | `high` | full badge (icon + temp + PoP when ≥ 20%) |
| 3–5 days | `medium` | full badge; popup notes "outlook — check closer to the date" |
| 6–7 days | `low` | tempered badge (icon + temp only, PoP shown as wording: "rain possible"); popup states low confidence explicitly |

Two things make this honest rather than decorative:

1. **PoP is already a probability** — always render it as "30% chance of
   rain", never "rain". The badge never asserts weather; it reports odds.
2. **The popup carries the receipts**: as-of timestamp, lead time, confidence
   tier. Copy the `UncertaintyBadge` popup pattern
   (`web/src/redesign/atoms.jsx`) so the interaction is consistent with how
   the site already discloses uncertain start times.

**v2 upgrade — measured confidence.** Open-Meteo's ensemble API returns
individual model members; member agreement (e.g. % of members within ±2 mm
precipitation) is a *real* confidence number instead of a lead-time proxy.
Deferred: it multiplies payload size and adds a second request, and lead-time
tiers are defensible and simple. The `conf` field's values don't change shape
when the computation improves — UI is insulated.

### Staleness guard (client-side)

The badge component compares `asOf` against the browser's current time:

- older than **30h** → render the popup's as-of line in a warning state;
- older than **48h** → don't render the badge at all (builds have stalled;
  a two-day-old forecast presented as current is misinformation).

This means a frozen pipeline degrades to "no weather" instead of "wrong
weather", with no server-side coordination.

### Notability threshold (list rows)

Two presentation options considered:

- Badge **every** eligible event (sun included) — a "72° and sunny" badge is
  genuinely useful for an outdoor event, and uniform presence teaches users
  the feature exists.
- Badge only **notable** weather (PoP ≥ 40%, temp ≤ 40°F / ≥ 90°F, snow,
  strong wind) — less visual noise on dense list rows.

(Note: this 40% *notability* threshold is a different knob from the 20%
*display* threshold in the confidence-tier table — the latter decides when a
PoP number is worth printing on a badge, the former whether weather is
attention-worthy at all.)

**Recommendation:** compact icon-only badge on list rows for all eligible
events, full badge (icon + temp + PoP) on the event detail view. Revisit after
seeing it on real data — this is a pure-presentation knob with no pipeline
impact.

## Failure modes and reporting

Designed so that **no new build-errors category is required** (avoiding the
five-surface parity tax):

| Failure | Behavior | Surfaced via |
|---|---|---|
| Open-Meteo down, warm cache | stale forecast served, badges still render with older `asOf` | existing `proxyStaleServes` (fetch cache) |
| Open-Meteo down, cold cache | build proceeds; no events get `weather`; badges absent | build log line only — badge absence is a legal state |
| Malformed response | `lib/weather.ts` returns no data (never throws into the build); badges absent | build log line |
| Pipeline stalls > 48h | client staleness guard suppresses badges | self-healing, no report |

The one thing to watch: if badge absence ever needs *monitoring* (e.g. "weather
has been missing for a week and nobody noticed"), that's the moment to add a
proper non-fatal counter — and pay the full reporting-parity cost in that PR.

## Template-city compatibility

- Forecast locations derive from event coordinates and fall back to the
  city centroid in `city.config.ts` — no Seattle literals.
- Display units (°F/°C) become a `city.config.ts` field (default imperial for
  the reference instance); Open-Meteo serves either natively.
- Open-Meteo is global, so copies outside the US work unchanged (this is a
  concrete reason it beats NWS for the default provider).

## Implementation sketch (for the eventual implementation PRs)

1. **`lib/weather.ts`** — cell snapping, batched Open-Meteo URL construction
   (date-bucketed), response parsing, per-event window aggregation, confidence
   tiering. Pure functions + `lib/weather.test.ts` with a committed
   `sample-data.json` fixture (scrubbed per fixture rules — Open-Meteo has no
   keys to leak, but follow the checklist anyway).
2. **`lib/calendar_ripper.ts`** — after coords are attached and overlays run:
   collect badge-eligible events (channel tagged `Outdoors`, start ≤ 7 days),
   one `withCache`d fetch, stamp `weather` onto index rows next to where
   `cost`/`uncertainty` are spread.
3. **Source YAML pass** — add `"Outdoors"` tag to the curated source list;
   register the tag in `TAG_CATEGORIES`.
4. **Web UI** — `WeatherBadge` atom modeled on `UncertaintyBadge` (compact
   mark on list rows, full chip + popup on detail); WMO-code → icon map
   (self-hosted glyphs/emoji — no third-party icon CDN, per privacy rules);
   staleness guard; a single Open-Meteo credit on the You tab. Playwright spec in
   `web/e2e/weather.spec.js` with mocked index fixtures covering each
   confidence tier + the staleness-suppression path, and committed screenshots
   embedded in the PR body.
5. **Docs** — update this doc's status; note the posture (build-time fetch, no
   visitor disclosure) in `docs/privacy-and-consent.md` in the same PR.

(v1 shipped steps 1–5 in one PR alongside this design. Feature work →
**manual merge** per the auto-merge table.)

## Phasing

| Phase | Contents |
|---|---|
| v1 | Curated `Outdoors` tag, one batched Open-Meteo fetch through the fetch cache, per-event `weather` on the index, lead-time confidence tiers, badge UI + e2e |
| v2 | Per-event `setting` overlay (cache + gap queue + resolver skill) for mixed venues and aggregators; shared with per-event category classification if that idea proceeds |
| Later, only if warranted | Standalone `weather.json` + weather-only refresh job (staleness); ensemble-spread confidence; notability-threshold tuning |

## Open questions (for the human owner)

1. Is Open-Meteo's non-commercial tier acceptable long-term, or is the
   public-domain NWS API preferred for the reference instance despite the
   per-gridpoint request pattern and US-only coverage?
2. Should "72° and sunny" badge positively on list rows, or only notable
   (rain/heat/snow) weather? (Recommendation: icon-only on rows, revisit.)
3. Does the `Outdoors` tag warrant a sidebar category of its own, or should it
   join an existing `TAG_CATEGORIES` group?
