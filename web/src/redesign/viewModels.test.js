import { describe, it, expect } from 'vitest'
import { eventInWindow, describeWindow, DATE_WINDOW_STOPS, channelFromCalendar, formatTimeRange, rowFromIndexEvent, groupIndexEventsByDay, filterDiscoverChannels, filterDiscoverEvents, eventMatchesCost, costLabel, COST_FILTER_OPTIONS } from './viewModels.js'
import { eventKey } from '../lib/eventKey.js'
import cityConfig from '../../../city.config.ts'

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
  // Any registered neighborhood works here; use the first configured one
  // so the test holds for whatever city the template is configured for.
  const HOOD = cityConfig.neighborhoods[0]
  const cal = { icsUrl: 'neumos-events.ics', name: 'neumos', fullName: 'Neumos', tags: ['Music', HOOD] }

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

  it('derives hood from a registered neighborhood tag', () => {
    const ch = channelFromCalendar(cal, null, { venue: null })
    expect(ch.hood).toBe(HOOD)
  })

  it('never falls back to a raw geo.label when there is no neighborhood tag', () => {
    const untagged = { icsUrl: 'x.ics', name: 'x', fullName: 'X', tags: ['Music'] }
    const venue = { geo: { lat: 47.6, lng: -122.3, label: '2100 6th Ave, Seattle' } }
    const ch = channelFromCalendar(untagged, null, { venue })
    expect(ch.hood).toBeNull()
  })

  it('carries the source website (friendlyLink) and description from the ripper', () => {
    const ripper = { friendlyName: 'Neumos', friendlyLink: 'https://www.neumos.com', description: 'Neumos' }
    const ch = channelFromCalendar(cal, ripper, { venue: null })
    expect(ch.website).toBe('https://www.neumos.com')
    expect(ch.description).toBe('Neumos')
  })

  it('has null website/description when the ripper provides none (e.g. recurring)', () => {
    const ch = channelFromCalendar(cal, { friendlyLink: null, description: null }, { venue: null })
    expect(ch.website).toBeNull()
    expect(ch.description).toBeNull()
  })
})

describe('formatTimeRange', () => {
  const d = (h, m = 0) => new Date(2026, 5, 1, h, m, 0)

  it('returns the start alone when there is no end', () => {
    expect(formatTimeRange(d(19), null)).toBe('7 PM')
    expect(formatTimeRange(d(19, 30), null)).toBe('7:30 PM')
  })

  it('collapses a shared meridiem for a same-day range', () => {
    expect(formatTimeRange(d(19), d(21))).toBe('7 – 9 PM')
    expect(formatTimeRange(d(19, 30), d(21, 15))).toBe('7:30 – 9:15 PM')
  })

  it('keeps both meridiems when they differ within a day', () => {
    expect(formatTimeRange(d(11), d(13))).toBe('11 AM – 1 PM')
  })

  it('prefixes the end weekday when the range crosses midnight', () => {
    expect(formatTimeRange(d(23), new Date(2026, 5, 2, 1, 0, 0))).toBe('11 PM → Tue 1 AM')
  })

  it('ignores an end that is not after the start', () => {
    expect(formatTimeRange(d(19), d(19))).toBe('7 PM')
    expect(formatTimeRange(d(19), d(18))).toBe('7 PM')
  })

  it('returns empty string with no start', () => {
    expect(formatTimeRange(null, d(21))).toBe('')
  })
})

describe('rowFromIndexEvent time fields', () => {
  it('exposes start-only `time` and end-aware `timeRange`', () => {
    const row = rowFromIndexEvent({ summary: 'Show', date: '2026-06-01T19:00:00', endDate: '2026-06-01T21:00:00' })
    expect(row.time).toBe('7 PM')
    expect(row.timeRange).toBe('7 – 9 PM')
  })

  it('timeRange falls back to the start when the index has no endDate', () => {
    const row = rowFromIndexEvent({ summary: 'Show', date: '2026-06-01T19:00:00' })
    expect(row.timeRange).toBe('7 PM')
  })

  it('dateNum omits year for current-year events', () => {
    const row = rowFromIndexEvent({ summary: 'Show', date: '2026-06-01T19:00:00' })
    expect(row.dateNum).not.toMatch(/\d{4}/)
  })

  it('dateNum includes year for future-year events', () => {
    const row = rowFromIndexEvent({ summary: 'Show', date: '2027-01-15T19:00:00' })
    expect(row.dateNum).toMatch(/2027/)
  })
})

describe('filterDiscoverChannels', () => {
  const channels = [
    { name: 'Neumos', tags: ['Music', 'Capitol Hill'], icsUrl: 'neumos.ics' },
    { name: 'Stoup Brewing', tags: ['Beer', 'Ballard'], icsUrl: 'stoup.ics' },
    { name: 'Tractor Tavern', tags: ['Music', 'Ballard'], icsUrl: 'tractor.ics' },
  ]

  it('returns all channels when no filters are set', () => {
    expect(filterDiscoverChannels(channels, {})).toHaveLength(3)
  })

  it('filters by category tag', () => {
    const out = filterDiscoverChannels(channels, { category: 'Music' })
    expect(out.map((c) => c.name)).toEqual(['Neumos', 'Tractor Tavern'])
  })

  it('filters by neighborhood tag', () => {
    const out = filterDiscoverChannels(channels, { neighborhood: 'Ballard' })
    expect(out.map((c) => c.name)).toEqual(['Stoup Brewing', 'Tractor Tavern'])
  })

  it('matches the search query against name (case-insensitive)', () => {
    expect(filterDiscoverChannels(channels, { query: 'neum' }).map((c) => c.name)).toEqual(['Neumos'])
  })

  it('matches the search query against tags', () => {
    expect(filterDiscoverChannels(channels, { query: 'beer' }).map((c) => c.name)).toEqual(['Stoup Brewing'])
  })

  it('combines category + neighborhood + query', () => {
    const out = filterDiscoverChannels(channels, { category: 'Music', neighborhood: 'Ballard', query: 'tractor' })
    expect(out.map((c) => c.name)).toEqual(['Tractor Tavern'])
  })

  it('treats a whitespace-only query as no query', () => {
    expect(filterDiscoverChannels(channels, { query: '   ' })).toHaveLength(3)
  })
})

describe('filterDiscoverEvents', () => {
  const channelByIcsUrl = new Map([
    ['music.ics', { tags: ['Music', 'Capitol Hill'] }],
    ['beer.ics', { tags: ['Beer', 'Ballard'] }],
  ])
  const e1 = { summary: 'Jazz Night', date: '2026-06-10T19:00', icsUrl: 'music.ics' }
  const e2 = { summary: 'Comedy Hour', date: '2026-06-11T20:00', icsUrl: 'music.ics' }
  const e3 = { summary: 'IPA Release', date: '2026-06-12T17:00', icsUrl: 'beer.ics' }
  const events = [e1, e2, e3]

  it('returns all events when no filters are set', () => {
    expect(filterDiscoverEvents(events, { channelByIcsUrl })).toHaveLength(3)
  })

  it('filters by category via the owning channel tags', () => {
    const out = filterDiscoverEvents(events, { category: 'Beer', channelByIcsUrl })
    expect(out).toEqual([e3])
  })

  it('filters by neighborhood via the owning channel tags', () => {
    const out = filterDiscoverEvents(events, { neighborhood: 'Capitol Hill', channelByIcsUrl })
    expect(out).toEqual([e1, e2])
  })

  it('filters by query via queryKeySet membership', () => {
    const queryKeySet = new Set([eventKey(e1), eventKey(e3)])
    const out = filterDiscoverEvents(events, { query: 'a', queryKeySet, channelByIcsUrl })
    expect(out).toEqual([e1, e3])
  })

  it('ignores queryKeySet when the query is blank', () => {
    const queryKeySet = new Set([eventKey(e1)])
    expect(filterDiscoverEvents(events, { query: '  ', queryKeySet, channelByIcsUrl })).toHaveLength(3)
  })

  it('combines tag filters with the search keyset', () => {
    const queryKeySet = new Set([eventKey(e1), eventKey(e2), eventKey(e3)])
    const out = filterDiscoverEvents(events, { category: 'Music', query: 'x', queryKeySet, channelByIcsUrl })
    expect(out).toEqual([e1, e2])
  })

  it('drops events whose channel is unknown when a tag filter is active', () => {
    const orphan = { summary: 'Orphan', date: '2026-06-13T18:00', icsUrl: 'missing.ics' }
    const out = filterDiscoverEvents([...events, orphan], { category: 'Music', channelByIcsUrl })
    expect(out).toEqual([e1, e2])
  })

  it('returns the full (uncapped) match list so a badge can show the true total', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ summary: `E${i}`, date: `2026-06-10T19:0${i % 10}`, icsUrl: 'music.ics' }))
    expect(filterDiscoverEvents(many, { channelByIcsUrl })).toHaveLength(250)
  })

  it('filters by cost bucket and combines with tag filters', () => {
    const free = { ...e1, cost: { min: 0 } }
    const cheap = { ...e2, cost: { min: 8 } }
    const pricey = { ...e3, cost: { min: 40 } }
    const unknown = { summary: 'Mystery', date: '2026-06-14T18:00', icsUrl: 'music.ics' }
    const all = [free, cheap, pricey, unknown]
    expect(filterDiscoverEvents(all, { cost: 'free', channelByIcsUrl })).toEqual([free])
    expect(filterDiscoverEvents(all, { cost: '10', channelByIcsUrl })).toEqual([free, cheap])
    expect(filterDiscoverEvents(all, { cost: 'free', category: 'Beer', channelByIcsUrl })).toEqual([])
  })
})

describe('eventMatchesCost', () => {
  it('matches everything when no filter is active', () => {
    expect(eventMatchesCost({}, null)).toBe(true)
    expect(eventMatchesCost({ cost: { paid: true } }, null)).toBe(true)
  })

  it('is strict: unknown-cost events match no bucket', () => {
    for (const { value } of COST_FILTER_OPTIONS) {
      expect(eventMatchesCost({}, value)).toBe(false)
    }
  })

  it('is strict: paid-amount-unknown events match no bucket', () => {
    for (const { value } of COST_FILTER_OPTIONS) {
      expect(eventMatchesCost({ cost: { paid: true } }, value)).toBe(false)
    }
  })

  it('free bucket requires min === 0', () => {
    expect(eventMatchesCost({ cost: { min: 0 } }, 'free')).toBe(true)
    expect(eventMatchesCost({ cost: { min: 0, max: 20 } }, 'free')).toBe(true)
    expect(eventMatchesCost({ cost: { min: 1 } }, 'free')).toBe(false)
  })

  it('numeric buckets compare the starting price inclusively', () => {
    expect(eventMatchesCost({ cost: { min: 10 } }, '10')).toBe(true)
    expect(eventMatchesCost({ cost: { min: 10.5 } }, '10')).toBe(false)
    expect(eventMatchesCost({ cost: { min: 0 } }, '25')).toBe(true)
    expect(eventMatchesCost({ cost: { min: 25, max: 80 } }, '25')).toBe(true)
    expect(eventMatchesCost({ cost: { min: 26 } }, '25')).toBe(false)
  })
})

describe('costLabel', () => {
  it('derives one display string per cost shape', () => {
    expect(costLabel(undefined)).toBe(null)
    expect(costLabel({ min: 0 })).toBe('Free')
    expect(costLabel({ min: 10 })).toBe('$10')
    expect(costLabel({ min: 12.5 })).toBe('$12.50')
    expect(costLabel({ min: 10, max: 45 })).toBe('From $10')
    expect(costLabel({ min: 10, max: 10 })).toBe('$10')
    expect(costLabel({ paid: true })).toBe('Ticketed')
  })
})

describe('groupIndexEventsByDay year display', () => {
  it('omits year from label and subtitle for current-year events', () => {
    const groups = groupIndexEventsByDay([{ summary: 'Show', date: '2026-09-15T19:00:00' }], NOW)
    expect(groups[0].label).not.toMatch(/\d{4}/)
    expect(groups[0].dateSubtitle).not.toMatch(/\d{4}/)
  })

  it('includes year in label and subtitle for future-year events', () => {
    const groups = groupIndexEventsByDay([{ summary: 'Show', date: '2027-03-10T19:00:00' }], NOW)
    expect(groups[0].label).toMatch(/2027/)
    expect(groups[0].dateSubtitle).toMatch(/2027/)
  })
})
