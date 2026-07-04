import { describe, it, expect } from 'vitest'
import {
  METRICS, formatDelta, parseEmbeddedTrend, buildComment, COMMENT_MARKER,
} from './boot-profile-report.mjs'
import { parseEmbeddedTrend as lighthouseParse } from './lighthouse-report.mjs'

const metric = (key) => METRICS.find((m) => m.key === key)

const sample = {
  worstTask: 860, totalBlock: 1900, swapBlock: 240, tapResponse: 180, splashTime: 2500,
  mapOpen: 1200, mapReopen: 950, youOpen: 400,
}

describe('METRICS', () => {
  it('covers every harness metric, all lower-is-better ms durations', () => {
    expect(METRICS.map((m) => m.key)).toEqual(
      ['worstTask', 'totalBlock', 'swapBlock', 'tapResponse', 'splashTime', 'mapOpen', 'mapReopen', 'youOpen'])
    for (const m of METRICS) {
      expect(m.unit).toBe('ms')
      expect(m.lowerIsBetter).toBe(true)
      expect(m.noise).toBeGreaterThan(0)
    }
  })
})

describe('formatDelta noise bands', () => {
  it('treats within-band changes as ≈ and beyond-band as real', () => {
    expect(formatDelta(metric('tapResponse'), 250, 180)).toBe('≈') // 70 ≤ 100
    expect(formatDelta(metric('tapResponse'), 350, 180)).toBe('+170 ms 🔴')
    expect(formatDelta(metric('worstTask'), 600, 860)).toBe('−260 ms 🟢')
  })
})

describe('buildComment', () => {
  it('renders every metric row with prev-push and baseline deltas', () => {
    const { markdown } = buildComment({
      current: sample,
      previous: { ...sample, worstTask: 2000 },
      baselineMain: { metrics: { ...sample, tapResponse: 8500 }, sha: 'abcdef1234567', ts: '2026-07-03T00:00:00Z' },
      reportUrl: null,
      meta: { sha: 'fedcba9876543', ts: '2026-07-03T01:00:00Z' },
      priorHistory: [],
    })
    expect(markdown).toContain('## ⏱️ Boot interactivity')
    for (const m of METRICS) expect(markdown).toContain(`| ${m.label} |`)
    expect(markdown).toContain('−1140 ms 🟢') // worstTask vs prev push
    expect(markdown).toContain('−8320 ms 🟢') // tapResponse vs main baseline
    expect(markdown).toContain('Main baseline: `abcdef1`')
    expect(markdown).toContain('<sub>commit `fedcba9`</sub>')
  })

  it('handles a first run: no previous, no baseline', () => {
    const { markdown } = buildComment({
      current: sample, previous: null, baselineMain: null, reportUrl: null,
      meta: { sha: 'fedcba9876543', ts: '2026-07-03T01:00:00Z' }, priorHistory: [],
    })
    expect(markdown).toContain('not recorded yet')
    // The delta columns render as dashes rather than crashing.
    expect(markdown).toContain('| Worst long task | 860 ms | — | — | — |')
  })

  it('round-trips the embedded trend: this run becomes previous on the next push', () => {
    const first = buildComment({
      current: sample, previous: null, baselineMain: null, reportUrl: null,
      meta: { sha: 'a'.repeat(40), ts: '2026-07-03T01:00:00Z' }, priorHistory: [],
    })
    const parsed = parseEmbeddedTrend(first.markdown)
    expect(parsed.current).toEqual(sample)
    expect(parsed.history).toEqual([])

    const second = buildComment({
      current: { ...sample, worstTask: 900 },
      previous: parsed.current,
      priorHistory: parsed.history,
      baselineMain: null, reportUrl: null,
      meta: { sha: 'b'.repeat(40), ts: '2026-07-03T02:00:00Z' },
    })
    const parsed2 = parseEmbeddedTrend(second.markdown)
    expect(parsed2.history).toEqual([sample])
    expect(second.markdown).toContain('**Worst-task trend (this PR, ms):** 860 → 900')
  })

  it('uses a marker distinct from the Lighthouse comment so the two upserts never collide', () => {
    expect(COMMENT_MARKER).not.toBe('lighthouse-trend')
    const { markdown } = buildComment({
      current: sample, previous: null, baselineMain: null, reportUrl: null,
      meta: { sha: 'c'.repeat(40), ts: '2026-07-03T01:00:00Z' }, priorHistory: [],
    })
    // The Lighthouse parser must NOT match a boot-profile comment (and vice versa).
    expect(lighthouseParse(markdown)).toBeNull()
    expect(parseEmbeddedTrend(markdown)).not.toBeNull()
  })
})
