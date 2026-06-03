import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Fuse from 'fuse.js'
import ICAL from 'ical.js'
import { TAG_CATEGORIES } from '../../lib/config/tags.ts'
import { GeoFiltersSection } from './components/GeoFiltersSection.jsx'
import { EventsMap } from './components/EventsMap.jsx'
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
import { App206 } from './redesign/App206.jsx'
import { upcomingIndexEvents, groupIndexEventsByDay } from './redesign/viewModels.js'

const FUSE_THRESHOLD = 0.1

function App() {
  const [calendars, setCalendars] = useState([])
  const [manifest, setManifest] = useState(null)
  const [venues, setVenues] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [selectedCalendar, setSelectedCalendar] = useState(null)
  const [showHomepage, setShowHomepage] = useState(true)
  const [showHappeningSoon, setShowHappeningSoon] = useState(false)
  const [showHealthDashboard, setShowHealthDashboard] = useState(false)
  const [buildErrors, setBuildErrors] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsIndex, setEventsIndex] = useState([])
  const [loading, setLoading] = useState(true)
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
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem('calendar-ripper-favorites')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  // Search filters state
  const [searchFilters, setSearchFilters] = useState(() => {
    try {
      const stored = localStorage.getItem('calendar-ripper-search-filters')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [newFilterInput, setNewFilterInput] = useState('')
  // View mode for favorites: 'all' | 'calendars' | 'search' | filter string
  const [favoritesViewMode, setFavoritesViewMode] = useState('all')

  // Geo filters state
  const [geoFilters, setGeoFilters] = useState(() => {
    try {
      const stored = localStorage.getItem('calendar-ripper-geo-filters')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  // Map view toggle (for events panel)
  const [showMapView, setShowMapView] = useState(false)
  const [showFavoritesMap, setShowFavoritesMap] = useState(false)

  // Auth state
  const [authUser, setAuthUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const API_URL = import.meta.env.VITE_FAVORITES_API_URL || ''

  const toggleFavorite = useCallback((icsUrl) => {
    setFavorites(prev => {
      const isFav = prev.includes(icsUrl)
      const next = isFav
        ? prev.filter(u => u !== icsUrl)
        : [...prev, icsUrl]
      try { localStorage.setItem('calendar-ripper-favorites', JSON.stringify(next)) } catch {}

      // Fire-and-forget API call when logged in
      if (API_URL && authUser) {
        const method = isFav ? 'DELETE' : 'POST'
        fetch(`${API_URL}/favorites/${encodeURIComponent(icsUrl)}`, {
          method,
          credentials: 'include',
        }).catch(() => {})
      }

      return next
    })
  }, [authUser])

  const addSearchFilter = useCallback((filter) => {
    const trimmed = filter.trim()
    if (!trimmed) return
    setSearchFilters(prev => {
      if (prev.some(f => f.toLowerCase() === trimmed.toLowerCase())) return prev
      if (prev.length >= 25) return prev
      const next = [...prev, trimmed]
      try { localStorage.setItem('calendar-ripper-search-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        fetch(`${API_URL}/search-filters`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: trimmed }),
        }).catch(() => {})
      }
      return next
    })
  }, [authUser])

  const removeSearchFilter = useCallback((filter) => {
    setSearchFilters(prev => {
      const next = prev.filter(f => f.toLowerCase() !== filter.toLowerCase())
      try { localStorage.setItem('calendar-ripper-search-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        fetch(`${API_URL}/search-filters/${encodeURIComponent(filter)}`, {
          method: 'DELETE',
          credentials: 'include',
        }).catch(() => {})
      }
      return next
    })
  }, [authUser])

  // Geo filter CRUD
  const addGeoFilter = useCallback((filter) => {
    setGeoFilters(prev => {
      if (prev.length >= 10) return prev
      const next = [...prev, filter]
      try { localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        fetch(`${API_URL}/geo-filters`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filter),
        }).catch(() => {})
      }
      return next
    })
  }, [API_URL, authUser])

  const deleteGeoFilter = useCallback((index) => {
    setGeoFilters(prev => {
      const next = prev.filter((_, i) => i !== index)
      try { localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        // Send full updated array (not index) to avoid race conditions when
        // local and server state are out of sync
        fetch(`${API_URL}/geo-filters`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(() => {})
      }
      return next
    })
  }, [API_URL, authUser])

  const editGeoFilter = useCallback((index, filter) => {
    setGeoFilters(prev => {
      const next = prev.map((f, i) => i === index ? filter : f)
      try { localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(next)) } catch {}
      if (API_URL && authUser) {
        fetch(`${API_URL}/geo-filters`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(() => {})
      }
      return next
    })
  }, [API_URL, authUser])

  // Check auth on mount
  useEffect(() => {
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
    if (API_URL) {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
    }
    setAuthUser(null)
  }

  // Sync favorites on login
  useEffect(() => {
    if (!authUser || !API_URL) return

    fetch(`${API_URL}/favorites`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        if (data.favorites.length === 0 && favorites.length > 0) {
          // First-time migration: push localStorage to server
          fetch(`${API_URL}/favorites`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorites }),
          })
        } else {
          // Server is source of truth
          setFavorites(data.favorites)
          try { localStorage.setItem('calendar-ripper-favorites', JSON.stringify(data.favorites)) } catch {}
        }
      })
      .catch(() => {})

    // Sync search filters
    fetch(`${API_URL}/search-filters`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        if (data.searchFilters.length === 0 && searchFilters.length > 0) {
          fetch(`${API_URL}/search-filters`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchFilters }),
          })
        } else {
          setSearchFilters(data.searchFilters)
          try { localStorage.setItem('calendar-ripper-search-filters', JSON.stringify(data.searchFilters)) } catch {}
        }
      })
      .catch(() => {})

    // Sync geo filters
    fetch(`${API_URL}/geo-filters`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        const serverFilters = data.geoFilters || []
        if (serverFilters.length === 0 && geoFilters.length > 0) {
          fetch(`${API_URL}/geo-filters`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geoFilters),
          })
        } else {
          setGeoFilters(serverFilters)
          try { localStorage.setItem('calendar-ripper-geo-filters', JSON.stringify(serverFilters)) } catch {}
        }
      })
      .catch(() => {})
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

      // Load events index for full-text event search
      try {
        const eventsResponse = await fetch('./events-index.json')
        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json()
          setEventsIndex(eventsData)
        }
      } catch (e) {
        console.warn('Events index not available, event search disabled')
      }

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

      // Load build errors for health dashboard
      try {
        const errorsResponse = await fetch('./build-errors.json')
        if (errorsResponse.ok) {
          setBuildErrors(await errorsResponse.json())
        }
      } catch (e) {
        console.warn('Build errors not available, health dashboard will show limited data')
      }
    } catch (error) {
      console.error('Failed to load calendars:', error)
    } finally {
      setLoading(false)
    }
  }, [])

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
  const searchInputRef = useRef(null)
  
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

  // Keyboard shortcuts: "/" to focus search, Escape to clear
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement
        const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable
        if (!isInput) {
          e.preventDefault()
          searchInputRef.current?.focus()
        }
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current && searchTerm) {
        setSearchTerm('')
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchTerm])

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

  // Fuzzy search setup — calendar names
  const fuse = useMemo(() => {
    const searchData = []
    calendars.forEach(ripper => {
      ripper.calendars.forEach(calendar => {
        searchData.push({
          ...calendar,
          ripperName: ripper.name,
          searchText: `${ripper.name} ${ripper.friendlyName || ''} ${ripper.description || ''} ${calendar.name} ${calendar.fullName} ${calendar.tags.join(' ')}`
        })
      })
    })

    return new Fuse(searchData, {
      keys: ['searchText'],
      threshold: FUSE_THRESHOLD
    })
  }, [calendars])

  // Fuzzy search setup — event content
  const eventFuse = useMemo(() => {
    if (!eventsIndex.length) return null
    return new Fuse(eventsIndex, {
      keys: ['summary', 'description', 'location'],
      threshold: FUSE_THRESHOLD
    })
  }, [eventsIndex])

  // Event matches grouped by calendar icsUrl (only computed when searching)
  const eventMatchesByCalendar = useMemo(() => {
    const map = new Map()
    if (!searchTerm || !eventFuse) return map
    eventFuse.search(searchTerm, { limit: 100 }).forEach(({ item }) => {
      if (!map.has(item.icsUrl)) map.set(item.icsUrl, [])
      map.get(item.icsUrl).push(item)
    })
    return map
  }, [searchTerm, eventFuse])

  // When searching, filter loaded events to only matching ones (fuzzy, consistent with sidebar hints)
  const filteredEvents = useMemo(() => {
    if (!searchTerm || !selectedCalendar) return events
    const fuse = new Fuse(events, {
      keys: ['title', 'description', 'location'],
      threshold: FUSE_THRESHOLD
    })
    return fuse.search(searchTerm).map(r => r.item)
  }, [events, searchTerm, selectedCalendar])

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

  // Happening Soon: group events from events-index into day buckets for the next 7 days
  const happeningSoonEvents = useMemo(() => {
    if (!eventsIndex.length) return []

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endDate = new Date(todayStart)
    endDate.setDate(endDate.getDate() + 7)

    // Parse and filter events to the next 7 days
    let upcoming = eventsIndex
      .map(event => {
        // js-joda toString() format: "2026-02-15T19:00-08:00[America/Los_Angeles]"
        // Extract the IANA timezone from brackets for display, then strip for Date parsing
        const tzMatch = event.date.match(/\[(.+)\]$/)
        const eventTimezone = tzMatch ? tzMatch[1] : undefined
        const dateStr = event.date.replace(/\[.*\]$/, '')
        const parsed = new Date(dateStr)
        if (isNaN(parsed.getTime())) return null
        let parsedEndDate = null
        if (event.endDate) {
          const endDateStr = event.endDate.replace(/\[.*\]$/, '')
          const parsedEnd = new Date(endDateStr)
          if (!isNaN(parsedEnd.getTime())) parsedEndDate = parsedEnd
        }
        return { ...event, parsedDate: parsed, parsedEndDate, eventTimezone }
      })
      .filter(event => {
        if (!event) return false
        if (event.parsedDate >= endDate) return false
        if (event.parsedDate < todayStart) return false
        // Filter out events whose end time has already passed
        const effectiveEnd = event.parsedEndDate || event.parsedDate
        if (effectiveEnd <= now) return false
        return true
      })

    // Apply tag filter
    if (selectedTag) {
      if (selectedTag === '__favorites__') {
        upcoming = upcoming.filter(event => favoritesSet.has(event.icsUrl))
      } else {
        upcoming = upcoming.filter(event => {
          const tags = calendarTagsByIcsUrl[event.icsUrl] || []
          return tags.includes(selectedTag)
        })
      }
    }

    // Apply search filter (fuzzy, consistent with calendar list sidebar hints)
    if (searchTerm) {
      const upcomingFuse = new Fuse(upcoming, {
        keys: ['summary', 'description', 'location'],
        threshold: FUSE_THRESHOLD
      })
      upcoming = upcomingFuse.search(searchTerm).map(r => r.item)
    }

    // Sort by date
    upcoming.sort((a, b) => a.parsedDate - b.parsedDate)

    // Group by day label using diffDays as the key so timezone-shifted
    // events that resolve to the same calendar day always merge into one group
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const groupsByDiffDays = new Map()

    for (const event of upcoming) {
      // Use the event's timezone for day grouping so "Today" is correct
      // for the event's local date, not the viewer's timezone
      let eventDay
      if (event.eventTimezone) {
        try {
          const parts = event.parsedDate.toLocaleDateString('en-CA', { timeZone: event.eventTimezone }).split('-')
          eventDay = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        } catch {
          eventDay = new Date(event.parsedDate.getFullYear(), event.parsedDate.getMonth(), event.parsedDate.getDate())
        }
      } else {
        eventDay = new Date(event.parsedDate.getFullYear(), event.parsedDate.getMonth(), event.parsedDate.getDate())
      }
      const diffDays = Math.round((eventDay - todayStart) / (1000 * 60 * 60 * 24))

      let label
      if (diffDays === 0) label = 'Today'
      else if (diffDays === 1) label = 'Tomorrow'
      else label = dayNames[eventDay.getDay()]

      if (!groupsByDiffDays.has(diffDays)) {
        const dateSubtitle = eventDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        groupsByDiffDays.set(diffDays, { label, dateSubtitle, events: [] })
      }
      groupsByDiffDays.get(diffDays).events.push(event)
    }

    const groups = [...groupsByDiffDays.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, group]) => group)

    return groups
  }, [eventsIndex, selectedTag, searchTerm, calendarTagsByIcsUrl, favoritesSet])

  // Per-filter match counts and match sets for view mode filtering
  const perFilterMatches = useMemo(() => {
    if (!eventsIndex.length) return new Map()
    const fuse = new Fuse(eventsIndex, {
      keys: ['summary', 'description', 'location'],
      threshold: FUSE_THRESHOLD,
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

  // Live preview: match count for the text currently being typed in the input
  const livePreviewMatches = useMemo(() => {
    const trimmed = newFilterInput.trim()
    if (!trimmed || !eventsIndex.length) return null
    const fuse = new Fuse(eventsIndex, {
      keys: ['summary', 'description', 'location'],
      threshold: FUSE_THRESHOLD,
    })
    const results = fuse.search(trimmed)
    return {
      count: results.length,
      samples: results.slice(0, 5).map(r => r.item),
    }
  }, [newFilterInput, eventsIndex])

  // Reset view mode when switching away from favorites or when filters change
  useEffect(() => {
    if (selectedTag !== '__favorites__') return
    if (favoritesViewMode !== 'all' && favoritesViewMode !== 'calendars' && favoritesViewMode !== 'search') {
      if (favoritesViewMode.startsWith('geo:')) {
        const idx = parseInt(favoritesViewMode.split(':')[1])
        if (!geoFilters[idx]) setFavoritesViewMode('all')
      } else {
        // It's a specific filter — check if it still exists
        if (!searchFilters.includes(favoritesViewMode)) {
          setFavoritesViewMode('all')
        }
      }
    }
  }, [searchFilters, selectedTag, geoFilters, favoritesViewMode])

  // Compute events for the favorites view
  const favoritesEvents = useMemo(() => {
    if (!eventsIndex.length || selectedTag !== '__favorites__') return []
    if (!favorites.length && !searchFilters.length && !geoFilters.length) return []

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate())

    let upcoming = eventsIndex
      .map(event => {
        const tzMatch = event.date.match(/\[(.+)\]$/)
        const eventTimezone = tzMatch ? tzMatch[1] : undefined
        const dateStr = event.date.replace(/\[.*\]$/, '')
        const parsed = new Date(dateStr)
        if (isNaN(parsed.getTime())) return null
        let parsedEndDate = null
        if (event.endDate) {
          const endDateStr = event.endDate.replace(/\[.*\]$/, '')
          const parsedEnd = new Date(endDateStr)
          if (!isNaN(parsedEnd.getTime())) parsedEndDate = parsedEnd
        }
        return { ...event, parsedDate: parsed, parsedEndDate, eventTimezone }
      })
      .filter(event => {
        if (!event) return false
        if (event.parsedDate >= sixMonthsFromNow) return false
        if (event.parsedDate < todayStart) return false
        const effectiveEnd = event.parsedEndDate || event.parsedDate
        if (effectiveEnd <= now) return false

        const isFavorited = favoritesSet.has(event.icsUrl)
        const key = eventKey(event)
        const isSearchMatch = searchFilterMatchSummaries.has(key)
        const isGeoMatch = geoFilters.length > 0 && event.lat != null && event.lng != null &&
          geoFilters.some(gf => haversineKm(gf.lat, gf.lng, event.lat, event.lng) <= gf.radiusKm)

        if (favoritesViewMode === 'calendars') {
          return isFavorited
        } else if (favoritesViewMode === 'search') {
          return isSearchMatch
        } else if (favoritesViewMode.startsWith('geo:')) {
          const geoIndex = parseInt(favoritesViewMode.split(':')[1])
          const gf = geoFilters[geoIndex]
          if (!gf) return false
          if (event.lat == null || event.lng == null) return false
          return haversineKm(gf.lat, gf.lng, event.lat, event.lng) <= gf.radiusKm
        } else if (favoritesViewMode !== 'all') {
          // Specific search filter selected
          const filterMatches = perFilterMatches.get(favoritesViewMode)
          return filterMatches ? filterMatches.has(key) : false
        }
        // 'all' mode — include events from any active source
        if (!isFavorited && !isSearchMatch && !isGeoMatch) return false
        return true
      })

    // Deduplicate cross-source events (same date + location + title)
    // Mirrors the dedup logic in infra/favorites-worker/src/feed.ts
    upcoming = deduplicateEvents(upcoming)

    if (searchTerm) {
      const fuse = new Fuse(upcoming, {
        keys: ['summary', 'description', 'location'],
        threshold: FUSE_THRESHOLD
      })
      upcoming = fuse.search(searchTerm).map(r => r.item)
    }

    upcoming.sort((a, b) => a.parsedDate - b.parsedDate)

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const groupsByDiffDays = new Map()

    for (const event of upcoming) {
      let eventDay
      if (event.eventTimezone) {
        try {
          const parts = event.parsedDate.toLocaleDateString('en-CA', { timeZone: event.eventTimezone }).split('-')
          eventDay = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        } catch {
          eventDay = new Date(event.parsedDate.getFullYear(), event.parsedDate.getMonth(), event.parsedDate.getDate())
        }
      } else {
        eventDay = new Date(event.parsedDate.getFullYear(), event.parsedDate.getMonth(), event.parsedDate.getDate())
      }
      const diffDays = Math.round((eventDay - todayStart) / (1000 * 60 * 60 * 24))

      let label
      if (diffDays === 0) label = 'Today'
      else if (diffDays === 1) label = 'Tomorrow'
      else if (diffDays > 1 && diffDays < 7) label = dayNames[eventDay.getDay()]
      else label = eventDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

      if (!groupsByDiffDays.has(diffDays)) {
        const dateSubtitle = eventDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        groupsByDiffDays.set(diffDays, { label, dateSubtitle, events: [] })
      }
      groupsByDiffDays.get(diffDays).events.push(event)
    }

    const groups = [...groupsByDiffDays.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, group]) => group)

    return groups
  }, [eventsIndex, favorites, favoritesSet, selectedTag, searchTerm, searchFilters, searchFilterMatchSummaries, favoritesViewMode, perFilterMatches, geoFilters])

  // Flat list of favorites events for the map (EventsMap expects a flat array, not day groups)
  const favoritesEventsFlat = useMemo(
    () => favoritesEvents.flatMap(group => group.events),
    [favoritesEvents]
  )

  // Always-on personal feed for the redesigned "Following" view. Same membership
  // math as favoritesEvents 'all' mode (favorited calendar OR saved-search match
  // OR geo match), but ungated by selectedTag/searchTerm. Uses the same
  // parity-locked helpers (haversineKm, eventKey, deduplicateEvents).
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

  // Track which calendars matched by name/description (not just event content)
  const calendarNameMatches = useMemo(() => {
    const nameMatches = new Set()
    if (searchTerm) {
      fuse.search(searchTerm).forEach(item => {
        nameMatches.add(`${item.item.ripperName}-${item.item.name}`)
      })
    }
    return nameMatches
  }, [searchTerm, fuse])

  // Filter calendars based on search and tag
  const filteredCalendars = useMemo(() => {
    let result = calendars

    if (searchTerm || selectedTag) {
      const matchingCalendars = new Set()

      if (searchTerm) {
        // Calendar name/tag matches
        calendarNameMatches.forEach(id => matchingCalendars.add(id))

        // Event content matches — surface calendars containing matching events
        for (const icsUrl of eventMatchesByCalendar.keys()) {
          calendars.forEach(ripper => {
            ripper.calendars.forEach(calendar => {
              if (calendar.icsUrl === icsUrl) {
                matchingCalendars.add(`${ripper.name}-${calendar.name}`)
              }
            })
          })
        }
      }

      result = calendars.map(ripper => ({
        ...ripper,
        calendars: ripper.calendars.filter(calendar => {
          const matchesSearch = !searchTerm || matchingCalendars.has(`${ripper.name}-${calendar.name}`)
          const matchesTag = !selectedTag || (selectedTag === '__favorites__' ? favoritesSet.has(calendar.icsUrl) : calendar.tags.includes(selectedTag))
          return matchesSearch && matchesTag
        })
      })).filter(ripper => ripper.calendars.length > 0)

      // Sort name/description matches to the top when searching
      if (searchTerm && calendarNameMatches.size > 0) {
        result.sort((a, b) => {
          const aHasNameMatch = a.calendars.some(c => calendarNameMatches.has(`${a.name}-${c.name}`))
          const bHasNameMatch = b.calendars.some(c => calendarNameMatches.has(`${b.name}-${c.name}`))
          if (aHasNameMatch && !bHasNameMatch) return -1
          if (!aHasNameMatch && bHasNameMatch) return 1
          return 0
        })
      }
    }

    return result
  }, [calendars, searchTerm, selectedTag, calendarNameMatches, eventMatchesByCalendar, favoritesSet])

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
      venues={venues}
      loading={loading}
      buildErrors={buildErrors}
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
      authUser={authUser}
      handleLogin={handleLogin}
      handleLogout={handleLogout}
      API_URL={API_URL}
      isMobile={isMobile}
      channelEvents={events}
      channelEventsLoading={eventsLoading}
      channelEventsError={eventsError}
      onSelectChannel={setSelectedCalendar}
      createWebcalUrl={createWebcalUrl}
      createGoogleCalendarUrl={createGoogleCalendarUrl}
      createHttpsUrl={createHttpsUrl}
    />
  )
}

export default App
