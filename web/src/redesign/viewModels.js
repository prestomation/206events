// Pure view-model selectors: turn the app's raw data (manifest calendars,
// events-index entries, venues, attributions) into the shapes the redesigned
// presentational components consume. No React, fully unit-testable.

import { formatTagLabel } from '../utils/format.js'
import { isNeighborhoodTag, primaryCategoryTag, channelColor } from './categories.js'
import { eventKey } from '../lib/eventKey.js'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DOW_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// Like toLocaleDateString but appends year: 'numeric' when the date is in a different year.
function localeDateMaybeYear(date, options) {
  const opts = date.getFullYear() !== new Date().getFullYear() ? { ...options, year: 'numeric' } : options
  return date.toLocaleDateString('en-US', opts)
}

// Parse an events-index date string ("2026-02-15T19:00-08:00[America/Los_Angeles]")
// into a JS Date plus the IANA zone. Returns null when unparseable.
//
// Parses components manually and uses Date.UTC() so the UTC offset is always
// honoured, regardless of browser. Avoids new Date(string) which Safari/WebKit
// and some Android browsers misparse when seconds are absent — they ignore the
// UTC offset and treat local time as UTC, producing a wrong AddToCalendar link.
export function parseIndexDate(dateStr) {
  if (!dateStr) return null
  const tzMatch = dateStr.match(/\[(.+)\]$/)
  const timezone = tzMatch ? tzMatch[1] : undefined
  const s = dateStr.replace(/\[.*\]$/, '')
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:([+-])(\d{2}):(\d{2})|(Z))?$/)
  if (!m) return null
  const [, yr, mo, da, hr, mn, sc = '00', sign, offH = '00', offM = '00', z] = m
  // Interpret the wall-clock fields as UTC, then subtract the stated UTC offset.
  const localMs = Date.UTC(+yr, +mo - 1, +da, +hr, +mn, +sc)
  let utcMs
  if (z || !sign) {
    utcMs = localMs
  } else {
    const offsetMs = (sign === '+' ? 1 : -1) * ((+offH * 60 + +offM) * 60000)
    utcMs = localMs - offsetMs
  }
  const parsed = new Date(utcMs)
  if (isNaN(parsed.getTime())) return null
  return { date: parsed, timezone }
}

// The local calendar day for an event, honoring its own timezone so "Today" is
// correct for the event's locale rather than the viewer's.
function localDay(parsed) {
  const { date, timezone } = parsed
  if (timezone) {
    try {
      const parts = date.toLocaleDateString('en-CA', { timeZone: timezone }).split('-')
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    } catch { /* fall through */ }
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Split a Date into a { label, mer } pair ("7:30", "PM") in the given IANA
// timezone, dropping a ":00" minute so "7:00 PM" reads "7 PM". `mer` is '' when
// the locale produced no AM/PM marker (e.g. a 24h locale override).
function timeParts(d, timezone) {
  const s = d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  })
  const m = s.match(/^(.*)\s(AM|PM)$/i)
  if (!m) return { label: s.replace(':00', ''), mer: '' }
  return { label: m[1].replace(':00', ''), mer: m[2] }
}

// Format an event's clock time as a range when an end is known, honoring the
// event's own timezone. Same-day ranges collapse a shared meridiem ("7 – 9 PM");
// ranges that cross midnight prefix the end with its weekday ("11 PM → Sun 1 AM").
// Falls back to the start time alone when there's no usable end.
export function formatTimeRange(start, end, timezone) {
  if (!start) return ''
  const s = timeParts(start, timezone)
  const startStr = `${s.label}${s.mer ? ' ' + s.mer : ''}`
  if (!end || end <= start) return startStr
  const e = timeParts(end, timezone)
  const endStr = `${e.label}${e.mer ? ' ' + e.mer : ''}`
  const sameDay = localDay({ date: start, timezone }).getTime() === localDay({ date: end, timezone }).getTime()
  if (sameDay) {
    // Collapse a shared meridiem: "7 – 9 PM" rather than "7 PM – 9 PM".
    if (s.mer && s.mer === e.mer) return `${s.label} – ${endStr}`
    return `${startStr} – ${endStr}`
  }
  const endDay = end.toLocaleDateString('en-US', {
    weekday: 'short', ...(timezone ? { timeZone: timezone } : {}),
  })
  return `${startStr} → ${endDay} ${endStr}`
}

// Short row labels for an events-index event. `time` is the start alone;
// `timeRange` adds the end when the index carries one (= `time` otherwise).
export function rowFromIndexEvent(event) {
  const parsed = parseIndexDate(event.date)
  const d = parsed ? parsed.date : null
  const day = d ? DOW_SHORT[localDay(parsed).getDay()] : ''
  const dateNum = d ? localeDateMaybeYear(localDay(parsed), { month: 'short', day: 'numeric' }) : ''
  const time = d ? formatTimeRange(d, null, parsed.timezone) : ''
  const parsedEnd = parseIndexDate(event.endDate)
  const timeRange = d ? formatTimeRange(d, parsedEnd ? parsedEnd.date : null, parsed.timezone) : ''
  return { id: event.icsUrl ? `${event.summary}|${event.date}` : event.summary, title: event.summary, day, dateNum, time, timeRange, raw: event }
}

// Group a flat list of (already date-filtered, sorted) events-index entries into
// day buckets: { label, dateSubtitle, events }. Mirrors App.jsx grouping.
export function groupIndexEventsByDay(events, now = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const byDiff = new Map()
  for (const event of events) {
    const parsed = parseIndexDate(event.date)
    if (!parsed) continue
    const eventDay = localDay(parsed)
    const diffDays = Math.round((eventDay - todayStart) / 86400000)
    let label
    if (diffDays === 0) label = 'Today'
    else if (diffDays === 1) label = 'Tomorrow'
    else if (diffDays > 1 && diffDays < 7) label = DAY_NAMES[eventDay.getDay()]
    else label = localeDateMaybeYear(eventDay, { weekday: 'long', month: 'short', day: 'numeric' })
    if (!byDiff.has(diffDays)) {
      byDiff.set(diffDays, {
        label,
        dateSubtitle: localeDateMaybeYear(eventDay, { month: 'short', day: 'numeric' }),
        events: [],
      })
    }
    byDiff.get(diffDays).events.push(event)
  }
  return [...byDiff.entries()].sort(([a], [b]) => a - b).map(([, g]) => g)
}

// Filter events-index to the upcoming window [today, +months) and sort ascending.
// NOTE: this helper is shared by the parity-locked favorites/following path
// (App.jsx), so it does NOT drop suppressed cross-source duplicates. The
// display-only redesign path suppresses `duplicateOf` itself (App206), keeping
// the Following preview aligned with the favorites-worker ICS feed (which has
// no knowledge of build-time `duplicateOf`). See docs/cross-source-event-dedup.md
// and the "Favorites Filter Parity" rule.
export function upcomingIndexEvents(eventsIndex, { months = 6, now = new Date() } = {}) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const horizon = new Date(now.getFullYear(), now.getMonth() + months, now.getDate())
  return eventsIndex
    .map((event) => ({ event, parsed: parseIndexDate(event.date) }))
    .filter(({ parsed }) => {
      if (!parsed) return false
      if (parsed.date >= horizon) return false
      if (parsed.date < todayStart) return false
      return true
    })
    .sort((a, b) => a.parsed.date - b.parsed.date)
    .map(({ event }) => event)
}

// --- Date-window filter -----------------------------------------------------
// The "next N days" map/list filter is a single global value with three shapes:
//   - a number of days from today (the slider stops below),
//   - 'all' (no date filtering, the default), or
//   - a { start, end } custom range of 'YYYY-MM-DD' local days (inclusive),
//     for picking explicit calendar dates (e.g. a visitor's trip).
// These are the discrete slider stops, smallest to largest.
export const DATE_WINDOW_STOPS = [0, 3, 7, 14, 30, 90, 'all']

// True when `win` is a custom { start, end } range object (the third dateWindow
// shape, alongside a numeric day count and 'all').
export function isDateRange(win) {
  return win != null && typeof win === 'object'
    && typeof win.start === 'string' && typeof win.end === 'string'
}

// Parse a 'YYYY-MM-DD' string into a Date at LOCAL midnight, matching how
// localDay() constructs an event's day so the two compare directly. Returns
// null when the string is malformed or not a real calendar date (e.g. Feb 31,
// which Date would silently roll over).
function parseLocalDay(s) {
  if (typeof s !== 'string') return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = +m[1], mo = +m[2], d = +m[3]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date
}

// Validate/normalize a { start, end } pair: both must be real 'YYYY-MM-DD'
// days; a reversed pair is swapped so start <= end. Returns the canonical
// { start, end } (preserving the original strings) or null when either side is
// malformed.
export function normalizeDateRange(range) {
  if (!range || typeof range !== 'object') return null
  const s = parseLocalDay(range.start)
  const e = parseLocalDay(range.end)
  if (!s || !e) return null
  return s <= e ? { start: range.start, end: range.end } : { start: range.end, end: range.start }
}

// "Jul 24" (single day), "Jul 24 – 28" (same month), or "Jul 28 – Aug 2"
// (cross-month), appending the year per side when it isn't `now`'s year.
function formatRangeLabel(range, now = new Date()) {
  const start = parseLocalDay(range.start)
  const end = parseLocalDay(range.end)
  if (!start || !end) return 'Custom dates'
  const curYear = now.getFullYear()
  const fmt = (date, withMonth) => date.toLocaleDateString('en-US', {
    ...(withMonth ? { month: 'short' } : {}),
    day: 'numeric',
    ...(date.getFullYear() !== curYear ? { year: 'numeric' } : {}),
  })
  if (start.getTime() === end.getTime()) return fmt(start, true)
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()
  return `${fmt(start, true)} – ${fmt(end, !sameMonth)}`
}

// True when `event` falls within the active window, honoring the event's own
// timezone via localDay(). 'all' (or null) matches everything; a numeric window
// is [today, today + windowDays] inclusive; a custom range is [start, end]
// inclusive. Past events and unparseable dates never match a numeric window or
// a range. A malformed range matches everything (mirrors the 'all' fallback).
export function eventInWindow(event, windowDays, now = new Date()) {
  if (windowDays === 'all' || windowDays == null) return true
  const parsed = parseIndexDate(event.date)
  if (!parsed) return false
  const day = localDay(parsed)
  if (isDateRange(windowDays)) {
    const range = normalizeDateRange(windowDays)
    if (!range) return true
    return day >= parseLocalDay(range.start) && day <= parseLocalDay(range.end)
  }
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((day - todayStart) / 86400000)
  return diff >= 0 && diff <= windowDays
}

// Human labels for a window value: the relative phrase plus the resolved
// absolute end date (null for 'all' and for custom ranges, which carry their
// own dates in the relative phrase).
export function describeWindow(windowDays, now = new Date()) {
  if (windowDays === 'all' || windowDays == null) {
    return { relative: 'All upcoming', absoluteEnd: null }
  }
  if (isDateRange(windowDays)) {
    const range = normalizeDateRange(windowDays)
    if (!range) return { relative: 'All upcoming', absoluteEnd: null }
    return { relative: formatRangeLabel(range, now), absoluteEnd: null }
  }
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(todayStart)
  end.setDate(end.getDate() + windowDays)
  const absoluteEnd = localeDateMaybeYear(end, { weekday: 'short', month: 'short', day: 'numeric' })
  if (windowDays === 0) return { relative: 'Today', absoluteEnd }
  if (windowDays === 7) return { relative: 'Next 7 days', absoluteEnd }
  if (windowDays === 14) return { relative: 'Next 2 weeks', absoluteEnd }
  if (windowDays === 30) return { relative: 'Next 30 days', absoluteEnd }
  if (windowDays === 90) return { relative: 'Next 3 months', absoluteEnd }
  return { relative: `Next ${windowDays} days`, absoluteEnd }
}

// --- Cost filter --------------------------------------------------------
// Price buckets over the events-index `cost` field ({min, max?} | {paid: true},
// USD face value; min 0 = free; absent = unknown). Filtering is strict on
// `min`: unknown-cost and paid-amount-unknown events match only "Any" (no
// filter) — we never guess that an unpriced event is free or cheap. The
// active-filter UI shows a "confirmed pricing only" caption for this reason.
export const COST_FILTER_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: '10', label: '$10 or less' },
  { value: '25', label: '$25 or less' },
]

export function eventMatchesCost(event, costFilter) {
  if (!costFilter) return true
  const c = event.cost
  // Unknown, paid-amount-unknown, and sold-out events have no `min` to compare
  // against — they match only "Any", never a price bucket.
  if (!c || c.paid || c.soldOut || typeof c.min !== 'number') return false
  if (costFilter === 'free') return c.min === 0
  const cap = Number(costFilter)
  return Number.isFinite(cap) ? c.min <= cap : true
}

// One display string for a cost object: "Sold out", "Free", "$10", "From $10"
// (range), or "Ticketed" (paid, amount unknown). null when cost is unknown —
// show nothing rather than a guess.
export function costLabel(cost) {
  if (!cost) return null
  if (cost.soldOut) return 'Sold out'
  if (cost.paid) return 'Ticketed'
  const fmt = (n) => Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
  if (cost.min === 0) return 'Free'
  if (cost.max != null && cost.max > cost.min) return `From ${fmt(cost.min)}`
  return fmt(cost.min)
}

// Modifier class for the `.ev-cost` span: `--free` (green) for free events,
// `--soldout` (muted/strikethrough) for sold-out. Centralized so the two list
// render sites stay in sync.
export function costClass(cost) {
  if (!cost) return ''
  if (cost.soldOut) return ' ev-cost--soldout'
  if (!cost.paid && cost.min === 0) return ' ev-cost--free'
  return ''
}

// --- Discover filtering -----------------------------------------------------
// Shared by the Discover Calendars/Events modes AND the seg-button match badges
// so the count on each tab always equals what that tab renders. The two are
// separate functions because they match differently: calendars do substring
// matching on name/tags, events use the precomputed Fuse `queryKeySet`.

// Channels passing the active Discover filters (category, neighborhood, search).
// Search is a case-insensitive substring over the channel name and its tags.
export function filterDiscoverChannels(channels, { category, neighborhood, query } = {}) {
  let out = channels || []
  if (category) out = out.filter((c) => c.tags.includes(category))
  if (neighborhood) out = out.filter((c) => c.tags.includes(neighborhood))
  const q = (query || '').trim().toLowerCase()
  if (q) out = out.filter((c) => c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)))
  return out
}

// Events passing the active Discover filters (category, neighborhood, cost,
// search). Category/neighborhood are resolved via the owning channel's tags;
// cost is event-level (strict on `min` — see eventMatchesCost); search is an
// eventKey membership test against the Fuse `queryKeySet` (null = no search).
// Returns the full (uncapped) match list — callers cap rendering separately so
// the badge can show the true total.
export function filterDiscoverEvents(events, { category, neighborhood, cost, query, channelByIcsUrl, queryKeySet } = {}) {
  let out = events || []
  if (category || neighborhood) {
    out = out.filter((e) => {
      const ch = channelByIcsUrl && channelByIcsUrl.get(e.icsUrl)
      if (!ch) return false
      if (category && !ch.tags.includes(category)) return false
      if (neighborhood && !ch.tags.includes(neighborhood)) return false
      return true
    })
  }
  if (cost) out = out.filter((e) => eventMatchesCost(e, cost))
  if ((query || '').trim() && queryKeySet) out = out.filter((e) => queryKeySet.has(eventKey(e)))
  return out
}

// Reduce an event's attribution list to a single provenance chip descriptor.
// "first matching reason wins" — order is calendar → search → geo.
export function provFromAttributions(attributions) {
  if (!attributions || !attributions.length) return null
  const first = attributions[0]
  if (first.type === 'calendar') return { kind: 'cal', label: `via ${first.value}` }
  if (first.type === 'search') return { kind: 'search', label: `matches “${first.value}”` }
  if (first.type === 'geo') return { kind: 'place', label: `near ${first.value}` }
  return null
}

// Best-effort neighborhood label for a calendar from its tags.
export function hoodFromTags(tags = []) {
  const hood = tags.find(isNeighborhoodTag)
  return hood ? formatTagLabel(hood) : null
}

// Build a channel view-model for one manifest calendar entry.
//   cal: { name, fullName, icsUrl, rssUrl, tags, isExternal, isRecurring, originalIcsUrl }
//   ripper: the owning group { name, friendlyName, friendlyLink, description }
export function channelFromCalendar(cal, ripper, opts = {}) {
  const { upcomingCount = 0, peek = [], venue = null } = opts
  const tags = cal.tags || []
  // A channel's area heading comes ONLY from a registered Neighborhoods tag.
  // We deliberately do NOT fall back to the venue's geo.label, which is a raw
  // street address ("2100 6th Ave, Seattle") and reads poorly as an area
  // heading. An untagged venue yields hood=null and groups under "Citywide"
  // instead — the fix is to add a neighborhood tag to the source, not to
  // surface its address. See lib/config/tags.ts (TAG_CATEGORIES.Neighborhoods).
  const hood = hoodFromTags(tags)
  return {
    icsUrl: cal.icsUrl,
    name: ripper && ripper.calendars && ripper.calendars.length > 1
      ? cal.fullName
      : (ripper && ripper.friendlyName) || cal.fullName || cal.name,
    ripperName: ripper ? ripper.name : undefined,
    cal,
    tags,
    hood,
    // The venue's fixed coordinates (when this calendar maps to a venue), used
    // to build a map link on the source page. null for distributed calendars.
    geo: venue && venue.geo ? venue.geo : null,
    // Optional venue photo URL (a link, never image bytes). null when the
    // venue has no photo or this is a distributed calendar.
    imageUrl: venue && venue.imageUrl ? venue.imageUrl : null,
    // Link to the source's own website (ripper `friendlyLink` / external
    // calendar `infoUrl`). null for recurring entries and sources without one.
    website: ripper && ripper.friendlyLink ? ripper.friendlyLink : null,
    // Source description. For rippers this is just the venue name (and the view
    // suppresses it when it merely repeats the channel name); for external
    // calendars it's a sentence describing what the feed covers.
    description: ripper && ripper.description ? ripper.description : null,
    primaryCategory: primaryCategoryTag(tags),
    color: channelColor(tags),
    distributed: !venue,
    upcomingCount,
    peek,
  }
}
