// App206 — the redesigned UI. Receives the raw app model (state + handlers)
// from App.jsx, derives the view-models, owns local navigation/overlay state,
// and renders the responsive shell (rail · content · map / bottom nav).

import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect, useDeferredValue } from 'react'
import Fuse from 'fuse.js'
import { App206Context } from './context.js'
import { TopBar, RailNav, BottomNav, MapPanel, FilterPopover, Toast } from './shell.jsx'
import { Lightbox } from './atoms.jsx'
import { FeedbackModal } from './FeedbackModal.jsx'
import { WelcomeModal, HelpModal, isCleanColdLoad } from './Onboarding.jsx'
import { DiscoverView, FollowingView, YouView, ChannelDetail, EventDetail } from './views.jsx'
import { HealthDashboard } from '../components/HealthDashboard.jsx'
import { channelFromCalendar, upcomingIndexEvents, rowFromIndexEvent, eventInWindow } from './viewModels.js'
import { isCategoryTag, isNeighborhoodTag } from './categories.js'
import { eventKey } from '../lib/eventKey.js'
import { haversineKm } from '../lib/haversine.js'
import { deserializeHash } from './urlHash.js'
import { useUrlState } from './useUrlState.js'

const FUSE_THRESHOLD = 0.1
// Search the entire field, not just its first ~10 characters — see App.jsx /
// event-search.ts for the full rationale (favorites filter parity).
const FUSE_IGNORE_LOCATION = true

// Desktop map-column resize bounds. RAIL_W mirrors the 84px rail column in the
// .app206 grid; MIN_CONTENT_W is the floor below which the content column gets
// uncomfortably narrow. MAP_WIDTH_KEY persists the chosen width.
const MAP_WIDTH_KEY = 'map-panel-width'
// First-run flag (same `calendar-ripper-*` convention as the favorites keys in
// App.jsx). Presence means the welcome card has been seen/dismissed.
const FTUX_SEEN_KEY = 'calendar-ripper-ftux-seen'
const MAP_WIDTH_MIN = 320
const RAIL_W = 84
const MIN_CONTENT_W = 420

export function App206(props) {
  const {
    calendars, eventsIndex, venues, loading, buildErrors,
    favoritesSet, toggleFavorite,
    searchFilters, addSearchFilter, removeSearchFilter,
    geoFilters, addGeoFilter, deleteGeoFilter, editGeoFilter,
    eventAttributions, calendarTagsByIcsUrl, calendarNameByIcsUrl, eventCountByIcsUrl,
    followingGroups,
    lists, activeListId, activeList, setActiveList, createList, renameList, deleteList, canCreateList, uatMode,
    authUser, handleLogin, handleLogout, API_URL,
    isMobile,
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
  // Help modal is always available (not gated by the first-run flag).
  const [helpOpen, setHelpOpen] = useState(false)
  const openHelp = useCallback(() => setHelpOpen(true), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])
  // Live Leaflet map instance (set by EventsMap via MapBridge) + desktop
  // expand toggle.
  const mapRef = useRef(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const toggleMapExpand = useCallback(() => setMapExpanded((v) => !v), [])
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
  const upcomingEvents = useMemo(() => upcomingIndexEvents(eventsIndex || []), [eventsIndex])
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

  /* ---- search: ONE Fuse over the upcoming window, matches memoized into a
     key Set so per-view filtering is an O(n) membership test (no per-keystroke
     index rebuilds → no freeze). ---- */
  const queryFuse = useMemo(
    () => new Fuse(upcomingEvents, { keys: ['summary', 'description', 'location'], threshold: FUSE_THRESHOLD, ignoreLocation: FUSE_IGNORE_LOCATION }),
    [upcomingEvents]
  )
  const queryKeySet = useMemo(() => {
    const q = query.trim()
    if (!q) return null
    const set = new Set()
    for (const r of queryFuse.search(q)) set.add(eventKey(r.item))
    return set
  }, [queryFuse, query])
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

  /* ---- navigation handlers ---- */
  const clearOverlays = useCallback(() => { setOpenCh(null); setOpenEventObj(null) }, [])
  const go = useCallback((id) => { clearOverlays(); onSelectChannel(null); setSection(id) }, [clearOverlays, onSelectChannel])
  const openChannel = useCallback((icsUrl) => {
    setOpenEventObj(null); setOpenCh(icsUrl)
    const ch = channelByIcsUrl.get(icsUrl)
    if (ch) onSelectChannel({ ...ch.cal, ripperName: ch.ripperName })
  }, [channelByIcsUrl, onSelectChannel])
  const openEvent = useCallback((event) => { setOpenCh(null); onSelectChannel(null); setOpenEventObj(event) }, [onSelectChannel])
  const back = useCallback(() => { clearOverlays(); onSelectChannel(null) }, [clearOverlays, onSelectChannel])
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

  const model = {
    // raw
    calendars, eventsIndex, loading, buildErrors,
    favoritesSet, toggleFollow,
    searchFilters, addSearchFilter, removeSearchFilter,
    geoFilters, addGeoFilter, deleteGeoFilter, editGeoFilter,
    eventAttributions, calendarTagsByIcsUrl, calendarNameByIcsUrl,
    lists, activeListId, activeList, setActiveList, createList, renameList, deleteList, canCreateList, uatMode,
    authUser, handleLogin, handleLogout, API_URL, isMobile,
    channelEvents, channelEventsLoading, channelEventsError,
    createWebcalUrl, createGoogleCalendarUrl, createHttpsUrl,
    calendarAddMode, setCalendarAddMode,
    // derived
    channels, channelByIcsUrl, categoryTags, neighborhoodTags, calendarsPerTag,
    upcomingEvents: scopedUpcoming, eventsByIcsUrl,
    feedGroups, matchEvents, queryKeySet, inScope,
    // ui state
    section, openCh, openEventObj, dateWindow, setDateWindow, dateWindowPending, emphasis, setEmphasis,
    query, setQuery, clearSearch, category, setCategory, neighborhood, setNeighborhood,
    costFilter, setCostFilter,
    hasActiveFilters, toast, todayLabel,
    showWelcome, dismissWelcome, helpOpen, openHelp, closeHelp,
    lightbox, openLightbox, closeLightbox,
    feedbackPrefill, openFeedback, closeFeedback,
    mapRef, mapExpanded, toggleMapExpand, mapScope, setMapScope,
    mapWidth, setMapWidth,
    // handlers
    go, openChannel, openEvent, back, toggleFilter, flash, saveArea,
  }

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
  if (section === 'health') content = <div style={{ padding: 'var(--pad)' }}><HealthDashboard buildErrors={buildErrors} calendars={calendars} healthTab={healthTab} healthSource={healthSource} onTabChange={selectHealthTab} onSelectSource={selectHealthSource} /></div>
  else if (openEventObj) content = <EventDetail event={openEventObj} />
  else if (openCh) content = <ChannelDetail icsUrl={openCh} />
  else if (section === 'discover') content = <DiscoverView />
  else if (section === 'map') content = <MapPanel mobile />
  else if (section === 'following') content = <FollowingView />
  else content = <YouView />

  return (
    <App206Context.Provider value={model}>
      <div className="mk app206" data-nav="adaptive"
        style={mapWidth ? { '--a-map-w': `${mapWidth}px` } : undefined}>
        <div className="a-rail"><RailNav /></div>
        <div className="a-top"><TopBar /></div>
        <div className="a-content" key={contentKey} ref={contentRef}>
          {loading ? <div className="a-empty" style={{ padding: '40px var(--pad)' }}>Loading…</div> : content}
        </div>
        <div className={`a-map${mapExpanded ? ' a-map--expanded' : ''}`}><MapPanel /></div>
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
