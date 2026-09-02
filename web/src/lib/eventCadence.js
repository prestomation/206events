// web/src/lib/eventCadence.js
//
// Human phrasing for a map popup's date block: how far off one date is, and
// what rhythm a whole series runs on. Both are display-only — nothing here
// decides membership, ordering, or identity.
//
// Note on times: `groupEvents` deliberately merges a matinee and an evening
// showing into one series (event-grouping.js, QUALIFIER_WORDS), so a series'
// instances do NOT all share a start time. `cadence` therefore appends a time
// only when every instance agrees on one; otherwise it stays silent rather
// than confidently printing the wrong showtime.

import { eventDateParts, localDayIndex } from './dateFormat.js'

/** How far off a date is, in the phrasing the popup uses. */
export function relativeDay(dateStr, now = new Date()) {
  const p = eventDateParts(dateStr)
  if (!p) return ''
  const n = p.dayIndex - localDayIndex(now)
  if (n < 0) return 'Past'
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n < 14) return `In ${n} days`
  const weeks = Math.round(n / 7)
  return `In ${weeks} weeks`
}

/** The one start time every instance shares, or null when they differ. */
export function sharedTime(instances = []) {
  let time = null
  for (const inst of instances) {
    const p = eventDateParts(inst?.date)
    if (!p) return null
    if (time === null) time = p.time
    else if (time !== p.time) return null
  }
  return time
}

/**
 * Describe a series' rhythm: "Every Thursday · 7:30 PM", "Every other
 * Wednesday", "Monthly on Sundays", "Nightly", or a plain "5 dates" when the
 * gaps are irregular. Instances are expected pre-sorted by date ascending
 * (which is what `groupEvents` hands back).
 *
 * A single occurrence has no rhythm to describe, so it names the DATE instead
 * ("Wed Sep 9 · 7:00 PM"). "One date" told a reader nothing they could act on
 * while occupying the line where the date belongs.
 *
 * `withTime: false` drops the trailing start time, for callers that already
 * show it on the line above and would otherwise print it twice.
 */
export function cadence(instances = [], { withTime = true } = {}) {
  const parts = instances.map((i) => eventDateParts(i?.date)).filter(Boolean)
  const time = withTime ? sharedTime(instances) : null
  const suffix = time ? ` · ${time}` : ''
  if (parts.length === 0) return ''
  if (parts.length === 1) return `${parts[0].dow} ${parts[0].dayMonth}${suffix}`

  const gaps = parts.slice(1).map((p, i) => p.dayIndex - parts[i].dayIndex)
  const even = gaps.every((g) => g === gaps[0])
  const day = parts[0].dowLong
  if (even && gaps[0] === 1) return `Nightly${suffix}`
  if (even && gaps[0] === 7) return `Every ${day}${suffix}`
  if (even && gaps[0] === 14) return `Every other ${day}${suffix}`
  if (even && gaps[0] >= 28 && gaps[0] <= 31) return `Monthly on ${day}s${suffix}`
  return `${parts.length} dates${suffix}`
}
