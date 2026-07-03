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
