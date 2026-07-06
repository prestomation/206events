// Composite views for the redesigned UI: Discover, Following, You (config),
// ChannelDetail, EventDetail, SearchView.

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { ChannelAvatar, CatDot, DayList, ActiveFilters, LocationMapLink, BannerImage, EventThumb, UncertaintyBadge, uncertainFieldsFor, EventLinkIcon } from './atoms.jsx'
import { ChannelCard } from './ChannelCard.jsx'
import { FilterDropdown } from './shell.jsx'
import { groupIndexEventsByDay, dayIndexForScrubber, parseIndexDate, rowFromIndexEvent, formatTimeRange, filterDiscoverChannels, filterDiscoverEvents, eventMatchesCost, costLabel, costClass, COST_FILTER_OPTIONS } from './viewModels.js'
import { DayScrubber } from './DayScrubber.jsx'
import { useDayScrubberSeek } from './useDayScrubber.js'
import { GeoFiltersSection } from '../components/GeoFiltersSection.jsx'
import { AddToCalendar } from '../components/AddToCalendar.jsx'
import cityConfig from '../../../city.config.ts'
import { CALENDAR_MODE_OPTIONS } from '../utils/calendarTargets.js'
import { EventDescription } from '../components/EventDescription.jsx'
import { stripUncertaintyNote } from '../utils/uncertaintyNote.js'
import { bestMapHref } from '../lib/maplink.js'
import { groupKey, compareByDate } from '../lib/event-grouping.js'
import { eventKey } from '../lib/eventKey.js'
import { formatTagLabel } from '../utils/format.js'
import { tagGroup, CATEGORY_GROUP_ORDER, isNeighborhoodTag } from './categories.js'
import { useBuildErrors } from './useBuildErrors.js'
import { indexBuildErrors, sourceDebug, eventDebug } from './debugData.js'

// Page size for the Discover "Events" list — the full upcoming window is
// thousands of events, so it's rendered a page at a time via infinite scroll
// (see EventsMode) to keep the DOM light while every event stays reachable.
const EVENTS_PAGE_SIZE = 60

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
  // the user knows whether the other tab has results they're not seeing. Counts
  // are computed once in the app model (single source of truth for the badges,
  // the empty-state CTA, and the cross-tab hint) and are null when there's no
  // query → no badge.
  const calMatchCount = app.calMatchCount
  const evMatchCount = app.evMatchCount

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
          <button className={app.emphasis === 'calendars' ? 'on' : ''} onClick={() => app.pickEmphasis('calendars')}>
            {Ico.grid}Calendars
            {calMatchCount != null && <span
              className={`a-seg-count${app.emphasis !== 'calendars' && calMatchCount > 0 ? ' a-seg-count--cross' : ''}`}
              aria-label={`${calMatchCount} matching calendars`}>{calMatchCount}</span>}
          </button>
          <button className={app.emphasis === 'events' ? 'on' : ''} onClick={() => app.pickEmphasis('events')}>
            {Ico.spark}Events
            {evMatchCount != null && <span
              className={`a-seg-count${app.emphasis !== 'events' && evMatchCount > 0 ? ' a-seg-count--cross' : ''}`}
              aria-label={`${evMatchCount} matching events`}>{evMatchCount}</span>}
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

      <CrossTabHint />

      {app.emphasis === 'calendars' ? <CalendarsMode /> : <div style={{ marginTop: 8 }}><EventsMode /></div>}
    </div>
  )
}

// Singular/plural noun for a tab's match count ("1 event" / "3 calendars").
function tabNoun(tab, count) {
  const singular = tab === 'events' ? 'event' : 'calendar'
  return count === 1 ? singular : `${singular}s`
}

// Cross-tab hint (shown above the active list when that list is NON-empty but
// the *other* tab also has matches the user can't see). The empty-tab case is
// handled richer by DiscoverEmpty below, so we suppress the hint there to avoid
// two competing prompts. Works in both directions — "N events also match" when
// browsing Calendars, "N calendars also match" when browsing Events.
function CrossTabHint() {
  const app = useApp206()
  const q = app.query.trim()
  if (!q) return null
  const onCalendars = app.emphasis === 'calendars'
  const activeCount = onCalendars ? app.calMatchCount : app.evMatchCount
  if (!activeCount) return null // empty active tab → DiscoverEmpty handles it
  const otherTab = onCalendars ? 'events' : 'calendars'
  const otherCount = onCalendars ? app.evMatchCount : app.calMatchCount
  if (!otherCount) return null
  return (
    <button className="a-crosshint" onClick={() => app.pickEmphasis(otherTab)}
      aria-label={`Switch to ${otherCount} matching ${tabNoun(otherTab, otherCount)}`}>
      <span className="a-crosshint-ico">{otherTab === 'events' ? Ico.spark : Ico.grid}</span>
      <span className="a-crosshint-txt"><strong>{otherCount} {tabNoun(otherTab, otherCount)}</strong> also {otherCount === 1 ? 'matches' : 'match'} “{q}”</span>
      <span className="a-crosshint-go">View{Ico.arrow}</span>
    </button>
  )
}

// Empty state for a Discover mode. When a search is active and the OTHER tab
// has matches, the "nothing here" message becomes a CTA that points at — and
// switches to — the tab that does have results. This is the core fix for
// "no venues match, so the user assumes the site has nothing" (and its mirror).
function DiscoverEmpty({ kind }) {
  const app = useApp206()
  const q = app.query.trim()
  const otherTab = kind === 'calendars' ? 'events' : 'calendars'
  const otherCount = kind === 'calendars' ? app.evMatchCount : app.calMatchCount
  if (q && otherCount > 0) {
    return (
      <div className="a-crossempty">
        <div className="a-crossempty-msg">
          No {kind === 'calendars' ? 'calendars' : 'events'} match “{q}” — but{' '}
          <strong>{otherCount} {tabNoun(otherTab, otherCount)}</strong> {otherCount === 1 ? 'does' : 'do'}.
        </div>
        <button className="btn btn-blue a-crossempty-cta" onClick={() => app.pickEmphasis(otherTab)}>
          See {otherCount} {tabNoun(otherTab, otherCount)}{Ico.arrow}
        </button>
      </div>
    )
  }
  return <div className="a-empty">{kind === 'calendars' ? 'No calendars match these filters.' : 'No events match.'}</div>
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

  if (!groups.length) return <DiscoverEmpty kind="calendars" />

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

// Infinite-scroll list of index events grouped by day, with a Google-Photos
// day scrubber down the right edge. Shared by the Discover events feed and the
// Following feed — both can be thousands of rows, so both page a screenful at a
// time and both need the identical scrubber seek behavior.
//
// `events` is the full (uncapped), date-sorted event array; the tick list spans
// all of it while only `visibleCount` rows render. `withReason` shows feed
// attribution chips (Following). `pendingMore` swaps the end-of-list caption for
// a "still loading" one while an upstream fetch is in flight (Discover's
// soon→full index swap). `emptyState` renders when there are no events.
function PagedDayList({ events, withReason = false, pendingMore = false, emptyState = null }) {
  // How many of `events` to render. Grows a page at a time as the sentinel
  // scrolls into view. Resets to one page whenever `events`'s identity changes
  // — a filter edit or the soon→full index swap — so the reader starts back near
  // the top of the new list rather than deep in a stale scroll position.
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE)

  const groups = useMemo(
    () => groupIndexEventsByDay(events.slice(0, visibleCount)),
    [events, visibleCount],
  )

  // Full-timeline day ticks for the scrubber (one per distinct day across the
  // whole set, not just the rendered page).
  const dayIndex = useMemo(() => dayIndexForScrubber(events), [events])

  // Day-scrubber seek: scroll to the day, growing the page far enough to include
  // it first when it isn't rendered yet. `groups` is the commit signal the
  // deferred scroll retries on.
  const { listRef, seekToDay, clearSeekTarget } = useDayScrubberSeek({
    grow: (day) => setVisibleCount((c) => Math.min(Math.max(c, day.firstIndex + EVENTS_PAGE_SIZE), events.length)),
    commitDep: groups,
  })
  useEffect(() => { setVisibleCount(EVENTS_PAGE_SIZE); clearSeekTarget() }, [events, clearSeekTarget])

  const hasMore = visibleCount < events.length
  const loadMore = () => setVisibleCount((c) => Math.min(c + EVENTS_PAGE_SIZE, events.length))
  const sentinelRef = useRef(null)
  useEffect(() => {
    if (!hasMore || typeof IntersectionObserver === 'undefined') return
    const el = sentinelRef.current
    if (!el) return
    // rootMargin preloads the next page ~a screen early so scrolling stays smooth
    // rather than pausing at the bottom while the next batch mounts. The observer
    // is deliberately NOT re-created per page (deps exclude visibleCount): each
    // +EVENTS_PAGE_SIZE rows pushes the sentinel back out of the rootMargin, so
    // it re-fires on the next scroll. This relies on a page being taller than
    // viewport + rootMargin (60 rows always are) — if the page size is ever cut
    // dramatically, add visibleCount to the deps so growth re-arms the observer.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore()
    }, { rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, events.length])

  if (!events.length) return emptyState
  return (
    <div ref={listRef}>
      <DayScrubber dayIndex={dayIndex} onSeek={seekToDay} />
      <DayList groups={groups} withReason={withReason} />
      {hasMore ? (
        // More rows already in memory. The IntersectionObserver auto-advances
        // this into view while scrolling; it's also a real button so keyboard/AT
        // users — and any browser without IntersectionObserver — can still page.
        <button ref={sentinelRef} type="button" className="a-listmore a-listmore--btn" onClick={loadMore}>
          Load more
        </button>
      ) : pendingMore ? (
        // Everything we have is rendered, but more is still on the way upstream.
        <div className="a-listmore" role="status">Loading more events…</div>
      ) : (
        // Genuine end of the list.
        <div className="a-listend">That’s all {events.length} event{events.length === 1 ? '' : 's'}.</div>
      )}
    </div>
  )
}

function EventsMode() {
  const app = useApp206()
  // Full (uncapped) filtered set, already date-sorted. A 6-month all-events list
  // is thousands of rows — PagedDayList renders it a page at a time.
  const filtered = useMemo(() => filterDiscoverEvents(app.upcomingEvents, {
    category: app.category, neighborhood: app.neighborhood, cost: app.costFilter, query: app.query,
    channelByIcsUrl: app.channelByIcsUrl, queryKeySet: app.queryKeySet,
  }), [app.upcomingEvents, app.category, app.neighborhood, app.costFilter, app.query, app.channelByIcsUrl, app.queryKeySet])

  return (
    <PagedDayList
      events={filtered}
      pendingMore={!app.fullEventsLoaded}
      emptyState={<DiscoverEmpty kind="events" />}
    />
  )
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
    // app.queryKeySet / app.matchEvents are required deps: queryKeySet is now
    // deferred (App206), so it settles in a render *after* app.query changes —
    // without it here, the feed would recompute with a stale/null match set and
    // never re-filter once the deferred search lands.
  }, [app.feedGroups, app.category, app.neighborhood, app.costFilter, app.query, app.queryKeySet, app.matchEvents, app.channelByIcsUrl])

  const counts = { cal: app.favoritesSet.size, place: app.geoFilters.length, search: app.searchFilters.length }
  // Flatten the day-grouped feed back to a single date-sorted event array for
  // PagedDayList (it re-groups the rendered page and derives the scrubber ticks
  // from the whole timeline). `groups` is already ascending, so a flatMap
  // preserves order.
  const flat = useMemo(() => groups.flatMap((g) => g.events), [groups])
  const total = flat.length

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
        <PagedDayList events={flat} withReason />
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
  // Sign-in / personal-feed UI only makes sense when a favorites backend is
  // wired up (VITE_FAVORITES_API_URL). Template copies without it run read-only
  // (favorites in localStorage), so the account + ICS-subscription cards — whose
  // only message would be a dead "Sign in…" prompt — are hidden entirely. The
  // UAT demo (?uat=1) keeps them so the placeholder experience still renders.
  const loginEnabled = !!app.API_URL || app.uatMode

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

      {/* account — only when a favorites backend / login is configured */}
      {loginEnabled && (
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
      )}

      {/* Lists manager (signed-in): switch between lists, create / rename / delete. */}
      <ListsManager />

      {/* ICS link — per active list. Hidden without a backend: there is no
          personal feed to subscribe to, so the card would only show a dead
          "Sign in…" prompt. */}
      {loginEnabled && (
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
      )}

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
            message: `Problem with ${channel.name}: `,
            context: { sourceName: channel.name, icsUrl: channel.cal.icsUrl, pageUrl: window.location.href },
          })}>{Ico.spark}Report a problem</button>
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

      <ChannelDebugPanel channel={channel} upcomingCount={evs.length} />
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
            <span className={`ev-cost${costClass(cost)}`}>{costLabel(cost)}</span>
          )}
        </div>
        <div className="ev-meta">
          <span>{time}</span>
          <UncertaintyBadge event={indexEvent} fields={uncertainFieldsFor(indexEvent, ['startTime', 'duration'])} compact />
        </div>
        {/* Distributed calendars set a per-event location ("its own geo"); link
            it via the shared pin-only LocationMapLink. */}
        {distributed && <LocationMapLink location={event.location} lat={event.lat} lng={event.lng} />}
        {event.description && (
          <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
            {/* This row renders the raw ICS description, which keeps the
                appended "⚠️ …" uncertainty note for calendar subscribers. Strip
                it for the web when the joined index event flags uncertainty
                (it's shown as the inline badge instead); leave note-less text
                untouched. */}
            <EventDescription text={indexEvent && indexEvent.uncertainty ? stripUncertaintyNote(event.description) : event.description} />
          </div>
        )}
      </div>
      <div className="ev-actions">
        <EventLinkIcon url={event.url} title={event.title ? `View ${event.title}` : 'View event page'} />
        <AddToCalendar title={event.title} startDate={event.startDate} endDate={event.endDate}
          description={event.description} location={event.location} url={event.url} mode={app.calendarAddMode} />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- EventDetail --- */
// How many sibling occurrences of a recurring event to list before collapsing
// the remainder into a "+N more dates" line.
const OTHER_DATES_CAP = 12

export function EventDetail({ event }) {
  const app = useApp206()

  // "Other dates": occurrences of the conceptually-same event on other days.
  // Many recurring events (weekly trivia, a multi-night musical) are scraped as
  // independent dated instances with no recurrence model, so we re-link them
  // here at display time using the same heuristic key the events map uses
  // (`groupKey`: normalized title + venue + source feed). We intentionally read
  // the UNSCOPED upcoming list (`allUpcomingEvents`), not the date-window-scoped
  // one, so the full cadence shows even when the user is browsing "next 7 days".
  // Computed before the early return below to keep hook order stable.
  const otherDates = useMemo(() => {
    if (!event) return []
    const key = groupKey(event)
    const selfKey = eventKey(event)
    return (app.allUpcomingEvents || [])
      .filter((e) => e !== event && eventKey(e) !== selfKey && groupKey(e) === key)
      .sort(compareByDate)
  }, [event, app.allUpcomingEvents])

  if (!event) return null
  const channel = app.channelByIcsUrl.get(event.icsUrl)
  const row = rowFromIndexEvent(event)
  const parsed = parseIndexDate(event.date)
  const color = channel ? channel.color : 'var(--blue)'
  // Exclude occurrences already surfaced under "Other dates" so the same event
  // never appears in both lists. The open event itself is excluded by KEY, not
  // object identity: `event` may come from an earlier corpus generation (the
  // "soon" payload) than `upcomingEvents` (the full index, swapped in behind
  // it), in which case the same event is a different object.
  const selfKey = eventKey(event)
  const otherDateKeys = new Set(otherDates.map(eventKey))
  const more = app.upcomingEvents
    .filter((e) => e.icsUrl === event.icsUrl && eventKey(e) !== selfKey && !otherDateKeys.has(eventKey(e)))
    .slice(0, 3)

  return (
    <div style={{ padding: '2px var(--pad) 24px', maxWidth: 680, margin: '0 auto' }}>
      <button className="a-iconbtn" onClick={app.back} style={{ marginTop: 8, marginBottom: 14 }}>{Ico.back}</button>

      <BannerImage src={event.imageUrl} alt={`Photo for ${event.summary}`} height={200} />

      <div className="a-hero" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, #000))` }}>
        <div className="a-hero-kick">{row.day} · {row.dateNum}{row.time ? ` · ${row.time}` : ''}</div>
        <div className="a-hero-title">{event.summary}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 13, fontSize: 13.5, fontWeight: 600, opacity: 0.96, flexWrap: 'wrap' }}>
          {row.time && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 15 }}>{Ico.clock}</span>{row.timeRange}<UncertaintyBadge event={event} fields={uncertainFieldsFor(event, ['startTime', 'duration'])} compact /></span>}
          {(event.location || channel?.hood) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 15 }}>{Ico.pin}</span>{event.location || channel.hood}<UncertaintyBadge event={event} fields={uncertainFieldsFor(event, ['location'])} compact /></span>}
          {costLabel(event.cost) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 15 }}>{Ico.spark}</span>{costLabel(event.cost)}<UncertaintyBadge event={event} fields={uncertainFieldsFor(event, ['cost'])} compact /></span>}
        </div>
      </div>

      {/* Primary outbound link to the event's own page (tickets / official
          listing). This is often the main thing someone wants, so it leads the
          action row as a full-width button. Absent when the source carries no
          per-event URL. */}
      {event.url && (
        <a className="btn btn-blue" style={{ width: '100%', marginBottom: 10 }}
          href={event.url} target="_blank" rel="noopener noreferrer">
          {Ico.globe}View event page
        </a>
      )}

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

      {/* Report a problem with this specific event. Pre-fills the feedback modal
          with the event's identity (title + date + source) and an editable
          template message, so a wrong time/location/duplicate can be reported in
          one tap. Mirrors the venue page's "Report a problem" button. */}
      <div style={{ display: 'flex', marginBottom: 20 }}>
        <button className="btn btn-ghost" style={{ flex: 1, minWidth: 0, height: 40, fontSize: 13.5 }}
          onClick={() => app.openFeedback({
            type: 'bug',
            message: `Problem with "${event.summary}" (${row.day} ${row.dateNum}): `,
            context: {
              eventTitle: event.summary,
              eventDate: `${row.day} ${row.dateNum}${row.time ? ` · ${row.time}` : ''}`,
              sourceName: channel?.name,
              icsUrl: event.icsUrl,
              pageUrl: window.location.href,
            },
          })}>{Ico.spark}Report a problem</button>
      </div>

      {event.description && (
        <div style={{ marginBottom: 22, fontSize: 15.5, lineHeight: 1.6 }}><EventDescription text={event.description} /></div>
      )}

      <div className="a-facts">
        {event.location && (() => {
          const mapHref = bestMapHref({ location: event.location, lat: event.lat, lng: event.lng })
          const locFields = uncertainFieldsFor(event, ['location'])
          const inner = (
            <>
              <span style={{ width: 18, height: 18, color: 'var(--ink-3)', flex: '0 0 auto' }}>{Ico.pin}</span>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>{event.location}</div>
                {channel?.hood && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>{channel.hood}</div>}</div>
            </>
          )
          // The badge is a <button>; keep it a sibling of the map link, never a
          // descendant — interactive content nested in an <a> is invalid HTML.
          const linkStyle = { display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }
          const link = mapHref
            ? <a href={mapHref} target="_blank" rel="noopener noreferrer" title="Open in maps" style={linkStyle}>{inner}</a>
            : <div style={linkStyle}>{inner}</div>
          return (
            <div className="a-fact" style={{ alignItems: 'center' }}>
              {link}
              {locFields.length > 0 && <UncertaintyBadge event={event} fields={locFields} />}
            </div>
          )
        })()}
        {/* Price fact. Unlike the row labels (silent when unknown), the detail
            page states unknown pricing explicitly — this is where someone
            decides whether to go, so honesty beats tidiness here. */}
        {(() => {
          const label = costLabel(event.cost)
          const sub = label === 'Sold out'
            ? 'No longer on sale — check the event site for resale or a waitlist'
            : label === 'Ticketed'
            ? 'Amount not posted — see the event site'
            : !label && event.url ? 'Check the event site' : null
          const costFields = uncertainFieldsFor(event, ['cost'])
          const inner = (
            <>
              <span style={{ width: 18, height: 18, color: 'var(--ink-3)', flex: '0 0 auto' }}>{Ico.spark}</span>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>{label || 'Price not listed'}</div>
                {sub && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>{sub}</div>}</div>
            </>
          )
          // Badge stays a sibling of the link (see location fact above).
          const linkStyle = { display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }
          const link = !label && event.url
            ? <a href={event.url} target="_blank" rel="noopener noreferrer" title="Check the event site for pricing" style={linkStyle}>{inner}</a>
            : <div style={linkStyle}>{inner}</div>
          return (
            <div className="a-fact" style={{ alignItems: 'center' }}>
              {link}
              {costFields.length > 0 && <UncertaintyBadge event={event} fields={costFields} />}
            </div>
          )
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

      {Array.isArray(event.dedupedSources) && event.dedupedSources.length > 0 && (
        <div className="a-dedup-sources" style={{ marginBottom: 20, fontSize: 13, color: 'var(--ink-3)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span>Also listed in:</span>
          {event.dedupedSources.map((icsUrl) => {
            const ch = app.channelByIcsUrl.get(icsUrl)
            const label = ch ? ch.name : icsUrl.replace(/\.ics$/, '')
            const chipStyle = { border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', fontSize: 12.5, color: 'var(--ink-2)', background: 'none' }
            return ch
              ? <button key={icsUrl} onClick={() => app.openChannel(icsUrl)} style={{ ...chipStyle, cursor: 'pointer' }}>{label}</button>
              : <span key={icsUrl} style={chipStyle}>{label}</span>
          })}
        </div>
      )}

      {otherDates.length > 0 && (
        <>
          <div className="a-rowhdr"><span className="a-eyebrow">OTHER DATES</span><span className="ln" /></div>
          {otherDates.slice(0, OTHER_DATES_CAP).map((e) => {
            const r = rowFromIndexEvent(e)
            return (
              <div className="ev" key={eventKey(e)} onClick={() => app.openEvent(e)}>
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
          {otherDates.length > OTHER_DATES_CAP && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '8px 2px 2px' }}>
              +{otherDates.length - OTHER_DATES_CAP} more {otherDates.length - OTHER_DATES_CAP === 1 ? 'date' : 'dates'}
            </div>
          )}
        </>
      )}

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

      <EventDebugPanel event={event} channel={channel} />
    </div>
  )
}

/* ----------------------------------------------------------- Debug panels --- */
// Rendered on the venue (ChannelDetail) and event (EventDetail) pages only when
// debug mode is on (toggled from the Site Health dashboard). They join the
// published build-errors.json to the object on screen so a QA pass can spot
// data-quality issues — missing photos, geocode misses, uncertainty, dedup —
// without leaving the page. build-errors.json is fetched lazily (only while
// debug mode is on) via the shared cache in useBuildErrors.

// One labeled key/value row. `warn` tints the value when it flags a gap.
function DebugRow({ label, value, warn = false }) {
  return (
    <div className="a-debug-row">
      <span className="a-debug-key">{label}</span>
      <span className={`a-debug-val${warn ? ' a-debug-val--warn' : ''}`}>{value}</span>
    </div>
  )
}

function ChannelDebugPanel({ channel, upcomingCount }) {
  const app = useApp206()
  const buildErrors = useBuildErrors(app.debugMode)
  const dbg = useMemo(
    () => (app.debugMode ? sourceDebug(indexBuildErrors(buildErrors), channel, { upcomingCount }) : null),
    [app.debugMode, buildErrors, channel, upcomingCount],
  )
  if (!app.debugMode || !dbg) return null
  const geo = dbg.geo
  return (
    <section className="a-debug" aria-label="Debug info for this source">
      <div className="a-debug-head">🐞 Debug · source</div>
      <DebugRow label="icsUrl" value={dbg.icsUrl || '—'} />
      <DebugRow label="source keys" value={dbg.sourceKeys.join(', ') || '—'} />
      <DebugRow label="type" value={dbg.type} />
      <DebugRow label="tags" value={(channel.tags || []).join(', ') || '—'} />
      <DebugRow label="neighborhood" value={channel.hood || (channel.distributed ? 'citywide' : '—')} />
      <DebugRow label="upcoming events" value={upcomingCount} warn={upcomingCount === 0 && !dbg.expectedEmpty} />
      <DebugRow label="parse errors" value={dbg.parseErrorCount} warn={dbg.parseErrorCount > 0} />
      <DebugRow label="uncertain events" value={dbg.uncertaintyCount} warn={dbg.uncertaintyCount > 0} />
      <DebugRow label="geocode misses" value={dbg.geocodeErrors.length} warn={dbg.geocodeErrors.length > 0} />
      <DebugRow label="geo" value={geo ? `${geo.lat}, ${geo.lng}${geo.label ? ` (${geo.label})` : ''}` : 'none (distributed)'} warn={!geo && !channel.distributed} />
      <DebugRow label="OSM id" value={dbg.hasOsmId ? `${geo.osmType || ''} ${geo.osmId}`.trim() : 'missing'} warn={dbg.osmGap} />
      <DebugRow label="venue photo" value={dbg.missingPhoto ? 'missing' : (dbg.imageUrl ? 'present' : 'n/a')} warn={dbg.missingPhoto} />
      {dbg.expectedEmpty && <DebugRow label="expectEmpty" value="yes (0 events expected)" />}
      {dbg.zeroEvent && <DebugRow label="zero events" value="unexpected — investigate" warn />}
      {dbg.proxy && <DebugRow label="proxy" value={`${dbg.proxy.rung} · ${dbg.proxy.consecutiveFailures} fails`} warn />}
      {dbg.stale && <DebugRow label="stale serve" value={dbg.stale.error || 'live fetch failed'} warn />}
      {dbg.errors.length > 0 && (
        <div className="a-debug-sub">
          {dbg.errors.slice(0, 8).map((e, i) => (
            <div key={i} className="a-debug-err">{e.type}: {e.reason}</div>
          ))}
          {dbg.errors.length > 8 && <div className="a-debug-err">…and {dbg.errors.length - 8} more</div>}
        </div>
      )}
    </section>
  )
}

function EventDebugPanel({ event, channel }) {
  const app = useApp206()
  const buildErrors = useBuildErrors(app.debugMode)
  const dbg = useMemo(
    () => (app.debugMode ? eventDebug(indexBuildErrors(buildErrors), event) : null),
    [app.debugMode, buildErrors, event],
  )
  if (!app.debugMode || !dbg) return null
  const q = dbg.queues
  const cost = dbg.cost
  const costStr = cost
    ? `${cost.soldOut ? 'soldout' : cost.paid ? 'paid' : 'free'}${cost.min != null ? ` min=${cost.min}` : ''}${cost.max != null ? ` max=${cost.max}` : ''}`
    : 'none'
  // The events-index `uncertainty` field exposes `.fields` (see atoms.jsx
  // eventUncertainty); the build-errors queue entry uses `.unknownFields`.
  const uncertainFields = dbg.uncertainty?.fields || (q.uncertain ? q.uncertain.unknownFields : null)
  return (
    <section className="a-debug" aria-label="Debug info for this event">
      <div className="a-debug-head">🐞 Debug · event</div>
      <DebugRow label="eventKey" value={dbg.eventKey} />
      <DebugRow label="id" value={dbg.id || '—'} />
      <DebugRow label="source" value={channel ? channel.name : (dbg.icsUrl || '—')} />
      <DebugRow label="icsUrl" value={dbg.icsUrl || '—'} />
      <DebugRow label="start" value={dbg.date || '—'} />
      <DebugRow label="end" value={dbg.endDate || '—'} />
      <DebugRow label="location" value={dbg.location || '—'} />
      <DebugRow label="coords" value={dbg.hasCoords ? `${dbg.lat}, ${dbg.lng}` : 'none'} warn={!dbg.hasCoords && !!dbg.location} />
      <DebugRow label="cost" value={costStr} warn={!!q.costGap} />
      <DebugRow label="photo" value={dbg.imageUrl ? 'present' : 'missing'} warn={!!q.photoGap} />
      {uncertainFields && uncertainFields.length > 0 && (
        <DebugRow label="uncertain fields" value={uncertainFields.join(', ')} warn />
      )}
      {dbg.duplicateOf && <DebugRow label="duplicateOf" value={dbg.duplicateOf} />}
      {Array.isArray(dbg.dedupedSources) && dbg.dedupedSources.length > 0 && (
        <DebugRow label="also listed in" value={`${dbg.dedupedSources.length} source(s)`} />
      )}
      <DebugRow label="in queues" value={
        [q.uncertain && 'uncertainty', q.costGap && 'cost', q.photoGap && 'photo', q.duplicateCandidate && 'duplicate']
          .filter(Boolean).join(', ') || 'none'
      } warn={!!(q.uncertain || q.costGap || q.photoGap || q.duplicateCandidate)} />
    </section>
  )
}
