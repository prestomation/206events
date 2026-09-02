import { describe, it, expect } from 'vitest'
import {
  normalizeTitle,
  quantizeCoord,
  groupKey,
  groupEvents,
  groupByVenue,
  venueNameKey,
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

describe('groupByVenue', () => {
  // ~1km east of VENUE — comfortably outside the ~50m identity grid.
  const OTHER = { lat: 47.6163, lng: -122.3075 }

  it('merges series from DIFFERENT source feeds at one coordinate', () => {
    // The whole point of dropping icsUrl from the venue key: two feeds listing
    // shows at Neumos are one place, not two pins.
    const venues = groupByVenue(groupEvents([
      ev({ icsUrl: 'a.ics', summary: 'Jazz Night', location: 'Neumos, Capitol Hill' }),
      ev({ icsUrl: 'b.ics', summary: 'Punk Matinee', location: 'Neumos, Capitol Hill' }),
    ]))
    expect(venues).toHaveLength(1)
    expect(venues[0].seriesCount).toBe(2)
    expect(venues[0].label).toBe('Neumos, Capitol Hill')
  })

  it('keeps distant coordinates as separate venues', () => {
    const venues = groupByVenue(groupEvents([
      ev({ summary: 'Here' }),
      ev({ summary: 'There', ...OTHER }),
    ]))
    expect(venues).toHaveLength(2)
  })

  it('merges coordinates within the identity grid (geocoding jitter)', () => {
    const venues = groupByVenue(groupEvents([
      ev({ summary: 'One' }),
      ev({ summary: 'Two', lat: VENUE.lat + GROUP_COORD_EPSILON_DEG / 3 }),
    ]))
    expect(venues).toHaveLength(1)
    expect(venues[0].seriesCount).toBe(2)
  })

  it('sums dateCount across every series and counts the series', () => {
    const venues = groupByVenue(groupEvents([
      ev({ summary: 'Long Run', date: '2026-07-01T19:00:00-07:00' }),
      ev({ summary: 'Long Run', date: '2026-07-02T19:00:00-07:00' }),
      ev({ summary: 'Long Run', date: '2026-07-03T19:00:00-07:00' }),
      ev({ summary: 'One Off', date: '2026-07-05T19:00:00-07:00' }),
    ]))
    expect(venues).toHaveLength(1)
    expect(venues[0].seriesCount).toBe(2)
    expect(venues[0].dateCount).toBe(4)
  })

  it('picks the MODAL location so one mislabelled instance cannot rename the venue', () => {
    const venues = groupByVenue(groupEvents([
      ev({ summary: 'A', date: '2026-07-01T19:00:00-07:00', location: 'Neumos, Capitol Hill' }),
      ev({ summary: 'A', date: '2026-07-08T19:00:00-07:00', location: 'Neumos, Capitol Hill' }),
      ev({ summary: 'B', date: '2026-07-02T19:00:00-07:00', location: 'neumos (typo)' }),
    ]))
    expect(venues[0].label).toBe('Neumos, Capitol Hill')
  })

  it('falls back to an empty label when no instance carries a location', () => {
    const venues = groupByVenue(groupEvents([ev({ location: undefined })]))
    expect(venues[0].label).toBe('')
  })

  it('orders series earliest-first, breaking ties on date count then input order', () => {
    const venues = groupByVenue(groupEvents([
      ev({ summary: 'Later', date: '2026-07-20T19:00:00-07:00' }),
      ev({ summary: 'Earlier', date: '2026-07-02T19:00:00-07:00' }),
    ]))
    expect(venues[0].series.map((g) => g.summary)).toEqual(['Earlier', 'Later'])
  })

  it('is deterministic across a shuffled input', () => {
    const events = [
      ev({ summary: 'Alpha', date: '2026-07-03T19:00:00-07:00' }),
      ev({ summary: 'Beta', date: '2026-07-01T19:00:00-07:00' }),
      ev({ summary: 'Gamma', date: '2026-07-02T19:00:00-07:00' }),
    ]
    const a = groupByVenue(groupEvents(events)).map((v) => v.series.map((g) => g.summary))
    const b = groupByVenue(groupEvents([...events].reverse())).map((v) => v.series.map((g) => g.summary))
    expect(a).toEqual(b)
    expect(a).toEqual([['Beta', 'Gamma', 'Alpha']])
  })

  // Regression: `discover-slu` declares one ripper-level `geo` (its office) and
  // stamps it on all 43 events it publishes, which actually happen at 17
  // different places. Keying on the coordinate alone merged the whole
  // neighbourhood into one pin and named it after whichever location string was
  // most common, so the South Lake Union Farmers Market at The Spheres was
  // filed under "The Behnke Family Gallery".
  it('does NOT merge differently-named places that share one stamped coordinate', () => {
    const venues = groupByVenue(groupEvents([
      ev({ summary: 'Farmers Market', location: 'The Spheres, South Lake Union, Seattle, WA' }),
      ev({ summary: 'Gallery Walk', location: 'The Behnke Family Gallery, South Lake Union, Seattle, WA' }),
      ev({ summary: 'Trivia', location: 'Tapster, South Lake Union, Seattle, WA' }),
    ]))
    expect(venues).toHaveLength(3)
    expect(venues.map((v) => v.label.split(',')[0]).sort())
      .toEqual(['Tapster', 'The Behnke Family Gallery', 'The Spheres'])
  })

  it('still merges one place named slightly differently by two feeds', () => {
    const venues = groupByVenue(groupEvents([
      ev({ icsUrl: 'a.ics', summary: 'One', location: 'Seattle Center, 305 Harrison St, Seattle, WA 98109' }),
      ev({ icsUrl: 'b.ics', summary: 'Two', location: 'Seattle Center' }),
    ]))
    expect(venues).toHaveLength(1)
    expect(venues[0].seriesCount).toBe(2)
  })

  it('groups by coordinate alone when no event names a place', () => {
    const venues = groupByVenue(groupEvents([
      ev({ summary: 'One', location: undefined }),
      ev({ summary: 'Two', location: '' }),
    ]))
    expect(venues).toHaveLength(1)
    expect(venues[0].seriesCount).toBe(2)
  })

  it('returns an empty array for empty input', () => {
    expect(groupByVenue([])).toEqual([])
  })

  it('carries the representative coordinate onto the venue', () => {
    const venues = groupByVenue(groupEvents([ev()]))
    expect(venues[0].lat).toBe(VENUE.lat)
    expect(venues[0].lng).toBe(VENUE.lng)
  })
})

describe('venueNameKey', () => {
  it('keeps only the leading segment, so an address tail does not split a place', () => {
    expect(venueNameKey('Seattle Center, 305 Harrison St, Seattle, WA 98109'))
      .toBe(venueNameKey('Seattle Center'))
  })

  it('ignores a leading "the", case and punctuation', () => {
    expect(venueNameKey('The Spheres')).toBe(venueNameKey('spheres'))
    expect(venueNameKey("Glazer's Camera")).toBe(venueNameKey('Glazers Camera'))
  })

  it('keeps genuinely different places apart', () => {
    expect(venueNameKey('The Spheres, South Lake Union'))
      .not.toBe(venueNameKey('The Behnke Family Gallery, South Lake Union'))
  })

  it('is empty when nothing is named', () => {
    expect(venueNameKey('')).toBe('')
    expect(venueNameKey(undefined)).toBe('')
  })
})
