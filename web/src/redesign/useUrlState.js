// Bidirectional sync between App206's navigation/filter state and the URL hash.
//
// App206 owns the state (useState); this hook adopts those values + setters and:
//   1. Writes state -> hash on change (push for navigation so the back button
//      works; replaceState for filter/search edits so keystrokes don't pollute
//      history). The `query` write is debounced.
//   2. Reads hash -> state on hashchange/popstate (back/forward, manual edits).
//   3. Resolves the initial deep-linked event/channel token once async data
//      (eventsIndex, calendars) has loaded.
//
// Guard refs prevent feedback loops / mount clobbering:
//   - mountedRef: skip the very first outbound run so the initial deep-link
//     hash survives until the cold-load resolver can open its overlay.
//   - popstateJustFiredRef: browsers fire popstate THEN hashchange for history
//     navigation; skip the trailing hashchange so it doesn't double-apply.
//   - initialTokensRef: the hash captured at first render, used by the cold-load
//     resolver so it isn't affected by later outbound writes.
//
// No "applying from URL" guard is needed: after an inbound apply sets state, the
// outbound effect re-serializes it, finds it equals the current hash, and no-ops
// — so inbound changes never echo back out.

import { useEffect, useRef } from 'react'
import { serializeHash, deserializeHash } from './urlHash.js'
import { eventKey } from '../lib/eventKey.js'

const QUERY_DEBOUNCE_MS = 200

// Read the current hash off window.location, tolerating a missing '#'.
function currentHashTokens() {
  return deserializeHash(window.location.hash.slice(1))
}

export function useUrlState({
  // current values (to write out)
  section, openCh, openEventObj, dateWindow, emphasis, query, category, neighborhood, costFilter,
  healthTab, healthSource,
  // setters (to apply inbound filter/scope values directly)
  setDateWindow, setEmphasis, setQuery, setCategory, setNeighborhood, setCostFilter,
  setHealthTab, setHealthSource,
  // App206 handlers (clean inbound application of section/overlay changes)
  go, openChannel, openEvent, back,
  // derived data for cold-load resolution
  channelByIcsUrl, upcomingEvents, loading,
}) {
  const mountedRef = useRef(false)
  const popstateJustFiredRef = useRef(false)
  const resolvedRef = useRef(false)
  const queryDebounceRef = useRef(null)
  // Snapshot of the last-written navigation tokens, to decide push vs replace.
  // The health drawer (`source`) counts as navigation so the back button closes
  // it; the health `tab` is a replace (like filters) so it doesn't pile up
  // history entries.
  const prevNavRef = useRef({ section, channel: openCh, event: openEventObj ? eventKey(openEventObj) : null, source: healthSource })
  // The deep link present at first render — resolved once data loads.
  const initialTokensRef = useRef(null)
  if (initialTokensRef.current === null) initialTokensRef.current = currentHashTokens()

  // --- Outbound: state -> hash -------------------------------------------
  useEffect(() => {
    const eventToken = openEventObj ? eventKey(openEventObj) : null

    // Skip the first run: leave the initial deep-link hash intact so the
    // cold-load resolver (below) can read and open its overlay first.
    if (!mountedRef.current) {
      mountedRef.current = true
      prevNavRef.current = { section, channel: openCh, event: eventToken, source: healthSource }
      return
    }

    const tokens = {
      section,
      channel: openCh,
      event: eventToken,
      q: query,
      category,
      neighborhood,
      cost: costFilter,
      dateWindow,
      emphasis,
      healthTab,
      healthSource,
    }
    const hash = serializeHash(tokens)
    const target = hash ? '#' + hash : window.location.pathname + window.location.search

    // Navigation (section/overlay/drawer) changes push a history entry so
    // back/forward walks the user's path; filter/search/tab-only changes
    // replace in place.
    const prev = prevNavRef.current
    const navChanged =
      prev.section !== section || prev.channel !== openCh || prev.event !== eventToken ||
      prev.source !== healthSource
    prevNavRef.current = { section, channel: openCh, event: eventToken, source: healthSource }

    const write = () => {
      // No-op if the hash already matches: this is what suppresses the echo
      // after an inbound apply (serialized state == current hash) and avoids
      // redundant history entries.
      if (window.location.hash.slice(1) === hash) return
      if (navChanged) window.location.hash = hash
      else history.replaceState(null, '', target)
    }

    if (navChanged) {
      // Flush any pending debounced query write immediately on navigation.
      clearTimeout(queryDebounceRef.current)
      write()
    } else {
      // Debounce filter/search churn (mostly per-keystroke `query`).
      clearTimeout(queryDebounceRef.current)
      queryDebounceRef.current = setTimeout(write, QUERY_DEBOUNCE_MS)
    }

    return () => clearTimeout(queryDebounceRef.current)
  }, [section, openCh, openEventObj, query, category, neighborhood, costFilter, dateWindow, emphasis, healthTab, healthSource])

  // --- Inbound: hash -> state (back/forward, manual edits) ----------------
  useEffect(() => {
    const apply = () => {
      const t = currentHashTokens()

      // Filters/scope apply directly.
      setQuery(t.q)
      setCategory(t.category)
      setNeighborhood(t.neighborhood)
      setCostFilter(t.cost)
      setDateWindow(t.dateWindow)
      setEmphasis(t.emphasis)
      // Health dashboard tab + drilled-into source apply directly too.
      setHealthTab(t.healthTab)
      setHealthSource(t.healthSource)

      // Section + overlays via App206 handlers (which clear/set cleanly).
      if (t.event) {
        const target = upcomingEvents.find((e) => eventKey(e) === t.event)
        if (target) openEvent(target)
        else back() // stale token -> drop to underlying section
      } else if (t.channel) {
        if (channelByIcsUrl.has(t.channel)) openChannel(t.channel)
        else back()
      } else {
        go(t.section)
      }
    }

    const onPopstate = () => {
      popstateJustFiredRef.current = true
      apply()
      setTimeout(() => { popstateJustFiredRef.current = false }, 0)
    }
    const onHashchange = () => {
      if (popstateJustFiredRef.current) return
      apply()
    }

    window.addEventListener('popstate', onPopstate)
    window.addEventListener('hashchange', onHashchange)
    return () => {
      window.removeEventListener('popstate', onPopstate)
      window.removeEventListener('hashchange', onHashchange)
    }
  }, [upcomingEvents, channelByIcsUrl, go, openChannel, openEvent, back,
      setQuery, setCategory, setNeighborhood, setCostFilter, setDateWindow, setEmphasis,
      setHealthTab, setHealthSource])

  // --- Cold-load resolver: open the initial event/channel once data lands -
  useEffect(() => {
    if (resolvedRef.current || loading) return
    const t = initialTokensRef.current

    if (t.event) {
      if (!upcomingEvents.length) return // wait for data
      const target = upcomingEvents.find((e) => eventKey(e) === t.event)
      if (target) openEvent(target) // else: stale token, leave on section view
      resolvedRef.current = true
    } else if (t.channel) {
      if (!channelByIcsUrl.size) return // wait for data
      if (channelByIcsUrl.has(t.channel)) openChannel(t.channel)
      resolvedRef.current = true
    } else {
      resolvedRef.current = true
    }
  }, [loading, upcomingEvents, channelByIcsUrl, openEvent, openChannel])
}
