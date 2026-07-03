import { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react'
import Fuse from 'fuse.js'
import { TAG_CATEGORIES } from '../../lib/config/tags.ts'
import { AttributionChips } from './components/AttributionChips.jsx'
import { AddToCalendar } from './components/AddToCalendar.jsx'
import { EventDescription } from './components/EventDescription.jsx'
import { HealthDashboard } from './components/HealthDashboard.jsx'
import { LoadingScreen } from './components/LoadingScreen.jsx'
import { useBreakpoint } from './hooks/useBreakpoint.js'
import { formatTagLabel } from './utils/format.js'
import { isIOS } from './utils/platform.js'
import { haversineKm } from './lib/haversine.js'
import { deduplicateEvents } from './lib/event-dedup.js'
import { eventKey } from './lib/eventKey.js'
import { extractIcsImageUrl } from './lib/icsImage.js'
import { createSearchClient } from './lib/searchClient.js'
import { App206 } from './redesign/App206.jsx'
import { upcomingIndexEvents, groupIndexEventsByDay } from './redesign/viewModels.js'

const FUSE_THRESHOLD = 0.1
// Calendar sidebar search can be more forgiving — "downtown community council" should
// find "Downtown Seattle Community Council" even with a word inserted in the middle.
// This threshold is UI-only (not subject to favorites filter parity with event-search.ts).
const CALENDAR_SEARCH_THRESHOLD = 0.4
// Search the entire field, not just its first ~10 characters. Fuse's default
// location-based scoring (location:0, distance:100) combined with our strict
// threshold otherwise rejects any term that isn't near the START of the field —
// e.g. "Elton"/"John" in "One Night Without Elton John" never matched while
// "choir" did. Must stay in sync with infra/favorites-worker/src/event-search.ts
// (favorites filter parity).
const FUSE_IGNORE_LOCATION = true

// Multiple favorites lists. Anonymous users get a single synthetic list backed
// by the original localStorage keys (so their experience is unchanged). Signed-in
// users get server-sourced lists, each with its own ICS feed URL.
const LOCAL_LIST_ID = 'local'
// Per-user list cap. Mirrors MAX_LISTS in infra/favorites-worker/src/lists.ts —
// the worker is the source of truth; this only gates the "New list" control.
const MAX_LISTS = 10
const LS_FAVORITES = 'calendar-ripper-favorites'
const LS_SEARCH = 'calendar-ripper-search-filters'
const LS_GEO = 'calendar-ripper-geo-filters'

function readLs(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : [] } catch { return [] }
}

// The anonymous single list, hydrated from localStorage.
function loadLocalList() {
  return {
    id: LOCAL_LIST_ID,
    name: 'My Favorites',
    feedUrl: null,
    icsUrls: readLs(LS_FAVORITES),
    searchFilters: readLs(LS_SEARCH),
    geoFilters: readLs(LS_GEO),
  }
}

// Coerce a server list payload into the client shape (arrays always present).
function normalizeServerList(l) {
  return {
    id: l.id,
    name: l.name,
    feedUrl: l.feedUrl || null,
    icsUrls: Array.isArray(l.icsUrls) ? l.icsUrls : [],
    searchFilters: Array.isArray(l.searchFilters) ? l.searchFilters : [],
    geoFilters: Array.isArray(l.geoFilters) ? l.geoFilters : [],
  }
}

// ----- Local UAT/demo mode -----
// The signed-in multi-list UI needs an OAuth backend, which static preview
// deploys don't have. Visiting any deploy with `?uat=1` fakes a signed-in
// session and keeps all lists in localStorage (no network), so the full
// multi-list UI is previewable. The flag is read from the URL on load and is
// NOT persisted — reload without `?uat=1` returns to normal logged-out mode.
const UAT_LISTS_KEY = 'calendar-ripper-uat-lists'
const UAT_USER = { name: 'UAT Tester', email: 'Demo session (browser-only)', picture: '', feedToken: 'uat', feedUrl: null }

function readUatFlag() {
  try { return new URLSearchParams(window.location.search).get('uat') === '1' } catch { return false }
}
function uatFeedUrl(id) {
  try { return `${window.location.origin}/feed/uat-${id}.ics` } catch { return `/feed/uat-${id}.ics` }
}
function uatList(id, name) {
  return { id, name, feedUrl: uatFeedUrl(id), icsUrls: [], searchFilters: [], geoFilters: [] }
}
function loadUatLists() {
  try {
    const s = localStorage.getItem(UAT_LISTS_KEY)
    if (s) {
      const arr = JSON.parse(s)
      if (Array.isArray(arr) && arr.length) return arr.map(normalizeServerList)
    }
  } catch {}
  return [uatList('default', 'My Favorites')]
}
function uatNewId(name, existing) {
  const base = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'list'
  const taken = new Set(existing.map(l => l.id))
  if (base !== 'default' && !taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

function localeDateMaybeYear(date, options) {
  const opts = date.getFullYear() !== new Date().getFullYear() ? { ...options, year: 'numeric' } : options
  return date.toLocaleDateString('en-US', opts)
}

function App() {
  // Read once per load; available to the useState initializers below.
  const uatMode = readUatFlag()

  const [calendars, setCalendars] = useState([])

  const [manifest, setManifest] = useState(null)
  const [venues, setVenues] = useState([])
  const [selectedCalendar, setSelectedCalendar] = useState(null)
  const [showHomepage, setShowHomepage] = useState(true)
  const [showHappeningSoon, setShowHappeningSoon] = useState(false)
  const [showHealthDashboard, setShowHealthDashboard] = useState(false)
  const [events, setEvents] = useState([])
  const [eventsIndex, setEventsIndex] = useState([])
  // Two-phase events load (issue #649): the small "soon" payload renders the
  // near-term views fast, then the full index arrives in the background. This
  // flag is false until the full index is in `eventsIndex` (or the full fetch
  // settled). Search surfaces it as a "loading all events" hint (so partial
  // results aren't read as "nothing found"); the map and favorites feed simply
  // fill in silently once the full index replaces the soon subset.
  const [fullEventsLoaded, setFullEventsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  // Live-search runs in a Web Worker so the events-index JSON.parse, the Fuse
  // index build, and every per-query scan stay off the main thread (no typing /
  // scroll freeze). Created once; falls back to a main-thread engine where
  // Workers are unavailable. See lib/searchClient.js and docs/web-search-worker.md.
  const searchClientRef = useRef(null)
  if (searchClientRef.current === null) searchClientRef.current = createSearchClient()
  const searchClient = searchClientRef.current
  useEffect(() => () => searchClient.destroy(), [searchClient])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    window.innerWidth < 1440 ? 320 : 360
  )
  const [tagsHeight, setTagsHeight] = useState(150)
  const [footerMinimized, setFooterMinimized] = useState(true)
  // Mobile: 'list' shows sidebar, 'detail' shows events
  // Start on 'detail' so the homepage is visible on mobile
  const [mobileView, setMobileView] = useState('detail')
  const [tagsCollapsed, setTagsCollapsed] = useState(false)
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [dataRefreshed, setDataRefreshed] = useState(false)
  // Lists model. `favorites` / `searchFilters` / `geoFilters` are derived from
  // the active list so all the downstream memoized parity logic keeps operating
  // on a single set of arrays, unchanged.
  const [lists, setLists] = useState(() => uatMode ? loadUatLists() : [loadLocalList()])
  const [activeListId, setActiveListId] = useState(() => uatMode ? (loadUatLists()[0]?.id || 'default') : LOCAL_LIST_ID)

  const activeList = useMemo(
    () => lists.find(l => l.id === activeListId) || lists[0] || loadLocalList(),
    [lists, activeListId]
  )
  const favorites = activeList.icsUrls
  const searchFilters = activeList.searchFilters
  const geoFilters = activeList.geoFilters
  const favoritesSet = useMemo(() => new Set(favorites), [favorites])


  // Add-to-calendar button mode ('auto' | 'google' | 'ics'). Client-only
  // preference (no server sync) controlling what the per-event 📅 button does.
  const [calendarAddMode, setCalendarAddModeState] = useState(() => {
    try { return localStorage.getItem('calendar-ripper-add-mode') || 'auto' } catch { return 'auto' }
  })
  const setCalendarAddMode = useCallback((mode) => {
    setCalendarAddModeState(mode)
    try { localStorage.setItem('calendar-ripper-add-mode', mode) } catch {}
  }, [])

  // Auth state. In UAT mode we fake a signed-in user so the multi-list UI shows.
  const [authUser, setAuthUser] = useState(() => uatMode ? UAT_USER : null)
  const [authLoading, setAuthLoading] = useState(() => !uatMode)

  const API_URL = import.meta.env.VITE_FAVORITES_API_URL || ''

  // Mutate the active list in place. `mutate(list)` returns the changed array
  // fields (or null/undefined to no-op); `sync(list, next)` fires the matching
  // persistence call. Local list → localStorage; server list → per-list API.
  // In UAT mode no sync runs here — the whole lists array is persisted to
  // localStorage by the effect below.
  const mutateActiveList = useCallback((mutate, syncLocal, syncServer) => {
    setLists(prev => prev.map(l => {
      if (l.id !== activeListId) return l
      const patch = mutate(l)
      if (!patch) return l
      const next = { ...l, ...patch }
      if (uatMode) {
        // persisted by the [lists] effect
      } else if (l.id === LOCAL_LIST_ID) {
        syncLocal?.(next)
      } else if (API_URL && authUser) {
        syncServer?.(l, next)
      }
      return next
    }))
  }, [activeListId, authUser, API_URL, uatMode])

  // UAT mode: persist the whole lists array to localStorage on any change.
  useEffect(() => {
    if (!uatMode) return
    try { localStorage.setItem(UAT_LISTS_KEY, JSON.stringify(lists)) } catch {}
  }, [uatMode, lists])

  const toggleFavorite = useCallback((icsUrl) => {
    mutateActiveList(
      (l) => {
        const isFav = l.icsUrls.includes(icsUrl)
        return { icsUrls: isFav ? l.icsUrls.filter(u => u !== icsUrl) : [...l.icsUrls, icsUrl] }
      },
      (next) => { try { localStorage.setItem(LS_FAVORITES, JSON.stringify(next.icsUrls)) } catch {} },
      (l, next) => {
        // Added ⇒ POST, removed ⇒ DELETE (derive from the new array).
        const method = next.icsUrls.includes(icsUrl) ? 'POST' : 'DELETE'
        fetch(`${API_URL}/lists/${encodeURIComponent(l.id)}/favorites/${encodeURIComponent(icsUrl)}`, {
          method, credentials: 'include',
        }).catch(() => {})
      },
    )
  }, [mutateActiveList, API_URL])

  const addSearchFilter = useCallback((filter) => {
    const trimmed = filter.trim()
    if (!trimmed) return
    mutateActiveList(
      (l) => {
        if (l.searchFilters.some(f => f.toLowerCase() === trimmed.toLowerCase())) return null
        if (l.searchFilters.length >= 25) return null
        return { searchFilters: [...l.searchFilters, trimmed] }
      },
      (next) => { try { localStorage.setItem(LS_SEARCH, JSON.stringify(next.searchFilters)) } catch {} },
      (l) => {
        fetch(`${API_URL}/lists/${encodeURIComponent(l.id)}/search-filters`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: trimmed }),
        }).catch(() => {})
      },
    )
  }, [mutateActiveList, API_URL])

  const removeSearchFilter = useCallback((filter) => {
    mutateActiveList(
      (l) => ({ searchFilters: l.searchFilters.filter(f => f.toLowerCase() !== filter.toLowerCase()) }),
      (next) => { try { localStorage.setItem(LS_SEARCH, JSON.stringify(next.searchFilters)) } catch {} },
      (l) => {
        fetch(`${API_URL}/lists/${encodeURIComponent(l.id)}/search-filters/${encodeURIComponent(filter)}`, {
          method: 'DELETE', credentials: 'include',
        }).catch(() => {})
      },
    )
  }, [mutateActiveList, API_URL])

  // Geo filter CRUD
  const addGeoFilter = useCallback((filter) => {
    mutateActiveList(
      (l) => (l.geoFilters.length >= 10 ? null : { geoFilters: [...l.geoFilters, filter] }),
      (next) => { try { localStorage.setItem(LS_GEO, JSON.stringify(next.geoFilters)) } catch {} },
      (l) => {
        fetch(`${API_URL}/lists/${encodeURIComponent(l.id)}/geo-filters`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filter),
        }).catch(() => {})
      },
    )
  }, [mutateActiveList, API_URL])

  const deleteGeoFilter = useCallback((index) => {
    mutateActiveList(
      (l) => ({ geoFilters: l.geoFilters.filter((_, i) => i !== index) }),
      (next) => { try { localStorage.setItem(LS_GEO, JSON.stringify(next.geoFilters)) } catch {} },
      // Send the full updated array (not index) to avoid races when local and
      // server state are out of sync.
      (l, next) => {
        fetch(`${API_URL}/lists/${encodeURIComponent(l.id)}/geo-filters`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next.geoFilters),
        }).catch(() => {})
      },
    )
  }, [mutateActiveList, API_URL])

  const editGeoFilter = useCallback((index, filter) => {
    mutateActiveList(
      (l) => ({ geoFilters: l.geoFilters.map((f, i) => i === index ? filter : f) }),
      (next) => { try { localStorage.setItem(LS_GEO, JSON.stringify(next.geoFilters)) } catch {} },
      (l, next) => {
        fetch(`${API_URL}/lists/${encodeURIComponent(l.id)}/geo-filters`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next.geoFilters),
        }).catch(() => {})
      },
    )
  }, [mutateActiveList, API_URL])

  // ----- list management (signed-in only) -----
  const setActiveList = useCallback((id) => setActiveListId(id), [])

  const createList = useCallback(async (name) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return null
    if (uatMode) {
      let nl = null
      setLists(prev => {
        nl = uatList(uatNewId(trimmed, prev), trimmed)
        return [...prev, nl]
      })
      if (nl) setActiveListId(nl.id)
      return nl
    }
    if (!API_URL || !authUser) return null
    try {
      const res = await fetch(`${API_URL}/lists`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) return null
      const data = await res.json()
      const nl = normalizeServerList(data.list)
      setLists(prev => [...prev, nl])
      setActiveListId(nl.id)
      return nl
    } catch { return null }
  }, [API_URL, authUser, uatMode])

  const renameList = useCallback((id, name) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    setLists(prev => prev.map(l => l.id === id ? { ...l, name: trimmed } : l))
    if (!uatMode && API_URL && authUser && id !== LOCAL_LIST_ID) {
      fetch(`${API_URL}/lists/${encodeURIComponent(id)}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      }).catch(() => {})
    }
  }, [API_URL, authUser, uatMode])

  const deleteList = useCallback((id) => {
    setLists(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter(l => l.id !== id)
      setActiveListId(cur => (cur === id ? next[0].id : cur))
      return next
    })
    if (!uatMode && API_URL && authUser && id !== LOCAL_LIST_ID) {
      fetch(`${API_URL}/lists/${encodeURIComponent(id)}`, {
        method: 'DELETE', credentials: 'include',
      }).catch(() => {})
    }
  }, [API_URL, authUser, uatMode])

  // Check auth on mount
  useEffect(() => {
    if (uatMode) return // demo session already set
    if (!API_URL) { setAuthLoading(false); return }
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.user) setAuthUser(data.user) })
      .catch(() => {})
      .finally(() => setAuthLoading(false))
  }, [])

  const handleLogin = () => {
    if (API_URL) {
      const returnTo = encodeURIComponent(window.location.href)
      window.location.href = `${API_URL}/auth/login?provider=google&return_to=${returnTo}`
    }
  }

  const handleLogout = async () => {
    if (!uatMode && API_URL) {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
    }
    setAuthUser(null)
    // Revert to the anonymous single list (backed by localStorage).
    setLists([loadLocalList()])
    setActiveListId(LOCAL_LIST_ID)
  }

  // Sync lists on login. Fetch all server lists; on first login, migrate any
  // anonymous localStorage data into the (empty) default list so nothing is lost.
  useEffect(() => {
    if (uatMode) return // demo lists live in localStorage, not the API
    if (!authUser || !API_URL) return
    let cancelled = false

    fetch(`${API_URL}/lists`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data?.lists) return
        const serverLists = data.lists.map(normalizeServerList)
        const def = serverLists[0]

        // First-login migration: push anonymous localStorage state into the
        // default list when that list is still empty.
        const local = loadLocalList()
        const localHasData = local.icsUrls.length || local.searchFilters.length || local.geoFilters.length
        const defEmpty = def && !def.icsUrls.length && !def.searchFilters.length && !def.geoFilters.length
        if (def && defEmpty && localHasData) {
          if (local.icsUrls.length) {
            fetch(`${API_URL}/lists/${encodeURIComponent(def.id)}/favorites`, {
              method: 'PUT', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ favorites: local.icsUrls }),
            }).catch(() => {})
          }
          if (local.searchFilters.length) {
            fetch(`${API_URL}/lists/${encodeURIComponent(def.id)}/search-filters`, {
              method: 'PUT', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ searchFilters: local.searchFilters }),
            }).catch(() => {})
          }
          if (local.geoFilters.length) {
            fetch(`${API_URL}/lists/${encodeURIComponent(def.id)}/geo-filters`, {
              method: 'PUT', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(local.geoFilters),
            }).catch(() => {})
          }
          def.icsUrls = local.icsUrls
          def.searchFilters = local.searchFilters
          def.geoFilters = local.geoFilters
        }

        setLists(serverLists)
        setActiveListId(prev => serverLists.some(l => l.id === prev) ? prev : (def?.id || prev))
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [authUser])

  // Load calendar metadata from JSON manifest
  const loadCalendars = useCallback(async () => {
    try {
      const response = await fetch('./manifest.json')
      const manifestData = await response.json()
      setManifest(manifestData)

      const ripperGroups = manifestData.rippers.map(ripper => ({
        name: ripper.name,
        friendlyName: ripper.friendlyName,
        description: ripper.description,
        friendlyLink: ripper.friendlyLink,
        calendars: ripper.calendars.map(calendar => ({
          name: calendar.name,
          fullName: calendar.friendlyName,
          icsUrl: calendar.icsUrl,
          rssUrl: calendar.rssUrl,
          tags: calendar.tags
        }))
      }))

      // Add external calendars as individual groups
      const externalGroups = (manifestData.externalCalendars || []).map(calendar => ({
        name: calendar.name,
        description: calendar.description,
        friendlyLink: calendar.infoUrl,
        calendars: [{
          name: calendar.name,
          fullName: calendar.friendlyName,
          icsUrl: calendar.icsUrl, // Local file for viewing
          originalIcsUrl: calendar.originalIcsUrl, // Original URL for subscription
          tags: calendar.tags,
          isExternal: true
        }]
      }))

      // Add recurring calendars as individual groups
      const recurringGroups = (manifestData.recurringCalendars || []).map(calendar => ({
        name: calendar.name,
        description: null,
        friendlyLink: null,
        calendars: [{
          name: calendar.name,
          fullName: calendar.friendlyName,
          icsUrl: calendar.icsUrl,
          rssUrl: calendar.rssUrl,
          tags: calendar.tags,
          isRecurring: true
        }]
      }))

      setCalendars([...ripperGroups, ...externalGroups, ...recurringGroups])

      // Load events index for full-text event search (issue #649).
      // Phase 1: fetch the small "soon" payload (next ~8 days, no descriptions)
      // so the near-term views paint immediately. It's a strict subset of the
      // full index, so phase 2 below simply replaces it — no merge or dedup.
      try {
        const soonResponse = await fetch('./events-index-soon.json')
        if (soonResponse.ok) {
          const soonData = await soonResponse.json()
          if (Array.isArray(soonData)) {
            setEventsIndex(soonData)
            // Index the near-term subset so search works during the window
            // before the full index lands (cheap clone — soon has no descriptions).
            searchClient.index(soonData)
          }
        }
      } catch (e) {
        // Soon payload is an optional accelerator; the full fetch below is the
        // source of truth. Older deploys / previews may not have this file yet.
      }

      // Phase 2: fetch the full index in the background. Not awaited, so it
      // doesn't block the rest of boot (venues, build errors). When it lands it
      // replaces the soon subset and unlocks the whole-timeline views.
      //
      // The main thread only reads the response bytes (`arrayBuffer()` — no
      // parse); the ~9.6 MB JSON.parse + Fuse index build happen in the search
      // worker, which hands the parsed array back for rendering. Keeping the
      // fetch on the main thread preserves the service-worker cache / offline
      // path (the request still originates from the page).
      fetch('./events-index.json')
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(`events-index.json ${r.status}`)))
        .then(buf => searchClient.parse(buf))
        .then(fullData => {
          // The soon→full swap re-renders the whole app over ~10k+ events in
          // one commit — profiled at >1 s of main-thread block on production
          // data (several seconds on phones), landing right when the user
          // starts interacting. Mark it as a transition so React renders it
          // at low priority and can interrupt it to service taps/typing; the
          // soon subset stays on screen until the full tree is ready.
          startTransition(() => {
            if (Array.isArray(fullData)) setEventsIndex(fullData)
            setFullEventsLoaded(true)
          })
        })
        .catch(() => {
          // Full index unavailable — keep whatever the soon payload provided and
          // stop showing the "loading more" hint so the UI isn't stuck on it.
          console.warn('Full events index not available; search limited to the near-term window')
          setFullEventsLoaded(true)
        })

      // Load venues (fixed-location calendars) for the redesigned channel cards
      try {
        const venuesResponse = await fetch('./venues.json')
        if (venuesResponse.ok) {
          const venuesData = await venuesResponse.json()
          // venues.json is { generated, venues: [...] }
          setVenues(Array.isArray(venuesData) ? venuesData : (venuesData.venues || []))
        }
      } catch (e) {
        console.warn('Venues index not available')
      }


    } catch (error) {
      console.error('Failed to load calendars:', error)
    } finally {
      setLoading(false)
    }
  }, [searchClient])

  // Offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // Listen for service worker data update messages and reload in-memory data
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handler = (event) => {
      if (event.data?.type === 'DATA_UPDATED') {
        loadCalendars().then(() => setDataRefreshed(true))
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [loadCalendars])

  // Auto-dismiss the "data refreshed" toast after 4 seconds
  useEffect(() => {
    if (!dataRefreshed) return
    const timer = setTimeout(() => setDataRefreshed(false), 4000)
    return () => clearTimeout(timer)
  }, [dataRefreshed])

  const [currentDayHeader, setCurrentDayHeader] = useState(null)

  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'

  const sidebarRef = useRef(null)
  const resizeHandleRef = useRef(null)
  const verticalResizeHandleRef = useRef(null)
  const tagsRef = useRef(null)
  const calendarListRef = useRef(null)
  const agendaRef = useRef(null)
  const savedCalendarListScrollRef = useRef(0)
  
  // Track current day-group-header on mobile scroll for the back bar
  useEffect(() => {
    if (!isMobile || mobileView !== 'detail') {
      setCurrentDayHeader(null)
      return
    }

    let scrollCleanup = null
    let attached = false

    const setup = () => {
      if (attached) return
      const container = agendaRef.current
      if (!container) return

      const handleScroll = () => {
        const headers = container.querySelectorAll('.day-group-header')
        let current = null
        const containerTop = container.getBoundingClientRect().top

        for (const header of headers) {
          if (header.getBoundingClientRect().top <= containerTop + 10) {
            current = {
              label: header.querySelector('.day-group-label')?.textContent || '',
              date: header.querySelector('.day-group-date')?.textContent || ''
            }
          }
        }
        setCurrentDayHeader(current)
      }

      container.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll()
      attached = true
      scrollCleanup = () => container.removeEventListener('scroll', handleScroll)
    }

    // Try immediately, and also after a frame for navigation timing
    // (agendaRef may not be set yet after view transitions)
    setup()
    const frameId = requestAnimationFrame(setup)

    return () => {
      cancelAnimationFrame(frameId)
      scrollCleanup?.()
    }
  }, [isMobile, mobileView, showHappeningSoon, selectedCalendar, events, eventsLoading])


  // Resize functionality
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    
    const handleMouseMove = (e) => {
      const newWidth = Math.max(250, Math.min(600, startWidth + e.clientX - startX))
      setSidebarWidth(newWidth)
    }
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (resizeHandleRef.current) {
        resizeHandleRef.current.classList.remove('dragging')
      }
    }
    
    if (resizeHandleRef.current) {
      resizeHandleRef.current.classList.add('dragging')
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [sidebarWidth])
  
  // Vertical resize functionality
  const handleVerticalMouseDown = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = tagsHeight
    
    const handleMouseMove = (e) => {
      const newHeight = Math.max(80, Math.min(300, startHeight + e.clientY - startY))
      setTagsHeight(newHeight)
    }
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (verticalResizeHandleRef.current) {
        verticalResizeHandleRef.current.classList.remove('dragging')
      }
    }
    
    if (verticalResizeHandleRef.current) {
      verticalResizeHandleRef.current.classList.add('dragging')
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [tagsHeight])
  
  // Scroll fade indicators
  const updateScrollFade = useCallback((element, container) => {
    if (!element || !container) return
    
    const { scrollTop, scrollHeight, clientHeight } = element
    const canScrollUp = scrollTop > 0
    const canScrollDown = scrollTop < scrollHeight - clientHeight - 1
    
    let topFade = container.querySelector('.scroll-fade-top')
    let bottomFade = container.querySelector('.scroll-fade-bottom')
    
    if (!topFade) {
      topFade = document.createElement('div')
      topFade.className = 'scroll-fade-top'
      container.appendChild(topFade)
    }
    
    if (!bottomFade) {
      bottomFade = document.createElement('div')
      bottomFade.className = 'scroll-fade-bottom'
      container.appendChild(bottomFade)
    }
    
    topFade.style.opacity = canScrollUp ? '1' : '0'
    bottomFade.style.opacity = canScrollDown ? '1' : '0'
  }, [])
  
  // Set up scroll listeners
  useEffect(() => {
    const setupScrollListener = (ref) => {
      const element = ref.current
      if (!element) return
      
      const handleScroll = () => updateScrollFade(element, element)
      
      element.addEventListener('scroll', handleScroll)
      // Initial check
      setTimeout(() => handleScroll(), 100)
      
      return () => element.removeEventListener('scroll', handleScroll)
    }
    
    const cleanupTags = setupScrollListener(tagsRef)
    const cleanupCalendarList = setupScrollListener(calendarListRef)
    const cleanupAgenda = setupScrollListener(agendaRef)
    
    return () => {
      cleanupTags?.()
      cleanupCalendarList?.()
      cleanupAgenda?.()
    }
  }, [updateScrollFade, calendars, events])

  // Restore the saved calendar list scroll position when returning to the list on mobile
  useEffect(() => {
    if (isMobile && mobileView === 'list' && calendarListRef.current && savedCalendarListScrollRef.current > 0) {
      calendarListRef.current.scrollTop = savedCalendarListScrollRef.current
    }
  }, [isMobile, mobileView])

  const createWebcalUrl = (icsUrl, originalIcsUrl) => {
    const urlToUse = originalIcsUrl || icsUrl
    const fullUrl = originalIcsUrl ? urlToUse : new URL(icsUrl, window.location.origin + window.location.pathname).href
    return fullUrl.replace(/^https?:/, 'webcal:')
  }

  const createHttpsUrl = (icsUrl, originalIcsUrl) => {
    const urlToUse = originalIcsUrl || icsUrl
    return originalIcsUrl ? urlToUse : new URL(icsUrl, window.location.origin + window.location.pathname).href
  }

  const createGoogleCalendarUrl = (icsUrl, originalIcsUrl) => {
    // Google Calendar "Add by URL" subscribe. Must be an https(/http) feed URL —
    // a webcal: cid silently fails in the browser (hands off to an absent OS
    // handler), which is why the button appeared to do nothing.
    const httpsUrl = createHttpsUrl(icsUrl, originalIcsUrl)
    return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(httpsUrl)}`
  }

  const copyToClipboard = async (text, buttonElement) => {
    try {
      await navigator.clipboard.writeText(text)
      showPopover(buttonElement, 'Copied!')
    } catch (err) {
      showPopover(buttonElement, 'Copy failed')
    }
  }

  const showPopover = (element, message) => {
    const popover = document.createElement('div')
    popover.textContent = message
    popover.style.cssText = `
      position: absolute;
      background: var(--text-primary);
      color: var(--bg-surface);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      pointer-events: none;
    `
    
    const rect = element.getBoundingClientRect()
    popover.style.left = rect.left + 'px'
    popover.style.top = (rect.top - 30) + 'px'
    
    document.body.appendChild(popover)
    setTimeout(() => document.body.removeChild(popover), 2000)
  }

  const trackEvent = (action, icsUrl) => {
    if (window.goatcounter?.count) {
      window.goatcounter.count({
        path: `${action}/${icsUrl}`,
        event: true,
      })
    }
  }

  const parseRRuleDescription = (rrule) => {
    if (!rrule) return null
    
    try {
      const parts = rrule.split(';')
      let freq = null
      let byday = null
      let bymonth = null
      
      parts.forEach(part => {
        const [key, value] = part.split('=')
        if (key === 'FREQ') freq = value
        if (key === 'BYDAY') byday = value
        if (key === 'BYMONTH') bymonth = value
      })
      
      if (freq === 'MONTHLY' && byday) {
        const match = byday.match(/^(\d+)([A-Z]{2})$/)
        if (match) {
          const ordinal = match[1]
          const day = match[2]
          
          const ordinalMap = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th' }
          const dayMap = { 'MO': 'Monday', 'TU': 'Tuesday', 'WE': 'Wednesday', 'TH': 'Thursday', 'FR': 'Friday', 'SA': 'Saturday', 'SU': 'Sunday' }
          
          let description = `${ordinalMap[ordinal]} ${dayMap[day]} of each month`
          
          if (bymonth) {
            const months = bymonth.split(',').map(m => {
              const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
              return monthNames[parseInt(m)]
            })
            description += ` (${months.join(', ')} only)`
          }
          
          return description
        }
      }
      
      return `Recurring: ${rrule}`
    } catch (e) {
      return 'Recurring event'
    }
  }

  useEffect(() => {
    loadCalendars()
  }, [loadCalendars])


  // Helper: look up a calendar's friendly name from its icsUrl
  const calendarNameByIcsUrl = useMemo(() => {
    const map = {}
    calendars.forEach(ripper => {
      ripper.calendars.forEach(cal => {
        map[cal.icsUrl] = ripper.friendlyName || cal.fullName
      })
    })
    return map
  }, [calendars])

  // Helper: count upcoming events per calendar from events-index
  const eventCountByIcsUrl = useMemo(() => {
    const counts = {}
    eventsIndex.forEach(event => {
      counts[event.icsUrl] = (counts[event.icsUrl] || 0) + 1
    })
    return counts
  }, [eventsIndex])

  // Helper: look up a calendar's tags from its icsUrl
  const calendarTagsByIcsUrl = useMemo(() => {
    const map = {}
    calendars.forEach(ripper => {
      ripper.calendars.forEach(cal => {
        map[cal.icsUrl] = cal.tags || []
      })
    })
    return map
  }, [calendars])


  // Per-filter match counts and match sets for view mode filtering
  const perFilterMatches = useMemo(() => {
    // No saved filters → no matches to compute, and (more importantly) no reason
    // to build a full-corpus Fuse index on the main thread. This is the common
    // case (anonymous / no saved searches), so the guard skips an ~11k-event
    // index build per events-index load for most visitors.
    if (!eventsIndex.length || !searchFilters.length) return new Map()
    const fuse = new Fuse(eventsIndex, {
      keys: ['summary', 'description', 'location'],
      threshold: FUSE_THRESHOLD,
      ignoreLocation: FUSE_IGNORE_LOCATION,
    })
    const result = new Map()
    for (const filter of searchFilters) {
      const matches = new Set()
      for (const r of fuse.search(filter)) {
        matches.add(eventKey(r.item))
      }
      result.set(filter, matches)
    }
    return result
  }, [searchFilters, eventsIndex])

  // Compute summaries matching search filters (for favorites view) — derived from perFilterMatches
  const searchFilterMatchSummaries = useMemo(() => {
    const set = new Set()
    for (const matchSet of perFilterMatches.values()) {
      for (const key of matchSet) set.add(key)
    }
    return set
  }, [perFilterMatches])

  // Attribution map: Map<compositeKey, Attribution[]>
  // compositeKey = eventKey(event) = event.summary + '|' + event.date
  // Derives search attributions from perFilterMatches to avoid re-running Fuse
  const eventAttributions = useMemo(() => {
    const map = new Map()
    const addAttr = (key, attr) => {
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(attr)
    }

    // 1. Favorited calendars
    for (const event of eventsIndex) {
      if (favoritesSet.has(event.icsUrl)) {
        const calName = calendarNameByIcsUrl[event.icsUrl] || event.icsUrl
        addAttr(eventKey(event), { type: 'calendar', value: calName })
      }
    }

    // 2. Search filters — derive from perFilterMatches (already computed above)
    for (const [filter, matchSet] of perFilterMatches) {
      for (const key of matchSet) {
        addAttr(key, { type: 'search', value: filter })
      }
    }

    // 3. Geo filters — haversine formula matching infra/favorites-worker/src/feed.ts exactly
    if (geoFilters.length) {
      for (const event of eventsIndex) {
        if (event.lat == null || event.lng == null) continue
        for (const gf of geoFilters) {
          if (haversineKm(gf.lat, gf.lng, event.lat, event.lng) <= gf.radiusKm) {
            addAttr(eventKey(event), {
              type: 'geo',
              value: gf.label || `${gf.radiusKm} km`,
            })
          }
        }
      }
    }

    return map
  }, [eventsIndex, favoritesSet, perFilterMatches, geoFilters, calendarNameByIcsUrl])



  // Always-on personal feed for the redesigned "Following" view: an event is
  // included when it matches a followed calendar OR a saved search filter OR a
  // saved geo filter. Uses the same parity-locked helpers as the favorites-worker
  // ICS feed (haversineKm, eventKey, deduplicateEvents).
  const followingGroups = useMemo(() => {
    if (!eventsIndex.length) return []
    if (!favorites.length && !searchFilters.length && !geoFilters.length) return []
    let evs = upcomingIndexEvents(eventsIndex)
    evs = evs.filter(event => {
      const isFav = favoritesSet.has(event.icsUrl)
      const isSearch = searchFilterMatchSummaries.has(eventKey(event))
      const isGeo = geoFilters.length > 0 && event.lat != null && event.lng != null &&
        geoFilters.some(gf => haversineKm(gf.lat, gf.lng, event.lat, event.lng) <= gf.radiusKm)
      return isFav || isSearch || isGeo
    })
    evs = deduplicateEvents(evs)
    return groupIndexEventsByDay(evs)
  }, [eventsIndex, favoritesSet, searchFilterMatchSummaries, geoFilters, favorites.length, searchFilters.length])


  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set()
    calendars.forEach(ripper => {
      ripper.calendars.forEach(calendar => {
        calendar.tags.forEach(tag => tags.add(tag))
      })
    })
    return Array.from(tags).sort()
  }, [calendars])

  const groupedTags = useMemo(() => {
    const remaining = new Set(allTags)
    const groups = []
    for (const [category, categoryTags] of Object.entries(TAG_CATEGORIES)) {
      const matching = categoryTags.filter(t => remaining.has(t))
      if (matching.length > 0) {
        groups.push({ category, tags: matching })
        for (const t of matching) remaining.delete(t)
      }
    }
    // Tags that aren't in any category fall through to "Other" so they
    // still appear in the sidebar without forcing every PR to update
    // lib/config/tags.ts.
    if (remaining.size > 0) {
      const otherIdx = groups.findIndex(g => g.category === 'Other')
      const sorted = [...remaining].sort()
      if (otherIdx >= 0) {
        groups[otherIdx] = { category: 'Other', tags: [...groups[otherIdx].tags, ...sorted] }
      } else {
        groups.push({ category: 'Other', tags: sorted })
      }
    }
    return groups
  }, [allTags])

  const tagCounts = useMemo(() => {
    const counts = {}
    calendars.forEach(ripper => {
      ripper.calendars.forEach(calendar => {
        calendar.tags.forEach(tag => {
          counts[tag] = (counts[tag] || 0) + 1
        })
      })
    })
    return counts
  }, [calendars])

  // Load events for selected calendar
  useEffect(() => {
    setEvents([]) // Clear events immediately when calendar changes
    if (!selectedCalendar) {
      setEventsLoading(false)
      return
    }

    const loadEvents = async () => {
      setEventsLoading(true)
      setEventsError(null)
      try {
        // Lazy-load the iCal parser: it's only needed when a channel detail is
        // opened, so keep it out of the entry chunk (see docs/web-performance-plan.md N-2).
        const ICAL = (await import('ical.js')).default
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
        
        const response = await fetch(selectedCalendar.icsUrl, { 
          signal: controller.signal 
        })
        clearTimeout(timeoutId)
        
        const icsData = await response.text()
        
        const jcalData = ICAL.parse(icsData)
        const comp = new ICAL.Component(jcalData)
        const vevents = comp.getAllSubcomponents('vevent')
        
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // Start of today
        const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()) // 6 months ahead
        
        const eventList = []
        
        vevents.forEach(vevent => {
          const event = new ICAL.Event(vevent)
          const description = event.description || ''
          
          // Extract calendar name from description for tag aggregates
          let calendarName = null
          const fromMatch = description.match(/From (.+?)$/m)
          if (fromMatch) {
            calendarName = fromMatch[1]
          }
          
          // Check if this is a recurring event by looking for RRULE
          const rrule = vevent.getFirstProperty('rrule')
          const hasRRule = !!rrule
          
          if (hasRRule) {
            // Handle recurring event
            const expand = new ICAL.RecurExpansion({
              component: vevent,
              dtstart: vevent.getFirstPropertyValue('dtstart')
            })
            
            // Get the RRULE string for description
            const rruleString = rrule.toICALString()
            
            let next
            let instanceCount = 0
            const maxInstances = 100 // Prevent infinite loops
            
            while (instanceCount < maxInstances && (next = expand.next())) {
              const startDate = next.toJSDate()
              
              // Only include events from today onwards and within 6 months
              if (startDate >= today && startDate <= sixMonthsFromNow) {
                // Calculate end date for this instance
                const duration = event.endDate ? 
                  event.endDate.toUnixTime() - event.startDate.toUnixTime() : 
                  3600 // Default 1 hour if no end time
                
                const endDate = new Date(startDate.getTime() + (duration * 1000))
                
                eventList.push({
                  id: `${event.uid}-${startDate.getTime()}`, // Unique ID for each instance
                  title: event.summary,
                  description: event.description,
                  location: event.location,
                  url: vevent.getFirstPropertyValue('url'),
                  imageUrl: extractIcsImageUrl(vevent),
                  startDate: startDate,
                  endDate: endDate,
                  calendarName: calendarName,
                  isRecurring: true,
                  rrule: rruleString
                })
              }
              
              instanceCount++
              
              // Stop if we're past our date range
              if (startDate > sixMonthsFromNow) {
                break
              }
            }
          } else {
            // Handle single event
            const startDate = event.startDate.toJSDate()
            
            if (startDate >= today) {
              eventList.push({
                id: event.uid,
                title: event.summary,
                description: event.description,
                location: event.location,
                url: vevent.getFirstPropertyValue('url'),
                imageUrl: extractIcsImageUrl(vevent),
                startDate: startDate,
                endDate: event.endDate?.toJSDate(),
                calendarName: calendarName,
                isRecurring: false
              })
            }
          }
        })
        
        // Sort all events by start date
        eventList.sort((a, b) => a.startDate - b.startDate)
        
        setEvents(eventList)
      } catch (error) {
        if (error.name === 'AbortError') {
          setEventsError('Calendar loading timed out. This calendar may be too large.')
        } else {
          setEventsError('Failed to load events. Please try again.')
        }
        console.error('Failed to load events:', error)
        setEvents([])
      } finally {
        setEventsLoading(false)
      }
    }

    loadEvents()
  }, [selectedCalendar])

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateRange = (startDate, endDate) => {
    const start = formatDate(startDate)
    if (!endDate) return start

    const sameDay = startDate.toDateString() === endDate.toDateString()
    if (sameDay) {
      const endTime = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      return `${start} – ${endTime}`
    }

    return `${start} – ${formatDate(endDate)}`
  }

  const MobileIcsButton = ({ icsUrl, originalIcsUrl }) => {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef(null)

    useEffect(() => {
      if (!open) return
      const onClickOutside = (e) => {
        if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
      }
      const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
      document.addEventListener('mousedown', onClickOutside)
      document.addEventListener('keydown', onEsc)
      return () => {
        document.removeEventListener('mousedown', onClickOutside)
        document.removeEventListener('keydown', onEsc)
      }
    }, [open])

    if (isIOS()) {
      // iOS: webcal:// works natively — single tap to subscribe
      return (
        <a
          href={createWebcalUrl(icsUrl, originalIcsUrl)}
          title="Subscribe to calendar"
          className="action-link mobile-ics-btn"
          onClick={() => trackEvent('webcal', icsUrl)}
        >
          📥 Subscribe
        </a>
      )
    }

    // Android / other: dropdown with copy link + download
    const webcalUrl = createWebcalUrl(icsUrl, originalIcsUrl)
    const httpsUrl = createHttpsUrl(icsUrl, originalIcsUrl)

    return (
      <span className="mobile-ics-wrap" ref={wrapRef}>
        <button
          className="action-link mobile-ics-btn"
          onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        >
          📥 ICS
        </button>
        {open && (
          <div className="mobile-ics-dropdown">
            <button
              className="mobile-ics-option"
              onClick={(e) => {
                e.stopPropagation()
                copyToClipboard(webcalUrl, e.target)
                trackEvent('copy-link', icsUrl)
                setOpen(false)
              }}
            >
              🔗 Copy subscription link
            </button>
            <a
              className="mobile-ics-option"
              href={httpsUrl}
              download
              onClick={(e) => {
                e.stopPropagation()
                trackEvent('download-ics', icsUrl)
                setOpen(false)
              }}
            >
              📥 Download .ics (one-time)
            </a>
          </div>
        )}
      </span>
    )
  }

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <App206
      calendars={calendars}
      eventsIndex={eventsIndex}
      searchClient={searchClient}
      fullEventsLoaded={fullEventsLoaded}
      venues={venues}
      loading={loading}
      favoritesSet={favoritesSet}
      toggleFavorite={toggleFavorite}
      searchFilters={searchFilters}
      addSearchFilter={addSearchFilter}
      removeSearchFilter={removeSearchFilter}
      geoFilters={geoFilters}
      addGeoFilter={addGeoFilter}
      deleteGeoFilter={deleteGeoFilter}
      editGeoFilter={editGeoFilter}
      eventAttributions={eventAttributions}
      calendarTagsByIcsUrl={calendarTagsByIcsUrl}
      calendarNameByIcsUrl={calendarNameByIcsUrl}
      eventCountByIcsUrl={eventCountByIcsUrl}
      followingGroups={followingGroups}
      lists={lists}
      activeListId={activeListId}
      activeList={activeList}
      setActiveList={setActiveList}
      createList={createList}
      renameList={renameList}
      deleteList={deleteList}
      canCreateList={lists.length < MAX_LISTS}
      uatMode={uatMode}
      authUser={authUser}
      handleLogin={handleLogin}
      handleLogout={handleLogout}
      API_URL={API_URL}
      isMobile={isMobile}
      isDesktop={breakpoint === 'desktop'}
      channelEvents={events}
      channelEventsLoading={eventsLoading}
      channelEventsError={eventsError}
      onSelectChannel={setSelectedCalendar}
      createWebcalUrl={createWebcalUrl}
      createGoogleCalendarUrl={createGoogleCalendarUrl}
      createHttpsUrl={createHttpsUrl}
      calendarAddMode={calendarAddMode}
      setCalendarAddMode={setCalendarAddMode}
    />
  )
}

export default App
