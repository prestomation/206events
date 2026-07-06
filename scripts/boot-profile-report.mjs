// Pure helpers for the boot-interactivity PR-comment trend report — the
// sibling of scripts/lighthouse-report.mjs, sharing the generic table/trend
// machinery in scripts/trend-comment.mjs. The workflow step
// (.github/workflows/pr-preview.yml `boot-profile` job) runs
// web/scripts/boot-profile.mjs against the deployed preview, restores the
// main baseline saved by web-boot-profile-baseline.yml, calls these, and
// upserts the PR comment. See docs/web-boot-profiling-ci.md.

import {
  formatMetric,
  formatDelta,
  parseEmbeddedTrend as parseTrendWithMarker,
  buildTrendComment,
} from './trend-comment.mjs'

export { formatMetric, formatDelta }

// The metrics the harness emits, in display order. All lower-is-better
// millisecond durations; `noise` is the absolute change below which a delta
// renders as "≈" so hosted-runner jitter doesn't read as a regression
// (bands from docs/web-boot-profiling-ci.md).
export const METRICS = [
  { key: 'worstTask', label: 'Worst long task', unit: 'ms', lowerIsBetter: true, noise: 150 },
  { key: 'totalBlock', label: 'Total blocking', unit: 'ms', lowerIsBetter: true, noise: 300 },
  { key: 'swapBlock', label: 'Index-swap block', unit: 'ms', lowerIsBetter: true, noise: 150 },
  { key: 'tapResponse', label: 'Tap mid-swap → response', unit: 'ms', lowerIsBetter: true, noise: 100 },
  { key: 'splashTime', label: 'Splash time', unit: 'ms', lowerIsBetter: true, noise: 300 },
  { key: 'mapOpen', label: 'Map first open', unit: 'ms', lowerIsBetter: true, noise: 200 },
  { key: 'mapReopen', label: 'Map re-open', unit: 'ms', lowerIsBetter: true, noise: 200 },
  { key: 'youOpen', label: 'You tab open', unit: 'ms', lowerIsBetter: true, noise: 150 },
  // Seeded-personalization pass (docs/following-tab-performance.md): a
  // representative logged-in profile (35 favorites / 14 saved searches /
  // 1 geo filter) written to localStorage before boot.
  // Noise band calibrated from its first same-code run pair (5155 → 6451 ms
  // across a docs-only push): the metric sums long tasks over a ~5 s window,
  // so runner variance alone swings it by >1 s — a ±300 band false-flags.
  { key: 'personalizedSettle', label: 'Personalized boot blocking', unit: 'ms', lowerIsBetter: true, noise: 1500 },
  { key: 'followingOpen', label: 'Following tab open (seeded)', unit: 'ms', lowerIsBetter: true, noise: 150 },
]

export const COMMENT_MARKER = 'boot-profile-trend'

// Find and parse the trend payload embedded in a prior PR comment. Returns
// { current, history } or null when absent/unparseable.
export function parseEmbeddedTrend(body) {
  return parseTrendWithMarker(COMMENT_MARKER, body)
}

// Build the PR comment markdown plus the trend payload to embed for next time.
// Same argument shape as lighthouse-report.mjs's buildComment.
export function buildComment({ current, previous, baselineMain, reportUrl, meta, priorHistory }) {
  return buildTrendComment({
    spec: {
      metrics: METRICS,
      marker: COMMENT_MARKER,
      title: '## ⏱️ Boot interactivity',
      intro: 'Playwright lab profile of the deployed preview (mobile, 4× CPU throttle, median of runs): main-thread blocking through boot and the full events-index swap, plus tap responsiveness while the index lands. Warn-only — these numbers don\'t gate the PR. 🟢 = better, 🔴 = worse, ≈ = within noise.',
      sparklineKey: 'worstTask',
      sparklineLabel: 'Worst-task trend (this PR, ms)',
      reportLinkLabel: 'Run detail',
    },
    current, previous, baselineMain, reportUrl, meta, priorHistory,
  })
}
