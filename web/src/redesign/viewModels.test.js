import { describe, it, expect } from 'vitest'
import { eventInWindow, describeWindow, DATE_WINDOW_STOPS, channelFromCalendar } from './viewModels.js'

// Fixed "now": Mon 2026-06-01 10:00 local. Day boundaries are computed in local
// time, matching the production helpers.
const NOW = new Date(2026, 5, 1, 10, 0, 0)

// Build an events-index-style date string for `offsetDays` from NOW's calendar
// day, at the given local hour, without a timezone bracket (parsed as local).
const at = (offsetDays, hour = 19) => {
  const d = new Date(2026, 5, 1 + offsetDays, hour, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

describe('eventInWindow', () => {
  it("'all' (and null) matches every event", () => {
    expect(eventInWindow({ date: at(0) }, 'all', NOW)).toBe(true)
    expect(eventInWindow({ date: at(365) }, 'all', NOW)).toBe(true)
    expect(eventInWindow({ date: at(5) }, null, NOW)).toBe(true)
  })

  it('window 0 matches only today', () => {
    expect(eventInWindow({ date: at(0) }, 0, NOW)).toBe(true)
    expect(eventInWindow({ date: at(0, 1) }, 0, NOW)).toBe(true) // earlier today still counts (day-based)
    expect(eventInWindow({ date: at(1) }, 0, NOW)).toBe(false)
  })

  it('includes the inclusive far edge (diff === windowDays)', () => {
    expect(eventInWindow({ date: at(7) }, 7, NOW)).toBe(true)
    expect(eventInWindow({ date: at(8) }, 7, NOW)).toBe(false)
  })

  it('excludes past events from a numeric window (upstream handles past for "all")', () => {
    expect(eventInWindow({ date: at(-1) }, 7, NOW)).toBe(false)
    // 'all' means "no date filtering" here; past-event exclusion is the job of
    // upcomingIndexEvents, so this helper returns true for past events under 'all'.
    expect(eventInWindow({ date: at(-1) }, 'all', NOW)).toBe(true)
  })

  it('returns false for an unparseable date against a numeric window', () => {
    expect(eventInWindow({ date: 'not-a-date' }, 7, NOW)).toBe(false)
    expect(eventInWindow({ date: undefined }, 7, NOW)).toBe(false)
  })
})

describe('describeWindow', () => {
  it("'all' has a relative label and no end date", () => {
    expect(describeWindow('all', NOW)).toEqual({ relative: 'All upcoming', absoluteEnd: null })
  })

  it('labels Today and the standard stops with an end date', () => {
    expect(describeWindow(0, NOW).relative).toBe('Today')
    expect(describeWindow(7, NOW).relative).toBe('Next 7 days')
    expect(describeWindow(14, NOW).relative).toBe('Next 2 weeks')
    expect(describeWindow(30, NOW).relative).toBe('Next 30 days')
    expect(describeWindow(90, NOW).relative).toBe('Next 3 months')
    expect(describeWindow(7, NOW).absoluteEnd).toBeTruthy()
  })

  it('every numeric stop produces a non-empty relative label', () => {
    for (const stop of DATE_WINDOW_STOPS) {
      expect(describeWindow(stop, NOW).relative.length).toBeGreaterThan(0)
    }
  })
})

describe('channelFromCalendar geo wiring', () => {
  const cal = { icsUrl: 'neumos-events.ics', name: 'neumos', fullName: 'Neumos', tags: ['Music', 'Capitol Hill'] }

  it('carries the venue geo and is not distributed when a venue is provided', () => {
    const venue = { geo: { lat: 47.6143, lng: -122.3197, label: 'Neumos, Seattle', osmType: 'way', osmId: 42 } }
    const ch = channelFromCalendar(cal, null, { venue })
    expect(ch.geo).toEqual(venue.geo)
    expect(ch.distributed).toBe(false)
  })

  it('has null geo and is distributed when no venue is provided', () => {
    const ch = channelFromCalendar(cal, null, { venue: null })
    expect(ch.geo).toBeNull()
    expect(ch.distributed).toBe(true)
  })

  it('carries the venue imageUrl when present', () => {
    const venue = { geo: { lat: 47.6, lng: -122.3 }, imageUrl: 'https://example.com/neumos.jpg' }
    const ch = channelFromCalendar(cal, null, { venue })
    expect(ch.imageUrl).toBe('https://example.com/neumos.jpg')
  })

  it('has null imageUrl when the venue has no photo or is distributed', () => {
    expect(channelFromCalendar(cal, null, { venue: { geo: { lat: 47.6, lng: -122.3 } } }).imageUrl).toBeNull()
    expect(channelFromCalendar(cal, null, { venue: null }).imageUrl).toBeNull()
  })
})
