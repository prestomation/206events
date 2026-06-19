// Shared, lazily-cached fetch of the published build-errors.json.
//
// Two consumers read it: the Health dashboard (always, when mounted) and the
// debug-mode panels on the venue / event detail pages (only when debug mode is
// on). A module-level cache means the file is fetched at most once per page
// load no matter how many consumers mount, and the debug panels cost a normal
// visitor nothing — the fetch only fires once `enabled` is true.

import { useEffect, useState } from 'react'

// Module-level singleton so every hook instance shares one in-flight request /
// resolved value. null until the first enabled consumer triggers the fetch.
let cachedPromise = null

function loadBuildErrors() {
  if (!cachedPromise) {
    cachedPromise = fetch('./build-errors.json')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return cachedPromise
}

/**
 * Returns the parsed build-errors.json (or null while loading / on failure).
 * Pass `enabled = false` to skip the fetch entirely — used by the debug panels
 * so the request only happens when debug mode is toggled on.
 */
export function useBuildErrors(enabled = true) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    loadBuildErrors().then(d => { if (active && d) setData(d) })
    return () => { active = false }
  }, [enabled])
  return data
}

// Test-only: reset the module-level cache between cases.
export function __resetBuildErrorsCache() {
  cachedPromise = null
}
