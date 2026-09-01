import { describe, it, expect } from 'vitest'
import {
  niceCeil,
  maxOf,
  hasSeries,
  firstDefinedIndex,
  segments,
  axisTicks,
  fmtAxis,
  fmtMonth,
  fmtFullDate,
  monthTicks,
  layout,
  xScale,
  indexFromClientX,
  deltaAt,
  SERIES,
} from './coverageChart.js'

const pt = (date, fields = {}) => ({ date, ...fields })

describe('niceCeil', () => {
  it('rounds up to a friendly maximum', () => {
    expect(niceCeil(15312)).toBe(20000)
    expect(niceCeil(554)).toBe(600)
    expect(niceCeil(265)).toBe(300)
    expect(niceCeil(100)).toBe(100)
  })

  it('floors at 10 for zero, negatives and non-numbers', () => {
    expect(niceCeil(0)).toBe(10)
    expect(niceCeil(-5)).toBe(10)
    expect(niceCeil(NaN)).toBe(10)
    expect(niceCeil(undefined)).toBe(10)
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
    expect(fmtAxis(500, true)).toBe('500')
    expect(fmtAxis(20000, false)).toBe('20,000')
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
  it('spreads indices across the plot width', () => {
    expect(xScale(0, 5, 50, 200)).toBe(50)
    expect(xScale(4, 5, 50, 200)).toBe(250)
    expect(xScale(2, 5, 50, 200)).toBe(150)
  })

  it('puts a lone point at the left edge rather than dividing by zero', () => {
    expect(xScale(0, 1, 50, 200)).toBe(50)
  })
})

describe('indexFromClientX', () => {
  const geom = { W: 400, ML: 50, PW: 300 }
  const rect = { left: 0, width: 400 }

  it('finds the nearest index', () => {
    expect(indexFromClientX(50, rect, geom, 11)).toBe(0)
    expect(indexFromClientX(200, rect, geom, 11)).toBe(5)
    expect(indexFromClientX(350, rect, geom, 11)).toBe(10)
  })

  it('clamps outside the plot area so an off-axis tap still selects', () => {
    expect(indexFromClientX(0, rect, geom, 11)).toBe(0)
    expect(indexFromClientX(9999, rect, geom, 11)).toBe(10)
  })

  it('scales when the rendered width differs from the viewBox width', () => {
    // Half-size render: a click at 100 client px is 200 user units.
    expect(indexFromClientX(100, { left: 0, width: 200 }, geom, 11)).toBe(5)
  })

  it('returns 0 for a missing rect or a single point', () => {
    expect(indexFromClientX(100, null, geom, 11)).toBe(0)
    expect(indexFromClientX(100, rect, geom, 1)).toBe(0)
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
