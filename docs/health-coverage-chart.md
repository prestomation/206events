# Health page coverage chart

The chart at the top of the health dashboard showing how coverage has moved
over time. Component: `web/src/components/HealthDashboard.jsx` (`CoverageChart`),
with geometry and formatting in `web/src/components/coverageChart.js`.

## Form: small multiples, not a dual axis

Three panels — Events, Calendars, Viable candidates — stacked on a shared
x-axis, with one crosshair and one readout.

This replaced a dual-axis plot (events on a left scale, calendars on a right
one). Two y-scales on one frame is the single most misleading thing a line
chart can do: the vertical alignment between the series is an arbitrary
consequence of the two maxima, so the chart invents a correlation that is not
in the data. With three series at ~15,000 / ~700 / ~265 it would have been
worse. Each panel now carries its own honest zero-based scale, and three short
wide panels read better on a phone than three lines crossing in one box.

## Series and colors

| Series | Color | Notes |
|---|---|---|
| Events | `#2563eb` | `geoStats.totalEvents` |
| Calendars | `#ea580c` | manifest calendars with future events |
| Viable candidates | `#db2777` | dashed; `candidate` + `investigating` in `docs/source-candidates/` |

The palette was validated with the dataviz skill's `validate_palette.js`
against the real card surfaces in both themes (`#f4f1ea` light, `#262318`
dark) — all six categorical checks pass. Two things to preserve if the colors
are ever revisited:

- **Do not use `#7c3aed` (or a nearby purple) for candidates.** It is
  indistinguishable from the events blue under deuteranopia — ΔE 0.4.
- Candidates↔calendars tritan separation is 4.9, below the ideal floor of 6,
  which is why the candidates line is **dashed**. Identity must never be
  carried by color alone; the dash is the secondary encoding, and the readout
  and hidden table carry the numbers regardless.

**Read-out only, never plotted:** `queue` (open work queue) and `errors`
(`totalErrors`). They answer "how much maintenance is outstanding", which is a
different question from "how much coverage do we have", and two more lines
would not have earned their space.

## Interaction

- **Pointer.** One transparent hit rect spanning the whole SVG. Nearest-point
  is a single `Math.round`, so per-point targets would buy nothing, and a tap
  below the axis still selects. Hover-scrubs with a mouse, drag-scrubs with a
  finger, and the selection **persists after the finger lifts**.
- **`touch-action: pan-y`** on the plot: a horizontal drag scrubs, a vertical
  one still scrolls the page. Never `preventDefault()` on touch here.
- **Keyboard.** The plot wrapper is `role="slider"` (arrows, Home/End,
  PageUp/PageDown), mirroring `DayScrubber` so the app's two scrubbers behave
  identically.
- **Default state** shows the latest point with no crosshair, so the card
  always shows current numbers and the readout has a constant height.
- State only updates when the selected *index* changes — otherwise every
  pointer move is a React render and an `aria-live` announcement.

### Accessibility

The SVG is `aria-hidden` decoration. Every number it shows is also text: the
readout is a `role="status"` live region, and a visually-hidden `<table>`
carries every point (also making the data Ctrl-F-able and copy-pasteable).
`aria-valuetext` deliberately carries the **date only** — the live region
announces the numbers, and saying them in both places double-announces.

## Rendering and responsiveness

The chart renders at **1:1 CSS pixels**: the `viewBox` is the ResizeObserver-
measured container width. The previous fixed `0 0 760 260` viewBox scaled to
~0.4× on a phone, rendering 11px axis text at ~4.5px. Measuring also means hit
testing is `clientX - rect.left` with no CTM inverse — which is what makes the
interaction unit-testable, since jsdom has no `getScreenCTM`. `layout()` picks
narrower margins, 3 gridlines instead of 5, and compact `11.2k` axis labels
below 520px.

On mobile the chart is **edge-to-edge**. That is done by moving padding off
`.health-dashboard` and onto its in-flow children, **not** with negative
margins: `.health-dashboard` sets `overflow-y: auto`, so `overflow-x` computes
to `auto` rather than `visible`, and a negative-margin child would be clipped
on the left and add a horizontal scrollbar on the right.

## Data: `event-history.json`

One point per build day, published at `/event-history.json`:

```json
{ "date": "2026-09-01", "events": 15377, "calendars": 555,
  "candidates": 264, "queue": 1639, "errors": 348 }
```

Every field except `date` is **optional**. A field a build could not compute is
absent, never `0` — the chart renders a gap and the readout an em-dash. Series
are drawn as one polyline per run of consecutive defined points (`segments()`),
so a late-starting series starts where its data does and an interior gap reads
as a break rather than a line dropping to zero.

`queue` = outstanding uncertainty + photo gaps + cost gaps + setting gaps +
duplicate candidates + geocode errors. It is `undefined` for builds predating
cross-source dedup (~PR 700, before 2026-06-17) rather than silently dropping
the `duplicateStats` term — a backlog trend whose definition changed partway
through is worse than a shorter one.

### Persistence: three sources, merged

This series was lost once. It lived only in a GitHub Actions cache; the cache
was evicted, the restore fell through to the stale committed copy, and 67 days
(2026-06-26 → 08-31) vanished with nothing failing.

`scripts/update-event-history.mjs` now merges in increasing authority:

1. the committed `docs/event-history.json`
2. the restored Actions cache (a **sidecar path**, so a cache hit can no longer
   overwrite the committed baseline before the merge reads it)
3. the live published copy fetched from the deployed site
4. this build's own numbers

For any `(date, field)` the most authoritative source with a *defined* value
wins; a date present in any source is kept; nothing is dropped. Losing a date
now requires it to be absent from all four at once — and the published copy is
the previous run's merged output, so one successful build after any cache loss
restores everything the site was serving. The script refuses to write a series
shorter than any of its inputs.

PR builds deliberately skip the fetch and copy the committed baseline: previews
get a slightly stale chart rather than every PR build paying for a network call.

## Backfill

Two one-shot scripts, both with `--dry-run`:

- **`scripts/backfill-event-history.mjs [MAX_PR] [MIN_PR]`** sweeps Cloudflare
  PR previews (`https://pr-<n>.206events.pages.dev`) for `build-errors.json` +
  `manifest.json`. This is what recovered the lost window.
  **Caveat:** previews are builds of *unmerged branches*, so `calendars` and
  `errors` can be skewed by whatever that PR was doing. Committed values always
  win over harvested ones, and within a day the latest `buildTime` wins — but
  for the June–August window there is no main-build data at all, so preview
  data is all there is.
- **`scripts/backfill-candidate-history.mjs`** reconstructs `candidates` from
  git, counting frontmatter statuses at the last first-parent commit on main for
  each date. `--first-parent` matters: without it a date can land on a PR-branch
  commit whose candidate set is mid-edit. `README.md` must be excluded — it
  documents the schema with a literal `status: candidate` line. The script
  refuses to run on a shallow clone (use `git fetch --shallow-since=`, **not**
  `--unshallow`; this repo commits ~20MB of screenshots and map tiles).

Reconstructing candidate history from `firstSeen`/`pr` frontmatter instead was
rejected: those date when a file appeared, not when its status flipped. Only
182 of 321 `added` files carry a `pr`, and no `notviable` file carries a flip
date, so it would systematically understate the past.

## Tests

- `web/src/components/coverageChart.test.js` — geometry, scaling, gap
  splitting, tick culling, hit testing.
- `web/src/components/HealthDashboard.test.jsx` — rendering, keyboard scrubbing,
  the em-dash path, and a guard that **no coordinate is ever `NaN`** when a
  series is only partly present (the failure mode that blanks the chart with no
  error).
- `web/e2e/coverage-chart.spec.js` — click and touch scrubbing, full-bleed
  geometry at 390px, `touch-action`, the screen-reader table, and that the page
  never scrolls sideways.
- `scripts/update-event-history.test.mjs` — the counters and the merge
  semantics, including the shrink guard.
