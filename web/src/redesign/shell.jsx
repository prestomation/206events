// App shell chrome: top bar, desktop rail, mobile bottom nav, map panel, toast.

import { useState, useEffect, useRef, useMemo } from 'react'
import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { Brand } from './atoms.jsx'
import { EventsMap } from '../components/EventsMap.jsx'
import { DATE_WINDOW_STOPS, describeWindow } from './viewModels.js'

const NAV_ITEMS = [
  { id: 'discover', label: 'Discover', icon: Ico.spark },
  { id: 'map', label: 'Map', icon: Ico.map, mobileOnly: true },
  { id: 'following', label: 'Following', icon: Ico.heart },
  { id: 'you', label: 'You', icon: Ico.user },
]

const SUGGESTIONS = ['jazz', 'outdoor', 'comedy', 'market', 'art', 'capitol hill']

// The single search bar lives in the top bar on every screen. Local input state
// updates immediately for a responsive caret; a debounced effect commits to the
// app-wide `query` (which drives filtering), so typing never rebuilds the index
// per keystroke.
export function TopBar() {
  const app = useApp206()
  const items = NAV_ITEMS.filter((it) => it.id !== 'you')
  const [text, setText] = useState(app.query)
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef(null)

  // Keep the input in sync when the query is cleared elsewhere (e.g. chip ✕).
  useEffect(() => { setText(app.query) }, [app.query])
  // Debounce commits into the global query.
  useEffect(() => {
    const id = setTimeout(() => { if (text !== app.query) app.setQuery(text) }, 200)
    return () => clearTimeout(id)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close suggestions on outside click.
  useEffect(() => {
    if (!focused) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [focused])

  const commit = (v) => { setText(v); app.setQuery(v); setFocused(false) }
  const clear = () => { setText(''); app.setQuery(''); }

  return (
    <div className="a-topbar">
      <Brand />
      <div className="a-search-wrap" ref={wrapRef}>
        <div className="a-search">
          <span style={{ width: 19, height: 19, flex: '0 0 auto' }}>{Ico.search}</span>
          <input className="a-search-input" value={text} onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)} placeholder="Search events & venues…"
            aria-label="Search events and venues" />
          {text && <button className="a-search-x" onClick={clear} aria-label="Clear search">
            <span style={{ width: 16, height: 16 }}>{Ico.close}</span>
          </button>}
        </div>
        {focused && !text && (
          <div className="a-suggest">
            <div className="a-eyebrow" style={{ padding: '2px 4px 8px' }}>TRY</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="mk-pill mk-pill--ghost" onMouseDown={(e) => { e.preventDefault(); commit(s) }}>{s}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <nav className="a-topnav">
        {items.map((it) => (
          <button key={it.id} className={`${app.section === it.id ? 'on' : ''} ${it.mobileOnly ? 'a-mapTabHide' : ''}`}
            onClick={() => app.go(it.id)}>{it.icon}<span>{it.label}</span></button>
        ))}
      </nav>
      <button className="a-iconbtn" onClick={app.toggleFilter} title="Filter by date">{Ico.filter}</button>
    </div>
  )
}

// Generic labelled dropdown (button → popup menu). Used for Category and
// Neighborhood browse filters. `options` = [{ value, label, count }].
export function FilterDropdown({ label, icon, value, options, onSelect, groups }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const active = options.find((o) => o.value === value)
  const pick = (v) => { onSelect(v); setOpen(false) }

  const renderOption = (o) => (
    <button key={o.value} className={`a-dd-item ${o.value === value ? 'on' : ''}`} onClick={() => pick(o.value)}>
      <span className="a-dd-item-label">{o.label}</span>
      {o.count != null && <span className="a-dd-item-count">{o.count}</span>}
      {o.value === value && <span className="a-dd-item-check" style={{ width: 14, height: 14 }}>{Ico.check}</span>}
    </button>
  )

  return (
    <div className="a-dd" ref={ref}>
      <button className={`a-dd-btn ${value ? 'on' : ''}`} onClick={() => setOpen((v) => !v)}>
        {icon && <span style={{ width: 16, height: 16, flex: '0 0 auto' }}>{icon}</span>}
        <span>{active ? active.label : label}</span>
        <span className="a-dd-caret" style={{ width: 14, height: 14 }}>{Ico.arrow}</span>
      </button>
      {open && (
        <div className="a-dd-menu">
          <button className={`a-dd-item ${!value ? 'on' : ''}`} onClick={() => pick(null)}>
            <span className="a-dd-item-label">All {label.toLowerCase()}</span>
            {!value && <span className="a-dd-item-check" style={{ width: 14, height: 14 }}>{Ico.check}</span>}
          </button>
          {groups
            ? groups.map((g) => (
              <div key={g.label} className="a-dd-group">
                <div className="a-dd-grouphdr">{g.label}</div>
                {g.options.map(renderOption)}
              </div>
            ))
            : options.map(renderOption)}
        </div>
      )}
    </div>
  )
}

export function RailNav() {
  const app = useApp206()
  const items = NAV_ITEMS.filter((it) => !it.mobileOnly)
  return (
    <div className="a-railinner">
      <div className="logo">206</div>
      {items.map((it) => (
        <button key={it.id} className={`a-railitem ${app.section === it.id ? 'on' : ''}`} onClick={() => app.go(it.id)}>
          {it.icon}<span>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

export function BottomNav() {
  const app = useApp206()
  return (
    <nav className="a-bottom">
      {NAV_ITEMS.map((it) => (
        <button key={it.id} className={`t ${app.section === it.id ? 'on' : ''} ${it.mobileOnly ? 'a-mapTabHide' : ''}`}
          onClick={() => app.go(it.id)}>{it.icon}<span>{it.label}</span></button>
      ))}
    </nav>
  )
}

// A single "next N days" slider over the discrete DATE_WINDOW_STOPS. The thumb
// position is the stop index; the value is the global `dateWindow` (a day count
// or 'all'). Label shows both the relative phrase and the resolved end date.
export function DateWindowSlider({ compact = false }) {
  const app = useApp206()
  const committedIdx = Math.max(0, DATE_WINDOW_STOPS.indexOf(app.dateWindow))
  // The thumb tracks LOCAL state, so dragging is never blocked by the heavy
  // re-filter / marker rebuild — it updates instantly on every input event.
  // We commit the picked stop to the global window (which triggers that work)
  // only after a short pause, so the expensive pass runs once, not per step.
  const [idx, setIdx] = useState(committedIdx)
  const commitT = useRef(0)

  // Re-sync the thumb when the window changes from elsewhere (Reset button, the
  // active-filter chip, the other slider instance, URL navigation). committedIdx
  // only moves once our debounced commit lands, so this never fights a drag.
  useEffect(() => { setIdx(committedIdx) }, [committedIdx])
  useEffect(() => () => clearTimeout(commitT.current), [])

  const onChange = (e) => {
    const next = Number(e.target.value)
    setIdx(next) // instant thumb + label
    clearTimeout(commitT.current)
    commitT.current = setTimeout(() => app.setDateWindow(DATE_WINDOW_STOPS[next]), 180)
  }

  // Label follows the LOCAL thumb so it updates live while dragging. Re-resolved
  // each render so the absolute end date stays anchored to "now".
  const { relative, absoluteEnd } = describeWindow(DATE_WINDOW_STOPS[idx])
  // "Updating" while the picked stop hasn't been applied yet (debounce in flight)
  // or while the deferred re-filter is still catching up.
  const pending = idx !== committedIdx || app.dateWindowPending

  return (
    <div className={`a-datewindow${compact ? ' a-datewindow--compact' : ''}`}>
      <div className="a-datewindow-label">
        <span className="a-datewindow-rel">
          {relative}
          {pending && <span className="a-datewindow-spin" role="status" aria-label="Updating events" />}
        </span>
        {absoluteEnd && <span className="a-datewindow-abs">through {absoluteEnd}</span>}
      </div>
      <input
        type="range"
        className="a-datewindow-range"
        min={0}
        max={DATE_WINDOW_STOPS.length - 1}
        step={1}
        value={idx}
        aria-label="Date range: how many days ahead to show"
        aria-valuetext={absoluteEnd ? `${relative}, through ${absoluteEnd}` : relative}
        onChange={onChange}
      />
    </div>
  )
}

export function FilterPopover() {
  const app = useApp206()
  return (
    <>
      <div onClick={app.toggleFilter} style={{ position: 'absolute', inset: 0, zIndex: 70 }} />
      <div className="a-filterpop">
        <div className="a-eyebrow" style={{ marginBottom: 9 }}>WHEN</div>
        <div style={{ marginBottom: 14 }}>
          <DateWindowSlider />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1, height: 38, fontSize: 13 }} onClick={() => app.setDateWindow('all')}>Reset</button>
          <button className="btn btn-blue" style={{ flex: 1, height: 38, fontSize: 13 }} onClick={app.toggleFilter}>Done</button>
        </div>
      </div>
    </>
  )
}

// Desktop persistent map column / mobile map view — wraps the existing Leaflet map.
export function MapPanel({ mobile = false }) {
  const app = useApp206()
  // Only the persistent desktop panel drives the shared map ref / expand state;
  // the mobile view is a separate instance and must not clobber the ref.
  const expanded = !mobile && app.mapExpanded

  // Esc collapses the expanded desktop map.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e) => { if (e.key === 'Escape') app.toggleMapExpand() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded, app])

  // Count what the map actually plots so the badge tracks the date window:
  // events with coords, matching the open-channel filter, inside the window.
  const shownCount = useMemo(() => {
    const openCh = app.openCh || null
    return app.eventsIndex.filter((e) =>
      e.lat && e.lng && (!openCh || e.icsUrl === openCh) && app.inScope(e)
    ).length
  }, [app.eventsIndex, app.openCh, app.inScope])

  const map = (
    <EventsMap
      eventsIndex={app.eventsIndex}
      geoFilters={app.geoFilters}
      calendarFilter={app.openCh || null}
      calendarTagsByIcsUrl={app.calendarTagsByIcsUrl}
      selectedTag={null}
      calendarNameByIcsUrl={app.calendarNameByIcsUrl}
      eventAttributions={app.eventAttributions}
      dateInScope={app.inScope}
      mapRef={mobile ? undefined : app.mapRef}
    />
  )
  const filterBar = (
    <div className="a-mapfilter">
      <DateWindowSlider compact />
    </div>
  )
  if (mobile) {
    return <div className="a-mapview">{map}{filterBar}</div>
  }
  return (
    <div className="a-mappanel">
      {map}
      {filterBar}
      <div className="a-mapbar">
        <div>
          <div className="a-h2" style={{ fontSize: 15 }}>Near you</div>
          <div className="mk-tag" style={{ marginTop: 2 }}>{shownCount} EVENTS</div>
        </div>
        <div className="a-mapbar-actions">
          <button className="a-iconbtn a-mapexpand" onClick={app.toggleMapExpand}
            title={expanded ? 'Collapse map' : 'Expand map to full screen'}
            aria-label={expanded ? 'Collapse map' : 'Expand map'}>
            {expanded ? Ico.shrink : Ico.expand}
          </button>
          <button className="btn btn-ghost a-mapsave" onClick={app.saveArea}
            title="Save the area shown on the map as a location filter — any event inside the circle joins your feed">
            {Ico.plus}Save this area
          </button>
        </div>
      </div>
    </div>
  )
}

export function Toast() {
  const app = useApp206()
  if (!app.toast) return null
  return (
    <div className="a-toast"><span style={{ width: 16, height: 16 }}>{Ico.check}</span>{app.toast}</div>
  )
}
