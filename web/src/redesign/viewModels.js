// Pure view-model selectors: turn the app's raw data (manifest calendars,
// events-index entries, venues, attributions) into the shapes the redesigned
// presentational components consume. No React, fully unit-testable.

import { formatTagLabel } from '../utils/format.js'
import { isNeighborhoodTag, primaryCategoryTag, channelColor } from './categories.js'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DOW_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// Parse an events-index date string ("2026-02-15T19:00-08:00[America/Los_Angeles]")
// into a JS Date plus the IANA zone. Returns null when unparseable.
export function parseIndexDate(dateStr) {
  if (!dateStr) return null
  const tzMatch = dateStr.match(/\[(.+)\]$/)
  const timezone = tzMatch ? tzMatch[1] : undefined
  const parsed = new Date(dateStr.replace(/\[.*\]$/, ''))
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

// Short row labels for an events-index event.
export function rowFromIndexEvent(event) {
  const parsed = parseIndexDate(event.date)
  const d = parsed ? parsed.date : null
  const day = d ? DOW_SHORT[localDay(parsed).getDay()] : ''
  const dateNum = d ? localDay(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
  const time = d
    ? d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
        ...(parsed.timezone ? { timeZone: parsed.timezone } : {}),
      }).replace(':00', '')
    : ''
  return { id: event.icsUrl ? `${event.summary}|${event.date}` : event.summary, title: event.summary, day, dateNum, time, raw: event }
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
    else label = eventDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    if (!byDiff.has(diffDays)) {
      byDiff.set(diffDays, {
        label,
        dateSubtitle: eventDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        events: [],
      })
    }
    byDiff.get(diffDays).events.push(event)
  }
  return [...byDiff.entries()].sort(([a], [b]) => a - b).map(([, g]) => g)
}

// Filter events-index to the upcoming window [today, +months) and sort ascending.
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
// The "next N days" map/list filter is a single global value: either a number
// of days from today, or 'all' (no date filtering, the default). These are the
// discrete slider stops, smallest to largest.
export const DATE_WINDOW_STOPS = [0, 3, 7, 14, 30, 90, 'all']

// True when `event` falls within [today, today + windowDays] (inclusive),
// honoring the event's own timezone via localDay(). 'all' (or null) matches
// everything; past events and unparseable dates never match a numeric window.
export function eventInWindow(event, windowDays, now = new Date()) {
  if (windowDays === 'all' || windowDays == null) return true
  const parsed = parseIndexDate(event.date)
  if (!parsed) return false
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = localDay(parsed)
  const diff = Math.round((day - todayStart) / 86400000)
  return diff >= 0 && diff <= windowDays
}

// Human labels for a window stop: the relative phrase plus the resolved
// absolute end date (null for 'all', which has no end).
export function describeWindow(windowDays, now = new Date()) {
  if (windowDays === 'all' || windowDays == null) {
    return { relative: 'All upcoming', absoluteEnd: null }
  }
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(todayStart)
  end.setDate(end.getDate() + windowDays)
  const absoluteEnd = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (windowDays === 0) return { relative: 'Today', absoluteEnd }
  if (windowDays === 7) return { relative: 'Next 7 days', absoluteEnd }
  if (windowDays === 14) return { relative: 'Next 2 weeks', absoluteEnd }
  if (windowDays === 30) return { relative: 'Next 30 days', absoluteEnd }
  if (windowDays === 90) return { relative: 'Next 3 months', absoluteEnd }
  return { relative: `Next ${windowDays} days`, absoluteEnd }
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
  const hood = hoodFromTags(tags) || (venue && venue.geo && venue.geo.label) || null
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
    primaryCategory: primaryCategoryTag(tags),
    color: channelColor(tags),
    distributed: !venue,
    upcomingCount,
    peek,
  }
}
