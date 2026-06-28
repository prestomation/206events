// Real-User Monitoring (RUM) for Core Web Vitals.
//
// Collects LCP / INP / CLS / FCP / TTFB in the browser via the `web-vitals`
// library and reports each as a BUCKETED GoatCounter custom event
// (`vitals/<metric>/<rating>`, rating ∈ good|needs-improvement|poor). INP is
// the headline metric — it's the one that captures "typing/tapping feels slow."
//
// Privacy (see docs/privacy-and-consent.md): this stays cookieless and
// non-identifying by design.
//   - It rides the EXISTING GoatCounter channel (no new third-party tracker).
//   - It reports rating BUCKETS, never raw per-visitor timings, so nothing is
//     individually identifying — and GoatCounter is count-only anyway.
//   - TWO DATA PLANES, never joined: the authenticated favorites-worker plane
//     (session JWT, user identity) is separate from this analytics plane. A
//     beacon must NEVER carry the logged-in identity (no user id / email /
//     listId) and must NEVER be routed through the authenticated worker — a
//     signed-in user's beacon is byte-for-byte identical to an anonymous one.
//     That separation is what keeps "non-identifying" true even with login.

import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals'

// Hosts/paths that must never report: local dev, the htmlpreview mirror, and
// Cloudflare Pages preview deploys (*.pages.dev) / gh-pages /preview/ paths.
// Mirrors the prod-only guard the GoatCounter loader uses in vite.config.js so
// PR previews and local dev don't pollute the field data.
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', 'htmlpreview.github.io']

export function isReportingEnv(loc = (typeof window !== 'undefined' ? window.location : null)) {
  if (!loc) return false
  if (BLOCKED_HOSTS.includes(loc.hostname)) return false
  if (loc.pathname && loc.pathname.indexOf('/preview/') !== -1) return false
  if (/\.pages\.dev$/.test(loc.hostname)) return false
  return true
}

// The GoatCounter path for a web-vitals metric: e.g. "vitals/INP/poor".
// `web-vitals` already classifies each value into the official CWV rating
// buckets, which are exactly the p75 thresholds Google reports against.
export function vitalPath(metric) {
  return `vitals/${metric.name}/${metric.rating || 'unknown'}`
}

// GoatCounter's count.js loads async and may not be present when the first
// metric fires. Queue beacons and flush whenever count() becomes available.
const queue = []

export function flushVitals(gc = (typeof window !== 'undefined' ? window.goatcounter : null)) {
  if (!gc || typeof gc.count !== 'function') return
  while (queue.length) {
    const path = queue.shift()
    // event: true records a GoatCounter event (not a pageview) at this path.
    try { gc.count({ path, title: 'web-vital', event: true }) } catch { /* swallow */ }
  }
}

export function reportVital(metric) {
  queue.push(vitalPath(metric))
  flushVitals()
}

export function initWebVitals() {
  if (!isReportingEnv()) return
  // Each callback fires once with the final value (LCP/FCP/TTFB early; INP/CLS
  // settle at visibility-hidden), so no metric is double-counted.
  onLCP(reportVital)
  onINP(reportVital)
  onCLS(reportVital)
  onFCP(reportVital)
  onTTFB(reportVital)
  // Safety flushes: if count.js loaded after an early metric was queued, drain
  // the backlog once the page is fully loaded and again as it's hidden/unloaded.
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => flushVitals())
    window.addEventListener('pagehide', () => flushVitals())
  }
}
