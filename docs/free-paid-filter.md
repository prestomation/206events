# Free vs. Paid Events Filter

Design for a web-UI filter that lets a user narrow the event list by
cost (user request: issue #572). Supersedes the earlier binary
free/paid design (#578) with a numeric "starting at" cost model.

## The core problem

Nothing in the pipeline carries price data today. `RipperCalendarEvent`
has no cost field, no source YAML schema declares one, and the only
price information anywhere is Ticketmaster's `priceRanges`, which is
flattened into description text. So this feature is mostly a
data-plumbing problem, and the honest data model keeps three top-level
states:

- **known cost** — including `0` for free
- **paid, amount unknown** — the page says "ticketed" but posts no price
- *(absent)* — fully unknown

Unknown is the majority on day one. The design embraces that rather
than guessing: per AGENTS.md → "Designing new features: uncertainty is
the default pattern for unparsable data", unknown cost is a
**pervasively-missing field**, so it follows the cache-overlay + gap-queue
flavor of the uncertainty system (the `imageUrl`/`photoGaps` pattern),
and the LLM-powered resolver drains the unknowns across builds.

## Data model

Add an optional `cost` field to `RipperCalendarEvent`
(`lib/config/schema.ts`):

```ts
cost?: { min: number; max?: number }  // min 0 = free
     | { paid: true }                 // ticketed, amount unknown
```

- `min` is the **"starting at" price** — the cheapest general-admission
  ticket. `min: 0` means free. A "$10 and $100 tickets" event is
  `{ min: 10, max: 100 }`.
- `max` is kept when the source provides it (Ticketmaster does, for
  free): filtering and any future sorting use `min` only, but display
  shows "From $10" when `max` differs — real information for a user
  deciding whether to click, at zero extra cost.
- `{ paid: true }` preserves the one bit the feature was asked for
  ("it's *not* free") when a page confirms tickets but posts no price
  ("price TBA"). Without it, those events would collapse into fully
  unknown.
- Dollars as a decimal number ($12.50 exists). **USD assumed** —
  Seattle-only site, no currency field in v1.

Source-level YAML default: add an optional `cost:` field to the ripper
config, per-calendar config, external calendar YAML, and recurring
event YAML — a default applied to all of that source's events. YAML
accepts `cost: free` (sugar for `{ min: 0 }`) or a number (the min), so
recurring farmers markets don't have to write structured objects. Many
curated sources are inherently free (farmers markets, art walks,
`free-first-thursday`); this buys meaningful coverage without touching
ripper code.

Precedence (highest wins): per-event ripper-parsed value → uncertainty-
cache resolution (overlay never overwrites) → source-level YAML default.

## Pricing rubric

These judgment calls apply everywhere a cost is derived — ripper code,
YAML annotations, and especially the resolver skill, whose SKILL.md
must embed this rubric verbatim so hundreds of LLM page-reads stay
consistent. The governing rule: **`min` = the least a general-admission
adult can pay and still get in.**

| Situation | Ruling |
|---|---|
| Suggested donation / pay-what-you-can / NOTAFLOF ("no one turned away for lack of funds") | free (`min: 0`); the suggested amount stays in the description |
| Sliding scale "$5–25" | `min: 5` (unless NOTAFLOF is stated → `0`) |
| "Free for members, $15 general" | anchor on **general-admission adult**: `min: 15`; member, child, senior, and student tiers are ignored |
| "$10 advance / $15 door" | advance price: `min: 10` |
| Free entry, paid activities inside (festivals, markets) | cost = cost to walk in = free |
| Ticketing fees | excluded — face value only (matches Ticketmaster `priceRanges` semantics); document so "From $10" + $8 fees isn't reported as a data bug |
| Page confirms tickets but no price posted ("ticketed", "price TBA") | `{ paid: true }` |
| Pricing looks volatile or ambiguous | resolver should prefer `{ paid: true }` over a precise number rather than record a guess |

## Population

### Structured extraction (bulk coverage)

| Source | Signal |
|---|---|
| Ticketmaster (`lib/config/ticketmaster.ts`) | only when `priceRanges?.length` (the existing guard for the description line): map `{min, max}` directly. **Sanity check**: a `min` of 0 alongside a large `max` from a structured source (occasional $0 platinum-row junk) should map to `{ paid: true }`, not free |
| Eventbrite (`lib/config/eventbrite.ts`) | `is_free` → `{ min: 0 }`; otherwise read `ticket_availability.minimum_ticket_price`, which requires adding `expand=ticket_availability` to the existing `expand=venue` API call — a fetch change, not just parsing; verify against live sample data in PR 1 |
| DICE (`lib/config/dice.ts`) | verify live DICE sample data in PR 1: confirm the price field exists and is populated reliably, and only then wire the classification — otherwise ship DICE as unknown |
| Recurring / external YAML | source-level `cost: free` (or a number) on the obviously-classifiable sources |

### Text heuristics — deliberately out of scope for v1

Classifying cost from summary/description text ("kids free", "free
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
   `fields.cost` (the structured object above).
3. Add CLI flags to
   `skills/event-uncertainty-resolver/scripts/uncertainty-cache.py`:
   `--cost-min <n>` (with optional `--cost-max <n>`), `--cost-free`
   (sugar for `--cost-min 0`), and `--cost-paid-unknown`.
4. Document the field shape and the pricing rubric in the resolver
   SKILL.md field table.

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
  batch per run: WebFetch the event URL, apply the pricing rubric,
  write `--cost-*` resolutions or mark `unresolvable`.

**Invalidation and staleness:** prices drift far more than free/paid
flips — $15 becomes $20 all the time, while free events rarely become
paid. Resolutions should carry a `partialFingerprint` wherever the
ripper parsed anything price-adjacent — hash the raw price signal
itself, e.g. the serialized `priceRanges` array for Ticketmaster or
the `is_free` value for Eventbrite, so any upstream price change (not
just a change to the derived min) invalidates the cached resolution.
(For structured sources this is belt-and-suspenders: the ripper-parsed
value wins over the cache anyway, so fingerprints chiefly protect
resolver-written entries for long-tail sources.) Resolver-written
prices for pages that don't get re-fetched will still drift; hedged
display ("From $10" rather than "$10") absorbs some of this, and the
rubric's "prefer `{ paid: true }` on volatile pages" rule limits the
exposure. The existing `lastSeen` pruning keeps dead entries from
accumulating.

**Prerequisite:** stable event IDs (AGENTS.md → "Ripper Design: Stable
Event IDs") for any source whose cost is cache-resolved.

## Plumbing

- `events-index.json`: add `cost` to the entry shape in
  `lib/calendar_ripper.ts`, emitted only when defined (respects the
  index size budget; the structured object is a few bytes per
  costed event).
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
  to the Category and Neighborhood `FilterDropdown`s in `views.jsx`.
  The numeric model enables **price buckets** rather than a binary
  toggle — e.g. **Any** (default) / **Free** / **≤ $10** / **≤ $25** —
  with exact boundaries decided in the UI PR.
- Strict semantics on `min`: "Free" = `min === 0`; a "≤ $N" bucket =
  `min <= N`; `{ paid: true }` events match only buckets that include
  paid-without-price (decide in the UI PR whether that's "Any" only).
  Fully-unknown events appear only under "Any". Show a small caption
  while a cost filter is active — "showing only events with confirmed
  pricing" — so it's clear the filter is strict, coverage is
  incomplete, and the shrunken list isn't a bug.
- Display derives one string from the object: "Free", "$10", or
  "From $10" (when `max` differs or the page said "starting at"), and
  "Ticketed" for `{ paid: true }`. Where cost appears (event cards,
  detail view, map popups) and whether sort-by-price ships are UI-PR
  decisions.
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

## Sequencing

| PR | Contents | Merge policy |
|---|---|---|
| 1 | `cost` on `RipperCalendarEvent` + YAML `cost:` on all source schemas + structured extraction (TM/Eventbrite/DICE, incl. the Eventbrite `expand=ticket_availability` fetch change and live sample-data verification) + `events-index.json` plumbing | Manual (schema change) |
| 2 | Uncertainty plumbing: `UncertaintyField`, `applyCostBackfill`, `costGaps` queue + all five reporting surfaces + `cost-resolver` skill with the pricing rubric | Manual (new error category/counters) |
| 3 | Annotate inherently-free recurring/external sources with `cost: free` | Auto-merge OK (housekeeping) |
| 4 | UI filter + viewModels tests | Manual (UI feature) |

## Open questions

- Price-bucket boundaries for the UI filter (Free / ≤$10 / ≤$25 / Any
  is a starting proposal), and which buckets `{ paid: true }` events
  match.
- Where cost displays (cards / detail / map popups) and whether
  sort-by-price is in scope for PR 4.
