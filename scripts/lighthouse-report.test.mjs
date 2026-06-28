import { describe, it, expect } from 'vitest'
import {
  METRICS, formatMetric, formatDelta, extractMetrics,
  parseEmbeddedTrend, buildComment, COMMENT_MARKER,
} from './lighthouse-report.mjs'

const metric = (key) => METRICS.find((m) => m.key === key)

describe('formatMetric', () => {
  it('formats each unit', () => {
    expect(formatMetric('score', 82.4)).toBe('82')
    expect(formatMetric('sec', 2900)).toBe('2.9 s')
    expect(formatMetric('ms', 119.6)).toBe('120 ms')
    expect(formatMetric('num', 0.0421)).toBe('0.042')
  })
  it('renders missing values as a dash', () => {
    expect(formatMetric('ms', null)).toBe('—')
    expect(formatMetric('sec', NaN)).toBe('—')
  })
})

describe('formatDelta', () => {
  it('flags a lower-is-better improvement green', () => {
    expect(formatDelta(metric('lcp'), 2700, 3100)).toBe('−0.40 s 🟢')
  })
  it('flags a lower-is-better regression red', () => {
    expect(formatDelta(metric('tbt'), 400, 200)).toBe('+200 ms 🔴')
  })
  it('flags a higher-is-better (score) improvement green and regression red', () => {
    expect(formatDelta(metric('perf'), 85, 80)).toBe('+5 🟢')
    expect(formatDelta(metric('perf'), 78, 84)).toBe('−6 🔴')
  })
  it('shows ≈ for within-noise changes', () => {
    expect(formatDelta(metric('perf'), 82, 82)).toBe('≈')
    expect(formatDelta(metric('lcp'), 2950, 3000)).toBe('≈') // 50ms ≤ 100ms noise
    expect(formatDelta(metric('cls'), 0.045, 0.04)).toBe('≈') // 0.005 ≤ 0.01 noise
  })
  it('returns a dash when a side is missing', () => {
    expect(formatDelta(metric('inp'), null, 200)).toBe('—')
    expect(formatDelta(metric('inp'), 200, null)).toBe('—')
  })
})

describe('extractMetrics', () => {
  const lhr = {
    categories: { performance: { score: 0.82 } },
    audits: {
      'largest-contentful-paint': { numericValue: 2900 },
      'total-blocking-time': { numericValue: 210 },
      'cumulative-layout-shift': { numericValue: 0.03 },
      'first-contentful-paint': { numericValue: 1400 },
      // no interaction-to-next-paint audit (cold lab load)
    },
  }
  const manifest = [
    { jsonPath: '/lhci/a.json', isRepresentativeRun: false, summary: { performance: 0.5 } },
    { jsonPath: '/lhci/b.json', isRepresentativeRun: true, summary: { performance: 0.82 } },
  ]

  it('uses the representative run and pulls audit values', () => {
    const m = extractMetrics(manifest, { '/lhci/b.json': lhr })
    expect(m).toEqual({ perf: 82, lcp: 2900, inp: null, tbt: 210, cls: 0.03, fcp: 1400 })
  })

  it('falls back to summary score when the LHR is missing', () => {
    const m = extractMetrics(manifest, {})
    expect(m.perf).toBe(82) // from summary.performance of the representative run
    expect(m.lcp).toBeNull()
  })

  it('returns null for an empty manifest', () => {
    expect(extractMetrics([], {})).toBeNull()
    expect(extractMetrics(null, {})).toBeNull()
  })
})

describe('parseEmbeddedTrend', () => {
  it('round-trips a payload embedded by buildComment', () => {
    const { markdown } = buildComment({
      current: { perf: 82, lcp: 2900, inp: null, tbt: 210, cls: 0.03, fcp: 1400 },
      previous: null, baselineMain: null, reportUrl: null,
      meta: { sha: 'abcdef1234', ts: '2026-06-28T00:00:00Z' }, priorHistory: [],
    })
    const parsed = parseEmbeddedTrend(markdown)
    expect(parsed).not.toBeNull()
    expect(parsed.current.perf).toBe(82)
    expect(parsed.meta.sha).toBe('abcdef1234')
  })
  it('returns null when no marker is present', () => {
    expect(parseEmbeddedTrend('just a normal comment')).toBeNull()
  })
  it('returns null on malformed JSON', () => {
    expect(parseEmbeddedTrend(`<!-- ${COMMENT_MARKER}:{not json} -->`)).toBeNull()
  })
})

describe('buildComment', () => {
  const current = { perf: 82, lcp: 2900, inp: null, tbt: 210, cls: 0.03, fcp: 1400 }
  const previous = { perf: 80, lcp: 3100, inp: null, tbt: 260, cls: 0.03, fcp: 1500 }
  const baselineMain = { metrics: { perf: 85, lcp: 2500, inp: null, tbt: 150, cls: 0.02, fcp: 1300 }, sha: '1234567abcdef', ts: '2026-06-20T12:00:00Z' }

  it('renders a table with both comparison columns', () => {
    const { markdown } = buildComment({ current, previous, baselineMain, reportUrl: 'https://lh/report', meta: { sha: 'deadbeef999', ts: '2026-06-28T00:00:00Z' }, priorHistory: [] })
    expect(markdown).toContain('## 🔦 Lighthouse')
    expect(markdown).toContain('vs prev push')
    expect(markdown).toContain('Main baseline')
    // vs prev push: LCP improved 3100→2900
    expect(markdown).toContain('−0.20 s 🟢')
    // vs main: perf 82 vs baseline 85 is a regression
    expect(markdown).toContain('Main baseline: `1234567`')
    expect(markdown).toContain('[Full report ↗](https://lh/report)')
  })

  it('notes when there is no main baseline yet', () => {
    const { markdown } = buildComment({ current, previous: null, baselineMain: null, reportUrl: null, meta: { sha: 'deadbeef999', ts: '2026-06-28T00:00:00Z' }, priorHistory: [] })
    expect(markdown).toContain('not recorded yet')
  })

  it('accumulates a performance sparkline and caps history', () => {
    const priorHistory = [{ perf: 79 }, { perf: 77 }]
    const { markdown, embedded } = buildComment({ current, previous, baselineMain: null, reportUrl: null, meta: { sha: 's', ts: 't' }, priorHistory })
    // oldest → newest, ending in the current run's score
    expect(markdown).toContain('77 → 79 → 80 → 82')
    // history now leads with the just-superseded "previous"
    expect(embedded.history[0].perf).toBe(80)
    expect(embedded.history.length).toBeLessThanOrEqual(8)
  })
})
