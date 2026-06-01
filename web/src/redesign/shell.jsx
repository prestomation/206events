// App shell chrome: top bar, desktop rail, mobile bottom nav, map panel, toast.

import { useState, useEffect, useRef } from 'react'
import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { Brand } from './atoms.jsx'
import { EventsMap } from '../components/EventsMap.jsx'

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

export function FilterPopover() {
  const app = useApp206()
  const scopes = [['all', 'Any day'], ['today', 'Today'], ['weekend', 'This weekend']]
  return (
    <>
      <div onClick={app.toggleFilter} style={{ position: 'absolute', inset: 0, zIndex: 70 }} />
      <div className="a-filterpop">
        <div className="a-eyebrow" style={{ marginBottom: 9 }}>WHEN</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {scopes.map(([v, label]) => (
            <button key={v} onClick={() => app.setDateScope(v)} className={`a-scope ${app.dateScope === v ? 'on' : ''}`}>
              <span style={{ width: 16, height: 16, flex: '0 0 auto' }}>{app.dateScope === v ? Ico.check : Ico.clock}</span>{label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1, height: 38, fontSize: 13 }} onClick={() => app.setDateScope('all')}>Reset</button>
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

  const map = (
    <EventsMap
      eventsIndex={app.eventsIndex}
      geoFilters={app.geoFilters}
      calendarFilter={app.openCh || null}
      calendarTagsByIcsUrl={app.calendarTagsByIcsUrl}
      selectedTag={null}
      calendarNameByIcsUrl={app.calendarNameByIcsUrl}
      eventAttributions={app.eventAttributions}
      mapRef={mobile ? undefined : app.mapRef}
    />
  )
  if (mobile) {
    return <div className="a-mapview">{map}</div>
  }
  return (
    <div className="a-mappanel">
      {map}
      <div className="a-mapbar">
        <div>
          <div className="a-h2" style={{ fontSize: 15 }}>Near you</div>
          <div className="mk-tag" style={{ marginTop: 2 }}>{app.eventsIndex.length} EVENTS</div>
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
