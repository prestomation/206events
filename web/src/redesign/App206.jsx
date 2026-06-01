// App206 — the redesigned UI. Receives the raw app model (state + handlers)
// from App.jsx, derives the view-models, owns local navigation/overlay state,
// and renders the responsive shell (rail · content · map / bottom nav).

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import Fuse from 'fuse.js'
import { App206Context } from './context.js'
import { TopBar, RailNav, BottomNav, MapPanel, FilterPopover, Toast } from './shell.jsx'
import { DiscoverView, FollowingView, YouView, ChannelDetail, EventDetail } from './views.jsx'
import { HealthDashboard } from '../components/HealthDashboard.jsx'
import { channelFromCalendar, upcomingIndexEvents, rowFromIndexEvent, parseIndexDate } from './viewModels.js'
import { isCategoryTag, isNeighborhoodTag } from './categories.js'
import { eventKey } from '../lib/eventKey.js'
import { haversineKm } from '../lib/haversine.js'
import { deserializeHash } from './urlHash.js'
import { useUrlState } from './useUrlState.js'

const FUSE_THRESHOLD = 0.1

export function App206(props) {
  const {
    calendars, eventsIndex, venues, loading, buildErrors,
    favoritesSet, toggleFavorite,
    searchFilters, addSearchFilter, removeSearchFilter,
    geoFilters, addGeoFilter, deleteGeoFilter, editGeoFilter,
    eventAttributions, calendarTagsByIcsUrl, calendarNameByIcsUrl, eventCountByIcsUrl,
    followingGroups,
    authUser, handleLogin, handleLogout, API_URL,
    isMobile,
    channelEvents, channelEventsLoading, channelEventsError, onSelectChannel,
    createWebcalUrl, createGoogleCalendarUrl, createHttpsUrl,
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
  const [dateScope, setDateScope] = useState(() => initialUrl.dateScope)
  const [emphasis, setEmphasis] = useState(() => initialUrl.emphasis)
  // Committed search query (drives filtering); the TopBar debounces into this.
  const [query, setQuery] = useState(() => initialUrl.q)
  // Browse filters shared across Discover / Following.
  const [category, setCategory] = useState(() => initialUrl.category)
  const [neighborhood, setNeighborhood] = useState(() => initialUrl.neighborhood)
  const [toast, setToast] = useState(null)
  const toastT = useRef(0)
  // Live Leaflet map instance (set by EventsMap via MapBridge) + desktop
  // expand toggle.
  const mapRef = useRef(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const toggleMapExpand = useCallback(() => setMapExpanded((v) => !v), [])

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
    () => new Fuse(upcomingEvents, { keys: ['summary', 'description', 'location'], threshold: FUSE_THRESHOLD }),
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

  /* ---- date-scope filter ---- */
  const inScope = useCallback((event) => {
    if (dateScope === 'all') return true
    const parsed = parseIndexDate(event.date)
    if (!parsed) return false
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const day = new Date(parsed.date.getFullYear(), parsed.date.getMonth(), parsed.date.getDate())
    const diff = Math.round((day - todayStart) / 86400000)
    if (dateScope === 'today') return diff === 0
    if (dateScope === 'weekend') {
      // nearest upcoming Sat/Sun within the next 7 days
      const dow = day.getDay()
      return diff >= 0 && diff < 7 && (dow === 0 || dow === 6)
    }
    return true
  }, [dateScope])

  const scopeGroups = useCallback((groups) => {
    if (dateScope === 'all') return groups
    return groups
      .map((g) => ({ ...g, events: g.events.filter(inScope) }))
      .filter((g) => g.events.length)
  }, [dateScope, inScope])

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

  /* ---- URL deep-linking: keep the hash in sync with the state above ---- */
  useUrlState({
    section, openCh, openEventObj, dateScope, emphasis, query, category, neighborhood,
    setDateScope, setEmphasis, setQuery, setCategory, setNeighborhood,
    go, openChannel, openEvent, back,
    channelByIcsUrl, upcomingEvents, loading,
  })

  /* ---- active filters: clearers + a convenience reset ---- */
  const clearSearch = useCallback(() => setQuery(''), [])
  const hasActiveFilters = !!(query.trim() || category || neighborhood || dateScope !== 'all')

  const toggleFollow = useCallback((icsUrl) => {
    const was = favoritesSet.has(icsUrl)
    toggleFavorite(icsUrl)
    if (!was) { const ch = channelByIcsUrl.get(icsUrl); flash(`Following ${ch ? ch.name : 'calendar'}`) }
  }, [favoritesSet, toggleFavorite, channelByIcsUrl, flash])

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
    authUser, handleLogin, handleLogout, API_URL, isMobile,
    channelEvents, channelEventsLoading, channelEventsError,
    createWebcalUrl, createGoogleCalendarUrl, createHttpsUrl,
    // derived
    channels, channelByIcsUrl, categoryTags, neighborhoodTags, calendarsPerTag,
    upcomingEvents: scopedUpcoming, eventsByIcsUrl,
    feedGroups, matchEvents, inScope,
    // ui state
    section, openCh, openEventObj, dateScope, setDateScope, emphasis, setEmphasis,
    query, setQuery, clearSearch, category, setCategory, neighborhood, setNeighborhood,
    hasActiveFilters, toast, todayLabel,
    mapRef, mapExpanded, toggleMapExpand,
    // handlers
    go, openChannel, openEvent, back, toggleFilter, flash, saveArea,
  }

  let content
  if (section === 'health') content = <div style={{ padding: 'var(--pad)' }}><HealthDashboard buildErrors={buildErrors} calendars={calendars} /></div>
  else if (openEventObj) content = <EventDetail event={openEventObj} />
  else if (openCh) content = <ChannelDetail icsUrl={openCh} />
  else if (section === 'discover') content = <DiscoverView />
  else if (section === 'map') content = <MapPanel mobile />
  else if (section === 'following') content = <FollowingView />
  else content = <YouView />

  return (
    <App206Context.Provider value={model}>
      <div className="mk app206" data-nav="adaptive">
        <div className="a-rail"><RailNav /></div>
        <div className="a-top"><TopBar /></div>
        <div className="a-content" key={openEventObj ? 'ev' : openCh ? 'ch' : section}>
          {loading ? <div className="a-empty" style={{ padding: '40px var(--pad)' }}>Loading…</div> : content}
        </div>
        <div className={`a-map${mapExpanded ? ' a-map--expanded' : ''}`}><MapPanel /></div>
        <div className="a-nav"><BottomNav /></div>
        {filterOpen && <FilterPopover />}
        <Toast />
      </div>
    </App206Context.Provider>
  )
}
