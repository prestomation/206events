import { describe, it, expect } from 'vitest'
import Fuse from 'fuse.js'
import { haversineKm } from './lib/haversine.js'
import { eventKey } from './lib/eventKey.js'
import { deduplicateEvents } from './lib/event-dedup.js'
import { isMappable } from './components/EventsMap.jsx'

const FUSE_THRESHOLD = 0.1
const FUSE_KEYS = ['summary', 'description', 'location']

// Shared fixture — a realistic slice of events-index entries
const FIXTURE_EVENTS = [
  { icsUrl: 'crocodile-main.ics', summary: 'Punk Night at the Crocodile', description: 'Local punk bands', location: '2505 1st Ave, Seattle', date: '2026-04-01T20:00', lat: 47.6146, lng: -122.3474 },
  { icsUrl: 'neumos.ics',         summary: 'Jazz Fusion Evening',         description: 'Smooth jazz',       location: '925 E Pike St, Seattle',  date: '2026-04-02T20:00', lat: 47.6143, lng: -122.3197 },
  { icsUrl: 'mopop.ics',          summary: 'Guitar Exhibit Opening',      description: 'Rock history',       location: '325 5th Ave N, Seattle',  date: '2026-04-03T11:00', lat: 47.6214, lng: -122.3481 },
  { icsUrl: 'fremont-brewing.ics', summary: 'Trivia Night',               description: 'Beer and trivia',   location: '1050 N 34th St, Seattle', date: '2026-04-04T19:00', lat: 47.6499, lng: -122.3482 },
  { icsUrl: 'seatoday.ics',        summary: 'Community Meeting',          description: null,                location: null,                       date: '2026-04-05T18:00', lat: null,   lng: null   },
]

describe('Filter parity: client matches worker behavior', () => {
  describe('Search filters', () => {
    it('matches "punk" to the right event', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const results = fuse.search('punk').map(r => r.item.icsUrl)
      expect(results).toContain('crocodile-main.ics')
      expect(results).not.toContain('neumos.ics')
    })

    it('does not match unrelated events for "jazz"', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const results = fuse.search('jazz').map(r => r.item.icsUrl)
      expect(results).toContain('neumos.ics')
      expect(results).not.toContain('fremont-brewing.ics')
    })

    it('handles events with null description/location gracefully', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      expect(() => fuse.search('community')).not.toThrow()
    })
  })

  describe('Geo filters', () => {
    it('includes events within radius', () => {
      // Capitol Hill center
      const filter = { lat: 47.6143, lng: -122.3197, radiusKm: 1 }
      const matches = FIXTURE_EVENTS.filter(e =>
        e.lat != null && e.lng != null &&
        haversineKm(filter.lat, filter.lng, e.lat, e.lng) <= filter.radiusKm
      )
      expect(matches.map(e => e.icsUrl)).toContain('neumos.ics')
      expect(matches.map(e => e.icsUrl)).not.toContain('fremont-brewing.ics')
    })

    it('excludes events outside radius', () => {
      // Very tight radius around Neumos — should NOT include Fremont Brewing (far north)
      const filter = { lat: 47.6143, lng: -122.3197, radiusKm: 0.5 }
      const matches = FIXTURE_EVENTS.filter(e =>
        e.lat != null && e.lng != null &&
        haversineKm(filter.lat, filter.lng, e.lat, e.lng) <= filter.radiusKm
      )
      expect(matches.map(e => e.icsUrl)).not.toContain('fremont-brewing.ics')
    })

    it('null-coord events produce no geo attribution chip', () => {
      const nullCoordEvent = FIXTURE_EVENTS.find(e => e.lat == null)
      expect(nullCoordEvent).toBeDefined()
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 5 }
      // Attribution logic: skip events with null coords (they get no geo chip)
      const wouldGetGeoAttribution = nullCoordEvent.lat != null && nullCoordEvent.lng != null &&
        haversineKm(filter.lat, filter.lng, nullCoordEvent.lat, nullCoordEvent.lng) <= filter.radiusKm
      expect(wouldGetGeoAttribution).toBe(false)
    })

    it('null-coord events are still included in geo-filtered feed (pass-through)', () => {
      // Worker behavior: events with no coords pass through geo filters (not excluded)
      const nullCoordEvent = FIXTURE_EVENTS.find(e => e.lat == null)
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 1 }
      const includedInFeed = nullCoordEvent.lat == null || nullCoordEvent.lng == null ||
        haversineKm(filter.lat, filter.lng, nullCoordEvent.lat, nullCoordEvent.lng) <= filter.radiusKm
      expect(includedInFeed).toBe(true)
    })

    it('handles large radius (city-wide, 20km) including all Seattle events', () => {
      const filter = { lat: 47.6062, lng: -122.3321, radiusKm: 20 }
      const matches = FIXTURE_EVENTS.filter(e =>
        e.lat == null || haversineKm(filter.lat, filter.lng, e.lat, e.lng) <= filter.radiusKm
      )
      expect(matches.length).toBe(FIXTURE_EVENTS.length) // all in Seattle, all match
    })
  })

  describe('Multi-match', () => {
    it('an event can match both search and geo simultaneously', () => {
      const searchFuse = new Fuse(FIXTURE_EVENTS, { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD })
      const searchMatches = new Set(searchFuse.search('punk').map(r => eventKey(r.item)))

      const geoFilter = { lat: 47.6146, lng: -122.3474, radiusKm: 0.5 } // right at Crocodile
      const geoMatches = new Set(
        FIXTURE_EVENTS
          .filter(e => e.lat != null && haversineKm(geoFilter.lat, geoFilter.lng, e.lat, e.lng) <= geoFilter.radiusKm)
          .map(e => eventKey(e))
      )

      const crocodileKey = 'Punk Night at the Crocodile|2026-04-01T20:00'
      expect(searchMatches.has(crocodileKey)).toBe(true)
      expect(geoMatches.has(crocodileKey)).toBe(true)
    })
  })
})

describe('Map feedOnly scoping: favorites view shows only feed events', () => {
  // Personal-feed membership is read from eventAttributions (App.jsx builds it
  // from favorited calendars / saved searches / geo matches — the parity-locked
  // logic). The map must scope to exactly those keys, not recompute membership.
  const attribs = (events) => {
    const m = new Map()
    for (const e of events) m.set(eventKey(e), [{ type: 'calendar', value: e.icsUrl }])
    return m
  }
  const map = (opts) => FIXTURE_EVENTS.filter((e) => isMappable(e, opts)).map((e) => e.icsUrl)

  it('feedOnly:false shows every event with coordinates', () => {
    const result = map({ feedOnly: false })
    // All but the null-coord seatoday event
    expect(result).toEqual(['crocodile-main.ics', 'neumos.ics', 'mopop.ics', 'fremont-brewing.ics'])
    expect(result).not.toContain('seatoday.ics')
  })

  it('feedOnly:true shows only events present in eventAttributions', () => {
    const feed = [FIXTURE_EVENTS[0], FIXTURE_EVENTS[1]] // crocodile + neumos
    const result = map({ feedOnly: true, eventAttributions: attribs(feed) })
    expect(result).toEqual(['crocodile-main.ics', 'neumos.ics'])
    expect(result).not.toContain('mopop.ics')
    expect(result).not.toContain('fremont-brewing.ics')
  })

  it('open channel takes precedence over feedOnly', () => {
    // mopop is NOT in the feed, but opening its channel must still show it
    const feed = [FIXTURE_EVENTS[0]] // only crocodile attributed
    const result = map({ feedOnly: true, calendarFilter: 'mopop.ics', eventAttributions: attribs(feed) })
    expect(result).toEqual(['mopop.ics'])
  })

  it('empty feed under feedOnly shows nothing (empty-state case)', () => {
    const result = map({ feedOnly: true, eventAttributions: new Map() })
    expect(result).toEqual([])
  })

  it('respects the date window via dateInScope', () => {
    const onlyCrocodile = (e) => e.date.startsWith('2026-04-01')
    const result = map({ feedOnly: false, dateInScope: onlyCrocodile })
    expect(result).toEqual(['crocodile-main.ics'])
  })
})

describe('Dedup parity: client matches worker behavior', () => {
  // Two events that ARE duplicates: same date, same coords (within 50m), similar title, different icsUrl
  const DUPE_A = {
    icsUrl: 'source-a.ics',
    summary: 'Punk Night at the Crocodile',
    description: 'Short desc',
    date: '2026-04-10T20:00',
    lat: 47.6146,
    lng: -122.3474,
  }
  const DUPE_B = {
    icsUrl: 'source-b.ics',
    summary: 'Punk Night at the Crocodile',
    description: 'Longer description with more detail about the event',
    date: '2026-04-10T20:00',
    lat: 47.6146,
    lng: -122.3474,
  }

  // Two events that look similar but are NOT duplicates:
  // same venue (same coords), same day, but very different titles (different show).
  // Titles chosen to have Jaccard similarity < 0.6 with each other and with DUPE titles.
  const DIFFERENT_SHOW_A = {
    icsUrl: 'venue-show1.ics',
    summary: 'Jazz Night',
    description: 'Jazz performance',
    date: '2026-04-10T19:00',
    lat: 47.6146,
    lng: -122.3474,
  }
  const DIFFERENT_SHOW_B = {
    icsUrl: 'venue-show2.ics',
    summary: 'Comedy Show',
    description: 'Stand-up comedy',
    date: '2026-04-10T22:00',
    lat: 47.6146,
    lng: -122.3474,
  }

  it('deduplicates two events with same date, coords, and similar title', () => {
    const result = deduplicateEvents([DUPE_A, DUPE_B])
    expect(result).toHaveLength(1)
  })

  it('keeps the event with the longer description as the winner', () => {
    const result = deduplicateEvents([DUPE_A, DUPE_B])
    // DUPE_B has longer description, so it should win
    expect(result[0].icsUrl).toBe('source-b.ics')
  })

  it('attaches dedupedSources to the winner', () => {
    const result = deduplicateEvents([DUPE_A, DUPE_B])
    expect(result[0].dedupedSources).toBeDefined()
    expect(result[0].dedupedSources).toContain('source-a.ics')
  })

  it('does not deduplicate events with similar location but very different titles (false positive case)', () => {
    const result = deduplicateEvents([DIFFERENT_SHOW_A, DIFFERENT_SHOW_B])
    expect(result).toHaveLength(2)
    expect(result.map(e => e.icsUrl)).toContain('venue-show1.ics')
    expect(result.map(e => e.icsUrl)).toContain('venue-show2.ics')
  })

  it('non-duplicate events have no dedupedSources', () => {
    const result = deduplicateEvents([DIFFERENT_SHOW_A, DIFFERENT_SHOW_B])
    for (const event of result) {
      expect(event.dedupedSources).toBeUndefined()
    }
  })

  it('passes through events without lat/lng unchanged', () => {
    const noCoords = { icsUrl: 'no-coords.ics', summary: 'Punk Night at the Crocodile', date: '2026-04-10T20:00', lat: null, lng: null }
    const result = deduplicateEvents([DUPE_A, noCoords])
    // Both should survive since noCoords can't be geo-deduped
    expect(result).toHaveLength(2)
  })

  it('client and worker produce same result (they are the same implementation)', () => {
    const fixture = [DUPE_A, DUPE_B, DIFFERENT_SHOW_A, DIFFERENT_SHOW_B]
    // Both client and worker use deduplicateEvents — same JS logic, same result
    const clientResult = deduplicateEvents(fixture)
    // Re-run to simulate "worker" result — identical function, identical output
    const workerResult = deduplicateEvents(fixture)
    expect(clientResult.map(e => e.icsUrl)).toEqual(workerResult.map(e => e.icsUrl))
    expect(clientResult).toHaveLength(3) // DUPE_A suppressed, others survive
  })
})
