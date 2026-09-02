// Pure geometry, scaling and formatting for the health page's coverage chart.
//
// Kept out of the component so it can be unit-tested without React, and so the
// gap handling below has somewhere to live where it is obvious. See
// docs/health-coverage-chart.md.

// The three plotted series, in fixed order. Colors were validated against the
// card surfaces in both themes (light #f4f1ea, dark #262318) — all six
// categorical checks pass. Tritan separation between candidates and calendars
// is 4.9, below the ideal floor, so candidates also carries a dash pattern as
// secondary encoding: identity is never color-alone.
//
// Do not substitute #7c3aed for the candidates hue — it is indistinguishable
// from the events blue under deuteranopia (ΔE 0.4).
export const SERIES = [
  { key: 'events', label: 'Events', color: '#2563eb' },
  { key: 'calendars', label: 'Calendars', color: '#ea580c' },
  { key: 'candidates', label: 'Viable candidates', color: '#db2777', dash: '5 3' },
]

// Metrics carried in the readout but never plotted — they answer "how much
// maintenance work is outstanding", which is a different question from "how
// much coverage do we have" and does not deserve a panel.
export const READOUT_ONLY = [
  { key: 'queue', label: 'Open work queue' },
  { key: 'errors', label: 'Build errors' },
]

// Round up to a friendly axis maximum that divides evenly into `intervals`
// gridline steps, so the intermediate labels are round too.
//
// The previous implementation searched [1, 2, 2.5, 5, 10] as multipliers of the
// leading power of ten, but `ceil(v / mag) * mag >= v` is true by construction,
// so it always returned on the first entry and the rest was unreachable — every
// axis was rounded to the next power of ten. That is tolerable for 554 -> 600
// but wasted half the panel just above a power of ten (1050 -> 2000).
//
// Sizing the STEP instead of the maximum fixes both: pick the smallest nice
// step whose `intervals` multiple covers the data.
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

export function niceCeil(v, intervals = 4) {
  if (!Number.isFinite(v) || v <= 0) return 10
  const n = Math.max(1, intervals)
  const raw = v / n
  // Floored at 1: every series here is a count, and a sub-unit step yields a
  // fractional maximum whose gridline labels collide once rounded — niceCeil(3)
  // was 3.2, so axisTicks produced [0, 1, 2, 2, 3] and drew two gridlines on
  // top of each other.
  const mag = Math.max(1, Math.pow(10, Math.floor(Math.log10(raw))))
  for (const m of NICE_STEPS) {
    const step = m * mag
    if (!Number.isInteger(step)) continue
    if (step * n >= v) return step * n
  }
  // Reachable only if every NICE_STEP were non-integral; mag >= 1 makes m = 10
  // integral always, so in practice the loop returns first.
  return 10 * mag * n
}

// Max of one field across the series, skipping points that don't carry it.
//
// A reducer rather than Math.max(...arr): spreading an absent field yields
// undefined -> NaN, which silently propagates into every coordinate and blanks
// the chart with no error. It also avoids blowing the stack on a long series.
export function maxOf(history, key) {
  let max = 0
  for (const p of history) {
    const v = p?.[key]
    if (Number.isFinite(v) && v > max) max = v
  }
  return max
}

export function hasSeries(history, key) {
  return history.some((p) => Number.isFinite(p?.[key]))
}

// Index of the first point carrying `key`, or -1.
export function firstDefinedIndex(history, key) {
  return history.findIndex((p) => Number.isFinite(p?.[key]))
}

// Split a series into runs of consecutive points that actually carry a value.
//
// Each run becomes its own polyline, so a series that starts partway through
// the x-range simply starts there, and an interior gap reads as a break. One
// polyline over the whole range would draw a line down to zero across the
// missing span — inventing a collapse that never happened.
export function segments(history, key) {
  const runs = []
  let run = null
  history.forEach((p, i) => {
    const v = p?.[key]
    if (Number.isFinite(v)) {
      if (!run) { run = []; runs.push(run) }
      run.push({ i, v })
    } else {
      run = null
    }
  })
  return runs
}

// Axis tick values for a panel: 0, midpoint, max (narrow) or quarters (wide).
export function axisTicks(max, steps) {
  const fractions = steps === 3 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]
  return fractions.map((t) => ({ t, val: Math.round(t * max) }))
}

// Compact axis labels so a narrow panel doesn't need a wide left margin.
//
// `compact` is decided per AXIS, not per value: thresholding each label on its
// own magnitude mixes styles within one axis ("16k" above "8,000").
export function fmtAxis(v, compact) {
  if (!compact) return v.toLocaleString()
  if (v === 0) return '0'
  return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
}

// Whether a panel's labels should be abbreviated: only on a narrow layout, and
// only when the axis actually reaches the thousands. Deliberately NOT named
// use*: it is a pure formatter, and the `use` prefix both trips
// react-hooks/rules-of-hooks where it is called and invites someone to add real
// hook state to it later.
export function shouldCompactAxis(narrow, max) {
  return narrow && max >= 10000
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtMonth(dateStr) {
  const [, m] = dateStr.split('-')
  return MONTHS[parseInt(m, 10) - 1] ?? ''
}

// "Aug 14, 2026". Parsed by hand rather than through Date: `new Date('2026-08-14')`
// parses as UTC and renders in local time, which shifts the label a day west of
// UTC — including in Seattle, where this site is read.
export function fmtFullDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-')
  const month = MONTHS[parseInt(m, 10) - 1]
  if (!month) return String(dateStr)
  return `${month} ${parseInt(d, 10)}, ${y}`
}

// One x tick per month boundary, then cull ticks that would collide. The first
// tick is always kept so the series start is labelled.
// Approximate advance width of the 11px axis font, in px per character. Only
// needs to be good enough to keep labels apart; SVG text measurement would mean
// a layout round-trip per tick.
const AXIS_CHAR_W = 6.2

export function monthTicks(history, xOf, minGap, charW = AXIS_CHAR_W) {
  const kept = []
  let lastMonth = null
  let lastYear = null
  history.forEach((p, i) => {
    const [year, month] = String(p.date).split('-')
    if (`${year}-${month}` === lastMonth) return
    lastMonth = `${year}-${month}`
    const x = xOf(i)
    // Label the year only when it changes, so a multi-year series stays
    // readable without repeating "2026" on every tick. Computed before the
    // cull because a year-bearing label ("Apr 2026") is much wider than a bare
    // one and needs more room beside it.
    const label = year === lastYear ? fmtMonth(p.date) : `${fmtMonth(p.date)} ${year}`
    const width = label.length * charW

    if (kept.length > 0) {
      const prev = kept[kept.length - 1]
      // How far the previous label reaches to the RIGHT of its own tick: its
      // full width when it is the first (start-anchored), half otherwise
      // (centred). A length, not a coordinate — see rightEdgeOf below, which
      // works in absolute x.
      const prevExtendsRight = kept.length === 1 ? prev.width : prev.width / 2
      const need = Math.max(minGap, prevExtendsRight + width / 2 + 6)
      if (x - prev.x < need) return
    }

    // Tracked across *kept* ticks only: otherwise a dropped January swallows
    // the year change and the year never gets shown at all.
    lastYear = year
    kept.push({ i, label, x, width })
  })

  // Labels depend on which ticks survive (the first of a year carries it), and
  // whether the tail collides depends on those labels' widths — so relabel and
  // re-check alternately until nothing more is dropped. Doing it once let a
  // tick widen from "Feb" to "Feb 2027" *after* its collision check had passed.
  const relabel = () => {
    let year = null
    for (const tick of kept) {
      const [y] = String(history[tick.i].date).split('-')
      const month = fmtMonth(history[tick.i].date)
      tick.label = y === year ? month : `${month} ${y}`
      tick.width = tick.label.length * charW
      year = y
    }
  }

  // The last tick renders end-anchored (to stay inside the box), so it extends
  // its FULL width to the LEFT, not half — the greedy pass above budgeted only
  // half. `rightEdgeOf` keeps the two passes honest about units: both work in
  // absolute x, not in widths relative to a tick's own position.
  const rightEdgeOf = (idx) => kept[idx].x + (idx === 0 ? kept[idx].width : kept[idx].width / 2)

  relabel()
  while (kept.length >= 2) {
    const last = kept[kept.length - 1]
    if (last.x - last.width - rightEdgeOf(kept.length - 2) >= 6) break
    // Never drop the first tick: it anchors the start of the series and is the
    // one carrying the year. With only two left, the later one goes instead.
    kept.splice(kept.length === 2 ? 1 : kept.length - 2, 1)
    relabel()
  }
  return kept
}

// Layout for a measured container width. Small multiples: three stacked panels
// sharing one x-axis, so there is no second y-scale to align arbitrarily
// against the first.
export function layout(width, panelCount = SERIES.length) {
  const W = Math.max(240, Math.round(width))
  const narrow = W < 520
  const panelH = narrow ? 64 : 88
  const titleH = narrow ? 18 : 20
  const gap = narrow ? 12 : 14
  const axisH = narrow ? 24 : 26
  const ML = narrow ? 38 : 52
  const MR = narrow ? 6 : 8
  const MT = 6
  // Height follows the panels actually drawn: a series absent from the whole
  // series gets no panel, rather than an axis invented from niceCeil(0).
  const n = Math.max(1, panelCount)
  return {
    W,
    narrow,
    ML,
    MR,
    MT,
    panelH,
    titleH,
    gap,
    axisH,
    PW: W - ML - MR,
    H: MT + n * (titleH + panelH) + (n - 1) * gap + axisH,
    gridSteps: narrow ? 3 : 5,
    minTickGap: narrow ? 34 : 44,
    // Top of panel k's plot area (below its title).
    panelTop: (k) => MT + k * (titleH + panelH + gap) + titleH,
  }
}

// Days since the epoch for a YYYY-MM-DD string. Parsed by hand for the same
// reason as fmtFullDate: Date's string parsing is timezone-dependent.
export function dayNumber(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return NaN
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

// Positions for a history, spaced by ELAPSED TIME rather than array index.
//
// Index spacing gives a day with no recorded build zero width, which quietly
// undoes everything else here: the 67-day outage this series was rebuilt to
// recover would render as a single step with an unbroken line across it, and
// months with few builds would be compressed so the axis misstates elapsed
// time. Returns a normalized 0..1 position per point.
export function timePositions(history) {
  const days = history.map((p) => dayNumber(p?.date))
  // One pass rather than Math.min(...days) / Math.max(...days): this series
  // grows by a point per build day, and spreading it would eventually hit the
  // engine's argument limit — the same reason maxOf above is a reducer.
  let first = Infinity
  let last = -Infinity
  for (const d of days) {
    if (!Number.isFinite(d)) continue
    if (d < first) first = d
    if (d > last) last = d
  }
  if (first === Infinity) { first = 0; last = 0 }
  const span = last - first
  return days.map((d) => {
    if (!Number.isFinite(d) || span <= 0) return 0
    return (d - first) / span
  })
}

// x for a normalized position.
export function xScale(t, ML, PW) {
  return ML + (Number.isFinite(t) ? t : 0) * PW
}

// Smallest gap in px between adjacent points.
//
// With time spacing, PW / count no longer bounds this: 25 points inside one
// week followed by 5 across the next year gives a comfortable average while the
// cluster renders as an unreadable blob of overlapping dots.
export function minPointGap(positions, PW) {
  if (!positions || positions.length < 2) return Infinity
  let min = Infinity
  for (let i = 1; i < positions.length; i++) {
    const gap = (positions[i] - positions[i - 1]) * PW
    if (gap < min) min = gap
  }
  return min
}

// Nearest point for a client-space x. Rendering at 1:1 CSS pixels means no CTM
// inverse is needed; the ratio guards a stale measure mid-resize.
//
// With time-spaced points a linear index is no longer the answer, so this scans
// for the closest position — the reader aims at a date, and the nearest
// recorded build to that date is what they mean.
export function indexFromClientX(clientX, rect, { W, ML, PW }, positions) {
  const n = positions?.length ?? 0
  if (!rect || !rect.width || n === 0) return 0
  if (n === 1) return 0
  const x = (clientX - rect.left) * (W / rect.width)
  const t = (x - ML) / PW
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < n; i++) {
    const dist = Math.abs(positions[i] - t)
    if (dist < bestDist) { bestDist = dist; best = i }
  }
  return best
}

// Signed change vs the previous point that carried the field, or null.
export function deltaAt(history, i, key) {
  const v = history[i]?.[key]
  if (!Number.isFinite(v)) return null
  for (let j = i - 1; j >= 0; j--) {
    const prev = history[j]?.[key]
    if (Number.isFinite(prev)) return v - prev
  }
  return null
}
