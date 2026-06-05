import { useMemo, useEffect, useState, useCallback, useRef, memo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { eventKey } from '../lib/eventKey.js'
import { googleMapsUrl } from '../lib/maplink.js'

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

const SEATTLE_CENTER = [47.6062, -122.3321]
const DEFAULT_ZOOM = 12

// Populated King County extent used to reject distant outliers from the default
// map fit. Kept close to the actual county lines so the opening view frames King
// County without spilling into neighbouring counties:
//   - north 47.78 sits on the King/Snohomish line — keeps Shoreline/Bothell/
//     Kenmore/Woodinville while excluding Edmonds/Lynnwood/Everett (Snohomish).
//   - south 47.20 keeps Renton/Kent/Auburn/Federal Way/Enumclaw.
//   - west -122.42 excludes Tacoma and the Tacoma Dome (Pierce, ~-122.43/-122.44);
//     this also drops Vashon Island, whose handful of events still render as
//     markers but no longer stretch the fit.
//   - east -121.70 keeps Issaquah/Sammamish/North Bend/Snoqualmie while excluding
//     the far-eastern Cascades and out-of-region venues (e.g. the Gorge).
// A lat/lng box can't trace the diagonal King/Pierce line exactly; these values
// favour excluding the Everett/Tacoma outliers the default view should ignore.
// Approximate and easily tunable.
const KING_COUNTY_BOUNDS = { south: 47.20, west: -122.42, north: 47.78, east: -121.70 }

export function isWithinKingCounty(lat, lng) {
  return (
    lat >= KING_COUNTY_BOUNDS.south && lat <= KING_COUNTY_BOUNDS.north &&
    lng >= KING_COUNTY_BOUNDS.west && lng <= KING_COUNTY_BOUNDS.east
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
      if (isWithinKingCounty(e.lat, e.lng)) inCounty.push(p)
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
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// Escape user/source-derived strings before interpolating into popup HTML.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

// Mirror of <AttributionChips> as an HTML string (the component is display-only).
// KEEP IN SYNC with AttributionChips.jsx — icon mapping + className whitelist.
function attributionChipsHtml(attributions) {
  if (!attributions?.length) return ''
  const chips = attributions.map((attr) => {
    const type = ['calendar', 'search', 'geo'].includes(attr.type) ? attr.type : 'unknown'
    const icon = attr.type === 'calendar' ? '🗓️' : attr.type === 'search' ? '🔍' : '📍'
    return `<span class="attribution-chip attribution-${type}">${icon} ${escapeHtml(attr.value)}</span>`
  }).join('')
  return `<div class="event-attributions">${chips}</div>`
}

// Build a marker's popup as an HTML string. Called lazily (on marker click) via
// Leaflet's bindPopup(fn), so we don't construct ~8k popup/attribution subtrees
// up front — only the one the user actually opens. Built by hand (rather than
// rendering React to a string) to keep react-dom/server out of the client bundle.
function renderPopupHtml(event, eventAttributions) {
  const parts = [
    `<strong class="map-popup-title">${escapeHtml(event.summary)}</strong>`,
    `<div class="map-popup-date">${escapeHtml(event.formattedDate)}</div>`,
  ]
  // Optional event photo (a link only). Hide on load error so a dead URL
  // leaves no broken-image icon in the popup.
  if (event.imageUrl && /^https?:\/\//i.test(event.imageUrl)) {
    parts.push(`<img class="map-popup-image" src="${escapeHtml(event.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" />`)
  }
  if (event.calendarName) {
    parts.push(`<div class="map-popup-source">${escapeHtml(event.calendarName)}</div>`)
  }
  // Only emit http(s) links — guards against javascript: / data: URLs in source data.
  if (event.url && /^https?:\/\//i.test(event.url)) {
    parts.push(`<a href="${escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer" class="map-popup-link">View event →</a>`)
  }
  // Open-in-maps link. Use the Google universal URL (always http(s), works on
  // desktop and deep-links into the maps app on mobile) so it passes the same
  // scheme guard as the event link above.
  const mapUrl = googleMapsUrl({ location: event.location, lat: event.lat, lng: event.lng })
  if (mapUrl) {
    parts.push(`<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer" class="map-popup-link">Open in maps →</a>`)
  }
  parts.push(attributionChipsHtml(eventAttributions?.get(eventKey(event))))
  return `<div class="map-popup">${parts.join('')}</div>`
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

  // Viewport culling: only render markers within (a padded) current map bounds,
  // re-filtering when the map pans/zooms. This keeps a date-window change cheap
  // while the user is zoomed into a neighborhood — we rebuild dozens of markers,
  // not thousands. `bounds` is null until the map reports its first viewport, in
  // which case we render everything (the initial fit frames all events anyway).
  const [bounds, setBounds] = useState(null)
  const onBounds = useCallback((b) => setBounds(b), [])
  const visibleEvents = useMemo(() => {
    if (!bounds) return eventsWithDates
    const padded = bounds.pad(0.5) // ~50% buffer so just-offscreen markers stay put while panning
    return eventsWithDates.filter((e) => padded.contains([e.lat, e.lng]))
  }, [eventsWithDates, bounds])

  // Bare markers, memoized so the marker list is rebuilt only when the visible
  // event set actually changes (not on every parent re-render). Popups are bound
  // lazily on first click via Leaflet's bindPopup — constructing the
  // popup/attribution markup only for the marker the user opens.
  const markers = useMemo(() => visibleEvents.map((event) => (
    <Marker
      key={`event-${eventKey(event)}`}
      position={[event.lat, event.lng]}
      eventHandlers={{
        click: (e) => {
          const layer = e.target
          if (!layer.getPopup()) layer.bindPopup(() => renderPopupHtml(event, eventAttributions))
          layer.openPopup()
        },
      }}
    />
  )), [visibleEvents, eventAttributions])

  return (
    <div className="events-map-container" data-testid="events-map">
      <MapContainer
        center={SEATTLE_CENTER}
        zoom={DEFAULT_ZOOM}
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
