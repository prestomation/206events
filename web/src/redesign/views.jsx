// Composite views for the redesigned UI: Discover, Following, You (config),
// ChannelDetail, EventDetail, SearchView.

import { useState, useMemo, useRef, useEffect } from 'react'
import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { ChannelAvatar, CatDot, FollowPill, DayList, CategoryChips } from './atoms.jsx'
import { ChannelCard } from './ChannelCard.jsx'
import {
  upcomingIndexEvents, groupIndexEventsByDay, parseIndexDate, rowFromIndexEvent,
} from './viewModels.js'
import { GeoFiltersSection } from '../components/GeoFiltersSection.jsx'
import { AddToCalendar } from '../components/AddToCalendar.jsx'
import { EventDescription } from '../components/EventDescription.jsx'
import { formatTagLabel } from '../utils/format.js'
import { isNeighborhoodTag } from './categories.js'

// Cap for the Discover "Events" list — the full upcoming window is thousands
// of events; render the soonest slice to keep the DOM light.
const EVENTS_MODE_CAP = 200

/* ------------------------------------------------------------- Discover --- */
export function DiscoverView() {
  const app = useApp206()
  const [axis, setAxis] = useState('hood')
  const [cat, setCat] = useState(null)

  return (
    <div style={{ padding: '2px var(--pad) 20px' }}>
      <div className="a-discover-head">
        <div>
          <div className="a-eyebrow" style={{ marginBottom: 5 }}>{app.todayLabel}</div>
          <div className="a-h1">Discover</div>
        </div>
        <div className="a-seg">
          <button className={app.emphasis === 'calendars' ? 'on' : ''} onClick={() => app.setEmphasis('calendars')}>{Ico.grid}Calendars</button>
          <button className={app.emphasis === 'events' ? 'on' : ''} onClick={() => app.setEmphasis('events')}>{Ico.spark}Events</button>
        </div>
      </div>

      <CategoryChips categories={app.categoryTags} active={cat} onSelect={setCat} />

      {app.emphasis === 'calendars' ? (
        <>
          <div className="a-browseby">
            <span className="a-eyebrow" style={{ color: 'var(--ink-4)' }}>BROWSE BY</span>
            <div className="a-seg" style={{ background: 'transparent', padding: 0, gap: 6 }}>
              <button className={axis === 'hood' ? 'on' : ''} style={{ height: 30, background: axis === 'hood' ? 'var(--surface-2)' : 'transparent' }} onClick={() => setAxis('hood')}>{Ico.pin}Neighborhood</button>
              <button className={axis === 'cat' ? 'on' : ''} style={{ height: 30, background: axis === 'cat' ? 'var(--surface-2)' : 'transparent' }} onClick={() => setAxis('cat')}>{Ico.grid}Category</button>
            </div>
          </div>
          <CalendarsMode axis={axis} cat={cat} />
        </>
      ) : (
        <div style={{ marginTop: 16 }}><EventsMode cat={cat} /></div>
      )}
    </div>
  )
}

function CalendarsMode({ axis, cat }) {
  const app = useApp206()
  let channels = app.channels
  if (cat) channels = channels.filter((c) => c.tags.includes(cat))

  const groups = useMemo(() => {
    if (axis === 'hood') {
      const byHood = new Map()
      const citywide = []
      for (const c of channels) {
        if (c.distributed || !c.hood) { citywide.push(c); continue }
        if (!byHood.has(c.hood)) byHood.set(c.hood, [])
        byHood.get(c.hood).push(c)
      }
      const out = [...byHood.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, keys]) => ({ label, channels: keys }))
      if (citywide.length) out.push({ label: 'Citywide · multiple venues', channels: citywide })
      return out
    }
    // category axis — multi-membership: a channel appears under each category tag
    const byCat = new Map()
    for (const tag of app.categoryTags) {
      const members = channels.filter((c) => c.tags.includes(tag))
      if (members.length) byCat.set(tag, members)
    }
    return [...byCat.entries()].map(([tag, keys]) => ({ label: formatTagLabel(tag), tag, channels: keys }))
  }, [axis, channels, app.categoryTags])

  if (!groups.length) return <div className="a-empty">No calendars in this category yet.</div>

  return (
    <div>
      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 22 }}>
          <div className="a-rowhdr">
            <span className="a-eyebrow">{g.label.toUpperCase()}</span>
            <span className="ln" />
          </div>
          <div className="a-grid a-maxcol2">
            {g.channels.map((c) => <ChannelCard key={c.icsUrl} channel={c} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function EventsMode({ cat }) {
  const app = useApp206()
  const groups = useMemo(() => {
    let evs = app.upcomingEvents
    if (cat) {
      evs = evs.filter((e) => {
        const ch = app.channelByIcsUrl.get(e.icsUrl)
        return ch && ch.tags.includes(cat)
      })
    }
    if (app.query) evs = app.matchEvents(app.query, evs)
    // Cap the rendered set: a 6-month all-events list is thousands of rows.
    // Events are already date-sorted, so this keeps the soonest.
    return groupIndexEventsByDay(evs.slice(0, EVENTS_MODE_CAP))
  }, [app.upcomingEvents, cat, app.query, app.channelByIcsUrl])
  if (!groups.length) return <div className="a-empty">No events match.</div>
  return <DayList groups={groups} />
}

/* ------------------------------------------------------------ Following --- */
export function FollowingView() {
  const app = useApp206()
  const groups = app.feedGroups
  const counts = { cal: app.favoritesSet.size, place: app.geoFilters.length, search: app.searchFilters.length }
  const total = groups.reduce((n, g) => n + g.events.length, 0)

  return (
    <div style={{ padding: '2px var(--pad) 24px', maxWidth: 1000, margin: '0 auto' }}>
      <div className="a-discover-head">
        <div>
          <div className="a-eyebrow" style={{ marginBottom: 5 }}>YOUR FEED · {total} EVENTS</div>
          <div className="a-h1">Following</div>
        </div>
        <button className="btn btn-ghost" style={{ height: 40, fontSize: 13.5 }} onClick={() => app.go('you')}>
          <span style={{ width: 16, height: 16 }}>{Ico.filter}</span>Manage sources
        </button>
      </div>

      <button className="a-feedlegend" onClick={() => app.go('you')} title="Manage what feeds this">
        <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>Feeding this:</span>
        <span className="prov-chip prov-cal"><span style={{ width: 12, height: 12 }}>{Ico.cal}</span>{counts.cal} calendars</span>
        <span className="prov-chip prov-place"><span style={{ width: 12, height: 12 }}>{Ico.pin}</span>{counts.place} places</span>
        <span className="prov-chip prov-search"><span style={{ width: 12, height: 12 }}>{Ico.search}</span>{counts.search} searches</span>
        <span style={{ marginLeft: 'auto', width: 16, height: 16, color: 'var(--ink-3)', flex: '0 0 auto' }}>{Ico.arrow}</span>
      </button>

      {total ? (
        <DayList groups={groups} withReason />
      ) : (
        <div className="a-empty" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Your feed is empty</div>
          <div style={{ fontSize: 13.5, marginBottom: 16 }}>Follow a calendar, save a place, or add a search.</div>
          <button className="btn btn-blue" style={{ display: 'inline-flex' }} onClick={() => app.go('you')}>{Ico.plus}Add sources</button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ You --- */
export function YouView() {
  const app = useApp206()
  const [addSearch, setAddSearch] = useState(false)
  const followed = app.channels.filter((c) => app.favoritesSet.has(c.icsUrl))
  const sourceCount = followed.length + app.geoFilters.length + app.searchFilters.length

  return (
    <div style={{ padding: '2px var(--pad) 24px', maxWidth: 1000, margin: '0 auto' }}>
      <div className="a-eyebrow" style={{ marginBottom: 5 }}>ACCOUNT &amp; SOURCES</div>
      <div className="a-h1" style={{ marginBottom: 16 }}>You</div>

      {/* account */}
      <div className="a-accountcard">
        <div className="a-accountcard-ava">
          {app.authUser
            ? <img src={app.authUser.picture} alt="" style={{ width: '100%', height: '100%', borderRadius: 999 }} />
            : <span style={{ width: 24, height: 24 }}>{Ico.user}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{app.authUser ? app.authUser.name : 'Not signed in'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            {app.authUser ? app.authUser.email : 'Sign in to sync sources across devices'}
          </div>
        </div>
        {app.API_URL && (app.authUser
          ? <button className="btn btn-ghost" style={{ height: 40, fontSize: 13.5, flex: '0 0 auto' }} onClick={app.handleLogout}>Sign out</button>
          : <button className="btn btn-ink" style={{ height: 40, fontSize: 13.5, flex: '0 0 auto' }} onClick={app.handleLogin}>{Ico.google}Sign in</button>)}
      </div>

      {/* ICS link */}
      <div className="a-icscard">
        <span style={{ width: 24, height: 24, color: 'var(--blue)', flex: '0 0 auto' }}>{Ico.cal}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: 'var(--blue-ink)', fontSize: 14.5 }}>One feed, one link</div>
          <div style={{ fontSize: 12.5, color: 'var(--blue-ink)', opacity: 0.85, marginTop: 2 }}>
            {app.authUser?.feedUrl
              ? `All ${sourceCount} sources below flow into a single subscription that stays updated.`
              : 'Sign in to get a single subscription link for everything below.'}
          </div>
          {app.authUser?.feedUrl && (
            <div style={{ display: 'flex', gap: 7, marginTop: 9, alignItems: 'center' }}>
              <code className="a-icscode">{app.authUser.feedUrl}</code>
              <button className="btn btn-blue" style={{ height: 38, fontSize: 13, flex: '0 0 auto', padding: '0 13px' }}
                onClick={() => { navigator.clipboard?.writeText(app.authUser.feedUrl); app.flash('Link copied ✓') }}>Copy</button>
            </div>
          )}
        </div>
      </div>

      {/* CALENDARS */}
      <SectionTitle kicker={Ico.cal} title="Calendars" count={followed.length} />
      {followed.length
        ? <div className="a-grid a-maxcol2">{followed.map((c) => <ChannelCard key={c.icsUrl} channel={c} />)}</div>
        : <div className="a-empty">No calendars yet — follow some in Discover.</div>}

      {/* PLACES */}
      <SectionTitle kicker={Ico.pin} title="Location filters" count={app.geoFilters.length} />
      <p className="a-sectionhint">Any event within the radius is added automatically — handy for calendars that don’t list a venue.</p>
      <GeoFiltersSection authUser={app.authUser} geoFilters={app.geoFilters}
        onAdd={app.addGeoFilter} onDelete={app.deleteGeoFilter} onEdit={app.editGeoFilter} isMobile={app.isMobile} />

      {/* SEARCHES */}
      <SectionTitle kicker={Ico.search} title="Saved searches" count={app.searchFilters.length} />
      <p className="a-sectionhint">New events matching these terms join your feed across every calendar.</p>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        {app.searchFilters.map((q) => (
          <span key={q} className="prov-chip prov-search" style={{ height: 34, paddingRight: 4 }}>
            <span style={{ width: 13, height: 13 }}>{Ico.search}</span>“{q}”
            <button className="a-chip-x" onClick={() => app.removeSearchFilter(q)} title="Remove">
              <span style={{ width: 12, height: 12 }}>{Ico.close}</span>
            </button>
          </span>
        ))}
        {!addSearch && (
          <button className="btn btn-ghost" style={{ height: 38, fontSize: 13.5 }} onClick={() => setAddSearch(true)}>{Ico.plus}Add search</button>
        )}
      </div>
      {addSearch && <AddSearchForm onSave={(q) => { app.addSearchFilter(q); setAddSearch(false) }} onCancel={() => setAddSearch(false)} />}

      {/* site health */}
      <div style={{ marginTop: 28 }}>
        <button className="btn btn-ghost" style={{ height: 40, fontSize: 13.5 }} onClick={() => app.go('health')}>
          <span style={{ width: 16, height: 16 }}>{Ico.spark}</span>Site health
        </button>
      </div>
    </div>
  )
}

function SectionTitle({ kicker, title, count }) {
  return (
    <div className="a-sectiontitle">
      <span style={{ width: 22, height: 22, color: 'var(--ink-3)', flex: '0 0 auto' }}>{kicker}</span>
      <span className="a-h2" style={{ fontSize: 17, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{title}</span>
      {count != null && <span className="a-eyebrow" style={{ color: 'var(--ink-4)', flex: '0 0 auto' }}>{count}</span>}
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  )
}

function AddSearchForm({ onSave, onCancel }) {
  const [q, setQ] = useState('')
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, maxWidth: 440 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search term (e.g. jazz, trivia)…"
        onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) onSave(q.trim()) }} className="a-input" style={{ flex: 1, minWidth: 0 }} />
      <button className="btn btn-blue" style={{ height: 42, flex: '0 0 auto' }} onClick={() => q.trim() && onSave(q.trim())}>Add</button>
      <button className="btn btn-ghost" style={{ height: 42, width: 42, padding: 0, flex: '0 0 auto' }} onClick={onCancel}>{Ico.close}</button>
    </div>
  )
}

/* -------------------------------------------------------- ChannelDetail --- */
export function ChannelDetail({ icsUrl }) {
  const app = useApp206()
  const channel = app.channelByIcsUrl.get(icsUrl)
  if (!channel) return null
  const following = app.favoritesSet.has(icsUrl)
  const evs = app.channelEvents

  return (
    <div style={{ padding: '2px var(--pad) 24px', maxWidth: 760, margin: '0 auto' }}>
      <button className="a-iconbtn" onClick={app.back} style={{ marginTop: 8, marginBottom: 14 }}>{Ico.back}</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <ChannelAvatar color={channel.color} size={56} />
        <div style={{ minWidth: 0 }}>
          <div className="a-h1" style={{ fontSize: 24, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{channel.name}</div>
          <div className="mk-tag" style={{ marginTop: 5 }}>
            <CatDot tag={channel.primaryCategory} color={channel.color} size={7} />
            {channel.distributed ? 'Multiple venues · Citywide' : (channel.hood || 'Seattle')}
          </div>
        </div>
      </div>

      <button className="btn btn-blue" style={{ width: '100%', marginBottom: 10 }}
        onClick={() => app.subscribeChannel(channel)}>{Ico.cal}Add to my calendar app</button>
      <div style={{ display: 'flex', gap: 9, marginBottom: 22 }}>
        <button className={`btn ${following ? 'btn-ink' : 'btn-ghost'}`} style={{ flex: 1, minWidth: 0, height: 44, fontSize: 13.5 }}
          onClick={() => app.toggleFollow(icsUrl)}>
          {following ? <><span style={{ width: 16, height: 16 }}>{Ico.check}</span>Following</> : <>♥ Follow</>}
        </button>
        <a className="btn btn-ghost" style={{ flex: 1, minWidth: 0, height: 44, fontSize: 13.5 }}
          href={app.createGoogleCalendarUrl(channel.cal.icsUrl, channel.cal.originalIcsUrl)}>{Ico.google}Google</a>
        {channel.cal.rssUrl && (
          <a className="btn btn-ghost" style={{ flex: 1, minWidth: 0, height: 44, fontSize: 13.5, color: 'var(--amber)' }}
            href={channel.cal.rssUrl}>{Ico.rss}RSS</a>
        )}
      </div>

      {channel.distributed && (
        <div className="a-note">
          <span style={{ width: 18, height: 18, color: 'var(--ink-3)', flex: '0 0 auto', marginTop: 1 }}>{Ico.pin}</span>
          <p style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-2)' }}>
            This calendar has <strong>no fixed venue</strong> — each event sets its own location, shown below and on the map.
          </p>
        </div>
      )}

      <div className="a-rowhdr"><span className="a-eyebrow">{app.channelEventsLoading ? 'LOADING…' : `${evs.length} UPCOMING EVENTS`}</span><span className="ln" /></div>
      {app.channelEventsError
        ? <div className="a-empty">{app.channelEventsError}</div>
        : evs.length
          ? evs.map((e) => <ParsedEventRow key={e.id} event={e} distributed={channel.distributed} />)
          : !app.channelEventsLoading && <div className="a-empty">Schedule updates daily.</div>}
    </div>
  )
}

// Row for an ICS-parsed event (channel detail). Shape: { title, startDate, endDate, location, description, url }
function ParsedEventRow({ event, distributed }) {
  const time = event.startDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="ev" style={{ cursor: 'default' }}>
      <div className="ev-body">
        <div className="ev-title">{event.title}</div>
        <div className="ev-meta"><span>{time}</span></div>
        {distributed && event.location && (
          <div className="ev-meta" style={{ marginTop: 5 }}>
            <span style={{ width: 13, height: 13, flex: '0 0 auto', color: 'var(--ink-4)' }}>{Ico.pin}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.location}</span>
          </div>
        )}
        {event.description && <div style={{ marginTop: 6 }}><EventDescription text={event.description} /></div>}
      </div>
      <AddToCalendar title={event.title} startDate={event.startDate} endDate={event.endDate}
        description={event.description} location={event.location} url={event.url} />
    </div>
  )
}

/* ---------------------------------------------------------- EventDetail --- */
export function EventDetail({ event }) {
  const app = useApp206()
  if (!event) return null
  const channel = app.channelByIcsUrl.get(event.icsUrl)
  const row = rowFromIndexEvent(event)
  const parsed = parseIndexDate(event.date)
  const color = channel ? channel.color : 'var(--blue)'
  const more = app.upcomingEvents.filter((e) => e.icsUrl === event.icsUrl && e !== event).slice(0, 3)

  return (
    <div style={{ padding: '2px var(--pad) 24px', maxWidth: 680, margin: '0 auto' }}>
      <button className="a-iconbtn" onClick={app.back} style={{ marginTop: 8, marginBottom: 14 }}>{Ico.back}</button>

      <div className="a-hero" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, #000))` }}>
        <div className="a-hero-kick">{row.day} · {row.dateNum}{row.time ? ` · ${row.time}` : ''}</div>
        <div className="a-hero-title">{event.summary}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 13, fontSize: 13.5, fontWeight: 600, opacity: 0.96, flexWrap: 'wrap' }}>
          {row.time && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 15 }}>{Ico.clock}</span>{row.time}</span>}
          {(event.location || channel?.hood) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 15 }}>{Ico.pin}</span>{event.location || channel.hood}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <AddToCalendar title={event.summary} startDate={parsed?.date} endDate={parseIndexDate(event.endDate)?.date}
            description={event.description} location={event.location} url={event.url} />
        </div>
        {channel && (
          <button className="btn btn-ghost" style={{ flex: '0 0 auto', width: 52, padding: 0 }}
            title={app.favoritesSet.has(event.icsUrl) ? 'Following calendar' : 'Follow calendar'}
            onClick={() => app.toggleFollow(event.icsUrl)}>{app.favoritesSet.has(event.icsUrl) ? <span style={{ width: 18, height: 18 }}>{Ico.check}</span> : '♥'}</button>
        )}
      </div>

      {event.description && (
        <div style={{ marginBottom: 22, fontSize: 15.5, lineHeight: 1.6 }}><EventDescription text={event.description} /></div>
      )}

      <div className="a-facts">
        {event.location && (
          <div className="a-fact">
            <span style={{ width: 18, height: 18, color: 'var(--ink-3)', flex: '0 0 auto' }}>{Ico.pin}</span>
            <div><div style={{ fontWeight: 600, fontSize: 14 }}>{event.location}</div>
              {channel?.hood && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>{channel.hood}</div>}</div>
          </div>
        )}
        {channel && (
          <button onClick={() => app.openChannel(event.icsUrl)} className="a-fact" style={{ textAlign: 'left', alignItems: 'center', width: '100%' }}>
            <span style={{ width: 18, height: 18, flex: '0 0 auto' }}><CatDot tag={channel.primaryCategory} color={channel.color} size={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{channel.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>{channel.distributed ? 'Citywide' : (channel.hood || 'Seattle')}</div></div>
            <span style={{ width: 15, height: 15, color: 'var(--blue)', flex: '0 0 auto' }}>{Ico.arrow}</span>
          </button>
        )}
      </div>

      {more.length > 0 && channel && (
        <>
          <div className="a-rowhdr"><span className="a-eyebrow">MORE FROM {channel.name.toUpperCase()}</span><span className="ln" /></div>
          {more.map((e, i) => {
            const r = rowFromIndexEvent(e)
            return (
              <div className="ev" key={i} onClick={() => app.openEvent(e)}>
                <div className="ev-body">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                    <span className="ev-time">{r.day} {r.dateNum.split(' ')[1]}</span>
                    <span className="ev-title" style={{ flex: 1 }}>{e.summary}</span>
                  </div>
                  {r.time && <div className="ev-meta"><span>{r.time}</span></div>}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- SearchView --- */
export function SearchView() {
  const app = useApp206()
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current && inputRef.current.focus() }, [])
  const q = app.query.trim()
  const results = useMemo(() => (q ? groupIndexEventsByDay(app.matchEvents(q, app.upcomingEvents)) : []), [q, app.upcomingEvents])
  const total = results.reduce((n, g) => n + g.events.length, 0)
  const suggestions = ['jazz', 'outdoor', 'comedy', 'market', 'art', 'capitol hill']
  const alreadySaved = app.searchFilters.some((f) => f.toLowerCase() === q.toLowerCase())

  return (
    <div style={{ padding: '2px var(--pad) 24px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0 16px' }}>
        <div className="a-search" style={{ flex: 1 }}>
          <span style={{ width: 19, height: 19, flex: '0 0 auto' }}>{Ico.search}</span>
          <input ref={inputRef} value={app.query} onChange={(e) => app.setQuery(e.target.value)} placeholder="Search events, venues, neighborhoods…"
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 15, color: 'var(--ink)', outline: 'none' }} />
          {app.query && <button onClick={() => app.setQuery('')} style={{ width: 22, height: 22, color: 'var(--ink-3)', flex: '0 0 auto' }}>{Ico.close}</button>}
        </div>
        <button className="btn btn-ghost" style={{ height: 42, flex: '0 0 auto' }} onClick={app.back}>Cancel</button>
      </div>

      {!q ? (
        <div>
          <div className="a-eyebrow" style={{ marginBottom: 11 }}>TRY</div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {suggestions.map((s) => <button key={s} className="mk-pill mk-pill--ghost" onClick={() => app.setQuery(s)}>{s}</button>)}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            <div className="a-eyebrow">{total} {total === 1 ? 'RESULT' : 'RESULTS'} FOR “{q}”</div>
            <button className={`btn ${alreadySaved ? 'btn-ghost' : 'btn-blue'}`} style={{ height: 38, fontSize: 13 }}
              disabled={alreadySaved} onClick={() => app.addSearchFilter(q)}>
              {alreadySaved ? <><span style={{ width: 15, height: 15 }}>{Ico.check}</span>Saved to feed</> : <>{Ico.plus}Save this search</>}
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 8 }}>Saving adds matching events to your feed automatically — including future ones.</p>
          {total ? <DayList groups={results} /> : <div className="a-empty">No events match “{q}”.</div>}
        </div>
      )}
    </div>
  )
}
