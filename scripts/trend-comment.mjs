// Generic machinery for PR trend comments: a metrics table with "vs prev
// push" / "vs main baseline" delta columns, plus the base64 trend payload
// embedded in the comment so the next push can compute deltas without any
// external store. Pure data-in/markdown-out — no GitHub API, no filesystem.
//
// Two consumers parameterize it with their own metric table and marker:
//   scripts/lighthouse-report.mjs     (the original; its tests pin this code)
//   scripts/boot-profile-report.mjs   (boot-interactivity profile)
// See docs/web-boot-profiling-ci.md.

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

// Encode/decode the embedded trend payload as base64. base64's alphabet
// ([A-Za-z0-9+/=]) can't contain "-->", so the JSON — whatever a future field
// holds — can never prematurely close the HTML comment and corrupt the marker.
function encodeTrend(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

// Find and parse the trend payload embedded in a prior PR comment (identified
// by `marker`). Returns { current, history, meta } or null when absent or
// unparseable.
export function parseEmbeddedTrend(marker, body) {
  if (!body) return null
  const m = body.match(new RegExp(`<!-- ${marker}:([A-Za-z0-9+/=]*)\\s*-->`, 's'))
  if (!m) return null
  try {
    const data = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'))
    return data && typeof data === 'object' ? data : null
  } catch { return null }
}

function metricsRow(metricDefs, metrics) {
  return metricDefs.reduce((o, m) => { o[m.key] = metrics?.[m.key] ?? null; return o }, {})
}

// Build the PR comment markdown plus the trend payload to embed for next time.
//
//   spec — what makes each consumer's comment its own:
//     metrics        — [{ key, label, unit, lowerIsBetter, noise }, ...] in display order
//     marker         — hidden HTML-comment marker carrying the trend payload
//     title          — the comment's markdown heading line
//     intro          — one-line explainer under the heading
//     sparklineKey   — metric key charted in the mini history line (e.g. 'perf')
//     sparklineLabel — label for that line (e.g. 'Performance trend (this PR)')
//     reportLinkLabel — text for the optional reportUrl link
//
//   current      — metrics from this run
//   previous     — metrics from the previous push (parsed from the old comment)
//   baselineMain — { metrics, sha, ts } from main's cache, or null
//   reportUrl    — an external report link (or null)
//   meta         — { sha, ts } stamps for this run (ts = ISO string)
//   priorHistory — the `history` array from the old comment (newest first)
export function buildTrendComment({ spec, current, previous, baselineMain, reportUrl, meta, priorHistory }) {
  const { metrics: METRICS, marker, title, intro, sparklineKey, sparklineLabel, reportLinkLabel } = spec
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

  // A tiny sparkline of `sparklineKey` over recent runs (oldest → newest):
  // older history, then the previous push, then this run.
  const chrono = [...(priorHistory || [])].reverse()
    .concat(previous ? [previous] : [])
    .concat(current ? [current] : [])
  const sparkline = chrono.map((h) => h?.[sparklineKey]).filter((v) => Number.isFinite(v)).join(' → ')

  const baseLine = baselineMain
    ? `Main baseline: \`${(baselineMain.sha || '').slice(0, 7) || 'unknown'}\`${baselineMain.ts ? ` · ${baselineMain.ts.slice(0, 10)}` : ''}`
    : 'Main baseline: _not recorded yet — runs after the next push to `main`._'

  // The trend payload to embed for the next push: this run becomes `current`,
  // and the just-superseded `previous` leads the capped history.
  const embedded = {
    current: metricsRow(METRICS, current),
    history: [previous, ...(priorHistory || [])].filter(Boolean).slice(0, MAX_HISTORY).map((h) => metricsRow(METRICS, h)),
    meta,
  }

  const lines = [
    `<!-- ${marker}:${encodeTrend(embedded)} -->`,
    title,
    '',
    intro,
    '',
    table,
    '',
    sparkline ? `**${sparklineLabel}:** ${sparkline}` : '',
    baseLine,
    reportUrl ? `\n[${reportLinkLabel} ↗](${reportUrl})` : '',
    `\n<sub>commit \`${(meta?.sha || '').slice(0, 7)}\`</sub>`,
  ].filter((l) => l !== '')

  return { markdown: lines.join('\n'), embedded }
}
