import { describe, it, expect } from 'vitest'
import Fuse from 'fuse.js'
import { haversineKm } from './lib/haversine.js'
import { eventKey } from './lib/eventKey.js'
import { deduplicateEvents } from './lib/event-dedup.js'
import { isMappable } from './components/EventsMap.jsx'

const FUSE_THRESHOLD = 0.1
// Must match the worker (infra/favorites-worker/src/event-search.ts) and App.jsx.
// ignoreLocation lets a term match anywhere in the field, not just near its start.
const FUSE_IGNORE_LOCATION = true
const FUSE_KEYS = ['summary', 'description', 'location']
const FUSE_OPTIONS = { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD, ignoreLocation: FUSE_IGNORE_LOCATION }

// Shared fixture — a realistic slice of events-index entries
const FIXTURE_EVENTS = [
  { icsUrl: 'crocodile-main.ics', summary: 'Punk Night at the Crocodile', description: 'Local punk bands', location: '2505 1st Ave, Seattle', date: '2026-04-01T20:00', lat: 47.6146, lng: -122.3474 },
  { icsUrl: 'neumos.ics',         summary: 'Jazz Fusion Evening',         description: 'Smooth jazz',       location: '925 E Pike St, Seattle',  date: '2026-04-02T20:00', lat: 47.6143, lng: -122.3197 },
  { icsUrl: 'mopop.ics',          summary: 'Guitar Exhibit Opening',      description: 'Rock history',       location: '325 5th Ave N, Seattle',  date: '2026-04-03T11:00', lat: 47.6214, lng: -122.3481 },
  { icsUrl: 'fremont-brewing.ics', summary: 'Trivia Night',               description: 'Beer and trivia',   location: '1050 N 34th St, Seattle', date: '2026-04-04T19:00', lat: 47.6499, lng: -122.3482 },
  { icsUrl: 'seatoday.ics',        summary: 'Community Meeting',          description: null,                location: null,                       date: '2026-04-05T18:00', lat: null,   lng: null   },
  // Regression fixture: search terms that appear in the MIDDLE/END of the field.
  // With Fuse's default location scoring + threshold 0.1 these never matched
  // (e.g. searching "Elton" or "John" returned nothing; only "choir" near the
  // start matched). ignoreLocation: true fixes this.
  { icsUrl: 'moore.ics',          summary: 'One Night Without Elton John: A Choir Tribute', description: 'Choir performs Elton John hits', location: '1932 2nd Ave, Seattle', date: '2026-04-06T20:00', lat: 47.6131, lng: -122.3411 },
]

describe('Filter parity: client matches worker behavior', () => {
  describe('Search filters', () => {
    it('matches "punk" to the right event', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, FUSE_OPTIONS)
      const results = fuse.search('punk').map(r => r.item.icsUrl)
      expect(results).toContain('crocodile-main.ics')
      expect(results).not.toContain('neumos.ics')
    })

    it('does not match unrelated events for "jazz"', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, FUSE_OPTIONS)
      const results = fuse.search('jazz').map(r => r.item.icsUrl)
      expect(results).toContain('neumos.ics')
      expect(results).not.toContain('fremont-brewing.ics')
    })

    it('handles events with null description/location gracefully', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, FUSE_OPTIONS)
      expect(() => fuse.search('community')).not.toThrow()
    })

    // Regression: terms in the middle/end of a field must match (ignoreLocation).
    it.each(['Elton', 'John', 'Tribute', 'choir'])(
      'matches mid/late-field term "%s" anywhere in the summary',
      (term) => {
        const fuse = new Fuse(FIXTURE_EVENTS, FUSE_OPTIONS)
        const results = fuse.search(term).map(r => r.item.icsUrl)
        expect(results).toContain('moore.ics')
      }
    )

    it('matches a term found only in the description, not the summary', () => {
      const fuse = new Fuse(FIXTURE_EVENTS, FUSE_OPTIONS)
      const results = fuse.search('performs').map(r => r.item.icsUrl)
      expect(results).toContain('moore.ics')
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
      const searchFuse = new Fuse(FIXTURE_EVENTS, FUSE_OPTIONS)
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
    expect(result).toEqual(['crocodile-main.ics', 'neumos.ics', 'mopop.ics', 'fremont-brewing.ics', 'moore.ics'])
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

describe('Per-list parity: client(active list) === server(list by token)', () => {
  // Two lists with distinct filters. The client filters using the ACTIVE list's
  // arrays; the worker (feed.ts) resolves the SAME list via the feed token's
  // listId and runs the identical Fuse/haversine logic. This asserts the per-list
  // resolution wiring feeds both sides the same filter arrays → same matches.
  const LISTS = [
    { id: 'default', name: 'My Favorites', feedToken: 'tok-default', searchFilters: ['jazz'], geoFilters: [] },
    { id: 'date-night', name: 'Date Night', feedToken: 'tok-date', searchFilters: ['punk'], geoFilters: [{ lat: 47.6499, lng: -122.3482, radiusKm: 0.5 }] },
  ]
  // Worker-style token → {userId, listId} reverse lookup (see feed.ts).
  const TOKENS = { 'tok-default': { listId: 'default' }, 'tok-date': { listId: 'date-night' } }
  const resolveList = (listId) => LISTS.find((l) => l.id === listId) || LISTS[0]

  // Shared matching used by BOTH sides (mirrors App.jsx + event-search.ts/feed.ts).
  const matchKeys = (list) => {
    const keys = new Set()
    const fuse = new Fuse(FIXTURE_EVENTS, FUSE_OPTIONS)
    for (const f of list.searchFilters) for (const r of fuse.search(f)) keys.add(eventKey(r.item))
    for (const e of FIXTURE_EVENTS) {
      if (e.lat == null || e.lng == null) continue
      for (const g of list.geoFilters) {
        if (haversineKm(g.lat, g.lng, e.lat, e.lng) <= g.radiusKm) keys.add(eventKey(e))
      }
    }
    return keys
  }

  it('each list resolves to a distinct matched set', () => {
    const def = matchKeys(resolveList('default'))
    const date = matchKeys(resolveList('date-night'))
    // 'jazz' list matches neumos; 'punk' + Fremont geo matches crocodile + fremont.
    expect([...def]).toContain('Jazz Fusion Evening|2026-04-02T20:00')
    expect([...def]).not.toContain('Punk Night at the Crocodile|2026-04-01T20:00')
    expect([...date]).toContain('Punk Night at the Crocodile|2026-04-01T20:00')
    expect([...date]).toContain('Trivia Night|2026-04-04T19:00') // Fremont geo match
    expect([...date]).not.toContain('Jazz Fusion Evening|2026-04-02T20:00')
  })

  it('client(active list) and server(list by token) produce identical sets', () => {
    for (const token of Object.keys(TOKENS)) {
      const serverList = resolveList(TOKENS[token].listId)        // worker side
      const clientList = LISTS.find((l) => l.feedToken === token) // active list on client
      const serverKeys = [...matchKeys(serverList)].sort()
      const clientKeys = [...matchKeys(clientList)].sort()
      expect(clientKeys).toEqual(serverKeys)
    }
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
