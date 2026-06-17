# Recurring-event grouping ("Other dates")

## Problem

Many events recur — a weekly trivia night, a nightly musical run, a monthly
art walk — but the sources we scrape often expose each occurrence as an
independent dated event with **no recurrence model** (no `RRULE`). The build
publishes them as N separate entries in `events-index.json`, with nothing
linking them.

The user-facing gap: on an **event detail page**, there's no way to see "what
other days is this same event on." If you land on this Tuesday's trivia night,
you can't tell it also runs next Tuesday and the Tuesday after.

The hand-authored `sources/recurring/*.yaml` calendars *do* carry a real
`RRULE`, but they're a small minority. The long tail of scraped recurring
events is the problem this addresses.

## Approach (Option A — client-side, display-only)

We re-link the occurrences **at display time in the web UI**, with no schema
change and no build work. This is the lightest of the options considered (see
"Alternatives" below) and validates the UX before investing in build-time
infrastructure.

The grouping reuses the **existing, tested** heuristic that the events map
already uses to collapse recurring instances into a single marker:
`web/src/lib/event-grouping.js` (`groupKey` / `normalizeTitle` /
`quantizeCoord`). `groupKey` is:

```
seriesId (if present)  ||  normalizedTitle | quantizedLat | quantizedLng | icsUrl
```

- **`normalizedTitle`** lowercases, collapses whitespace, and strips trailing
  per-occurrence qualifiers ("- Evening", "(Matinee)", "8pm", "(Sold Out)"),
  so showtime variants of one run collapse to the same base title.
- **`quantizedLat/Lng`** snap coordinates to a ~50m grid (matching the
  same-day dedup neighborhood), so geocoding jitter doesn't split one series.
- **`icsUrl`** scopes grouping to a single source feed. Two feeds are never
  merged here — cross-source identity is a harder, separate problem already
  half-handled by the same-day dedup.

### Where it lives

- `web/src/redesign/views.jsx` — `EventDetail` computes `otherDates`: every
  entry in the upcoming list whose `groupKey` equals the current event's, minus
  the current occurrence, sorted by date. Rendered as an **"Other dates"**
  section (capped at `OTHER_DATES_CAP = 12`, with a "+N more dates" overflow
  line). Occurrences shown here are excluded from the existing "More from
  &lt;channel&gt;" list so nothing appears twice.
- `web/src/redesign/App206.jsx` — exposes `allUpcomingEvents` (the **unscoped**
  upcoming list) alongside the existing date-window-scoped `upcomingEvents`.
  "Other dates" reads the unscoped list so the full cadence shows even when the
  user is browsing a narrow "next 7 days" window.

### Why exact `groupKey`, not the full `groupEvents` pass

The map's `groupEvents` adds a second, fuzzy clustering pass (title Jaccard
≥ 0.7 within a venue bucket). The detail page deliberately uses **only the
exact `groupKey` match**: it's O(n) per open instead of O(n²), deterministic,
and conservative (it won't over-group titles that differ beyond qualifier
stripping). For a display affordance, missing a borderline fuzzy match is a
better failure than wrongly merging two distinct shows.

## Guardrails against false grouping

Generic titles at a venue ("Live Music", "Happy Hour") are the main risk.
Mitigations baked into the shared key:

- Grouping is scoped to **same source + same venue** (icsUrl + quantized
  coords) — never cross-source.
- Section only renders when there is **≥ 1 other occurrence**.
- Title comparison goes through `normalizeTitle`, which strips only
  per-occurrence qualifiers and preserves real subtitles.

## Testing

- `web/e2e/recurring-dates.spec.js` — Playwright spec: opens one occurrence of
  a scraped "Tuesday Trivia Night" series, asserts the "Other dates" section
  lists the sibling occurrences, that a same-venue different-title event lands
  under "More from" instead, that a same-title event at a *different* venue is
  NOT folded in, and that clicking an other-date navigates to that occurrence.
  Fixtures in `web/e2e/fixtures.js` (`mockRecurringEvents`); screenshot in
  `web/e2e/screenshots/event-detail-other-dates.png`.
- The underlying `groupKey` heuristic already has unit coverage in
  `web/src/lib/event-grouping.test.js`.

## Alternatives considered (not chosen now)

- **Option B — build-time `seriesId`.** Stamp a deterministic series id onto
  every `events-index.json` entry in `lib/discovery.ts` so the web UI, the
  favorites worker, and any future consumer share one canonical, unit-tested
  grouping. `groupKey`/`groupEvents` already prefer a `seriesId` when present,
  so this client feature becomes a no-op migration the day the build emits one.
  Deferred because Option A ships the UX first with zero schema/build risk.
- **Option C — RRULE folding.** Detect a regular cadence among the grouped
  occurrences and collapse them into a single recurring event with a generated
  `RRULE` (the `generateRRule` machinery in `lib/config/recurring.ts` already
  exists). Most "correct" data model, but highest risk: cadence inference is
  error-prone (skipped weeks, holidays), and folding changes every list view
  and the ICS output, not just the detail page. Only worth pursuing once a
  grouping key (Option B) has proven accurate in production.

## Future work

When/if the build gains a `seriesId` (Option B), this feature requires **no
change** — `groupKey` already short-circuits on `seriesId`. At that point the
"Other dates" list inherits the canonical grouping for free, and Option C can
build on top of the same key.
