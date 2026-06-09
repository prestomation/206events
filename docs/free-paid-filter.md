# Free vs. Paid Events Filter

Design for a web-UI filter that lets a user narrow the event list to
free or paid events (user request: issue #572).

## The core problem

Nothing in the pipeline carries price data today. `RipperCalendarEvent`
has no cost field, no source YAML schema declares one, and the only
price information anywhere is Ticketmaster's `priceRanges`, which is
flattened into description text. So this feature is mostly a
data-plumbing problem, and the honest data model is **tri-state**:

- `free` — confirmed free
- `paid` — confirmed ticketed/paid
- *(absent)* — unknown

Unknown is the majority on day one. The design embraces that rather
than guessing: per AGENTS.md → "Designing new features: uncertainty is
the default pattern for unparsable data", unknown cost is a
**pervasively-missing field**, so it follows the cache-overlay + gap-queue
flavor of the uncertainty system (the `imageUrl`/`photoGaps` pattern),
and the LLM-powered resolver drains the unknowns across builds.

## Data model

- Add `cost?: 'free' | 'paid'` to `RipperCalendarEvent`
  (`lib/config/schema.ts`). Absent = unknown. No price amounts in v1 —
  just the binary the filter needs.
- Add an optional `cost: free | paid` field to the source-level
  schemas — ripper config, per-calendar config, external calendar
  YAML, and recurring event YAML — acting as a **default applied to
  all of that source's events**. Many curated sources are inherently
  free (farmers markets, art walks, `free-first-thursday`); this buys
  meaningful coverage without touching ripper code.

Precedence (highest wins): per-event ripper-parsed value → uncertainty-
cache resolution (overlay never overwrites) → source-level YAML default.

## Population

### Structured extraction (bulk coverage)

| Source | Signal |
|---|---|
| Ticketmaster (`lib/config/ticketmaster.ts`) | only when `priceRanges?.length` (the existing guard for the description line): `min === 0` → free, `> 0` → paid; otherwise cost stays unknown |
| Eventbrite (`lib/config/eventbrite.ts`) | v3 API event `is_free` boolean |
| DICE (`lib/config/dice.ts`) | ticket/price data on the events API response (confirm exact field against `sample-data.json` before implementing) |
| Recurring / external YAML | source-level `cost: free` annotations on the obviously-free sources |

### Text heuristics — deliberately out of scope for v1

Classifying "free" from summary/description text ("kids free", "free
parking", "gluten-free") risks publishing a guess that looks like a
fact — exactly what the uncertainty system exists to avoid. If ever
added, it must be allowlist-conservative ("free admission", "free
entry", title beginning "Free"). Prefer the resolver below.

### LLM resolution (the long tail)

Cost becomes a resolvable field in the existing
`event-uncertainty-cache.json` (keyed `source:eventId` — no new cache).
Per the "Future fields" checklist in `docs/event-uncertainty.md`:

1. Add `cost` to `UncertaintyField` in `lib/config/schema.ts`.
2. Teach `applyResolution` in `lib/uncertainty-merge.ts` to apply
   `fields.cost`.
3. Add `--cost free|paid` to
   `skills/event-uncertainty-resolver/scripts/uncertainty-cache.py`.
4. Document the field in the resolver SKILL.md field table.

Because cost is pervasively missing, rippers do **not** emit an
`UncertaintyError` per costless event (that would drown the
start-time queue). Instead, mirror the photo pipeline:

- **Overlay**: `applyCostBackfill` in `lib/uncertainty-merge.ts`,
  modeled on `applyImageBackfill` — fills `cost` from the cache for
  events that lack one, never overwrites a ripper-provided value,
  skips `unresolvable` entries ("pricing genuinely not published").
- **Gap queue**: `costGaps` + `costStats` in `build-errors.json`,
  built in `lib/discovery.ts` mirroring `buildPhotoGaps`. Non-fatal
  (not counted in `totalErrors`, like `photoGaps`/`osmGaps`);
  self-limiting as the cache fills.
- **Resolver skill**: `skills/cost-resolver/` mirroring
  `skills/photo-resolver/` — reads `costGaps`, processes a bounded
  batch per run: WebFetch the event URL, read the pricing ("Free",
  "$15 adv", "donations welcome"), write `--cost` resolutions or mark
  `unresolvable`.

**Invalidation:** prices change ("free" shows become ticketed).
Resolutions should carry a `partialFingerprint` wherever the ripper
parsed anything price-adjacent — hash the raw price signal itself, e.g.
the serialized `priceRanges` array for Ticketmaster or the `is_free`
value for Eventbrite, so any upstream price change (not just a change
to the derived min) invalidates the cached resolution. (For structured
sources this is belt-and-suspenders: the ripper-parsed value wins over
the cache anyway, so fingerprints chiefly protect resolver-written
entries for long-tail sources.) The existing `lastSeen` pruning keeps
dead entries from accumulating.

**Prerequisite:** stable event IDs (AGENTS.md → "Ripper Design: Stable
Event IDs") for any source whose cost is cache-resolved.

## Plumbing

- `events-index.json`: add `cost` to the entry shape in
  `lib/calendar_ripper.ts`, emitted only when defined (respects the
  index size budget).
- **ICS output: none in v1.** There is no standard iCalendar price
  property and the filter reads `events-index.json`. An `X-` property
  can follow later if feed subscribers want it.
- **Reporting parity:** `costGaps`/`costStats` is a new
  `build-errors.json` section and MUST be plumbed through all five
  surfaces in the same PR — PR preview comment, GH step summary,
  Discord notification, web HealthDashboard, and the build-report
  skill handoff.

## UI

- In the redesign UI (`web/src/redesign/`), add a **Cost** filter next
  to the Category and Neighborhood `FilterDropdown`s in `views.jsx`:
  **All** (default) / **Free** / **Paid**.
- Strict semantics: "Free" shows only `cost === 'free'`, "Paid" only
  `cost === 'paid'`; unknown events appear only under "All". Show a
  small caption while a cost filter is active — "showing only events
  confirmed as free" / "…confirmed as paid" — so it's clear the filter
  is strict, coverage is incomplete, and the shrunken list isn't a bug.
- Filtering logic in `filterDiscoverEvents` (`viewModels.js`), tests in
  `viewModels.test.js`. Cost is an *event*-level filter — channels pass
  through unfiltered (unlike category/neighborhood, which are
  tag-based and apply to channels too).
- Persist the selection in the URL hash alongside category/neighborhood
  (`urlHash.js` / `useUrlState.js`).
- **Favorites parity rule is not triggered**: Discover filters are
  client-only and are not part of a list's `searchFilters`/`geoFilters`,
  so the Cloudflare worker is unchanged. If cost ever becomes a
  favorites-list filter, that is a parity-bound change to both
  `infra/favorites-worker/src/feed.ts` and `web/src/App.jsx` in one PR.

If sparse initial "paid" coverage makes a three-way filter confusing, a
defensible v1 ships only a **"Free events" toggle**, with "Paid" added
once Ticketmaster/Eventbrite/DICE coverage proves out.

## Sequencing

| PR | Contents | Merge policy |
|---|---|---|
| 1 | `cost` on `RipperCalendarEvent` + YAML `cost:` on all source schemas + structured extraction (TM/Eventbrite/DICE) + `events-index.json` plumbing | Manual (schema change) |
| 2 | Uncertainty plumbing: `UncertaintyField`, `applyCostBackfill`, `costGaps` queue + all five reporting surfaces + `cost-resolver` skill | Manual (new error category/counters) |
| 3 | Annotate inherently-free recurring/external sources with `cost: free` | Auto-merge OK (housekeeping) |
| 4 | UI filter + viewModels tests | Manual (UI feature) |

## Open questions

- Three-way filter vs. free-only toggle in v1 (see UI section).
- Whether DICE's API price data is reliable enough to classify, or
  DICE events start as unknown and flow through the resolver. Resolve
  during PR 1: fetch live DICE sample data, confirm the field exists
  and is populated reliably, and only then wire the classification —
  otherwise ship DICE as unknown.
- Whether "donation suggested" / "pay what you can" maps to `free`,
  `paid`, or stays unknown — recommend `free` (no payment required to
  attend) with the nuance left in the description, but confirm before
  PR 2 bakes it into resolver guidance.
