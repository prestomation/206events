import { describe, it, expect } from 'vitest'
import { eventInWindow, describeWindow, isDateRange, normalizeDateRange, DATE_WINDOW_STOPS, channelFromCalendar, formatTimeRange, rowFromIndexEvent, groupIndexEventsByDay, dayIndexForScrubber, isoDayKey, filterDiscoverChannels, filterDiscoverEvents, eventMatchesCost, costLabel, costClass, COST_FILTER_OPTIONS, parseIndexDate } from './viewModels.js'
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

describe('isDateRange / normalizeDateRange', () => {
  it('recognizes a well-formed range object', () => {
    expect(isDateRange({ start: '2026-07-24', end: '2026-07-28' })).toBe(true)
  })

  it('rejects non-range values', () => {
    expect(isDateRange('all')).toBe(false)
    expect(isDateRange(7)).toBe(false)
    expect(isDateRange(null)).toBe(false)
    expect(isDateRange({ start: '2026-07-24' })).toBe(false) // missing end
  })

  it('normalizes valid ranges and swaps reversed ones', () => {
    expect(normalizeDateRange({ start: '2026-07-24', end: '2026-07-28' }))
      .toEqual({ start: '2026-07-24', end: '2026-07-28' })
    expect(normalizeDateRange({ start: '2026-07-28', end: '2026-07-24' }))
      .toEqual({ start: '2026-07-24', end: '2026-07-28' }) // swapped
  })

  it('returns null for malformed or impossible dates', () => {
    expect(normalizeDateRange({ start: '2026-02-31', end: '2026-07-28' })).toBeNull() // Feb 31 rolls over
    expect(normalizeDateRange({ start: 'nope', end: '2026-07-28' })).toBeNull()
    expect(normalizeDateRange({ start: '2026/07/24', end: '2026-07-28' })).toBeNull() // wrong separator
    expect(normalizeDateRange(null)).toBeNull()
  })
})

describe('eventInWindow (custom range)', () => {
  const range = { start: '2026-07-24', end: '2026-07-28' }

  it('matches days inside the inclusive range, including both edges', () => {
    expect(eventInWindow({ date: '2026-07-24T00:30' }, range, NOW)).toBe(true) // start edge
    expect(eventInWindow({ date: '2026-07-26T08:00' }, range, NOW)).toBe(true) // middle
    expect(eventInWindow({ date: '2026-07-28T23:30' }, range, NOW)).toBe(true) // end edge (late)
  })

  it('excludes days just outside the range', () => {
    expect(eventInWindow({ date: '2026-07-23T23:00' }, range, NOW)).toBe(false)
    expect(eventInWindow({ date: '2026-07-29T00:30' }, range, NOW)).toBe(false)
  })

  it('is absolute, not anchored to "now" like a numeric window', () => {
    // A range entirely before NOW still matches its days (past-event exclusion
    // is upcomingIndexEvents' job, not this helper's, for ranges as for 'all').
    expect(eventInWindow({ date: '2026-05-15T19:00' }, { start: '2026-05-10', end: '2026-05-20' }, NOW)).toBe(true)
  })

  it('normalizes a reversed range before testing', () => {
    expect(eventInWindow({ date: '2026-07-26T19:00' }, { start: '2026-07-28', end: '2026-07-24' }, NOW)).toBe(true)
  })

  it('returns false for an unparseable event date', () => {
    expect(eventInWindow({ date: 'not-a-date' }, range, NOW)).toBe(false)
  })

  it('treats a malformed range as no filter (matches everything)', () => {
    expect(eventInWindow({ date: '2030-01-01T19:00' }, { start: 'bad', end: '2026-07-28' }, NOW)).toBe(true)
  })
})

describe('describeWindow (custom range)', () => {
  it('labels a same-month range compactly', () => {
    expect(describeWindow({ start: '2026-07-24', end: '2026-07-28' }, NOW).relative).toBe('Jul 24 – 28')
  })

  it('labels a cross-month range with both months', () => {
    expect(describeWindow({ start: '2026-07-28', end: '2026-08-02' }, NOW).relative).toBe('Jul 28 – Aug 2')
  })

  it('labels a single-day range as one date', () => {
    expect(describeWindow({ start: '2026-07-24', end: '2026-07-24' }, NOW).relative).toBe('Jul 24')
  })

  it('appends the year when the range is outside the current year', () => {
    const label = describeWindow({ start: '2027-01-02', end: '2027-01-05' }, NOW).relative
    expect(label).toContain('2027')
    expect(label).toContain('–')
  })

  it('carries no absoluteEnd (the dates live in the relative phrase)', () => {
    expect(describeWindow({ start: '2026-07-24', end: '2026-07-28' }, NOW).absoluteEnd).toBeNull()
  })

  it('falls back to "All upcoming" for a malformed range', () => {
    expect(describeWindow({ start: 'bad', end: 'worse' }, NOW)).toEqual({ relative: 'All upcoming', absoluteEnd: null })
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

describe('parseIndexDate', () => {
  it('parses a full ISO 8601 offset string with seconds', () => {
    const r = parseIndexDate('2026-06-18T17:00:00-07:00[America/Los_Angeles]')
    expect(r.date.toISOString()).toBe('2026-06-19T00:00:00.000Z')
    expect(r.timezone).toBe('America/Los_Angeles')
  })

  it('parses an offset string WITHOUT seconds (Safari bug guard)', () => {
    // Safari historically ignores the UTC offset when seconds are absent, making
    // new Date("2026-06-18T17:00-07:00") return 5 PM UTC (10 AM PDT) instead of
    // midnight UTC (5 PM PDT). parseIndexDate must normalize before parsing.
    const r = parseIndexDate('2026-06-18T17:00-07:00[America/Los_Angeles]')
    expect(r.date.toISOString()).toBe('2026-06-19T00:00:00.000Z')
    expect(r.timezone).toBe('America/Los_Angeles')
  })

  it('parses a UTC Z-suffix string without seconds', () => {
    const r = parseIndexDate('2026-06-15T19:00Z')
    expect(r.date.toISOString()).toBe('2026-06-15T19:00:00.000Z')
    expect(r.timezone).toBeUndefined()
  })

  it('parses a PST (-08:00) string without seconds', () => {
    const r = parseIndexDate('2026-02-15T19:00-08:00[America/Los_Angeles]')
    expect(r.date.toISOString()).toBe('2026-02-16T03:00:00.000Z')
    expect(r.timezone).toBe('America/Los_Angeles')
  })

  it('returns null for null/undefined', () => {
    expect(parseIndexDate(null)).toBeNull()
    expect(parseIndexDate(undefined)).toBeNull()
    expect(parseIndexDate('')).toBeNull()
  })

  it('caches by string yet returns equal-but-distinct, mutation-safe Dates', () => {
    // The parse is memoized (O-4), but each call must mint a fresh Date so a
    // caller mutating one result can't corrupt a later call's value.
    const str = '2026-06-18T17:00:00-07:00[America/Los_Angeles]'
    const a = parseIndexDate(str)
    const b = parseIndexDate(str)
    expect(a.date.getTime()).toBe(b.date.getTime())
    expect(a.timezone).toBe(b.timezone)
    expect(a.date).not.toBe(b.date)
    a.date.setFullYear(1999)
    expect(parseIndexDate(str).date.toISOString()).toBe('2026-06-19T00:00:00.000Z')
  })

  it('caches unparseable strings without re-running the regex', () => {
    expect(parseIndexDate('not-a-date')).toBeNull()
    expect(parseIndexDate('not-a-date')).toBeNull()
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

  it('is strict: sold-out events match no bucket', () => {
    for (const { value } of COST_FILTER_OPTIONS) {
      expect(eventMatchesCost({ cost: { soldOut: true } }, value)).toBe(false)
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
    expect(costLabel({ soldOut: true })).toBe('Sold out')
  })
})

describe('costClass', () => {
  it('maps each cost shape to its row modifier class', () => {
    expect(costClass(undefined)).toBe('')
    expect(costClass({ min: 0 })).toBe(' ev-cost--free')
    expect(costClass({ min: 10 })).toBe('')
    expect(costClass({ paid: true })).toBe('')
    expect(costClass({ soldOut: true })).toBe(' ev-cost--soldout')
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

  it('tags each group with a stable YYYY-MM-DD dayKey matching the scrubber', () => {
    const groups = groupIndexEventsByDay([{ summary: 'Show', date: at(3) }], NOW)
    expect(groups[0].dayKey).toBe('2026-06-04')
  })
})

describe('dayIndexForScrubber', () => {
  it('emits one tick per distinct day with the first event index', () => {
    const events = [
      { summary: 'A', date: at(0, 10) },
      { summary: 'B', date: at(0, 20) }, // same day → no new tick
      { summary: 'C', date: at(2, 19) },
      { summary: 'D', date: at(5, 19) },
    ]
    const ticks = dayIndexForScrubber(events, NOW)
    expect(ticks.map((t) => t.dayKey)).toEqual(['2026-06-01', '2026-06-03', '2026-06-06'])
    expect(ticks.map((t) => t.firstIndex)).toEqual([0, 2, 3])
  })

  it('labels today and tomorrow, and carries a month label', () => {
    const ticks = dayIndexForScrubber([
      { summary: 'A', date: at(0) },
      { summary: 'B', date: at(1) },
      { summary: 'C', date: at(9) },
    ], NOW)
    expect(ticks[0].dayLabel).toBe('Today')
    expect(ticks[1].dayLabel).toBe('Tomorrow')
    expect(ticks[2].monthLabel).toMatch(/Jun/)
  })

  it('skips unparseable dates without emitting a tick', () => {
    const ticks = dayIndexForScrubber([
      { summary: 'bad', date: 'not-a-date' },
      { summary: 'ok', date: at(1) },
    ], NOW)
    expect(ticks).toHaveLength(1)
    expect(ticks[0].firstIndex).toBe(1)
  })
})

describe('isoDayKey', () => {
  it('zero-pads month and day', () => {
    expect(isoDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(isoDayKey(new Date(2026, 10, 20))).toBe('2026-11-20')
  })
})
