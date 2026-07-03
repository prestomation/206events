// Pure helpers for the Lighthouse PR-comment trend report. No GitHub API, no
// filesystem — just data in, markdown out — so it's unit-testable. The workflow
// step (.github/workflows/pr-preview.yml) reads the LHCI results + restored
// main baseline, calls these, and upserts the PR comment.
//
// Two comparisons (issue: trending Lighthouse):
//   - vs the PREVIOUS push on this PR (stored in the comment itself, below the
//     marker, so no external state is needed), and
//   - vs the MAIN BASELINE (the last scores recorded on main, restored from the
//     Actions cache by web-lighthouse-baseline.yml).
//
// The generic table/trend machinery lives in scripts/trend-comment.mjs (shared
// with scripts/boot-profile-report.mjs); this module contributes the
// Lighthouse-specific metric table, marker, and LHCI-result extraction.

import {
  formatMetric,
  formatDelta,
  parseEmbeddedTrend as parseTrendWithMarker,
  buildTrendComment,
} from './trend-comment.mjs'

export { formatMetric, formatDelta }

// The metrics we surface, in display order. `unit` drives formatting;
// `lowerIsBetter` drives the improved/regressed indicator; `noise` is the
// absolute change below which a delta is shown as "≈" (neutral) so
// hosted-runner jitter doesn't read as a real regression.
export const METRICS = [
  { key: 'perf', label: 'Performance', unit: 'score', lowerIsBetter: false, noise: 1 },
  { key: 'lcp', label: 'LCP', unit: 'sec', lowerIsBetter: true, noise: 100 },
  { key: 'inp', label: 'INP', unit: 'ms', lowerIsBetter: true, noise: 30 },
  { key: 'tbt', label: 'TBT', unit: 'ms', lowerIsBetter: true, noise: 50 },
  { key: 'cls', label: 'CLS', unit: 'num', lowerIsBetter: true, noise: 0.01 },
  { key: 'fcp', label: 'FCP', unit: 'sec', lowerIsBetter: true, noise: 100 },
]

// Hidden marker carrying this PR's trend state (current run + recent history),
// so the next push can compute deltas without any external store.
export const COMMENT_MARKER = 'lighthouse-trend'

// Pull the metrics we care about out of an LHCI run. `manifest` is the parsed
// .lighthouseci/manifest.json array; `lhrByPath` maps each entry's jsonPath to
// its parsed Lighthouse report. Uses the representative (median) run. Audits
// that Lighthouse didn't produce (e.g. INP with no interactions in a lab load)
// come back null and render as "—".
export function extractMetrics(manifest, lhrByPath) {
  if (!Array.isArray(manifest) || manifest.length === 0) return null
  const entry = manifest.find((m) => m.isRepresentativeRun) || manifest[0]
  const lhr = lhrByPath?.[entry.jsonPath] || null
  const auditMs = (id) => {
    const a = lhr?.audits?.[id]
    return a && typeof a.numericValue === 'number' ? a.numericValue : null
  }
  const perfScore = lhr?.categories?.performance?.score
  return {
    perf: typeof perfScore === 'number' ? Math.round(perfScore * 100)
      : (typeof entry.summary?.performance === 'number' ? Math.round(entry.summary.performance * 100) : null),
    lcp: auditMs('largest-contentful-paint'),
    inp: auditMs('interaction-to-next-paint') ?? auditMs('experimental-interaction-to-next-paint'),
    tbt: auditMs('total-blocking-time'),
    cls: (() => { const a = lhr?.audits?.['cumulative-layout-shift']; return a && typeof a.numericValue === 'number' ? a.numericValue : null })(),
    fcp: auditMs('first-contentful-paint'),
  }
}

// Find and parse the trend payload embedded in a prior PR comment. Returns
// { current, history } or null when absent/unparseable.
export function parseEmbeddedTrend(body) {
  return parseTrendWithMarker(COMMENT_MARKER, body)
}

// Build the PR comment markdown plus the trend payload to embed for next time.
//   current      — metrics from this run (extractMetrics)
//   previous     — metrics from the previous push (parsed from the old comment)
//   baselineMain — { metrics, sha, ts } from main's cache, or null
//   reportUrl    — temporary-public-storage report link (or null)
//   meta         — { sha, ts } stamps for this run (ts = ISO string)
//   priorHistory — the `history` array from the old comment (newest first)
export function buildComment({ current, previous, baselineMain, reportUrl, meta, priorHistory }) {
  return buildTrendComment({
    spec: {
      metrics: METRICS,
      marker: COMMENT_MARKER,
      title: '## 🔦 Lighthouse',
      intro: 'Lab audit of the deployed preview (mobile, median of runs). Warn-only — these numbers don\'t gate the PR. 🟢 = better, 🔴 = worse, ≈ = within noise.',
      sparklineKey: 'perf',
      sparklineLabel: 'Performance trend (this PR)',
      reportLinkLabel: 'Full report',
    },
    current, previous, baselineMain, reportUrl, meta, priorHistory,
  })
}
