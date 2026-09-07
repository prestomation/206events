import { describe, it, expect } from 'vitest'
import {
  normalizeHistory,
  niceCeil,
  maxOf,
  hasSeries,
  firstDefinedIndex,
  segments,
  axisTicks,
  fmtAxis,
  shouldCompactAxis,
  fmtMonth,
  fmtFullDate,
  monthTicks,
  layout,
  xScale,
  dayNumber,
  timePositions,
  indexFromClientX,
  deltaAt,
  SERIES,
} from './coverageChart.js'

const pt = (date, fields = {}) => ({ date, ...fields })

describe('normalizeHistory', () => {
  it('drops entries that are not usable points', () => {
    const out = normalizeHistory([
      { date: '2026-05-01', events: 1 },
      null,
      'nope',
      { events: 2 },                 // no date
      { date: 20260502, events: 3 },  // not a string
      { date: 'not-a-date', events: 4 },
    ])
    expect(out).toEqual([{ date: '2026-05-01', events: 1 }])
  })

  it('sorts ascending, so the geometry can assume monotonic dates', () => {
    const out = normalizeHistory([
      { date: '2026-07-01' }, { date: '2026-05-01' }, { date: '2026-06-01' },
    ])
    expect(out.map((p) => p.date)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01'])
  })

  // Duplicate dates would give two table rows the same identity and break the
  // one-point-per-day assumption the x-scale rests on.
  it('dedupes by date, last write winning', () => {
    const out = normalizeHistory([
      { date: '2026-05-01', events: 1 },
      { date: '2026-05-01', events: 2 },
    ])
    expect(out).toEqual([{ date: '2026-05-01', events: 2 }])
  })

  it('returns an empty array for anything that is not an array', () => {
    for (const v of [null, undefined, {}, 'x', 42]) expect(normalizeHistory(v)).toEqual([])
  })
})

describe('niceCeil', () => {
  it('covers the data without wasting the panel', () => {
    for (const [v, expected] of [[15312, 16000], [554, 600], [265, 320], [100, 100]]) {
      expect(niceCeil(v, 4), `niceCeil(${v})`).toBe(expected)
    }
  })

  // The old implementation's step search was unreachable (ceil(v/mag)*mag >= v
  // always holds), so everything rounded to the next power of ten and a value
  // just above one wasted half the panel.
  it('does not round a value just over a power of ten to the next one', () => {
    expect(niceCeil(1050, 4)).toBe(1200)
    expect(niceCeil(1050, 4)).toBeLessThan(2000)
  })

  it('always covers the value and never wastes more than half the panel', () => {
    for (const v of [7, 42, 99, 101, 265, 554, 1050, 9999, 15312, 123456]) {
      for (const intervals of [2, 4]) {
        const max = niceCeil(v, intervals)
        expect(max, `niceCeil(${v}, ${intervals}) must cover`).toBeGreaterThanOrEqual(v)
        expect(v / max, `niceCeil(${v}, ${intervals}) wastes too much`).toBeGreaterThan(0.4)
      }
    }
  })

  // Below the interval count, a step of 1 is already the finest integer
  // gridline available, so the fill ratio is bounded by arithmetic rather than
  // by the algorithm. It must still cover the value and stay integral.
  it('degrades gracefully for values smaller than the interval count', () => {
    for (const v of [1, 2, 3]) {
      expect(niceCeil(v, 4)).toBe(4)
    }
  })

  // Gridline labels are max * [0, .25, .5, .75, 1] (or halves), so the maximum
  // has to divide evenly into whole numbers or two labels round to the same
  // value and their gridlines are drawn on top of each other.
  it('produces round, distinct intermediate gridline labels', () => {
    for (const v of [1, 2, 3, 7, 42, 265, 554, 1050, 15312]) {
      for (const intervals of [2, 4]) {
        const max = niceCeil(v, intervals)
        const step = max / intervals
        expect(Number.isInteger(step), `step ${step} for ${v}/${intervals}`).toBe(true)
        const labels = axisTicks(max, intervals + 1).map((t) => t.val)
        expect(new Set(labels).size, `duplicate labels ${labels} for ${v}`).toBe(labels.length)
      }
    }
  })

  // The fallback has to stay divisible by the interval count too, or an
  // all-zero series (a new city's first builds) gets labels that do not line up
  // with its gridlines.
  it('falls back to a small axis that still divides evenly', () => {
    for (const v of [0, -5, NaN, undefined]) {
      for (const intervals of [2, 4]) {
        const max = niceCeil(v, intervals)
        expect(max, `niceCeil(${v}, ${intervals})`).toBeGreaterThan(0)
        expect(Number.isInteger(max / intervals)).toBe(true)
        const labels = axisTicks(max, intervals + 1).map((t) => t.val)
        expect(new Set(labels).size).toBe(labels.length)
      }
    }
  })
})

describe('timePositions', () => {
  // The whole point: a stretch of days with no build must occupy real width,
  // or the 67-day outage this series was rebuilt to recover renders as a single
  // step with an unbroken line across it.
  it('spaces points by elapsed time, not array index', () => {
    const h = [pt('2026-01-01'), pt('2026-01-02'), pt('2026-01-11')]
    expect(timePositions(h)).toEqual([0, 0.1, 1])
  })

  it('puts a single point, or an all-same-day series, at the left edge', () => {
    expect(timePositions([pt('2026-01-01')])).toEqual([0])
    expect(timePositions([pt('2026-01-01'), pt('2026-01-01')])).toEqual([0, 0])
  })

  it('treats an unparseable date as position 0 rather than NaN', () => {
    const out = timePositions([pt('2026-01-01'), pt('nonsense'), pt('2026-01-11')])
    expect(out.every(Number.isFinite)).toBe(true)
  })
})

describe('dayNumber', () => {
  it('counts whole days and is timezone-independent', () => {
    expect(dayNumber('2026-01-02') - dayNumber('2026-01-01')).toBe(1)
    expect(dayNumber('2027-01-01') - dayNumber('2026-01-01')).toBe(365)
  })

  it('is NaN for an unparseable value', () => {
    expect(Number.isNaN(dayNumber('nope'))).toBe(true)
  })
})

describe('maxOf', () => {
  // The regression this whole module exists for: Math.max(...) over a
  // partially-present field yields NaN, which propagates into every coordinate
  // and blanks the chart with no error.
  it('skips points that do not carry the field', () => {
    const history = [pt('2026-05-01', { events: 10 }), pt('2026-05-02'), pt('2026-05-03', { events: 30 })]
    expect(maxOf(history, 'events')).toBe(30)
    expect(Number.isNaN(maxOf(history, 'events'))).toBe(false)
  })

  it('returns 0 when nothing carries the field', () => {
    expect(maxOf([pt('2026-05-01'), pt('2026-05-02')], 'candidates')).toBe(0)
  })

  it('ignores non-finite values', () => {
    expect(maxOf([pt('a', { events: NaN }), pt('b', { events: 5 })], 'events')).toBe(5)
  })
})

describe('hasSeries / firstDefinedIndex', () => {
  const history = [pt('2026-05-01'), pt('2026-05-02'), pt('2026-05-03', { candidates: 7 })]

  it('detects presence and the first index carrying the field', () => {
    expect(hasSeries(history, 'candidates')).toBe(true)
    expect(firstDefinedIndex(history, 'candidates')).toBe(2)
  })

  it('reports absence', () => {
    expect(hasSeries(history, 'queue')).toBe(false)
    expect(firstDefinedIndex(history, 'queue')).toBe(-1)
  })
})

describe('segments', () => {
  const flat = (runs) => runs.map((r) => r.map((s) => s.i))

  it('returns one run when every point is defined', () => {
    const h = [pt('a', { v: 1 }), pt('b', { v: 2 }), pt('c', { v: 3 })]
    expect(flat(segments(h, 'v'))).toEqual([[0, 1, 2]])
  })

  it('starts the run where a late series begins (leading gap)', () => {
    const h = [pt('a'), pt('b'), pt('c', { v: 3 }), pt('d', { v: 4 })]
    expect(flat(segments(h, 'v'))).toEqual([[2, 3]])
  })

  it('ends the run at a trailing gap', () => {
    const h = [pt('a', { v: 1 }), pt('b', { v: 2 }), pt('c'), pt('d')]
    expect(flat(segments(h, 'v'))).toEqual([[0, 1]])
  })

  // The point of splitting: an interior gap must read as a break, never as a
  // line dropping to zero and back.
  it('breaks into two runs across an interior gap', () => {
    const h = [pt('a', { v: 1 }), pt('b'), pt('c', { v: 3 })]
    expect(flat(segments(h, 'v'))).toEqual([[0], [2]])
  })

  it('emits a single-point run', () => {
    const h = [pt('a'), pt('b', { v: 2 }), pt('c')]
    expect(flat(segments(h, 'v'))).toEqual([[1]])
  })

  it('returns nothing when the field is absent throughout', () => {
    expect(segments([pt('a'), pt('b')], 'v')).toEqual([])
  })
})

describe('axisTicks', () => {
  it('gives 3 steps on narrow panels and 5 on wide', () => {
    expect(axisTicks(1000, 3).map((t) => t.val)).toEqual([0, 500, 1000])
    expect(axisTicks(1000, 5).map((t) => t.val)).toEqual([0, 250, 500, 750, 1000])
  })
})

describe('fmtAxis', () => {
  it('abbreviates only in compact mode', () => {
    expect(fmtAxis(20000, true)).toBe('20k')
    expect(fmtAxis(15500, true)).toBe('15.5k')
    expect(fmtAxis(0, true)).toBe('0')
    expect(fmtAxis(20000, false)).toBe('20,000')
  })

  // Per-axis, not per-value: thresholding each label on its own magnitude gave
  // one axis reading "16k" above "8,000".
  it('abbreviates every label on a compact axis, not just the large ones', () => {
    const compact = shouldCompactAxis(true, 16000)
    expect([0, 4000, 8000, 12000, 16000].map((v) => fmtAxis(v, compact)))
      .toEqual(['0', '4k', '8k', '12k', '16k'])
  })

  it('stays uncompacted on a wide layout or a small axis', () => {
    expect(shouldCompactAxis(false, 16000)).toBe(false)
    expect(shouldCompactAxis(true, 600)).toBe(false)
    expect(fmtAxis(600, shouldCompactAxis(true, 600))).toBe('600')
  })
})

describe('fmtMonth / fmtFullDate', () => {
  it('formats a month abbreviation', () => {
    expect(fmtMonth('2026-08-14')).toBe('Aug')
    expect(fmtMonth('2026-01-01')).toBe('Jan')
    expect(fmtMonth('2026-12-31')).toBe('Dec')
  })

  // Parsed by hand: new Date('2026-08-14') parses as UTC and renders local,
  // which shifts the label a day west of UTC — including in Seattle.
  it('formats a full date without a timezone shift', () => {
    expect(fmtFullDate('2026-08-14')).toBe('Aug 14, 2026')
    expect(fmtFullDate('2026-01-01')).toBe('Jan 1, 2026')
  })

  it('passes through an unparseable value', () => {
    expect(fmtFullDate('nonsense')).toBe('nonsense')
  })
})

describe('monthTicks', () => {
  const spaced = (px) => (i) => i * px

  it('emits one tick per month boundary', () => {
    const h = [pt('2026-04-01'), pt('2026-04-20'), pt('2026-05-02'), pt('2026-06-09')]
    // Indices 0,1,2,3 at 60px apart: boundaries fall at 0, 120, 180.
    expect(monthTicks(h, spaced(60), 44).map((t) => t.label)).toEqual(['Apr 2026', 'May', 'Jun'])
  })

  it('culls ticks that would collide with the last one kept', () => {
    const h = [pt('2026-04-01'), pt('2026-05-01'), pt('2026-06-01'), pt('2026-07-01')]
    expect(monthTicks(h, spaced(30), 44).map((t) => t.label)).toEqual(['Apr 2026', 'Jul'])
  })

  // The real collision this guards: the first label carries a year, is
  // left-anchored, and so extends its FULL width to the right — a fixed gap
  // sized for a bare "May" let "Apr 2026" run into the next label.
  it('reserves room for a wide year-bearing first label', () => {
    const h = [pt('2026-04-01'), pt('2026-05-01'), pt('2026-06-01')]
    // 50px apart clears the 44px floor, but "Apr 2026" is ~50px wide on its own.
    expect(monthTicks(h, spaced(50), 44).map((t) => t.label)).toEqual(['Apr 2026', 'Jun'])
    // Given real room, both survive.
    expect(monthTicks(h, spaced(90), 44).map((t) => t.label)).toEqual(['Apr 2026', 'May', 'Jun'])
  })

  // A dropped December must not swallow the year change, or the year never
  // appears again.
  it('shows the year on the first kept tick of a new year', () => {
    const h = [pt('2026-11-01'), pt('2026-12-01'), pt('2027-01-01'), pt('2027-02-01')]
    expect(monthTicks(h, spaced(60), 44).map((t) => t.label))
      .toEqual(['Nov 2026', 'Jan 2027', 'Feb'])
  })

  // Labels are anchored start / middle / end by position, so their extents
  // differ. Rather than pin hand-computed pixels, assert the property that
  // actually matters at every spacing: no two rendered labels overlap.
  it('never emits overlapping labels, at any spacing', () => {
    const months = ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']
    const h = months.map((d) => pt(d))
    for (const px of [8, 17, 30, 45, 53, 70, 100, 160]) {
      const ticks = monthTicks(h, spaced(px), 44)
      const extents = ticks.map((t, i) => {
        if (i === 0) return [t.x, t.x + t.width]                   // start-anchored
        if (i === ticks.length - 1) return [t.x - t.width, t.x]     // end-anchored
        return [t.x - t.width / 2, t.x + t.width / 2]               // centred
      })
      for (let i = 1; i < extents.length; i++) {
        expect(
          extents[i][0] - extents[i - 1][1],
          `spacing ${px}px: "${ticks[i - 1].label}" runs into "${ticks[i].label}"`
        ).toBeGreaterThanOrEqual(0)
      }
      expect(ticks.length).toBeGreaterThanOrEqual(1)
    }
  })

  // Never at the cost of the first tick, which anchors the series start and
  // carries the year.
  it('keeps the first tick when only two remain and they collide', () => {
    const h = [pt('2026-11-01'), pt('2026-12-01')]
    expect(monthTicks(h, spaced(10), 44).map((t) => t.label)).toEqual(['Nov 2026'])
  })
})

describe('layout', () => {
  it('stacks one panel per series with a shared x-axis', () => {
    const l = layout(760)
    expect(l.narrow).toBe(false)
    // Panels do not overlap and are ordered top to bottom.
    const tops = SERIES.map((_, k) => l.panelTop(k))
    expect(tops[1] - tops[0]).toBe(l.titleH + l.panelH + l.gap)
    expect(tops[2] - tops[1]).toBe(l.titleH + l.panelH + l.gap)
    // The last panel's plot plus the axis band fits inside H.
    expect(tops[2] + l.panelH + l.axisH).toBe(l.H)
  })

  it('shrinks margins and gridlines on a narrow container', () => {
    const wide = layout(760)
    const narrow = layout(390)
    expect(narrow.narrow).toBe(true)
    expect(narrow.ML).toBeLessThan(wide.ML)
    expect(narrow.gridSteps).toBe(3)
    // The whole point of shrinking: the plot uses most of a phone's width.
    expect(narrow.PW / narrow.W).toBeGreaterThan(0.85)
  })

  it('clamps absurdly small widths instead of producing negative plot width', () => {
    expect(layout(0).PW).toBeGreaterThan(0)
  })
})

describe('xScale', () => {
  it('maps a normalized position across the plot width', () => {
    expect(xScale(0, 50, 200)).toBe(50)
    expect(xScale(1, 50, 200)).toBe(250)
    expect(xScale(0.5, 50, 200)).toBe(150)
  })

  it('treats a non-finite position as the left edge', () => {
    expect(xScale(NaN, 50, 200)).toBe(50)
    expect(xScale(undefined, 50, 200)).toBe(50)
  })
})

describe('indexFromClientX', () => {
  const geom = { W: 400, ML: 50, PW: 300 }
  const rect = { left: 0, width: 400 }
  const even = Array.from({ length: 11 }, (_, i) => i / 10)

  it('finds the nearest point', () => {
    expect(indexFromClientX(50, rect, geom, even)).toBe(0)
    expect(indexFromClientX(200, rect, geom, even)).toBe(5)
    expect(indexFromClientX(350, rect, geom, even)).toBe(10)
  })

  it('clamps outside the plot area so an off-axis tap still selects', () => {
    expect(indexFromClientX(0, rect, geom, even)).toBe(0)
    expect(indexFromClientX(9999, rect, geom, even)).toBe(10)
  })

  it('scales when the rendered width differs from the viewBox width', () => {
    // Half-size render: a click at 100 client px is 200 user units.
    expect(indexFromClientX(100, { left: 0, width: 200 }, geom, even)).toBe(5)
  })

  // With time spacing the points are no longer evenly distributed, so the
  // nearest one is a scan rather than a division.
  it('picks the nearest point when spacing is uneven', () => {
    const uneven = timePositions([pt('2026-01-01'), pt('2026-01-02'), pt('2026-01-31')])
    // Just right of the left edge: the 2nd of January, not the 31st.
    expect(indexFromClientX(60, rect, geom, uneven)).toBe(1)
    // Far right: the 31st.
    expect(indexFromClientX(340, rect, geom, uneven)).toBe(2)
  })

  // null, not 0: returning the first index would snap the crosshair to the
  // oldest date when the container is momentarily unmeasurable mid-gesture.
  it('returns null when the position cannot be resolved', () => {
    expect(indexFromClientX(100, null, geom, even)).toBeNull()
    expect(indexFromClientX(100, { left: 0, width: 0 }, geom, even)).toBeNull()
    expect(indexFromClientX(100, rect, geom, [])).toBeNull()
  })

  it('still resolves a single-point series', () => {
    expect(indexFromClientX(100, rect, geom, [0])).toBe(0)
  })
})

describe('deltaAt', () => {
  const h = [pt('a', { events: 100 }), pt('b'), pt('c', { events: 130 })]

  it('compares against the previous point that carries the field', () => {
    expect(deltaAt(h, 2, 'events')).toBe(30)
  })

  it('is null at the first defined point and where the field is absent', () => {
    expect(deltaAt(h, 0, 'events')).toBeNull()
    expect(deltaAt(h, 1, 'events')).toBeNull()
  })
})
