// App shell chrome: top bar, desktop rail, mobile bottom nav, map panel, toast.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { Brand } from './atoms.jsx'
import { EventsMap } from '../components/EventsMap.jsx'
import { eventKey } from '../lib/eventKey.js'
import { DATE_WINDOW_STOPS, describeWindow } from './viewModels.js'

const NAV_ITEMS = [
  { id: 'discover', label: 'Discover', icon: Ico.spark },
  { id: 'map', label: 'Map', icon: Ico.map, mobileOnly: true },
  { id: 'following', label: 'Following', icon: Ico.heart },
  { id: 'you', label: 'You', icon: Ico.user },
]

const SUGGESTIONS = ['jazz', 'outdoor', 'comedy', 'market', 'art', 'capitol hill']

// How long to wait after the last slider move before committing the picked stop
// to the global window (which triggers the heavy re-filter / marker rebuild).
const DATE_WINDOW_COMMIT_MS = 180

// The single search bar lives in the top bar on every screen. Local input state
// updates immediately for a responsive caret; a debounced effect commits to the
// app-wide `query` (which drives filtering), so typing never rebuilds the index
// per keystroke.
export function TopBar() {
  const app = useApp206()
  const items = NAV_ITEMS.filter((it) => it.id !== 'you')
  const [text, setText] = useState(app.query)
  const [focused, setFocused] = useState(false)
  // Mobile only: the search field collapses to an icon and expands to a
  // full-width overlay when tapped, so the "Saving to" switcher can share the
  // narrow top bar without squeezing search into a useless sliver. Desktop CSS
  // ignores this state and keeps the field inline.
  const [searchOpen, setSearchOpen] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  // Keep the input in sync when the query is cleared elsewhere (e.g. chip ✕).
  useEffect(() => { setText(app.query) }, [app.query])
  // Debounce commits into the global query.
  useEffect(() => {
    const id = setTimeout(() => { if (text !== app.query) app.setQuery(text) }, 200)
    return () => clearTimeout(id)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the field as soon as the mobile overlay opens.
  useEffect(() => { if (searchOpen) inputRef.current?.focus() }, [searchOpen])

  // Close suggestions on outside click.
  useEffect(() => {
    if (!focused) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [focused])

  const commit = (v) => { setText(v); app.setQuery(v); setFocused(false); setSearchOpen(false) }
  const clear = () => { setText(''); app.setQuery(''); inputRef.current?.focus() }
  // Collapse the mobile overlay, keeping whatever query is committed.
  const closeSearch = () => { app.setQuery(text); setFocused(false); setSearchOpen(false) }
  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter') { app.setQuery(text); setFocused(false); setSearchOpen(false); inputRef.current?.blur() }
    else if (e.key === 'Escape') { setFocused(false); setSearchOpen(false) }
  }

  return (
    <div className={`a-topbar${searchOpen ? ' a-topbar--searching' : ''}`}>
      <Brand />
      {/* Mobile-only collapsed state: tap to expand the search overlay. Shows an
          active dot when a query is applied (the field itself is hidden). */}
      <button className={`a-iconbtn a-search-toggle${app.query.trim() ? ' on' : ''}`}
        onClick={() => setSearchOpen(true)} aria-expanded={searchOpen}
        aria-label="Search events and venues">
        <span style={{ width: 20, height: 20 }}>{Ico.search}</span>
      </button>
      <div className="a-search-wrap" ref={wrapRef}>
        <div className="a-search">
          {/* Back arrow collapses the mobile overlay; on desktop the magnifier
              glyph shows in its place (visibility swapped in CSS). */}
          <button className="a-search-back" onClick={closeSearch} aria-label="Close search">
            <span style={{ width: 19, height: 19 }}>{Ico.back}</span>
          </button>
          <span className="a-search-ico" style={{ width: 19, height: 19, flex: '0 0 auto' }}>{Ico.search}</span>
          <input ref={inputRef} className="a-search-input" value={text} onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)} onKeyDown={onSearchKeyDown} placeholder="Search events & venues…"
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
      <SavingToSwitcher />
      <button className="a-iconbtn" onClick={app.openHelp} title="How it works" aria-label="How it works">{Ico.help}</button>
      <button className="a-iconbtn" onClick={app.toggleFilter} title="Filter by date">{Ico.filter}</button>
    </div>
  )
}

// Global "Saving to: <list>" control. Visible on every view when the user is
// signed-in with more than one favorites list, so it's always clear which list
// a Follow lands in — and switchable from anywhere. With a single list there's
// no ambiguity, so it stays hidden. Built on the same .a-dd* dropdown styling as
// FilterDropdown (not FilterDropdown itself, which has "All …"/null semantics —
// a list is always selected).
export function SavingToSwitcher() {
  const app = useApp206()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!app.authUser || !app.lists || app.lists.length <= 1) return null
  const active = app.lists.find((l) => l.id === app.activeListId) || app.lists[0]
  const pick = (id) => { app.setActiveList(id); setOpen(false) }

  return (
    <div className="a-dd a-savingto" ref={ref}>
      <button className="a-dd-btn on" onClick={() => setOpen((v) => !v)}
        title="New follows are saved to this list">
        <span style={{ width: 16, height: 16, flex: '0 0 auto' }}>{Ico.list}</span>
        <span className="a-savingto-prefix">Saving to:</span>
        <span className="a-savingto-name">{active.name}</span>
        <span className="a-dd-caret" style={{ width: 14, height: 14 }}>{Ico.arrow}</span>
      </button>
      {open && (
        <div className="a-dd-menu" role="listbox" aria-label="List that follows are saved to">
          {app.lists.map((l) => (
            <button key={l.id} role="option" aria-selected={l.id === active.id}
              className={`a-dd-item ${l.id === active.id ? 'on' : ''}`} onClick={() => pick(l.id)}>
              <span className="a-dd-item-label">{l.name}</span>
              {l.id === active.id && <span className="a-dd-item-check" style={{ width: 14, height: 14 }}>{Ico.check}</span>}
            </button>
          ))}
        </div>
      )}
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
    commitT.current = setTimeout(() => app.setDateWindow(DATE_WINDOW_STOPS[next]), DATE_WINDOW_COMMIT_MS)
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
// Draggable divider on the left edge of the desktop map panel. Dragging sets
// the map column width (distance from the right edge of the window to the
// pointer); double-clicking resets to the default. Keyboard: Left/Right arrows
// grow/shrink the map by KEY_STEP. The MapBridge ResizeObserver re-sizes Leaflet
// after the column changes, so no manual invalidateSize() is needed here.
const KEY_STEP = 24
function MapResizeHandle({ panelRef, setMapWidth, mapWidth }) {
  const onPointerDown = useCallback((e) => {
    // Only the primary (left) button starts a drag.
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    const move = (ev) => setMapWidth(window.innerWidth - ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('a-resizing')
    }
    document.body.classList.add('a-resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [setMapWidth])

  const onKeyDown = useCallback((e) => {
    const cur = mapWidth ?? (panelRef.current ? panelRef.current.offsetWidth : 440)
    if (e.key === 'ArrowLeft') { e.preventDefault(); setMapWidth(cur + KEY_STEP) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setMapWidth(cur - KEY_STEP) }
    else if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); setMapWidth(null) }
  }, [mapWidth, panelRef, setMapWidth])

  return (
    <div
      className="a-mapresize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize map — drag, or use arrow keys; double-click to reset"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => setMapWidth(null)}
      onKeyDown={onKeyDown}
    />
  )
}

export function MapPanel({ mobile = false }) {
  const app = useApp206()
  const panelRef = useRef(null)
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

  // Scope the map to the personal feed. Desktop strictly mirrors the section
  // (favorites-only on Following); mobile uses the persistent `mapScope` toggle
  // since the Map is its own tab. An open channel always takes precedence.
  const feedOnly = !app.openCh && (mobile ? app.mapScope === 'following' : app.section === 'following')

  // Count what the map actually plots so the badge tracks the date window:
  // events with coords, matching the active search, the open-channel filter (or
  // the feed), inside the window. Mirrors the EventsMap predicate.
  const shownCount = useMemo(() => {
    const openCh = app.openCh || null
    const attrib = app.eventAttributions
    const qks = app.queryKeySet
    return app.eventsIndex.filter((e) => {
      if (!e.lat || !e.lng || !app.inScope(e)) return false
      if (qks && !qks.has(eventKey(e))) return false
      if (openCh) return e.icsUrl === openCh
      if (feedOnly && !(attrib && attrib.has(eventKey(e)))) return false
      return true
    }).length
  }, [app.eventsIndex, app.openCh, app.inScope, app.eventAttributions, app.queryKeySet, feedOnly])

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
      feedOnly={feedOnly}
      queryKeySet={app.queryKeySet}
      mapRef={mobile ? undefined : app.mapRef}
    />
  )
  // Mobile gets an explicit All/Following toggle since the Map tab has no section
  // context to mirror. It rides inside the floating filter bar (an overlay) next
  // to the date slider, so it costs no map height. Reuses the segmented styles.
  const scopeToggle = (
    <div className="a-seg a-mapscope" role="group" aria-label="Map scope">
      <button className={app.mapScope === 'all' ? 'on' : ''} onClick={() => app.setMapScope('all')}>All</button>
      <button className={app.mapScope === 'following' ? 'on' : ''} onClick={() => app.setMapScope('following')}>Following</button>
    </div>
  )
  // Visual hint that the map is narrowed by the search box. Lives in the bottom
  // filter bar (the one overlay present on BOTH desktop and mobile), shows the
  // term + how many of the plotted pins match, and offers a one-tap clear. The
  // desktop top bar additionally swaps its heading (below) so "Near you" doesn't
  // contradict an active search.
  const query = app.query.trim()
  const searchHint = query ? (
    <div className="a-mapsearch" title={`Map filtered to events matching “${query}”`}>
      <span className="a-mapsearch-ico" style={{ width: 14, height: 14 }}>{Ico.search}</span>
      <span className="a-mapsearch-text">“{query}” · {shownCount}</span>
      <button className="a-mapsearch-x" onClick={app.clearSearch} aria-label="Clear search filter" title="Clear search">
        <span style={{ width: 13, height: 13 }}>{Ico.close}</span>
      </button>
    </div>
  ) : null
  const filterBar = (
    <div className="a-mapfilter">
      {searchHint}
      {mobile && scopeToggle}
      <DateWindowSlider compact />
    </div>
  )
  if (mobile) {
    return <div className="a-mapview">{map}{filterBar}</div>
  }
  return (
    <div className="a-mappanel" ref={panelRef}>
      <MapResizeHandle panelRef={panelRef} setMapWidth={app.setMapWidth} mapWidth={app.mapWidth} />
      {map}
      {filterBar}
      <div className="a-mapbar">
        <div>
          <div className="a-h2" style={{ fontSize: 15 }}>{query ? <>Matching “{query}”</> : feedOnly ? 'Your feed' : 'Near you'}</div>
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
