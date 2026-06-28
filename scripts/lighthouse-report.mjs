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
const MAX_HISTORY = 8

// Format a metric value for display. null → "—".
export function formatMetric(unit, value) {
  if (value == null || Number.isNaN(value)) return '—'
  switch (unit) {
    case 'score': return String(Math.round(value))
    case 'sec': return `${(value / 1000).toFixed(1)} s`
    case 'ms': return `${Math.round(value)} ms`
    case 'num': return value.toFixed(3)
    default: return String(value)
  }
}

function formatMagnitude(unit, absValue) {
  switch (unit) {
    case 'score': return String(Math.round(absValue))
    case 'sec': return `${(absValue / 1000).toFixed(2)} s`
    case 'ms': return `${Math.round(absValue)} ms`
    case 'num': return absValue.toFixed(3)
    default: return String(absValue)
  }
}

// A direction-aware delta string for one metric. Returns "—" when either side
// is missing, "≈" for within-noise changes, else e.g. "−0.20 s 🟢" (improved)
// or "+3 🔴" (regressed). 🟢 always means "better", regardless of metric.
export function formatDelta(metric, current, prev) {
  if (current == null || prev == null || Number.isNaN(current) || Number.isNaN(prev)) return '—'
  const d = current - prev
  if (Math.abs(d) <= metric.noise) return '≈'
  const improved = metric.lowerIsBetter ? d < 0 : d > 0
  const sign = d > 0 ? '+' : '−'
  return `${sign}${formatMagnitude(metric.unit, Math.abs(d))} ${improved ? '🟢' : '🔴'}`
}

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

// Encode/decode the embedded trend payload as base64. base64's alphabet
// ([A-Za-z0-9+/=]) can't contain "-->", so the JSON — whatever a future field
// holds — can never prematurely close the HTML comment and corrupt the marker.
function encodeTrend(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

// Find and parse the trend payload embedded in a prior PR comment. Returns
// { current, history } or null when absent/unparseable.
export function parseEmbeddedTrend(body) {
  if (!body) return null
  const m = body.match(new RegExp(`<!-- ${COMMENT_MARKER}:([A-Za-z0-9+/=]*)\\s*-->`, 's'))
  if (!m) return null
  try {
    const data = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'))
    return data && typeof data === 'object' ? data : null
  } catch { return null }
}

function metricsRow(metrics) {
  return METRICS.reduce((o, m) => { o[m.key] = metrics?.[m.key] ?? null; return o }, {})
}

// Build the PR comment markdown plus the trend payload to embed for next time.
//   current      — metrics from this run (extractMetrics)
//   previous     — metrics from the previous push (parsed from the old comment)
//   baselineMain — { metrics, sha, ts } from main's cache, or null
//   reportUrl    — temporary-public-storage report link (or null)
//   meta         — { sha, ts } stamps for this run (ts = ISO string)
//   priorHistory — the `history` array from the old comment (newest first)
export function buildComment({ current, previous, baselineMain, reportUrl, meta, priorHistory }) {
  const header = ['Metric', 'This PR', 'vs prev push', 'Main baseline', 'vs main']
  const sep = header.map(() => '---')
  const rows = METRICS.map((m) => {
    const cur = current?.[m.key] ?? null
    const prev = previous?.[m.key] ?? null
    const base = baselineMain?.metrics?.[m.key] ?? null
    return [
      m.label,
      formatMetric(m.unit, cur),
      formatDelta(m, cur, prev),
      formatMetric(m.unit, base),
      formatDelta(m, cur, base),
    ]
  })
  const table = [header, sep, ...rows].map((r) => `| ${r.join(' | ')} |`).join('\n')

  // A tiny Performance-score sparkline over recent runs (oldest → newest):
  // older history, then the previous push, then this run.
  const chrono = [...(priorHistory || [])].reverse()
    .concat(previous ? [previous] : [])
    .concat(current ? [current] : [])
  const sparkline = chrono.map((h) => h?.perf).filter((v) => Number.isFinite(v)).join(' → ')

  const baseLine = baselineMain
    ? `Main baseline: \`${(baselineMain.sha || '').slice(0, 7) || 'unknown'}\`${baselineMain.ts ? ` · ${baselineMain.ts.slice(0, 10)}` : ''}`
    : 'Main baseline: _not recorded yet — runs after the next push to `main`._'

  // The trend payload to embed for the next push: this run becomes `current`,
  // and the just-superseded `previous` leads the capped history.
  const embedded = {
    current: metricsRow(current),
    history: [previous, ...(priorHistory || [])].filter(Boolean).slice(0, MAX_HISTORY).map(metricsRow),
    meta,
  }

  const lines = [
    `<!-- ${COMMENT_MARKER}:${encodeTrend(embedded)} -->`,
    '## 🔦 Lighthouse',
    '',
    'Lab audit of the deployed preview (mobile, median of runs). Warn-only — these numbers don\'t gate the PR. 🟢 = better, 🔴 = worse, ≈ = within noise.',
    '',
    table,
    '',
    sparkline ? `**Performance trend (this PR):** ${sparkline}` : '',
    baseLine,
    reportUrl ? `\n[Full report ↗](${reportUrl})` : '',
    `\n<sub>commit \`${(meta?.sha || '').slice(0, 7)}\`</sub>`,
  ].filter((l) => l !== '')

  return { markdown: lines.join('\n'), embedded }
}
