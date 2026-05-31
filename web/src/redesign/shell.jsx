// App shell chrome: top bar, desktop rail, mobile bottom nav, map panel, toast.

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

export function TopBar() {
  const app = useApp206()
  const items = NAV_ITEMS.filter((it) => it.id !== 'you')
  return (
    <div className="a-topbar">
      <Brand />
      <button className="a-search" onClick={app.openSearch} style={{ cursor: 'text' }}>
        <span style={{ width: 19, height: 19, flex: '0 0 auto' }}>{Ico.search}</span>
        <span className="tx">Search events &amp; venues…</span>
      </button>
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
  const map = (
    <EventsMap
      eventsIndex={app.eventsIndex}
      geoFilters={app.geoFilters}
      calendarFilter={app.openCh || null}
      calendarTagsByIcsUrl={app.calendarTagsByIcsUrl}
      selectedTag={null}
      calendarNameByIcsUrl={app.calendarNameByIcsUrl}
      eventAttributions={app.eventAttributions}
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
        <button className="btn btn-ghost" style={{ height: 36, fontSize: 13, padding: '0 12px' }} onClick={app.saveArea}>{Ico.plus}Save this area</button>
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
