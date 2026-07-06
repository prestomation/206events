// App206 — the redesigned UI. Receives the raw app model (state + handlers)
// from App.jsx, derives the view-models, owns local navigation/overlay state,
// and renders the responsive shell (rail · content · map / bottom nav).

import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect, useDeferredValue, startTransition, lazy, Suspense } from 'react'
import { App206Context } from './context.js'
import { TopBar, RailNav, BottomNav, MapPanel, FilterPopover, Toast } from './shell.jsx'
import { Lightbox } from './atoms.jsx'
import { FeedbackModal } from './FeedbackModal.jsx'
import { WelcomeModal, HelpModal, isCleanColdLoad } from './Onboarding.jsx'
import { DiscoverView, FollowingView, YouView, ChannelDetail, EventDetail } from './views.jsx'

// Lazy-load the health dashboard: it's behind the You-tab "Site health"
// section that most sessions never open, so it (and its build-errors plumbing)
// stays out of the eager bundle. Same pattern as EventsMap in shell.jsx —
// see docs/lighthouse-performance-plan.md Phase 1c.
const HealthDashboard = lazy(() =>
  import('../components/HealthDashboard.jsx').then((m) => ({ default: m.HealthDashboard })),
)
import { channelFromCalendar, upcomingIndexEvents, rowFromIndexEvent, eventInWindow, filterDiscoverChannels, filterDiscoverEvents } from './viewModels.js'
import { isCategoryTag, isNeighborhoodTag } from './categories.js'
import { eventKey } from '../lib/eventKey.js'
import { haversineKm } from '../lib/haversine.js'
import { deserializeHash } from './urlHash.js'
import { useUrlState } from './useUrlState.js'

// Desktop map-column resize bounds. RAIL_W mirrors the 84px rail column in the
// .app206 grid; MIN_CONTENT_W is the floor below which the content column gets
// uncomfortably narrow. MAP_WIDTH_KEY persists the chosen width.
const MAP_WIDTH_KEY = 'map-panel-width'
// First-run flag (same `calendar-ripper-*` convention as the favorites keys in
// App.jsx). Presence means the welcome card has been seen/dismissed.
const FTUX_SEEN_KEY = 'calendar-ripper-ftux-seen'
// Debug-mode flag (QA spot-checking). When on, the venue / event detail pages
// render a curated debug panel of the underlying object's build-health data.
// Toggled from the Site Health dashboard header; persisted like other prefs.
const DEBUG_KEY = 'calendar-ripper-debug'
const MAP_WIDTH_MIN = 320
const RAIL_W = 84
const MIN_CONTENT_W = 420

export function App206(props) {
  const {
    calendars, eventsIndex, searchClient, fullEventsLoaded, venues, loading,
    favoritesSet, toggleFavorite,
    searchFilters, addSearchFilter, removeSearchFilter,
    geoFilters, addGeoFilter, deleteGeoFilter, editGeoFilter,
    eventAttributions, calendarTagsByIcsUrl, calendarNameByIcsUrl, eventCountByIcsUrl,
    followingGroups,
    lists, activeListId, activeList, setActiveList, createList, renameList, deleteList, canCreateList, uatMode,
    authUser, handleLogin, handleLogout, API_URL,
    isMobile, isDesktop,
    channelEvents, channelEventsLoading, channelEventsError, onSelectChannel,
    createWebcalUrl, createGoogleCalendarUrl, createHttpsUrl,
    calendarAddMode, setCalendarAddMode,
  } = props

  /* ---- local UI/navigation state ---- */
  // Deep-link seed: parse the hash once so cold-load lands on the right view
  // without a flash. openCh/openEventObj can't be seeded synchronously (the
  // objects don't exist until async data lands) — useUrlState resolves them.
  const initialUrl = deserializeHash(window.location.hash.slice(1))
  const [section, setSection] = useState(() => initialUrl.section)
  // Urgent mirror of `section` for the nav highlight only. Section changes
  // render the whole view swap inside startTransition (see `go`), so without
  // this the tapped tab couldn't show ANY feedback until the swap finished —
  // the exact "tab feels dead" symptom docs/web-tab-switch-performance.md
  // Fix 1 addresses. This paints on the next frame; the swap follows.
  const [navSection, setNavSection] = useState(() => initialUrl.section)
  const [openCh, setOpenCh] = useState(null)        // icsUrl
  const [openEventObj, setOpenEventObj] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [dateWindow, setDateWindow] = useState(() => initialUrl.dateWindow)
  const [emphasis, setEmphasis] = useState(() => initialUrl.emphasis)
  // Committed search query (drives filtering); the TopBar debounces into this.
  const [query, setQuery] = useState(() => initialUrl.q)
  // Browse filters shared across Discover / Following.
  const [category, setCategory] = useState(() => initialUrl.category)
  const [neighborhood, setNeighborhood] = useState(() => initialUrl.neighborhood)
  const [costFilter, setCostFilter] = useState(() => initialUrl.cost)
  // Health dashboard view state (deep-linked): active tab + drilled-into source.
  const [healthTab, setHealthTab] = useState(() => initialUrl.healthTab)
  const [healthSource, setHealthSource] = useState(() => initialUrl.healthSource)
  const [toast, setToast] = useState(null)
  const toastT = useRef(0)
  // Lightbox (full-image viewer) state: null when closed, { src, alt } when open.
  const [lightbox, setLightbox] = useState(null)
  const openLightbox = useCallback((src, alt) => { if (src) setLightbox({ src, alt: alt || '' }) }, [])
  const closeLightbox = useCallback(() => setLightbox(null), [])
  // Feedback modal: null when closed, { type, context? } when open. Rendered once
  // at the shell level; opened from YouView / ChannelDetail via openFeedback.
  const [feedbackPrefill, setFeedbackPrefill] = useState(null)
  const openFeedback = useCallback((prefill) => setFeedbackPrefill(prefill || { type: 'general' }), [])
  const closeFeedback = useCallback(() => setFeedbackPrefill(null), [])

  /* ---- first-run welcome + persistent help (explain-only FTUX) ---- */
  // Show the welcome card only on a clean cold load: the flag is unset AND the
  // initial URL is a plain Discover entry (no deep link to an event/channel or
  // another section), so shared links aren't interrupted.
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      if (localStorage.getItem(FTUX_SEEN_KEY)) return false
    } catch { return false }
    return isCleanColdLoad(initialUrl)
  })
  const dismissWelcome = useCallback(() => {
    setShowWelcome(false)
    try { localStorage.setItem(FTUX_SEEN_KEY, '1') } catch { /* ignore */ }
  }, [])
  // Debug mode — persisted QA toggle. When on, ChannelDetail / EventDetail show
  // a curated debug panel; build-errors.json is only fetched (by those panels)
  // while this is true, so a normal visitor pays nothing for it.
  const [debugMode, setDebugMode] = useState(() => {
    try { return localStorage.getItem(DEBUG_KEY) === '1' } catch { return false }
  })
  const toggleDebug = useCallback(() => {
    setDebugMode((v) => {
      const next = !v
      try {
        if (next) localStorage.setItem(DEBUG_KEY, '1')
        else localStorage.removeItem(DEBUG_KEY)
      } catch { /* ignore */ }
      return next
    })
  }, [])
  // Help modal is always available (not gated by the first-run flag).
  const [helpOpen, setHelpOpen] = useState(false)
  const openHelp = useCallback(() => setHelpOpen(true), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])
  // Live Leaflet map instance (set by EventsMap via MapBridge) + desktop
  // expand toggle.
  const mapRef = useRef(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const toggleMapExpand = useCallback(() => setMapExpanded((v) => !v), [])
  // The expanded map only exists inside the desktop-only map column. Reset the
  // flag when the viewport leaves desktop so re-widening later doesn't surprise
  // the user with a full-screen map they closed a session ago.
  useEffect(() => {
    if (!isDesktop) setMapExpanded(false)
  }, [isDesktop])
  // Desktop only: user-draggable width of the map column (px). null = use the
  // CSS default clamp(). Persisted so a resized map sticks across reloads.
  // Clamped in setMapWidth so the content column never collapses; passing null
  // resets to the default. See the resize handle in shell.jsx MapPanel.
  const [mapWidth, setMapWidthState] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(MAP_WIDTH_KEY), 10)
      return Number.isFinite(v) ? v : null
    } catch { return null }
  })
  const setMapWidth = useCallback((px) => {
    if (px == null) {
      setMapWidthState(null)
      try { localStorage.removeItem(MAP_WIDTH_KEY) } catch { /* ignore */ }
      return
    }
    // Keep at least RAIL_W + MIN_CONTENT_W for the rail + content columns.
    const max = Math.max(MAP_WIDTH_MIN, window.innerWidth - RAIL_W - MIN_CONTENT_W)
    const clamped = Math.round(Math.min(Math.max(px, MAP_WIDTH_MIN), max))
    setMapWidthState(clamped)
    try { localStorage.setItem(MAP_WIDTH_KEY, String(clamped)) } catch { /* ignore */ }
  }, [])
  // Mobile map scope ('all' | 'following'). The Map is its own bottom-nav tab on
  // mobile, so it can't derive scope from `section`; this persists across the
  // tab switch and auto-defaults on section entry (effect below). On desktop the
  // persistent map ignores this and strictly mirrors `section` instead.
  const [mapScope, setMapScope] = useState('all')
  // Entering Following defaults the map to the personal feed; entering Discover
  // resets it to all. Map/You/Health inherit the current scope, so tapping the
  // mobile Map tab right after Following lands on a favorites-scoped map.
  useEffect(() => {
    if (section === 'following') setMapScope('following')
    else if (section === 'discover') setMapScope('all')
  }, [section])

  // Map popups are hand-built DOM (outside React, see EventsMap.renderPopupHtml),
  // so wire their photo into the lightbox via a delegated click listener rather
  // than a per-popup React handler.
  useEffect(() => {
    const onClick = (e) => {
      const img = e.target.closest && e.target.closest('.map-popup-image')
      if (img && img.src) openLightbox(img.src, img.alt || '')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [openLightbox])

  const flash = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 2200)
  }, [])

  /* ---- venue lookup: icsUrl -> venue (presence ⇒ fixed-location calendar) ---- */
  const venueByIcsUrl = useMemo(() => {
    const map = new Map()
    for (const v of venues || []) {
      for (const c of v.calendars || []) {
        const href = c.links && c.links.ics && c.links.ics.href
        if (href) map.set(href, v)
      }
    }
    return map
  }, [venues])

  /* ---- upcoming events + per-calendar index ---- */
  // Display-only path: drop suppressed cross-source duplicates (`duplicateOf`),
  // folding them into their canonical (which carries `dedupedSources` for "also
  // listed in" attribution). Applied HERE, not in the shared upcomingIndexEvents
  // helper, so the parity-locked favorites/following path (App.jsx) stays aligned
  // with the favorites-worker feed. See docs/cross-source-event-dedup.md.
  const upcomingEvents = useMemo(
    () => upcomingIndexEvents(eventsIndex || []).filter((e) => !e.duplicateOf),
    [eventsIndex],
  )
  const eventsByIcsUrl = useMemo(() => {
    const map = new Map()
    for (const e of upcomingEvents) {
      if (!map.has(e.icsUrl)) map.set(e.icsUrl, [])
      map.get(e.icsUrl).push(e)
    }
    return map
  }, [upcomingEvents])

  /* ---- channels (one per manifest calendar) ---- */
  const channels = useMemo(() => {
    const out = []
    for (const ripper of calendars || []) {
      for (const cal of ripper.calendars) {
        const peek = (eventsByIcsUrl.get(cal.icsUrl) || []).slice(0, 2).map(rowFromIndexEvent)
        out.push(channelFromCalendar(cal, ripper, {
          upcomingCount: eventCountByIcsUrl[cal.icsUrl] || 0,
          peek,
          venue: venueByIcsUrl.get(cal.icsUrl) || null,
        }))
      }
    }
    return out
  }, [calendars, eventsByIcsUrl, eventCountByIcsUrl, venueByIcsUrl])

  const channelByIcsUrl = useMemo(() => {
    const map = new Map()
    for (const c of channels) map.set(c.icsUrl, c)
    return map
  }, [channels])

  /* ---- browsable tags + per-tag calendar counts ---- */
  const calendarsPerTag = useMemo(() => {
    const counts = new Map()
    for (const c of channels) for (const t of c.tags) counts.set(t, (counts.get(t) || 0) + 1)
    return counts
  }, [channels])
  const categoryTags = useMemo(() => {
    const set = new Set()
    for (const c of channels) for (const t of c.tags) if (isCategoryTag(t)) set.add(t)
    return [...set].sort()
  }, [channels])
  const neighborhoodTags = useMemo(() => {
    const set = new Set()
    for (const c of channels) for (const t of c.tags) if (isNeighborhoodTag(t)) set.add(t)
    return [...set].sort()
  }, [channels])

  /* ---- search: the Fuse index build + per-query scan run in a Web Worker
     (App.jsx owns the client), so the expensive pass — `ignoreLocation: true`
     scans every event's whole description, ~120 ms/query desktop and several
     hundred ms on mobile — never blocks the main thread. The worker returns a
     Set of matched event keys; per-view filtering stays an O(n) membership test.

     `query` is still routed through `useDeferredValue` so the search is kicked
     off at low priority (and rapid commits coalesce), but the heavy work is now
     off-thread regardless. `queryKeySet` is null when there's no query (= "no
     filter") OR while the first result for a new query is still in flight —
     consumers show the full list until the Set lands, and `queryPending` drives
     the "Searching…" hint so a partial frame isn't read as the final result.

     The worker indexes the raw corpus (a superset of `upcomingEvents`); extra
     keys for past/duplicate events are harmless because consumers only membership-
     test events already scoped to the upcoming, de-duplicated window. This is the
     client-only live box; the parity-locked saved-search path (App.jsx
     `perFilterMatches` / event-search.ts) is untouched. */
  const deferredQuery = useDeferredValue(query)
  const [queryKeySet, setQueryKeySet] = useState(null)
  const [searchInFlight, setSearchInFlight] = useState(false)
  useEffect(() => {
    const q = deferredQuery.trim()
    if (!q) {
      setQueryKeySet(null)
      setSearchInFlight(false)
      return
    }
    let cancelled = false
    setSearchInFlight(true)
    searchClient.search(q)
      .then((keys) => {
        if (cancelled) return
        setQueryKeySet(keys || null)
        setSearchInFlight(false)
      })
      .catch(() => {
        if (!cancelled) setSearchInFlight(false)
      })
    return () => { cancelled = true }
    // Re-run when the corpus changes (soon → full index) so results refresh
    // against the newly-indexed events.
  }, [deferredQuery, searchClient, eventsIndex])
  const queryPending = deferredQuery !== query || searchInFlight
  // Filter any list of index events by the committed query (membership test).
  const matchEvents = useCallback((q, list) => {
    if (!q || !q.trim() || !queryKeySet) return list
    return list.filter((e) => queryKeySet.has(eventKey(e)))
  }, [queryKeySet])

  /* ---- date-window filter ("next N days" slider; 'all' = no filter) ----
     The slider thumb/label bind to the urgent `dateWindow` so dragging stays
     responsive, but the expensive work (re-filtering ~10k+ events and rebuilding
     the Leaflet marker clusters) runs off a *deferred* copy. React renders the
     deferred update at low priority and coalesces rapid drags, so we pay the
     heavy commit once when the user pauses instead of once per slider step.
     `dateWindowPending` is true while the two diverge — used to show a spinner. */
  const deferredWindow = useDeferredValue(dateWindow)
  const dateWindowPending = deferredWindow !== dateWindow
  const inScope = useCallback((event) => eventInWindow(event, deferredWindow), [deferredWindow])

  const scopeGroups = useCallback((groups) => {
    if (deferredWindow === 'all') return groups
    return groups
      .map((g) => ({ ...g, events: g.events.filter(inScope) }))
      .filter((g) => g.events.length)
  }, [deferredWindow, inScope])

  const scopedUpcoming = useMemo(() => upcomingEvents.filter(inScope), [upcomingEvents, inScope])
  const feedGroups = useMemo(() => scopeGroups(followingGroups || []), [followingGroups, scopeGroups])

  /* ---- navigation handlers ----
     Every navigation renders a full keyed-view swap (teardown + mount of large
     subtrees), so the state changes that trigger it run inside startTransition:
     React renders the swap at interruptible transition priority instead of
     blocking the tap handler until the whole commit lands (the pattern
     PR 835 shipped, applied to navigation — Fix 1 in
     docs/web-tab-switch-performance.md). Only the tiny nav-highlight update
     (`navSection`) stays urgent so the pressed tab lights up immediately. */
  const clearOverlays = useCallback(() => { setOpenCh(null); setOpenEventObj(null) }, [])
  const go = useCallback((id) => {
    setNavSection(id)
    startTransition(() => { clearOverlays(); onSelectChannel(null); setSection(id) })
  }, [clearOverlays, onSelectChannel])
  const openChannel = useCallback((icsUrl) => {
    startTransition(() => {
      setOpenEventObj(null); setOpenCh(icsUrl)
      const ch = channelByIcsUrl.get(icsUrl)
      if (ch) onSelectChannel({ ...ch.cal, ripperName: ch.ripperName })
    })
  }, [channelByIcsUrl, onSelectChannel])
  const openEvent = useCallback((event) => {
    startTransition(() => { setOpenCh(null); onSelectChannel(null); setOpenEventObj(event) })
  }, [onSelectChannel])
  const back = useCallback(() => {
    startTransition(() => { clearOverlays(); onSelectChannel(null) })
  }, [clearOverlays, onSelectChannel])
  const toggleFilter = useCallback(() => setFilterOpen((v) => !v), [])

  /* ---- health dashboard handlers ---- */
  // Switching tabs closes any open drawer; selecting a source opens it. The
  // drawer push/replace semantics live in useUrlState.
  const selectHealthTab = useCallback((tab) => { setHealthSource(null); setHealthTab(tab) }, [])
  const selectHealthSource = useCallback((name) => { setHealthSource(name) }, [])
  // Leaving the health section resets its view state so a later return lands
  // clean (deep-linked entries set section === 'health', so this won't clobber them).
  useEffect(() => {
    if (section !== 'health') { setHealthTab('sources'); setHealthSource(null) }
  }, [section])

  /* ---- URL deep-linking: keep the hash in sync with the state above ---- */
  useUrlState({
    section, openCh, openEventObj, dateWindow, emphasis, query, category, neighborhood, costFilter,
    healthTab, healthSource,
    setDateWindow, setEmphasis, setQuery, setCategory, setNeighborhood, setCostFilter,
    setHealthTab, setHealthSource,
    go, openChannel, openEvent, back,
    channelByIcsUrl, upcomingEvents, loading,
  })

  /* ---- active filters: clearers + a convenience reset ---- */
  const clearSearch = useCallback(() => setQuery(''), [])
  const hasActiveFilters = !!(query.trim() || category || neighborhood || costFilter || dateWindow !== 'all')

  const toggleFollow = useCallback((icsUrl) => {
    const was = favoritesSet.has(icsUrl)
    toggleFavorite(icsUrl)
    if (!was) {
      const ch = channelByIcsUrl.get(icsUrl)
      const name = ch ? ch.name : 'calendar'
      // With more than one list, name the destination so it's clear where the
      // follow landed (matches the top-bar "Saving to" switcher).
      const multi = (lists?.length || 0) > 1
      flash(multi ? `Added “${name}” to ${activeList?.name || 'your list'}` : `Following ${name}`)
    }
  }, [favoritesSet, toggleFavorite, channelByIcsUrl, flash, lists, activeList])

  // "Save this area" turns whatever is currently framed on the map into a
  // location filter: center = map center, radius = distance from the center to
  // the nearest visible edge so the saved circle matches the viewport. If the
  // map isn't ready yet, fall back to the manual form in the You section.
  const saveArea = useCallback(() => {
    const map = mapRef.current
    if (!map) { go('you'); flash('Add a location filter below'); return }
    const c = map.getCenter()
    const b = map.getBounds()
    const toEdgeKm = Math.min(
      haversineKm(c.lat, c.lng, b.getNorth(), c.lng),
      haversineKm(c.lat, c.lng, c.lat, b.getEast())
    )
    const radiusKm = Math.max(0.5, Math.round(toEdgeKm * 10) / 10)
    addGeoFilter({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), radiusKm, label: 'Map area' })
    flash(`Saved this area (${radiusKm} km) as a location filter`)
  }, [addGeoFilter, go, flash])

  const todayLabel = useMemo(() =>
    new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase().replace(',', ' ·'),
  [])

  /* ---- Discover cross-tab match counts + smart default emphasis ----
     A frequent confusion on Discover: a search like "jazz" matches no *venues*
     (calendar names/tags) but plenty of *events*, and the Calendars tab is the
     default — so the user sees "No calendars match" and assumes the whole site
     has nothing. We compute both counts once here (single source of truth for
     the seg badges, the empty-state CTA, and the cross-tab hint) and use them to
     (a) land the user on whichever tab has results when a *new* search begins,
     and (b) surface the other tab's matches when they're on the side that has
     fewer/zero. Counts are null when there's no query (no badge). They mirror
     exactly what each mode renders (same filterDiscover* helpers). */
  const calMatchCount = useMemo(() => query.trim()
    ? filterDiscoverChannels(channels, { category, neighborhood, query }).length
    : null, [query, channels, category, neighborhood])
  const evMatchCount = useMemo(() => query.trim()
    ? filterDiscoverEvents(scopedUpcoming, {
      category, neighborhood, cost: costFilter, query, channelByIcsUrl, queryKeySet,
    }).length
    : null, [query, scopedUpcoming, category, neighborhood, costFilter, channelByIcsUrl, queryKeySet])

  // An explicit tab choice (seg button or a cross-tab CTA) suppresses the smart
  // default until the *next* new search — we never yank a user off a tab they
  // deliberately chose. `pickEmphasis` is the user-initiated setter; bare
  // `setEmphasis` (deep links, the effect below) doesn't latch.
  const emphasisPicked = useRef(false)
  const prevHadQuery = useRef(!!query.trim())
  const pickEmphasis = useCallback((tab) => { emphasisPicked.current = true; setEmphasis(tab) }, [])
  useEffect(() => {
    const hasQuery = !!query.trim()
    if (hasQuery && !prevHadQuery.current) emphasisPicked.current = false // new search re-arms it
    prevHadQuery.current = hasQuery
    if (!hasQuery || emphasisPicked.current) return
    // Only rescue the user off an *empty* tab; if the current tab has any
    // results, stay put and let the cross-tab hint point at the other side.
    if (emphasis === 'calendars' && calMatchCount === 0 && evMatchCount > 0) setEmphasis('events')
    else if (emphasis === 'events' && evMatchCount === 0 && calMatchCount > 0) setEmphasis('calendars')
  }, [query, emphasis, calMatchCount, evMatchCount])

  // The context value is memoized so its identity only changes when one of
  // its constituents does (Fix 4 first step, docs/web-tab-switch-performance.md):
  // a parent (App.jsx) re-render with unchanged props no longer re-renders
  // every context consumer. Setters from useState/useCallback are referentially
  // stable and listed anyway so the dep array mechanically mirrors the object.
  const model = useMemo(() => ({
    // raw
    calendars, eventsIndex, fullEventsLoaded, loading,
    favoritesSet, toggleFollow,
    searchFilters, addSearchFilter, removeSearchFilter,
    geoFilters, addGeoFilter, deleteGeoFilter, editGeoFilter,
    eventAttributions, calendarTagsByIcsUrl, calendarNameByIcsUrl, eventCountByIcsUrl,
    lists, activeListId, activeList, setActiveList, createList, renameList, deleteList, canCreateList, uatMode,
    authUser, handleLogin, handleLogout, API_URL, isMobile,
    channelEvents, channelEventsLoading, channelEventsError,
    createWebcalUrl, createGoogleCalendarUrl, createHttpsUrl,
    calendarAddMode, setCalendarAddMode,
    // derived
    channels, channelByIcsUrl, categoryTags, neighborhoodTags, calendarsPerTag,
    upcomingEvents: scopedUpcoming, allUpcomingEvents: upcomingEvents, eventsByIcsUrl,
    feedGroups, matchEvents, queryKeySet, inScope,
    // ui state
    section, navSection, openCh, openEventObj, dateWindow, setDateWindow, dateWindowPending, emphasis, setEmphasis, pickEmphasis,
    calMatchCount, evMatchCount,
    query, setQuery, queryPending, clearSearch, category, setCategory, neighborhood, setNeighborhood,
    costFilter, setCostFilter,
    hasActiveFilters, toast, todayLabel,
    showWelcome, dismissWelcome, helpOpen, openHelp, closeHelp,
    lightbox, openLightbox, closeLightbox,
    feedbackPrefill, openFeedback, closeFeedback,
    mapRef, mapExpanded, toggleMapExpand, mapScope, setMapScope,
    mapWidth, setMapWidth,
    debugMode, toggleDebug,
    // handlers
    go, openChannel, openEvent, back, toggleFilter, flash, saveArea,
  }), [
    calendars, eventsIndex, fullEventsLoaded, loading,
    favoritesSet, toggleFollow,
    searchFilters, addSearchFilter, removeSearchFilter,
    geoFilters, addGeoFilter, deleteGeoFilter, editGeoFilter,
    eventAttributions, calendarTagsByIcsUrl, calendarNameByIcsUrl, eventCountByIcsUrl,
    lists, activeListId, activeList, setActiveList, createList, renameList, deleteList, canCreateList, uatMode,
    authUser, handleLogin, handleLogout, API_URL, isMobile,
    channelEvents, channelEventsLoading, channelEventsError,
    createWebcalUrl, createGoogleCalendarUrl, createHttpsUrl,
    calendarAddMode, setCalendarAddMode,
    channels, channelByIcsUrl, categoryTags, neighborhoodTags, calendarsPerTag,
    scopedUpcoming, upcomingEvents, eventsByIcsUrl,
    feedGroups, matchEvents, queryKeySet, inScope,
    section, navSection, openCh, openEventObj, dateWindow, dateWindowPending, emphasis, setEmphasis, pickEmphasis,
    calMatchCount, evMatchCount,
    query, queryPending, clearSearch, category, neighborhood,
    costFilter,
    hasActiveFilters, toast, todayLabel,
    showWelcome, dismissWelcome, helpOpen, openHelp, closeHelp,
    lightbox, openLightbox, closeLightbox,
    feedbackPrefill, openFeedback, closeFeedback,
    mapExpanded, toggleMapExpand, mapScope,
    mapWidth, setMapWidth,
    debugMode, toggleDebug,
    go, openChannel, openEvent, back, toggleFilter, flash, saveArea,
  ])

  // Preserve each view's scroll position across navigation. The `.a-content`
  // scroll container is keyed by view, so forward-nav into an event/channel
  // detail starts at the top — but without this, returning to the list via the
  // back button would remount the container at scrollTop 0 and lose the user's
  // place. We record the live scrollTop per view key and restore it when that
  // view remounts.
  const contentRef = useRef(null)
  const scrollPositionsRef = useRef(new Map())
  const contentKey = openEventObj ? 'ev' : openCh ? 'ch' : section
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    // Restore before paint (no flash); default to the top for first visits.
    el.scrollTop = scrollPositionsRef.current.get(contentKey) ?? 0
    const onScroll = () => { scrollPositionsRef.current.set(contentKey, el.scrollTop) }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [contentKey])

  let content
  if (section === 'health') content = <div style={{ padding: 'var(--pad)' }}><Suspense fallback={null}><HealthDashboard calendars={calendars} healthTab={healthTab} healthSource={healthSource} onTabChange={selectHealthTab} onSelectSource={selectHealthSource} debugMode={debugMode} onToggleDebug={toggleDebug} /></Suspense></div>
  else if (openEventObj) content = <EventDetail event={openEventObj} />
  else if (openCh) content = <ChannelDetail icsUrl={openCh} />
  else if (section === 'discover') content = <DiscoverView />
  else if (section === 'map') content = null // rendered by the keep-alive .a-maptab sibling below
  else if (section === 'following') content = <FollowingView />
  else content = <YouView />

  // Keep-alive for the Map tab (Fix 2, docs/web-tab-switch-performance.md):
  // the tab's <MapPanel mobile> renders in a SIBLING of the keyed content
  // area and, once first opened, stays mounted for the rest of the session —
  // leaving the tab only hides it with CSS. Unmounting through the keyed
  // container made every re-entry pay Leaflet init + the full marker
  // pipeline again (mapReopen ≈ 90% of mapOpen); now a return visit is a
  // style flip plus the MapBridge ResizeObserver's invalidateSize(). The
  // lazy-until-first-open guarantee pinned by web/e2e/map-mount.spec.js is
  // preserved: nothing mounts until the first visit. The first entry mounts
  // the map in the same pass (mapTabVisit is true for it directly); the
  // monotonic keep-alive latch is written in an effect, NOT during render —
  // a render-phase write would survive a discarded transition render (tap
  // Map, tap away before commit) and mount the hidden map for a tab that
  // was never shown. While `loading` the content area still shows its
  // Loading… row instead, matching the other sections.
  const mapTabVisit = section === 'map' && !loading
  const [mapTabOpened, setMapTabOpened] = useState(false)
  useEffect(() => {
    if (mapTabVisit) setMapTabOpened(true)
  }, [mapTabVisit])
  const mapTabActive = contentKey === 'map' && !loading

  return (
    <App206Context.Provider value={model}>
      <div className="mk app206" data-nav="adaptive"
        style={mapWidth ? { '--a-map-w': `${mapWidth}px` } : undefined}>
        <div className="a-rail"><RailNav /></div>
        <div className="a-top"><TopBar /></div>
        <div className={`a-content${mapTabActive ? ' a-content--maphidden' : ''}`} key={contentKey} ref={contentRef}>
          {loading ? <div className="a-empty" style={{ padding: '40px var(--pad)' }}>Loading…</div> : content}
        </div>
        {(mapTabVisit || mapTabOpened) && (
          <div className={`a-maptab${mapTabActive ? '' : ' a-maptab--hidden'}`}>
            <MapPanel mobile />
          </div>
        )}
        {/* The persistent map column exists only at the desktop breakpoint
            (>= 1024px, where the CSS grid shows it). Below that it used to be
            merely display:none while React still mounted it — so phones paid
            for Leaflet plus the full marker pipeline over every event (twice,
            once more for the Map tab's own instance) without ever seeing this
            panel. Mount it only where it's visible; the mobile/tablet Map tab
            renders its own <MapPanel mobile /> in the content area instead. */}
        {isDesktop && <div className={`a-map${mapExpanded ? ' a-map--expanded' : ''}`}><MapPanel /></div>}
        <div className="a-nav"><BottomNav /></div>
        {filterOpen && <FilterPopover />}
        <Toast />
        <Lightbox />
        <FeedbackModal />
        <WelcomeModal />
        <HelpModal />
      </div>
    </App206Context.Provider>
  )
}
