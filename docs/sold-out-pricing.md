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

> **Status: implemented.** Both phases shipped together. The decisions that
> were open questions in the original plan are recorded inline below
> (✅ **Decided**).

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

✅ **Decided — union member, not an orthogonal `event.soldOut` flag.** The
user's framing ("add sold out as a 'price'") matches the union: sold-out is a
terminal admission state that supersedes price — you can't buy in at any number,
so the exact price is moot. This keeps one field (`cost`) as the single thing
every surface formats, exactly like `{ paid: true }` today, and needs no new
event-level field plumbed through `events-index.json`.

**Trade-off:** a `{ soldOut: true }` event drops a simultaneously-known price
(e.g. "sold out, was $25"). If we later want "Sold out · was $25," promote to an
orthogonal flag (`{ min: 25, soldOut: true }`) — a strictly larger change
touching every `costLabel`/filter/stats branch. Not done now.

### Detection (where `{ soldOut: true }` comes from)

| Source type | Signal | Notes |
|---|---|---|
| `ticketmaster` | `event.dates.status.code === 'offsale'` | Primary. The reported case. `offsale` also covers "sale ended"; for a *future* event that means sold out / unavailable, which is what we want to surface. Corroborated by the collapsed `min:0,max:0` range. |
| `dice` / `axs` / `eventbrite` | per-platform availability/`on_sale_status` | Out of MVP scope; add when those APIs are revisited. Field table in resolver docs makes this incremental. |
| manual / uncertainty cache | new `--cost-sold-out` flag | Lets the cost-resolver mark a known sold-out event (see below). |

✅ **Decided — detection is source-specific; MVP is Ticketmaster only.** In
`ticketmaster.ts`, after computing `cost`, upgrade to sold-out when the event is
`offsale` **and** its public sale has already started — so a not-yet-on-sale
event (also `offsale`) isn't mislabeled. When sale dates are absent we stay
conservative and leave the price as-is (Phase 1 still keeps it from being free):

```ts
if (status === 'offsale') {
    const saleStart = event.sales?.public?.startDateTime;
    if (saleStart && new Date(saleStart).getTime() <= Date.now()) {
        cost = { soldOut: true };
    }
}
```

The collapsed `min:0` price range is *not* used as the sold-out signal — that
heuristic is too source-specific — but Phase 1 still maps any `min:0` to
`{ paid: true }`, so a sold-out show with no usable status is "Ticketed", never
"Free".

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
- **Cost filter** (`viewModels.js`, `eventMatchesCost`): sold-out matches only
  "Any" — never Free / "$10 or less" (strict on `min`, same as `{ paid: true }`
  today). ✅ **Decided — no "hide sold out" toggle.** Not built; sold-out shows
  still surface in the list with their label.

The list-row modifier class is centralized in a new `costClass(cost)` helper
(`viewModels.js`) so the two render sites (`atoms.jsx`, `views.jsx`) stay in
sync: `--free` (green) for free, `--soldout` (muted + strikethrough) for
sold-out.

### Server/UI parity

`costLabel` lives only in the web UI, and the favorites Worker ICS feed does
not serialize cost, so the **Favorites Filter Parity Rule** is not triggered by
a render-only label. If a "hide sold out" *filter* is added, it must land in
both `feed.ts` and `App.jsx`/`viewModels.js` per that rule.

### Reporting parity

`EventCost` flows into `events-index.json` already, so no new serialization.
✅ **Decided — add the `soldOutEvents` counter.** `costStats`
(`calendar_ripper.ts`) gains `soldOutEvents` (events whose `cost` is
`{ soldOut: true }`), and per the **Reporting Parity Rule** it is plumbed
through all five surfaces in this PR: the build step summary, the PR-preview
comment, the Discord notification, the web health dashboard, and the
build-report skill. It is informational (sold-out shows are resolved, not a
gap/todo), so it never counts toward `costGaps` or `totalErrors`.

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

## What shipped

Both phases landed together in one PR (the UI/schema change requires manual
merge regardless, so splitting bought nothing here):

- **Phase 1** — `ticketmaster.ts`: any `min:0` → `{ paid: true }`, plus the
  `min:0/max:0` and `min:0`-only regression tests.
- **Phase 2** — `EventCost` union member `{ soldOut: true }`; Ticketmaster
  `offsale` + sale-started detection; `costLabel`/`costClass` + CSS in the
  redesign UI; `eventMatchesCost` excludes sold-out from price buckets;
  `soldOutEvents` counter through all five reporting surfaces;
  `--cost-sold-out` resolver flag (+ `applyResolution`/cache support, which is
  generic over the `cost` field); unit tests and a Playwright e2e spec with
  committed screenshots.

## Decisions (were open questions)

1. **Model:** union member `{ soldOut: true }` — ✅ chosen over an orthogonal
   price-preserving flag.
2. **`offsale` semantics:** sold-out only when `offsale` **and** the public sale
   has already started; conservative (keep price) when sale dates are absent.
   The collapsed-`min:0` heuristic is too source-specific to use as the signal.
3. **Counter:** ✅ `soldOutEvents` added to `costStats` and plumbed through every
   surface.
4. **Filter:** ✅ no "hide sold out" toggle — sold-out events still show, labeled.
