// Cached Intl.DateTimeFormat instances.
//
// `Date.prototype.toLocaleDateString/toLocaleTimeString` construct a fresh
// Intl.DateTimeFormat on every call — ~0.1–1 ms each, which CPU-profiling
// showed dominating the main-thread block when the full events index lands
// (tens of thousands of calls across rowFromIndexEvent, day grouping, and the
// map pipeline). Formatting through a cached instance is 10–50× cheaper.
//
// Callers pass literal options objects, so the cache key derived from the
// options' insertion order is stable per call site. The cache is bounded by
// the number of distinct (locale, options) shapes in the codebase — a handful
// per timezone seen in event data — and lives for the session.
const formatCache = new Map()

export function cachedDateTimeFormat(locale, options = {}) {
  let key = locale
  for (const k of Object.keys(options)) key += `|${k}=${options[k]}`
  let fmt = formatCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options)
    formatCache.set(key, fmt)
  }
  return fmt
}

// Split a js-joda-style date string ("…T19:00:00-07:00[America/Los_Angeles]")
// into the display parts the map surface needs. Returns null when unparseable,
// so callers can fall back to the raw string.
//
// `dayIndex` is a whole-day counter derived from the LOCAL calendar date, so
// differencing two of them gives a DST-safe day gap — `(b - a) / 864e5` on the
// raw timestamps is off by an hour across a US DST boundary and rounds wrong.
// Every field formats through `cachedDateTimeFormat`, which is the whole reason
// this module exists: the map pipeline calls this per instance.
export function eventDateParts(dateStr) {
  const cleaned = String(dateStr ?? '').replace(/\[.*\]$/, '')
  const d = new Date(cleaned)
  if (Number.isNaN(d.getTime())) return null
  return {
    date: d,
    dow: cachedDateTimeFormat('en-US', { weekday: 'short' }).format(d),
    dowLong: cachedDateTimeFormat('en-US', { weekday: 'long' }).format(d),
    day: cachedDateTimeFormat('en-US', { day: 'numeric' }).format(d),
    dayMonth: cachedDateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d),
    time: cachedDateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d),
    monthLabel: cachedDateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d),
    dayIndex: Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5),
  }
}

// Whole-day counter for a Date in the local calendar — the same scale as
// `eventDateParts().dayIndex`, for "how far off is this" arithmetic.
export function localDayIndex(d = new Date()) {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5)
}
