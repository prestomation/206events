import { useMemo, useEffect, useState, useCallback, useRef, memo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { eventKey } from '../lib/eventKey.js'

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
    const points = []
    for (const e of eventsRef.current) {
      if (e.lat && e.lng) points.push([e.lat, e.lng])
    }
    for (const gf of geoRef.current) {
      const kmToDeg = gf.radiusKm / 111
      points.push([gf.lat + kmToDeg, gf.lng + kmToDeg])
      points.push([gf.lat - kmToDeg, gf.lng - kmToDeg])
    }
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
  if (event.calendarName) {
    parts.push(`<div class="map-popup-source">${escapeHtml(event.calendarName)}</div>`)
  }
  // Only emit http(s) links — guards against javascript: / data: URLs in source data.
  if (event.url && /^https?:\/\//i.test(event.url)) {
    parts.push(`<a href="${escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer" class="map-popup-link">View event →</a>`)
  }
  parts.push(attributionChipsHtml(eventAttributions?.get(eventKey(event))))
  return `<div class="map-popup">${parts.join('')}</div>`
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
  mapRef,
}) {
  // Filter events: only those with lat/lng, respecting the active tag/calendar
  // filter and the global date window.
  const mappableEvents = useMemo(() => eventsIndex.filter(event => {
    if (!event.lat || !event.lng) return false

    // Date-window filter (global "next N days" slider)
    if (!dateInScope(event)) return false

    // Calendar/tag filter
    if (calendarFilter) {
      // If a specific calendar is selected, only show events from it
      if (event.icsUrl !== calendarFilter) return false
    } else if (selectedTag && selectedTag !== '__favorites__') {
      const tags = calendarTagsByIcsUrl[event.icsUrl] || []
      if (!tags.includes(selectedTag)) return false
    }

    return true
  }), [eventsIndex, calendarFilter, selectedTag, calendarTagsByIcsUrl, dateInScope])

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

        <FitBounds events={eventsWithDates} geoFilters={geoFilters} fitKey={`${calendarFilter || ''}|${selectedTag || ''}`} />

        {/* Event markers — bare markers with lazy (on-click) popups */}
        <MarkerClusterGroup
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
          No geocoded events to display
          {selectedTag ? ` for this filter` : ''}
        </div>
      )}
    </div>
  )
}

export const EventsMap = memo(EventsMapInner)
