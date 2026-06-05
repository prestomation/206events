import { describe, it, expect } from 'vitest'
import {
  normalizeTitle,
  quantizeCoord,
  groupKey,
  groupEvents,
  GROUP_COORD_EPSILON_DEG,
} from './event-grouping.js'

// A venue coordinate (Neumos, Capitol Hill) reused across the series tests.
const VENUE = { lat: 47.6163, lng: -122.3209 }

// Build an event instance with sensible defaults.
function ev(overrides = {}) {
  return {
    icsUrl: 'venue-main.ics',
    summary: 'Some Show',
    date: '2026-07-01T19:00:00-07:00',
    lat: VENUE.lat,
    lng: VENUE.lng,
    ...overrides,
  }
}

describe('normalizeTitle', () => {
  it('folds case and collapses whitespace', () => {
    expect(normalizeTitle('  Hamilton   Live  ')).toBe('hamilton live')
  })

  it('strips a trailing showtime qualifier', () => {
    expect(normalizeTitle('Hamilton - Evening')).toBe('hamilton')
    expect(normalizeTitle('Hamilton (Matinee)')).toBe('hamilton')
    expect(normalizeTitle('Hamilton: 8pm')).toBe('hamilton')
    expect(normalizeTitle('Hamilton - 7:30')).toBe('hamilton')
  })

  it('peels multiple trailing qualifiers', () => {
    expect(normalizeTitle('The Show - Evening (Sold Out)')).toBe('the show')
  })

  it('preserves real subtitles (only qualifier-only tails are stripped)', () => {
    expect(normalizeTitle('Hamilton - An American Musical')).toBe('hamilton - an american musical')
  })

  it('does not collapse clearly different titles to the same value', () => {
    expect(normalizeTitle('Romeo and Juliet')).not.toBe(normalizeTitle('Macbeth'))
  })

  it('handles nullish input', () => {
    expect(normalizeTitle(undefined)).toBe('')
    expect(normalizeTitle(null)).toBe('')
  })
})

describe('quantizeCoord', () => {
  it('snaps jitter within ~50m to the same token', () => {
    // ~half an epsilon apart -> same grid cell
    const a = quantizeCoord(VENUE.lat)
    const b = quantizeCoord(VENUE.lat + GROUP_COORD_EPSILON_DEG * 0.3)
    expect(a).toBe(b)
  })

  it('distinguishes coordinates several cells apart', () => {
    const a = quantizeCoord(VENUE.lat)
    const b = quantizeCoord(VENUE.lat + GROUP_COORD_EPSILON_DEG * 5)
    expect(a).not.toBe(b)
  })

  it('returns "na" for missing/non-finite coords', () => {
    expect(quantizeCoord(undefined)).toBe('na')
    expect(quantizeCoord(NaN)).toBe('na')
  })
})

describe('groupKey', () => {
  it('prefers a seriesId when present', () => {
    expect(groupKey(ev({ seriesId: 'abc' }))).toBe('series:abc')
  })

  it('matches same title + venue + source', () => {
    expect(groupKey(ev({ summary: 'Hamilton - Evening' }))).toBe(groupKey(ev({ summary: 'Hamilton (Matinee)' })))
  })

  it('differs across venues', () => {
    expect(groupKey(ev())).not.toBe(groupKey(ev({ lat: 47.5, lng: -122.4 })))
  })

  it('differs across source feeds', () => {
    expect(groupKey(ev())).not.toBe(groupKey(ev({ icsUrl: 'other-feed.ics' })))
  })
})

describe('groupEvents', () => {
  it('collapses N instances of one series at a venue into a single group', () => {
    const events = [
      ev({ summary: 'Cats', date: '2026-07-03T19:00:00-07:00' }),
      ev({ summary: 'Cats', date: '2026-07-01T19:00:00-07:00' }),
      ev({ summary: 'Cats', date: '2026-07-02T19:00:00-07:00' }),
    ]
    const groups = groupEvents(events)
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(3)
    // instances sorted by date ascending
    expect(groups[0].instances.map((e) => e.date)).toEqual([
      '2026-07-01T19:00:00-07:00',
      '2026-07-02T19:00:00-07:00',
      '2026-07-03T19:00:00-07:00',
    ])
  })

  it('fuzzy-merges showtime title variants (Hamilton / Hamilton - Evening)', () => {
    const events = [
      ev({ summary: 'Hamilton', date: '2026-07-01T14:00:00-07:00' }),
      ev({ summary: 'Hamilton - Evening', date: '2026-07-01T20:00:00-07:00' }),
    ]
    const groups = groupEvents(events)
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })

  it('keeps the same title at two venues as two groups', () => {
    const events = [
      ev({ summary: 'Touring Show', lat: 47.61, lng: -122.32 }),
      ev({ summary: 'Touring Show', lat: 47.65, lng: -122.30 }),
    ]
    const groups = groupEvents(events)
    expect(groups).toHaveLength(2)
  })

  it('keeps the same title from two source feeds as two groups', () => {
    const events = [
      ev({ summary: 'Trivia Night', icsUrl: 'feed-a.ics' }),
      ev({ summary: 'Trivia Night', icsUrl: 'feed-b.ics' }),
    ]
    const groups = groupEvents(events)
    expect(groups).toHaveLength(2)
  })

  it('groups matinee + evening on the same day into one group with two instances', () => {
    const events = [
      ev({ summary: 'Wicked (Matinee)', date: '2026-07-04T14:00:00-07:00' }),
      ev({ summary: 'Wicked (Evening)', date: '2026-07-04T20:00:00-07:00' }),
    ]
    const groups = groupEvents(events)
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })

  it('does not merge clearly different shows at the same venue', () => {
    const events = [
      ev({ summary: 'Jazz Night' }),
      ev({ summary: 'Comedy Open Mic' }),
    ]
    const groups = groupEvents(events)
    expect(groups).toHaveLength(2)
  })

  it('treats a single one-off event as a group of one', () => {
    const groups = groupEvents([ev({ summary: 'Solo Gig' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(1)
  })

  it('returns an empty array for empty input', () => {
    expect(groupEvents([])).toEqual([])
  })

  it('short-circuits on seriesId across venues', () => {
    const events = [
      ev({ summary: 'A', seriesId: 's1', lat: 47.61, lng: -122.32 }),
      ev({ summary: 'B', seriesId: 's1', lat: 47.65, lng: -122.30 }),
    ]
    const groups = groupEvents(events)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('series:s1')
    expect(groups[0].count).toBe(2)
  })

  it('reflects only the instances it is given (count tracks the pre-filtered window)', () => {
    // Simulating an already-date-windowed set: only 2 of a longer run passed in.
    const windowed = [
      ev({ summary: 'Long Run', date: '2026-07-10T19:00:00-07:00' }),
      ev({ summary: 'Long Run', date: '2026-07-11T19:00:00-07:00' }),
    ]
    expect(groupEvents(windowed)[0].count).toBe(2)
  })

  it('produces deterministic group order (first-seen by input)', () => {
    const events = [
      ev({ summary: 'Zeta Show' }),
      ev({ summary: 'Alpha Show' }),
    ]
    const keys = groupEvents(events).map((g) => g.summary)
    expect(keys).toEqual(['Zeta Show', 'Alpha Show'])
  })
})
