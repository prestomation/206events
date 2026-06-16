import { useMemo, useEffect, useState, useCallback, useRef, memo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { eventKey } from '../lib/eventKey.js'
import { groupEvents } from '../lib/event-grouping.js'
import { EventGroupPanel } from './EventGroupPanel.jsx'
import cityConfig from '../../../city.config.ts'

// Fix Leaflet default marker icons in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// Width (px) of the drill-down side panel on desktop. Kept in sync with the
// `.event-group-panel` width in index.css so the map can pan a clicked marker
// out from behind it.
const PANEL_WIDTH = 340

// Populated metro extent used to reject distant outliers from the default map
// fit. Configured per city in city.config.ts (Seattle's box hugs King County
// — see the comments there for how its edges were chosen).
const CLAMP_BOUNDS = cityConfig.map.clampBounds

// Initial viewport, framed at the metro extent (CLAMP_BOUNDS) the moment the
// map mounts — before any event data has loaded. This lets Leaflet pick the
// final-ish zoom and start fetching tiles immediately, instead of opening at
// the city-center zoom and then animating out to frame events once the (heavy)
// events index resolves. FitBounds still snaps to the real event distribution
// when events arrive, but from this starting point that adjustment is a small
// pan rather than a jarring zoom-out, and no city-center tiles are wasted.
const INITIAL_BOUNDS = [
  [CLAMP_BOUNDS.south, CLAMP_BOUNDS.west],
  [CLAMP_BOUNDS.north, CLAMP_BOUNDS.east],
]

export function isWithinClampBounds(lat, lng) {
  return (
    lat >= CLAMP_BOUNDS.south && lat <= CLAMP_BOUNDS.north &&
    lng >= CLAMP_BOUNDS.west && lng <= CLAMP_BOUNDS.east
  )
}

// Fraction of events trimmed off each tail (per axis) before framing the default
// view, and the minimum point count before trimming kicks in. The dense mass of
// events sits in the Seattle/Eastside core; a sparse handful of legitimate but
// far-flung King County events (a lone Federal Way or Issaquah listing) would
// otherwise stretch the default zoom out far enough that — given the map panel's
// aspect ratio — neighbouring Tacoma/Everett markers fall into view. Trimming the
// sparsest tails frames the metro mass instead. Filtered views (a single
// calendar/tag) stay below the threshold and are framed in full, untrimmed.
const FIT_TRIM_QUANTILE = 0.02
const FIT_TRIM_MIN_POINTS = 50

function quantile(sortedAsc, q) {
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(sortedAsc.length * q)))
  return sortedAsc[i]
}

// Points the default/refit viewport should frame. For large point sets (the
// unfiltered default), frames the dense mass by trimming the sparsest
// `FIT_TRIM_QUANTILE` tails per axis so far-flung outliers — in- or out-of-county
// — don't stretch the zoom; outliers still render as markers. Smaller sets
// (filtered views) are framed in full. Geo-filter circles are user-chosen and
// always folded in untrimmed. Falls back to ALL event markers when none are
// in-county, so the map never ends up empty.
export function collectFitPoints(events, geoFilters) {
  const all = []
  const inCounty = []
  for (const e of events) {
    if (e.lat && e.lng) {
      const p = [e.lat, e.lng]
      all.push(p)
      if (isWithinClampBounds(e.lat, e.lng)) inCounty.push(p)
    }
  }
  const base = inCounty.length > 0 ? inCounty : all
  let points
  if (base.length >= FIT_TRIM_MIN_POINTS) {
    const lats = base.map((p) => p[0]).sort((a, b) => a - b)
    const lngs = base.map((p) => p[1]).sort((a, b) => a - b)
    points = [
      [quantile(lats, FIT_TRIM_QUANTILE), quantile(lngs, FIT_TRIM_QUANTILE)],
      [quantile(lats, 1 - FIT_TRIM_QUANTILE), quantile(lngs, 1 - FIT_TRIM_QUANTILE)],
    ]
  } else {
    points = [...base]
  }
  for (const gf of geoFilters) {
    // Longitude degrees shrink with latitude (1° lng ≈ 111·cos(lat) km), so the
    // east-west offset needs the cos(lat) correction or the bounds under-frame
    // the circle (~33% short at Seattle's ~47.6°).
    const latDeg = gf.radiusKm / 111
    const lngDeg = gf.radiusKm / (111 * Math.cos(gf.lat * Math.PI / 180))
    points.push([gf.lat + latDeg, gf.lng + lngDeg])
    points.push([gf.lat - latDeg, gf.lng - lngDeg])
  }
  return points
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount()
  let size, colorClass
  if (count < 10) { size = 36; colorClass = 'cluster-small' }
  else if (count < 50) { size = 44; colorClass = 'cluster-medium' }
  else { size = 52; colorClass = 'cluster-large' }
  return L.divIcon({
    html: `<div class="cluster-icon ${colorClass}"><span>${count}</span></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Marker icon for a temporal group with more than one date: the bundled default
// pin image plus a small corner badge showing the number of dates. Single-date
// groups use the default Leaflet marker instead (no icon prop), so the global
// Icon.Default setup above is untouched. Sized/anchored to match the default
// marker footprint. `count` is always a number here, so no escaping is needed.
function createGroupBadgeIcon(count) {
  return L.divIcon({
    className: 'event-group-marker',
    html: `<img class="event-group-pin" src="${markerIcon}" alt="" /><span class="event-group-badge">${count}</span>`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })
}

function FitBounds({ events, geoFilters, fitKey }) {
  const map = useMap()
  // Latest events/geoFilters held in refs so the fit effect can read them
  // without re-firing every time they change (it fires only on `fitKey`).
  const eventsRef = useRef(events)
  eventsRef.current = events
  const geoRef = useRef(geoFilters)
  geoRef.current = geoFilters
  const hasEvents = events.length > 0

  // Auto-fit on initial load (first non-empty event set) and on calendar/tag
  // changes (`fitKey`). Intentionally NOT keyed on the full event set, so a
  // date-window change leaves the user's current viewport alone — otherwise
  // the map would snap back to frame everything on every slider step, which is
  // jarring and would also defeat viewport culling. Also not keyed on
  // geoFilters: adding a location filter leaves the viewport put. Stored
  // filters are still folded into the bounds on the runs that do fire.
  useEffect(() => {
    if (!hasEvents) return
    // In-county event markers (distant outliers like the Gorge are excluded so
    // they don't stretch the default zoom) plus any geo-filter circles.
    const points = collectFitPoints(eventsRef.current, geoRef.current)
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
    }
  }, [map, fitKey, hasEvents]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Reports the map's current bounds up to EventsMap on pan/zoom (moveend/zoomend)
// so the marker layer can be culled to roughly what's on screen. moveend/zoomend
// fire once per gesture (not continuously), so no debounce is needed.
function ViewportTracker({ onBounds }) {
  const map = useMap()
  useEffect(() => {
    const update = () => onBounds(map.getBounds())
    update() // seed initial bounds
    map.on('moveend zoomend', update)
    return () => map.off('moveend zoomend', update)
  }, [map, onBounds])
  return null
}

// Exposes the Leaflet map instance to the parent via a ref, and keeps the map
// sized to its container. The ResizeObserver matters for the expand/collapse
// toggle: Leaflet caches the container size, so without invalidateSize() the
// tiles render with gray gaps after the panel grows or shrinks.
function MapBridge({ mapRef }) {
  const map = useMap()
  useEffect(() => {
    if (mapRef) mapRef.current = map
    // ResizeObserver is absent in some test environments (jsdom); skip the
    // auto-resize there rather than crashing the effect.
    const RO = typeof ResizeObserver !== 'undefined' ? ResizeObserver : null
    const ro = RO ? new RO(() => map.invalidateSize()) : null
    if (ro) ro.observe(map.getContainer())
    return () => {
      if (ro) ro.disconnect()
      if (mapRef && mapRef.current === map) mapRef.current = null
    }
  }, [map, mapRef])
  return null
}

function formatEventDate(dateStr) {
  if (!dateStr) return ''
  try {
    const cleaned = dateStr.replace(/\[.*\]$/, '')
    const d = new Date(cleaned)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// Pure predicate deciding whether an event belongs on the map under the active
// filters. Extracted so it can be unit-tested without rendering Leaflet, and so
// the favorites-parity rule has one place to live.
//   - requires coordinates + the global date window
//   - a specific open channel (calendarFilter) takes precedence — feedOnly is
//     ignored so opening a calendar always shows that calendar
//   - feedOnly restricts to the personal feed: an event is in the feed iff it
//     has an attribution (favorited calendar / saved search / geo match), which
//     reuses App.jsx's parity-locked membership rather than recomputing it
//   - queryKeySet (when non-null) is the live search-box matches: an event must
//     be in the set to map. Applied before the calendarFilter early-return so an
//     active search narrows every scope (all / following / open channel). It's a
//     plain eventKey membership test; the date window is handled separately by
//     dateInScope, so the two compose as an intersection.
export function isMappable(event, {
  calendarFilter,
  selectedTag,
  calendarTagsByIcsUrl,
  dateInScope = () => true,
  feedOnly = false,
  eventAttributions,
  queryKeySet = null,
}) {
  if (!event.lat || !event.lng) return false
  if (!dateInScope(event)) return false
  if (queryKeySet && !queryKeySet.has(eventKey(event))) return false

  if (calendarFilter) {
    return event.icsUrl === calendarFilter
  }
  if (feedOnly && !(eventAttributions && eventAttributions.has(eventKey(event)))) return false
  if (selectedTag && selectedTag !== '__favorites__') {
    const tags = calendarTagsByIcsUrl[event.icsUrl] || []
    if (!tags.includes(selectedTag)) return false
  }
  return true
}

/**
 * EventsMap renders a Leaflet map with event markers and optional geo filter circles.
 *
 * Props:
 *   eventsIndex      - array of EventsIndexEntry (all events)
 *   geoFilters       - array of GeoFilter ({ lat, lng, radiusKm, label? })
 *   calendarFilter   - optional: icsUrl of selected calendar (or tag icsUrl) to filter by
 *   calendarTagsByIcsUrl - map of icsUrl → tags[]
 *   selectedTag      - currently active tag ('' means all)
 *   calendarNameByIcsUrl - map of icsUrl → friendly calendar name
 *   eventAttributions  - optional Map<compositeKey, Attribution[]> from App.jsx for showing why events appear
 *   feedOnly         - when true (and no calendarFilter), restrict markers to the personal feed
 *   queryKeySet      - optional Set<eventKey> of live search matches; when non-null, only those events map
 */
// Memoized so the heavy marker/cluster subtree is rebuilt only when its own
// inputs actually change. While the date-window slider is being dragged, the
// parent re-renders on the urgent pass but EventsMap's props (including the
// deferred-window-keyed `dateInScope`) are referentially stable, so React skips
// this subtree entirely and the thumb stays responsive.
function EventsMapInner({
  eventsIndex,
  geoFilters,
  calendarFilter,
  calendarTagsByIcsUrl,
  selectedTag,
  calendarNameByIcsUrl,
  eventAttributions,
  dateInScope = () => true,
  feedOnly = false,
  queryKeySet = null,
  mapRef,
}) {
  // Filter events: only those with lat/lng, respecting the active tag/calendar
  // filter, the global date window, (when feedOnly) the personal feed, and (when
  // queryKeySet is set) the live search box.
  const mappableEvents = useMemo(() => eventsIndex.filter(event => isMappable(event, {
    calendarFilter, selectedTag, calendarTagsByIcsUrl, dateInScope, feedOnly, eventAttributions, queryKeySet,
  })), [eventsIndex, calendarFilter, selectedTag, calendarTagsByIcsUrl, dateInScope, feedOnly, eventAttributions, queryKeySet])

  // Token folded into the FitBounds/cluster keys so an active search remounts
  // the cluster (clearing stale markers) and refits the view to the matches.
  // Empty/absent search → '' (no remount); size disambiguates match-set changes.
  const scopeQueryToken = queryKeySet ? `q${queryKeySet.size}` : ''

  // Parse dates for popup display
  const eventsWithDates = useMemo(() => mappableEvents.map(event => ({
    ...event,
    formattedDate: formatEventDate(event.date),
    calendarName: calendarNameByIcsUrl[event.icsUrl] || event.icsUrl?.replace('.ics', ''),
  })), [mappableEvents, calendarNameByIcsUrl])

  // Temporal grouping: collapse the many instances of a conceptually-same
  // recurring event at one venue into a single group → a single marker. Runs on
  // the already-filtered (isMappable) set, so each group's date count reflects
  // the active date window automatically. All instances of a group share one
  // coordinate, so grouping first and culling the groups (below) is equivalent
  // to and cheaper than culling instances. The spatial MarkerClusterGroup layer
  // then still clusters distinct venues on top — the two are complementary.
  const eventGroups = useMemo(() => groupEvents(eventsWithDates), [eventsWithDates])

  // Viewport culling: only render markers within (a padded) current map bounds,
  // re-filtering when the map pans/zooms. This keeps a date-window change cheap
  // while the user is zoomed into a neighborhood — we rebuild dozens of markers,
  // not thousands. `bounds` is null until the map reports its first viewport, in
  // which case we render everything (the initial fit frames all events anyway).
  const [bounds, setBounds] = useState(null)
  const onBounds = useCallback((b) => setBounds(b), [])
  const visibleGroups = useMemo(() => {
    if (!bounds) return eventGroups
    const padded = bounds.pad(0.5) // ~50% buffer so just-offscreen markers stay put while panning
    return eventGroups.filter((g) => padded.contains([g.lat, g.lng]))
  }, [eventGroups, bounds])

  // The group whose drill-down panel is open (null = closed).
  const [selectedGroup, setSelectedGroup] = useState(null)

  // Open a group's panel and pan the map so the clicked marker isn't hidden
  // behind the right-side panel. `panInside` shifts the view the minimum amount
  // needed to bring the point into the area left of the panel; it's a no-op on
  // mobile (mapRef undefined) where the panel is a bottom sheet instead.
  const openGroup = useCallback((group) => {
    setSelectedGroup(group)
    const map = mapRef?.current
    if (map && group?.lat != null && group?.lng != null) {
      map.panInside([group.lat, group.lng], {
        paddingTopRight: [PANEL_WIDTH + 24, 24],
        paddingBottomLeft: [24, 24],
      })
    }
  }, [mapRef])

  // One marker per group, memoized so the list rebuilds only when the visible
  // group set changes. Multi-date groups get a count-badge icon; single-date
  // groups omit the `icon` prop entirely so Leaflet uses its default marker —
  // passing `icon={undefined}` instead would override (and crash) Leaflet's
  // default icon in a real browser. Clicking opens the side detail panel rather
  // than a Leaflet popup. Keyed on the stable group key (date-independent) so
  // slider drags update markers in place.
  const markers = useMemo(() => visibleGroups.map((group) => {
    const iconProps = group.count > 1 ? { icon: createGroupBadgeIcon(group.count) } : {}
    return (
      <Marker
        key={`group-${group.key}`}
        position={[group.lat, group.lng]}
        {...iconProps}
        eventHandlers={{ click: () => openGroup(group) }}
      />
    )
  }), [visibleGroups, openGroup])

  return (
    <div className="events-map-container" data-testid="events-map">
      <MapContainer
        bounds={INITIAL_BOUNDS}
        boundsOptions={{ padding: [0, 0] }}
        style={{ height: '100%', width: '100%' }}
        className="events-map"
      >
        <MapBridge mapRef={mapRef} />
        <ViewportTracker onBounds={onBounds} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Geo filter circles */}
        {geoFilters.map((filter, i) => (
          <Circle
            key={`geo-filter-${filter.lat}-${filter.lng}-${filter.radiusKm}`}
            center={[filter.lat, filter.lng]}
            radius={filter.radiusKm * 1000}
            pathOptions={{
              color: '#4a90d9',
              fillColor: '#4a90d9',
              fillOpacity: 0.12,
              weight: 2,
            }}
          >
            <Popup>
              <strong>{filter.label || 'Location filter'}</strong><br />
              Radius: {filter.radiusKm} km
            </Popup>
          </Circle>
        ))}

        <FitBounds events={eventsWithDates} geoFilters={geoFilters} fitKey={`${calendarFilter || ''}|${selectedTag || ''}|${feedOnly ? 'feed' : 'all'}|${scopeQueryToken}`} />

        {/* Event markers — bare markers with lazy (on-click) popups.
            Keyed on the scope (calendar / tag / feed / search) so a scope change
            remounts the cluster layer: react-leaflet-cluster doesn't reliably
            clear its markers when the children collapse to empty, which otherwise
            leaves stale all-events clusters under the "feed is empty" overlay.
            The search token is included so narrowing to (or clearing) a search
            refits the view and clears stale clusters; the key deliberately omits
            the date window so slider drags update markers in place. */}
        <MarkerClusterGroup
          key={`cluster-${calendarFilter || ''}|${selectedTag || ''}|${feedOnly ? 'feed' : 'all'}|${scopeQueryToken}`}
          chunkedLoading
          iconCreateFunction={createClusterIcon}
          showCoverageOnHover={true}
          maxClusterRadius={45}
          spiderfyOnMaxZoom={true}
        >
          {markers}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Drill-down: clicking a marker opens this side panel with the group's
          venue details and full date list. Rendered over the map container. */}
      <EventGroupPanel
        group={selectedGroup}
        eventAttributions={eventAttributions}
        onClose={() => setSelectedGroup(null)}
      />

      {eventsWithDates.length === 0 && (
        <div className="events-map-empty">
          {queryKeySet
            ? 'No events match your search on the map'
            : feedOnly && !calendarFilter
              ? 'No favorited events with a location to show'
              : <>No geocoded events to display{selectedTag ? ' for this filter' : ''}</>}
        </div>
      )}
    </div>
  )
}

export const EventsMap = memo(EventsMapInner)
