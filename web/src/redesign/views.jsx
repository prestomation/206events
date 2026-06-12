// Composite views for the redesigned UI: Discover, Following, You (config),
// ChannelDetail, EventDetail, SearchView.

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { ChannelAvatar, CatDot, DayList, ActiveFilters, LocationMapLink, BannerImage, EventThumb } from './atoms.jsx'
import { ChannelCard } from './ChannelCard.jsx'
import { FilterDropdown } from './shell.jsx'
import { groupIndexEventsByDay, parseIndexDate, rowFromIndexEvent, formatTimeRange, filterDiscoverChannels, filterDiscoverEvents, eventMatchesCost, costLabel, COST_FILTER_OPTIONS } from './viewModels.js'
import { GeoFiltersSection } from '../components/GeoFiltersSection.jsx'
import { AddToCalendar } from '../components/AddToCalendar.jsx'
import cityConfig from '../../../city.config.ts'
import { CALENDAR_MODE_OPTIONS } from '../utils/calendarTargets.js'
import { EventDescription } from '../components/EventDescription.jsx'
import { bestMapHref } from '../lib/maplink.js'
import { formatTagLabel } from '../utils/format.js'
import { tagGroup, CATEGORY_GROUP_ORDER, isNeighborhoodTag } from './categories.js'

// Cap for the Discover "Events" list — the full upcoming window is thousands
// of events; render the soonest slice to keep the DOM light.
const EVENTS_MODE_CAP = 200

// Build grouped dropdown options for the Category filter (taxonomy groups), and
// a flat option list for Neighborhood — each with a live calendar count.
function useCategoryGroups(app) {
  return useMemo(() => {
    const byGroup = new Map()
    for (const tag of app.categoryTags) {
      const g = tagGroup(tag)
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g).push({ value: tag, label: formatTagLabel(tag), count: app.calendarsPerTag.get(tag) || 0 })
    }
    return CATEGORY_GROUP_ORDER
      .filter((g) => byGroup.has(g))
      .map((g) => ({ label: g, options: byGroup.get(g).sort((a, b) => a.label.localeCompare(b.label)) }))
  }, [app.categoryTags, app.calendarsPerTag])
}
function useNeighborhoodOptions(app) {
  return useMemo(() => app.neighborhoodTags.map((tag) => ({
    value: tag, label: formatTagLabel(tag), count: app.calendarsPerTag.get(tag) || 0,
  })), [app.neighborhoodTags, app.calendarsPerTag])
}

/* ------------------------------------------------------------- Discover --- */
export function DiscoverView() {
  const app = useApp206()
  const categoryGroups = useCategoryGroups(app)
  const neighborhoodOptions = useNeighborhoodOptions(app)
  const flatCategoryOptions = useMemo(() => categoryGroups.flatMap((g) => g.options), [categoryGroups])

  // When a search is active, show how many of each type match on the seg tabs so
  // the user knows whether the Events tab has results they're not seeing. Counts
  // reuse the exact filters each mode renders (see filterDiscover* helpers), so
  // badge == list. null when no search → no badge.
  const hasQuery = !!app.query.trim()
  const calMatchCount = useMemo(() => hasQuery
    ? filterDiscoverChannels(app.channels, { category: app.category, neighborhood: app.neighborhood, query: app.query }).length
    : null, [hasQuery, app.channels, app.category, app.neighborhood, app.query])
  const evMatchCount = useMemo(() => hasQuery
    ? filterDiscoverEvents(app.upcomingEvents, {
      category: app.category, neighborhood: app.neighborhood, cost: app.costFilter, query: app.query,
      channelByIcsUrl: app.channelByIcsUrl, queryKeySet: app.queryKeySet,
    }).length
    : null, [hasQuery, app.upcomingEvents, app.category, app.neighborhood, app.costFilter, app.query, app.channelByIcsUrl, app.queryKeySet])

  // How many events pass every filter except the price bucket — i.e. hidden
  // solely for lack of a confirmed price. Feeds the ActiveFilters caption.
  const costHiddenCount = useMemo(() => {
    if (!app.costFilter) return null
    const base = {
      category: app.category, neighborhood: app.neighborhood, query: app.query,
      channelByIcsUrl: app.channelByIcsUrl, queryKeySet: app.queryKeySet,
    }
    return filterDiscoverEvents(app.upcomingEvents, base).length -
      filterDiscoverEvents(app.upcomingEvents, { ...base, cost: app.costFilter }).length
  }, [app.upcomingEvents, app.category, app.neighborhood, app.costFilter, app.query, app.channelByIcsUrl, app.queryKeySet])

  return (
    <div style={{ padding: '2px var(--pad) 20px' }}>
      <div className="a-discover-head">
        <div>
          <div className="a-eyebrow" style={{ marginBottom: 5 }}>{app.todayLabel}</div>
          <div className="a-h1">Discover</div>
        </div>
        <div className="a-seg">
          <button className={app.emphasis === 'calendars' ? 'on' : ''} onClick={() => app.setEmphasis('calendars')}>
            {Ico.grid}Calendars
            {calMatchCount != null && <span className="a-seg-count" aria-label={`${calMatchCount} matching calendars`}>{calMatchCount}</span>}
          </button>
          <button className={app.emphasis === 'events' ? 'on' : ''} onClick={() => app.setEmphasis('events')}>
            {Ico.spark}Events
            {evMatchCount != null && <span className="a-seg-count" aria-label={`${evMatchCount} matching events`}>{evMatchCount}</span>}
          </button>
        </div>
      </div>

      <CategoryChips options={flatCategoryOptions} value={app.category} onSelect={app.setCategory} />

      <div className="a-filterbar">
        {/* Category dropdown is the mobile-only control; on desktop the
            CategoryChips row above takes over (visibility is swapped in CSS). */}
        <div className="a-cat-dd">
          <FilterDropdown label="Category" icon={Ico.grid} value={app.category}
            options={flatCategoryOptions} groups={categoryGroups} onSelect={app.setCategory} />
        </div>
        <FilterDropdown label="Neighborhood" icon={Ico.pin} value={app.neighborhood}
          options={neighborhoodOptions} onSelect={app.setNeighborhood} />
        {/* Cost buckets filter only the Events list (calendars have no price);
            strict on confirmed pricing — see eventMatchesCost. */}
        <FilterDropdown label="Price" icon={Ico.spark} value={app.costFilter}
          options={COST_FILTER_OPTIONS} onSelect={app.setCostFilter} />
      </div>

      <ActiveFilters costHiddenCount={costHiddenCount} />

      {app.emphasis === 'calendars' ? <CalendarsMode /> : <div style={{ marginTop: 8 }}><EventsMode /></div>}
    </div>
  )
}

// Pointer-device-only horizontal category picker (see the .a-catchips media
// rule in index.css: shown only on hover+fine-pointer ≥1024px, i.e. a real
// desktop with a mouse). Touch devices — phones, tablets, and foldables like
// the Fold inner screen, regardless of how wide they report — keep the compact
// dropdown to save vertical space. Clicking the active chip again clears it.
//
// The row never wraps. It uses a Priority+ overflow pattern: as many chips as
// fit on one line are shown, and the remainder collapse into a "More ▾" popover.
// A hidden measurement row carries every chip at its natural width so a
// ResizeObserver can recompute how many fit when the column resizes. The active
// category is pinned first so it stays visible even when it would overflow.
function CategoryChips({ options, value, onSelect }) {
  const rootRef = useRef(null)
  const rowRef = useRef(null)
  const measureRef = useRef(null)
  const [visibleCount, setVisibleCount] = useState(options.length)
  const [moreOpen, setMoreOpen] = useState(false)

  const ordered = useMemo(() => {
    if (!value) return options
    const idx = options.findIndex((o) => o.value === value)
    if (idx <= 0) return options
    const copy = options.slice()
    const [sel] = copy.splice(idx, 1)
    copy.unshift(sel)
    return copy
  }, [options, value])

  // Recompute how many chips fit on one line, reserving room for the More chip
  // when there's overflow. Driven by a ResizeObserver on the visible row.
  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    const compute = () => {
      const kids = measure.children
      if (kids.length < 2) return
      const GAP = 8
      const total = row.clientWidth
      if (!total) return
      const allW = kids[0].offsetWidth
      const moreW = kids[kids.length - 1].offsetWidth
      const chipW = ordered.map((_, i) => kids[1 + i]?.offsetWidth || 0)

      // Does the whole set fit without a More chip?
      let sumAll = allW
      for (const w of chipW) sumAll += GAP + w
      if (sumAll <= total) { setVisibleCount(ordered.length); return }

      // Otherwise reserve space for the All chip + More chip and fill the rest.
      let used = allW + GAP + moreW
      let count = 0
      for (const w of chipW) {
        const next = used + w + GAP
        if (next > total) break
        used = next
        count++
      }
      setVisibleCount(count)
    }
    compute()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [ordered])

  // Close the More popover on outside click.
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setMoreOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreOpen])

  const pick = (v) => { onSelect(v === value ? null : v); setMoreOpen(false) }
  const visible = ordered.slice(0, visibleCount)
  const overflow = ordered.slice(visibleCount)

  const allChip = (
    <button className={`a-catchip ${!value ? 'on' : ''}`} onClick={() => pick(null)}>
      <span style={{ width: 14, height: 14, flex: '0 0 auto' }}>{Ico.grid}</span>
      <span className="a-catchip-label">All</span>
    </button>
  )
  const catChip = (o, prefix = '') => (
    <button key={prefix + o.value} className={`a-catchip ${o.value === value ? 'on' : ''}`} onClick={() => pick(o.value)}>
      <CatDot tag={o.value} size={8} />
      <span className="a-catchip-label">{o.label}</span>
      {o.count != null && <span className="a-catchip-count">{o.count}</span>}
    </button>
  )
  const moreChip = (n, onClick) => (
    <button className="a-catchip a-catchip-more" onClick={onClick} aria-expanded={moreOpen} aria-haspopup="menu">
      <span className="a-catchip-label">More</span>
      <span className="a-catchip-count">{n}</span>
      <span className="a-dd-caret" style={{ width: 14, height: 14 }}>{Ico.arrow}</span>
    </button>
  )

  return (
    <div className="a-catchips" role="group" aria-label="Filter by category" ref={rootRef}>
      {/* Hidden measurement row: every chip at its natural width. */}
      <div className="a-catchips-measure" ref={measureRef} aria-hidden="true">
        {allChip}
        {ordered.map((o) => catChip(o, 'm-'))}
        {moreChip(options.length)}
      </div>

      {/* Visible single-line row. */}
      <div className="a-catchips-row" ref={rowRef}>
        {allChip}
        {visible.map((o) => catChip(o))}
        {overflow.length > 0 && moreChip(overflow.length, () => setMoreOpen((v) => !v))}
      </div>

      {/* Overflow popover — rendered outside the clipped row so it isn't cut off. */}
      {moreOpen && overflow.length > 0 && (
        <div className="a-dd-menu a-catchips-menu" role="menu">
          {overflow.map((o) => (
            <button key={o.value} className={`a-dd-item ${o.value === value ? 'on' : ''}`} onClick={() => pick(o.value)}>
              <CatDot tag={o.value} size={8} />
              <span className="a-dd-item-label">{o.label}</span>
              {o.count != null && <span className="a-dd-item-count">{o.count}</span>}
              {o.value === value && <span className="a-dd-item-check" style={{ width: 14, height: 14 }}>{Ico.check}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Filter channels by the active category + neighborhood, then group by hood.
function CalendarsMode() {
  const app = useApp206()
  const groups = useMemo(() => {
    const channels = filterDiscoverChannels(app.channels, {
      category: app.category, neighborhood: app.neighborhood, query: app.query,
    })
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
  }, [app.channels, app.category, app.neighborhood, app.query])

  if (!groups.length) return <div className="a-empty">No calendars match these filters.</div>

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

function EventsMode() {
  const app = useApp206()
  const groups = useMemo(() => {
    const evs = filterDiscoverEvents(app.upcomingEvents, {
      category: app.category, neighborhood: app.neighborhood, cost: app.costFilter, query: app.query,
      channelByIcsUrl: app.channelByIcsUrl, queryKeySet: app.queryKeySet,
    })
    // Cap the rendered set: a 6-month all-events list is thousands of rows.
    // Events are already date-sorted, so this keeps the soonest.
    return groupIndexEventsByDay(evs.slice(0, EVENTS_MODE_CAP))
  }, [app.upcomingEvents, app.category, app.neighborhood, app.costFilter, app.query, app.channelByIcsUrl, app.queryKeySet])
  if (!groups.length) return <div className="a-empty">No events match.</div>
  return <DayList groups={groups} />
}

/* ------------------------------------------------------------ Following --- */
export function FollowingView() {
  const app = useApp206()
  // The feed is already date-scoped; additionally narrow by the active
  // category / neighborhood / search filters so they apply here too.
  const { groups, costHiddenCount } = useMemo(() => {
    let gs = app.feedGroups
    const passesTags = (e) => {
      if (app.category || app.neighborhood) {
        const ch = app.channelByIcsUrl.get(e.icsUrl)
        if (app.category && !(ch && ch.tags.includes(app.category))) return false
        if (app.neighborhood && !(ch && ch.tags.includes(app.neighborhood))) return false
      }
      return true
    }
    if (app.category || app.neighborhood) {
      gs = gs.map((g) => ({ ...g, events: g.events.filter(passesTags) })).filter((g) => g.events.length)
    }
    if (app.query.trim()) {
      gs = gs.map((g) => ({ ...g, events: app.matchEvents(app.query, g.events) })).filter((g) => g.events.length)
    }
    // Cost runs last so the difference is exactly "hidden solely for lack of
    // a confirmed price" — feeds the ActiveFilters caption.
    let costHiddenCount = null
    if (app.costFilter) {
      const before = gs.reduce((n, g) => n + g.events.length, 0)
      gs = gs.map((g) => ({ ...g, events: g.events.filter((e) => eventMatchesCost(e, app.costFilter)) })).filter((g) => g.events.length)
      costHiddenCount = before - gs.reduce((n, g) => n + g.events.length, 0)
    }
    return { groups: gs, costHiddenCount }
  }, [app.feedGroups, app.category, app.neighborhood, app.costFilter, app.query, app.channelByIcsUrl])

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

      <ActiveFilters costHiddenCount={costHiddenCount} />

      <button className="a-feedlegend" onClick={() => app.go('you')} title="Manage what feeds this">
        <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>Feeding this:</span>
        <span className="prov-chip prov-cal"><span style={{ width: 12, height: 12 }}>{Ico.cal}</span>{counts.cal} calendars</span>
        <span className="prov-chip prov-place"><span style={{ width: 12, height: 12 }}>{Ico.pin}</span>{counts.place} places</span>
        <span className="prov-chip prov-search"><span style={{ width: 12, height: 12 }}>{Ico.search}</span>{counts.search} searches</span>
        <span style={{ marginLeft: 'auto', width: 16, height: 16, color: 'var(--ink-3)', flex: '0 0 auto' }}>{Ico.arrow}</span>
      </button>

      {total ? (
        <DayList groups={groups} withReason />
      ) : app.hasActiveFilters ? (
        <div className="a-empty" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>No feed events match these filters</div>
          <div style={{ fontSize: 13.5 }}>Clear a filter above to see more.</div>
        </div>
      ) : (
        <div className="a-getstarted">
          <div className="a-getstarted-h">Build your feed</div>
          <div className="a-getstarted-sub">
            Following collects everything you care about into one calendar you can subscribe to. Start with any of these:
          </div>
          <div className="a-getstarted-actions">
            <button className="a-getstarted-card" onClick={() => app.go('discover')}>
              <span className="a-onboard-ico">{Ico.grid}</span>
              <span className="a-getstarted-card-title">Browse calendars</span>
              <span className="a-getstarted-card-body">Follow venues and topics in Discover.</span>
            </button>
            <button className="a-getstarted-card" onClick={() => app.go('you')}>
              <span className="a-onboard-ico">{Ico.pin}</span>
              <span className="a-getstarted-card-title">Save a place</span>
              <span className="a-getstarted-card-body">Pull in everything near an address.</span>
            </button>
            <button className="a-getstarted-card" onClick={() => app.go('you')}>
              <span className="a-onboard-ico">{Ico.search}</span>
              <span className="a-getstarted-card-title">Add a search</span>
              <span className="a-getstarted-card-body">Keep matching new events automatically.</span>
            </button>
          </div>
          <button className="a-getstarted-help" onClick={app.openHelp}>
            <span style={{ width: 15, height: 15 }}>{Ico.help}</span>How it works
          </button>
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
  // Per-list feed URL (each list has its own ICS subscription). For anonymous
  // users activeList.feedUrl is null, so the card prompts sign-in.
  const feedUrl = app.activeList?.feedUrl || null
  const multiList = (app.lists?.length || 0) > 1

  return (
    <div style={{ padding: '2px var(--pad) 24px', maxWidth: 1000, margin: '0 auto' }}>
      <div className="a-eyebrow" style={{ marginBottom: 5 }}>ACCOUNT &amp; SOURCES</div>
      <div className="a-h1" style={{ marginBottom: 16 }}>You</div>

      {app.uatMode && (
        <div role="note" style={{
          margin: '0 0 16px', padding: '10px 13px', borderRadius: 10,
          background: 'var(--amber-bg)', border: '1px solid var(--amber)',
          fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45,
        }}>
          🧪 <strong>Local UAT mode.</strong> You’re not really signed in — lists and feed URLs
          are stored in your browser only (no account, no real subscriptions). Remove
          <code style={{ margin: '0 3px' }}>?uat=1</code> from the URL to exit.
        </div>
      )}

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

      {/* Lists manager (signed-in): switch between lists, create / rename / delete. */}
      <ListsManager />

      {/* ICS link — per active list */}
      <div className="a-icscard">
        <span style={{ width: 24, height: 24, color: 'var(--blue)', flex: '0 0 auto' }}>{Ico.cal}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: 'var(--blue-ink)', fontSize: 14.5 }}>
            {multiList ? `Feed for “${app.activeList.name}”` : 'One feed, one link'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--blue-ink)', opacity: 0.85, marginTop: 2 }}>
            {app.uatMode
              ? 'Demo mode — this is a placeholder link and is not a working subscription.'
              : feedUrl
                ? `All ${sourceCount} sources below flow into a single subscription that stays updated.`
                : 'Sign in to get a single subscription link for everything below.'}
          </div>
          {feedUrl && (
            <div style={{ display: 'flex', gap: 7, marginTop: 9, alignItems: 'center' }}>
              {app.uatMode && (
                <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 700, color: 'var(--amber)',
                  border: '1px solid var(--amber)', borderRadius: 6, padding: '2px 6px' }}>DEMO · non-functional</span>
              )}
              <code className="a-icscode">{feedUrl}</code>
              {!app.uatMode && (
                <button className="btn btn-blue" style={{ height: 38, fontSize: 13, flex: '0 0 auto', padding: '0 13px' }}
                  onClick={() => { navigator.clipboard?.writeText(feedUrl); app.flash('Link copied ✓') }}>Copy</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ADD-TO-CALENDAR BUTTON PREFERENCE */}
      <SectionTitle kicker={Ico.cal} title="Add-to-calendar button" />
      <p className="a-sectionhint">Choose what the 📅 button next to each event does. “Automatic” picks Google Calendar on phones and a downloaded .ics file on desktop.</p>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        {CALENDAR_MODE_OPTIONS.map((opt) => {
          const active = app.calendarAddMode === opt.id
          return (
            <button key={opt.id}
              className={`btn ${active ? 'btn-blue' : 'btn-ghost'}`}
              style={{ height: 38, fontSize: 13.5 }}
              aria-pressed={active}
              title={opt.hint || opt.label}
              onClick={() => app.setCalendarAddMode(opt.id)}>
              {opt.label}
            </button>
          )
        })}
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

      {/* feedback + site health */}
      <div style={{ marginTop: 28, display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" style={{ height: 40, fontSize: 13.5 }} onClick={() => app.openFeedback({ type: 'general' })}>
          <span style={{ width: 16, height: 16 }}>{Ico.heart}</span>Send feedback
        </button>
        <button className="btn btn-ghost" style={{ height: 40, fontSize: 13.5 }} onClick={() => app.openFeedback({ type: 'source' })}>
          <span style={{ width: 16, height: 16 }}>{Ico.plus}</span>Suggest a source
        </button>
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

// Lists manager — signed-in only. Shows a list switcher when the user has more
// than one list, plus create / rename / delete controls. Follow/add actions
// throughout the app target whichever list is active here.
function ListsManager() {
  const app = useApp206()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Anonymous users keep a single local list — no management UI.
  if (!app.authUser || !app.lists) return null

  const multi = app.lists.length > 1

  return (
    <div className="a-listsmanager" style={{ margin: '14px 0' }}>
      {multi && (
        <div className="a-listswitch" role="tablist" aria-label="Your lists"
          style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
          {app.lists.map((l) => (
            <button key={l.id} role="tab" aria-selected={l.id === app.activeListId}
              className={`a-listtab ${l.id === app.activeListId ? 'on' : ''}`}
              onClick={() => app.setActiveList(l.id)}
              style={{
                height: 34, padding: '0 13px', borderRadius: 999, fontSize: 13.5, cursor: 'pointer',
                border: '1px solid var(--line)',
                background: l.id === app.activeListId ? 'var(--blue)' : 'transparent',
                color: l.id === app.activeListId ? '#fff' : 'var(--ink-2)',
                fontWeight: l.id === app.activeListId ? 700 : 500,
              }}>
              {l.name}
            </button>
          ))}
        </div>
      )}

      {!creating && !renaming && (
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost" style={{ height: 36, fontSize: 13 }} onClick={() => setRenaming(true)}>
            {Ico.edit || null}Rename
          </button>
          {multi && (confirmDelete ? (
            <>
              <button className="btn btn-ghost" style={{ height: 36, fontSize: 13, color: 'var(--danger)' }}
                onClick={() => { app.deleteList(app.activeListId); setConfirmDelete(false) }}>Confirm delete</button>
              <button className="btn btn-ghost" style={{ height: 36, fontSize: 13 }}
                onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-ghost" style={{ height: 36, fontSize: 13 }}
              onClick={() => setConfirmDelete(true)}>Delete list</button>
          ))}
          <button className="btn btn-ghost" style={{ height: 36, fontSize: 13 }}
            disabled={!app.canCreateList}
            title={app.canCreateList ? 'Create a new list' : 'Maximum number of lists reached'}
            onClick={() => setCreating(true)}>{Ico.plus}New list</button>
        </div>
      )}

      {creating && (
        <ListNameForm placeholder="List name (e.g. Date Night)…"
          onSave={(name) => { app.createList(name); setCreating(false) }}
          onCancel={() => setCreating(false)} />
      )}
      {renaming && (
        <ListNameForm initial={app.activeList?.name || ''} placeholder="Rename list…"
          onSave={(name) => { app.renameList(app.activeListId, name); setRenaming(false) }}
          onCancel={() => setRenaming(false)} />
      )}
    </div>
  )
}

function ListNameForm({ initial = '', placeholder, onSave, onCancel }) {
  const [name, setName] = useState(initial)
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, maxWidth: 440 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()) }}
        className="a-input" style={{ flex: 1, minWidth: 0 }} />
      <button className="btn btn-blue" style={{ height: 42, flex: '0 0 auto' }}
        onClick={() => name.trim() && onSave(name.trim())}>Save</button>
      <button className="btn btn-ghost" style={{ height: 42, width: 42, padding: 0, flex: '0 0 auto' }}
        onClick={onCancel}>{Ico.close}</button>
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
  const indexByKey = useChannelIndexByKey(icsUrl)
  const channel = app.channelByIcsUrl.get(icsUrl)
  if (!channel) return null
  const following = app.favoritesSet.has(icsUrl)
  const evs = app.channelEvents

  return (
    <div style={{ padding: '2px var(--pad) 24px', maxWidth: 760, margin: '0 auto' }}>
      <button className="a-iconbtn" onClick={app.back} style={{ marginTop: 8, marginBottom: 14 }}>{Ico.back}</button>
      <BannerImage src={channel.imageUrl} alt={`Photo of ${channel.name}`} height={160} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <ChannelAvatar color={channel.color} size={56} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <div className="a-h1" style={{ fontSize: 24, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{channel.name}</div>
            {channel.geo && (() => {
              const href = bestMapHref({ lat: channel.geo.lat, lng: channel.geo.lng, label: channel.geo.label, osmType: channel.geo.osmType, osmId: channel.geo.osmId })
              return href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" title="Open venue in maps" aria-label="Open venue in maps"
                  style={{ flex: '0 0 auto', width: 20, height: 20, color: 'var(--pin)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {Ico.pin}
                </a>
              ) : null
            })()}
          </div>
          <div className="mk-tag" style={{ marginTop: 5 }}>
            <CatDot tag={channel.primaryCategory} color={channel.color} size={7} />
            {channel.distributed ? 'Multiple venues · Citywide' : (channel.hood || cityConfig.city.name)}
          </div>
        </div>
      </div>

      {/* Source description. Suppressed for rippers where it only repeats the
          channel name (per AGENTS.md the ripper `description` is the venue
          name); shown for external feeds whose description is a real sentence. */}
      {channel.description && channel.description.trim().toLowerCase() !== channel.name.trim().toLowerCase() && (
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 14px' }}>
          {channel.description}
        </p>
      )}

      {/* Full tag list — neighborhood + activity chips. Each routes to Discover
          with the matching filter applied. */}
      {channel.tags && channel.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
          {channel.tags.map((t) => (
            <button
              key={t}
              className="mk-tag"
              onClick={() => {
                if (isNeighborhoodTag(t)) app.setNeighborhood(t)
                else app.setCategory(t)
                app.go('discover')
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid var(--line)', borderRadius: 999, background: 'transparent', cursor: 'pointer', fontSize: 12.5 }}
              title={`Browse ${formatTagLabel(t)}`}
            >
              <CatDot tag={t} size={6} />
              {formatTagLabel(t)}
            </button>
          ))}
        </div>
      )}

      {channel.website && (
        <a className="btn btn-ghost" style={{ width: '100%', marginBottom: 10 }}
          href={channel.website} target="_blank" rel="noopener noreferrer">
          {Ico.globe}Visit website
        </a>
      )}

      <a className="btn btn-blue" style={{ width: '100%', marginBottom: 10 }}
        href={app.createWebcalUrl(channel.cal.icsUrl, channel.cal.originalIcsUrl)}>
        {Ico.cal}Add to my calendar app
      </a>
      <div style={{ display: 'flex', gap: 9, marginBottom: 10 }}>
        <button className={`btn ${following ? 'btn-follow' : 'btn-ghost'}`} style={{ flex: 1, minWidth: 0, height: 44, fontSize: 13.5 }}
          onClick={() => app.toggleFollow(icsUrl)}>
          {following ? <><span style={{ width: 16, height: 16 }}>{Ico.check}</span>Following</> : <>♥ Follow</>}
        </button>
        <a className="btn btn-ghost" style={{ flex: 1, minWidth: 0, height: 44, fontSize: 13.5 }}
          href={app.createGoogleCalendarUrl(channel.cal.icsUrl, channel.cal.originalIcsUrl)}
          target="_blank" rel="noopener noreferrer">{Ico.google}Google</a>
        {channel.cal.rssUrl && (
          <a className="btn btn-ghost" style={{ flex: 1, minWidth: 0, height: 44, fontSize: 13.5, color: 'var(--amber)' }}
            href={channel.cal.rssUrl} target="_blank" rel="noopener noreferrer">{Ico.rss}RSS</a>
        )}
      </div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 22 }}>
        <button className="btn btn-ghost" style={{ flex: 1, minWidth: 0, height: 40, fontSize: 13.5 }}
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href)
            app.flash('Link copied ✓')
          }}>{Ico.link}Copy link</button>
        <button className="btn btn-ghost" style={{ flex: 1, minWidth: 0, height: 40, fontSize: 13.5 }}
          onClick={() => {
            const link = app.createHttpsUrl(channel.cal.icsUrl, channel.cal.originalIcsUrl)
            navigator.clipboard?.writeText(link)
            app.flash('Subscription link copied ✓')
          }}>{Ico.cal}Subscription link</button>
      </div>
      <div style={{ display: 'flex', marginBottom: 22 }}>
        <button className="btn btn-ghost" style={{ flex: 1, minWidth: 0, height: 40, fontSize: 13.5 }}
          onClick={() => app.openFeedback({
            type: 'bug',
            context: { sourceName: channel.name, icsUrl: channel.cal.icsUrl, pageUrl: window.location.href },
          })}>{Ico.spark}Report a problem with this source</button>
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
          ? evs.map((e) => <ParsedEventRow key={e.id} event={e} distributed={channel.distributed} indexEvent={indexByKey.get(parsedEventCostKey(e))} />)
          : !app.channelEventsLoading && <div className="a-empty">Schedule updates daily.</div>}
    </div>
  )
}

// Cost lives on events-index entries, but the channel page renders events
// parsed live from the ICS file, which carries no price (no ICS price
// property in v1). Join the two by summary + start instant so venue-page
// rows show the same cost labels as the Discover list.
function parsedEventCostKey(parsedEvent) {
  return `${parsedEvent.title}|${parsedEvent.startDate?.getTime?.() ?? ''}`
}
// Join the channel's ICS-parsed events back to their events-index entries by
// summary + start instant. The index entry carries the cost label *and* is the
// shape `EventDetail` / deep-linking require, so a row can navigate to the event
// detail page by opening the matched entry (see ParsedEventRow). Unlike the row
// labels, every entry is included (no cost filter) so any event is clickable.
//
// Join-key limitations (acceptable because the map is scoped to a single
// `icsUrl` — one channel's events):
//   - Two events in the same channel with an identical summary *and* identical
//     start instant collide; last-write-wins, same as the prior cost map. Both
//     resolve to the same detail page anyway, so the practical impact is nil.
//   - A title that differs between the ICS and the index (e.g. trailing
//     whitespace, "Live Jazz Night" vs "Jazz Night") won't match — the row
//     falls back to inert rather than opening the wrong event.
// Do not reuse this key across sources (where same-named events at the same
// time genuinely differ) without adding the icsUrl to the key.
function useChannelIndexByKey(icsUrl) {
  const app = useApp206()
  return useMemo(() => {
    const map = new Map()
    for (const e of app.eventsByIcsUrl.get(icsUrl) || []) {
      const parsed = parseIndexDate(e.date)
      if (!parsed) continue
      map.set(`${e.summary}|${parsed.date.getTime()}`, e)
    }
    return map
  }, [app.eventsByIcsUrl, icsUrl])
}

// Row for an ICS-parsed event (channel detail). Shape: { title, startDate, endDate, location, description, url }
// `indexEvent` is the matching events-index entry joined by the caller (the ICS
// has no price). When present it supplies the cost label *and* makes the row
// navigate to the event detail page; when absent (an ICS event not in the index)
// the row stays inert. AddToCalendar and the LocationMapLink pin already
// stopPropagation on their own clicks; the description is wrapped to stop a click
// on a link inside it from also triggering the row's open-event nav.
function ParsedEventRow({ event, distributed, indexEvent }) {
  const app = useApp206()
  const cost = indexEvent?.cost
  const eventYear = event.startDate.getFullYear()
  const datePart = event.startDate.toLocaleDateString('en-US', eventYear !== new Date().getFullYear()
    ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric' })
  const time = `${datePart}, ${formatTimeRange(event.startDate, event.endDate)}`
  const open = indexEvent ? () => app.openEvent(indexEvent) : undefined
  return (
    <div className="ev" onClick={open} style={{ cursor: open ? 'pointer' : 'default' }}>
      <EventThumb src={event.imageUrl} alt={event.title ? `Photo for ${event.title}` : ''} size={56} />
      <div className="ev-body">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <div className="ev-title" style={{ flex: 1, minWidth: 0 }}>{event.title}</div>
          {costLabel(cost) && (
            <span className={`ev-cost${cost && !cost.paid && cost.min === 0 ? ' ev-cost--free' : ''}`}>{costLabel(cost)}</span>
          )}
        </div>
        <div className="ev-meta"><span>{time}</span></div>
        {/* Distributed calendars set a per-event location ("its own geo"); link
            it via the shared pin-only LocationMapLink. */}
        {distributed && <LocationMapLink location={event.location} lat={event.lat} lng={event.lng} />}
        {event.description && <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}><EventDescription text={event.description} /></div>}
      </div>
      <AddToCalendar title={event.title} startDate={event.startDate} endDate={event.endDate}
        description={event.description} location={event.location} url={event.url} mode={app.calendarAddMode} />
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

      <BannerImage src={event.imageUrl} alt={`Photo for ${event.summary}`} height={200} />

      <div className="a-hero" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, #000))` }}>
        <div className="a-hero-kick">{row.day} · {row.dateNum}{row.time ? ` · ${row.time}` : ''}</div>
        <div className="a-hero-title">{event.summary}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 13, fontSize: 13.5, fontWeight: 600, opacity: 0.96, flexWrap: 'wrap' }}>
          {row.time && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 15 }}>{Ico.clock}</span>{row.timeRange}</span>}
          {(event.location || channel?.hood) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 15 }}>{Ico.pin}</span>{event.location || channel.hood}</span>}
          {costLabel(event.cost) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 15 }}>{Ico.spark}</span>{costLabel(event.cost)}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <AddToCalendar title={event.summary} startDate={parsed?.date} endDate={parseIndexDate(event.endDate)?.date}
            description={event.description} location={event.location} url={event.url} mode={app.calendarAddMode} showLabel />
        </div>
        {channel && (
          <button className="btn btn-ghost" style={{ flex: '0 0 auto', width: 52, padding: 0 }}
            title={app.favoritesSet.has(event.icsUrl) ? 'Following calendar' : 'Follow calendar'}
            onClick={() => app.toggleFollow(event.icsUrl)}>{app.favoritesSet.has(event.icsUrl) ? <span style={{ width: 18, height: 18 }}>{Ico.check}</span> : '♥'}</button>
        )}
        <button className="btn btn-ghost" style={{ flex: '0 0 auto', width: 52, padding: 0 }}
          title="Copy link to this event"
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href)
            app.flash('Link copied ✓')
          }}><span style={{ width: 18, height: 18 }}>{Ico.link}</span></button>
      </div>

      {event.description && (
        <div style={{ marginBottom: 22, fontSize: 15.5, lineHeight: 1.6 }}><EventDescription text={event.description} /></div>
      )}

      <div className="a-facts">
        {event.location && (() => {
          const mapHref = bestMapHref({ location: event.location, lat: event.lat, lng: event.lng })
          const inner = (
            <>
              <span style={{ width: 18, height: 18, color: 'var(--ink-3)', flex: '0 0 auto' }}>{Ico.pin}</span>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>{event.location}</div>
                {channel?.hood && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>{channel.hood}</div>}</div>
            </>
          )
          return mapHref
            ? <a className="a-fact" href={mapHref} target="_blank" rel="noopener noreferrer" title="Open in maps" style={{ alignItems: 'center', width: '100%', color: 'inherit', textDecoration: 'none' }}>{inner}</a>
            : <div className="a-fact">{inner}</div>
        })()}
        {/* Price fact. Unlike the row labels (silent when unknown), the detail
            page states unknown pricing explicitly — this is where someone
            decides whether to go, so honesty beats tidiness here. */}
        {(() => {
          const label = costLabel(event.cost)
          const sub = label === 'Ticketed'
            ? 'Amount not posted — see the event site'
            : !label && event.url ? 'Check the event site' : null
          const inner = (
            <>
              <span style={{ width: 18, height: 18, color: 'var(--ink-3)', flex: '0 0 auto' }}>{Ico.spark}</span>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>{label || 'Price not listed'}</div>
                {sub && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>{sub}</div>}</div>
            </>
          )
          return !label && event.url
            ? <a className="a-fact" href={event.url} target="_blank" rel="noopener noreferrer" title="Check the event site for pricing" style={{ alignItems: 'center', width: '100%', color: 'inherit', textDecoration: 'none' }}>{inner}</a>
            : <div className="a-fact">{inner}</div>
        })()}
        {channel && (
          <button onClick={() => app.openChannel(event.icsUrl)} className="a-fact" style={{ textAlign: 'left', alignItems: 'center', width: '100%' }}>
            <span style={{ width: 18, height: 18, flex: '0 0 auto' }}><CatDot tag={channel.primaryCategory} color={channel.color} size={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{channel.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>{channel.distributed ? 'Citywide' : (channel.hood || cityConfig.city.name)}</div></div>
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
