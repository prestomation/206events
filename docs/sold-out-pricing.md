# Sold-out as a price + the false-"Free" bug

Two related problems with how we report admission cost:

1. **Bug — sold-out Ticketmaster shows are reported as "Free."** A sold-out
   event whose price range collapses to `min: 0` is published with
   `cost: { min: 0 }`, which every surface renders as **Free** (green).
2. **Feature — there is no way to say "sold out."** A sold-out show is not
   free, not "ticketed, amount unknown," and not a price range. We have no
   representation for "you can't buy this," so the closest wrong answer
   ("Free") wins.

This doc covers both. Phase 1 is a self-contained bug fix; Phase 2 adds a
first-class sold-out state and is the feature the title refers to.

## The reported case

`https://206.events/#event=The+Crane+Wives...&q=Croc` — "The Crane Wives -
ACT II" at **The Crocodile** (a `type: ticketmaster` source). Live
`events-index.json` for both nights:

```json
{ "summary": "The Crane Wives - ACT II ...",
  "icsUrl": "crocodile-crocodile-main.ics",
  "cost": { "min": 0 } }
```

`{ min: 0 }` is the canonical representation of **free**
(`costLabel` → `'Free'`, `.ev-cost--free` green styling, counts toward
`costStats.freeEvents`). The same act listed by Showbox (a different ripper)
correctly carries `{ paid: true }`. Both Crocodile nights are sold out.

## Root cause (Phase 1 bug)

`lib/config/ticketmaster.ts` (cost derivation, ~lines 148-167):

```ts
if (range.min != null) {
    if (range.min === 0 && range.max > 0) {
        // junk data (hidden platinum/resale rows) — never free
        cost = { paid: true };
    } else {
        cost = { min: range.min, ...(range.max > range.min ? { max: range.max } : {}) };
    }
}
```

The guard only fires when `max > 0`. For a sold-out show Ticketmaster returns a
price range that collapses to `min: 0, max: 0` (or `max` null/≤ min), which
slips past the guard into the `else` branch and becomes `{ min: 0 }` = **Free**
— directly contradicting the file's own comment that *"Ticketmaster events are
never free."*

Blast radius (today, from live `events-index.json`): **4 events** across
Ticketmaster venues falsely marked Free — 2× Crocodile (The Crane Wives),
2× Tractor Tavern (White Denim, Black Joe Lewis). Of 313 Ticketmaster events:
105 priced, 5 paid-unknown, 199 no-cost, **4 falsely free**. Non-Ticketmaster
`{ min: 0 }` events (events12, breweries, libraries, food trucks, …) are
legitimately free and unaffected.

Because Ticketmaster cost is **ripper-parsed every build** (not cached — the
uncertainty cache only overlays events that *lack* cost), the next build after
the fix corrects all four automatically. No cache surgery, no
`allowed-removals`.

## Phase 1 — fix the false Free (standalone, auto-mergeable)

A Ticketmaster event is never free. Collapse the rule to: **any `min === 0`
becomes paid-unknown**, not just `min === 0 && max > 0`.

```ts
if (range.min != null) {
    if (range.min === 0) {
        // Ticketmaster events are never free. A $0 min is junk data
        // (hidden platinum/resale rows) or a sold-out range that has
        // collapsed to zero — treat as paid-unknown.
        cost = { paid: true };
    } else {
        cost = { min: range.min, ...(range.max != null && range.max > range.min ? { max: range.max } : {}) };
    }
}
```

Tests (`lib/config/ticketmaster.test.ts`) — add the cases the current suite
misses, which are exactly the bug:

- `priceRanges: [{ min: 0, max: 0 }]` → `{ paid: true }` (was `{ min: 0 }`)
- `priceRanges: [{ min: 0 }]` (no max) → `{ paid: true }`
- keep existing: `{ min: 0, max: 199 }` → `{ paid: true }`, `{ min: 25, max: 75 }`
  → `{ min: 25, max: 75 }`, etc.

This phase touches one ripper + its test → **auto-merge eligible** (bug fix to
an existing ripper). It can ship before, or independently of, Phase 2.

## Phase 2 — sold-out as a first-class state (the feature)

### Model

`EventCost` is a discriminated union (`lib/config/schema.ts:45-49`):

```ts
export type EventCost = { min: number; max?: number } | { paid: true };
```

Add a third member, mirroring the existing `{ paid: true }` precedent:

```ts
export type EventCost =
    | { min: number; max?: number }
    | { paid: true }
    | { soldOut: true };
```

**Why a union member and not an orthogonal `event.soldOut` flag.** The user's
framing ("add sold out as a 'price'") matches the union: sold-out is a terminal
admission state that supersedes price — you can't buy in at any number, so the
exact price is moot. This keeps one field (`cost`) as the single thing every
surface formats, exactly like `{ paid: true }` today, and needs no new
event-level field plumbed through `events-index.json`.

**Trade-off (call out for review):** a `{ soldOut: true }` event drops a
simultaneously-known price (e.g. "sold out, was $25"). If we later want
"Sold out · was $25," promote to an orthogonal flag
(`{ min: 25, soldOut: true }`) — a strictly larger change touching every
`costLabel`/filter/stats branch. Recommendation: start with the union member;
revisit only if the price-too signal is wanted.

### Detection (where `{ soldOut: true }` comes from)

| Source type | Signal | Notes |
|---|---|---|
| `ticketmaster` | `event.dates.status.code === 'offsale'` | Primary. The reported case. `offsale` also covers "sale ended"; for a *future* event that means sold out / unavailable, which is what we want to surface. Corroborated by the collapsed `min:0,max:0` range. |
| `dice` / `axs` / `eventbrite` | per-platform availability/`on_sale_status` | Out of MVP scope; add when those APIs are revisited. Field table in resolver docs makes this incremental. |
| manual / uncertainty cache | new `--cost-sold-out` flag | Lets the cost-resolver mark a known sold-out event (see below). |

MVP detection = Ticketmaster only. In `ticketmaster.ts`, after computing
`cost`, upgrade to sold-out when `status === 'offsale'`:

```ts
if (status === 'offsale') cost = { soldOut: true };
```

This subsumes the Phase 1 case for sold-out shows specifically, while Phase 1
still protects any `min:0` that isn't flagged `offsale`.

### Rendering (web UI — `web/src/redesign/`)

`costLabel` (`viewModels.js:285-292`) gains a branch:

```js
if (cost.soldOut) return 'Sold out'
```

- **List rows** (`atoms.jsx`, `views.jsx`): render in a `.ev-cost--soldout`
  span (muted/strikethrough, distinct from the green `--free`). New CSS var in
  `index.css` alongside `--free`.
- **Detail page** (`views.jsx:1013-1040`): "Sold out" with a sub-line and the
  existing "Check the event site" outbound link (resale/waitlist).
- **Cost filter** (`viewModels.js:267-280`, `eventMatchesCost`): sold-out
  matches only "Any" — never Free / "$10 or less" (strict on `min`, same as
  `{ paid: true }` today). Optionally add a "Hide sold out" toggle (stretch).

### Server/UI parity

`costLabel` lives only in the web UI, and the favorites Worker ICS feed does
not serialize cost, so the **Favorites Filter Parity Rule** is not triggered by
a render-only label. If a "hide sold out" *filter* is added, it must land in
both `feed.ts` and `App.jsx`/`viewModels.js` per that rule.

### Reporting parity

`EventCost` flows into `events-index.json` already, so no new serialization.
`costStats` (`calendar_ripper.ts:1975-1984`) **optionally** gains
`soldOutEvents`. Per the **Reporting Parity Rule**, *if* we add that counter we
must plumb it through all five surfaces (step summary, PR comment, Discord, web
health dashboard, build-report skill) in the same PR. Recommendation: **skip
the counter for MVP** — sold-out is not a build-health problem, and adding a
counter is pure overhead. Note it as a follow-up if product wants the metric.

### Resolver / cache

Add `--cost-sold-out` to
`skills/event-uncertainty-resolver/scripts/uncertainty-cache.py` (writes
`fields.cost = { soldOut: true }`), teach `applyResolution`
(`lib/uncertainty-merge.ts:120`) and the cache type
(`lib/event-uncertainty-cache.ts`) to carry it, and document it in the
cost-resolver SKILL field table — following the "Future fields" checklist in
`docs/event-uncertainty.md`. This lets a human mark sold-out shows from other
sources without ripper changes.

### Tests & screenshots (required for the UI change)

Per AGENTS.md "UI Changes": a Playwright e2e spec in `web/e2e/` driving a
`{ soldOut: true }` fixture through list + detail, asserted with locators
(not pixel diffs), plus committed screenshots in `web/e2e/screenshots/`
embedded in the PR body. Unit tests for `costLabel`/`eventMatchesCost` and the
Ticketmaster `offsale` → `{ soldOut: true }` mapping.

## Sequencing

1. **PR 1 — Phase 1 bug fix.** `ticketmaster.ts` `min:0` → `{ paid: true }` +
   tests. Small, auto-merge eligible, stops the false-Free immediately.
2. **PR 2 — Phase 2 feature.** Schema union member, Ticketmaster `offsale`
   detection, UI label + CSS + filter behavior, e2e + screenshots, resolver
   `--cost-sold-out`. UI/schema change → **requires manual merge**.

Splitting keeps the live data-quality fix from waiting on the larger feature
review.

## Open questions for review

1. **Model:** union member `{ soldOut: true }` (recommended) vs orthogonal flag
   that preserves price (`{ min, soldOut: true }`)?
2. **`offsale` semantics:** treat all future-dated `offsale` Ticketmaster events
   as "Sold out," or only when the price range also collapsed to `min:0`? (The
   stricter rule risks missing genuinely-sold-out shows that kept a price.)
3. **Counter:** add `soldOutEvents` to `costStats` (full reporting-parity plumb)
   now, or defer?
4. **Filter:** ship a "hide sold out" toggle in this work, or later?
