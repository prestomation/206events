import { describe, it, expect } from 'vitest'
import { isWithinClampBounds, collectFitPoints, isMappable } from './EventsMap.jsx'
import { eventKey } from '../lib/eventKey.js'
import cityConfig from '../../../city.config.ts'

// Reference coordinates derived from the configured clamp bounds so the
// suite passes for any city the template is configured for. For the Seattle
// config these correspond to: CENTER ≈ downtown/Eastside, IN_NORTH ≈
// Shoreline, IN_SOUTH ≈ Federal Way, and the OUT_* points to the Gorge,
// Everett, and Tacoma.
const B = cityConfig.map.clampBounds
const midLat = (B.south + B.north) / 2
const midLng = (B.west + B.east) / 2
const CENTER = { lat: midLat, lng: midLng }
const IN_EAST = { lat: midLat, lng: B.east - 0.01 }
const IN_NORTH = { lat: B.north - 0.01, lng: midLng }
const IN_SOUTH = { lat: B.south + 0.01, lng: midLng }
const OUT_FAR_EAST = { lat: midLat, lng: B.east + 2 }
const OUT_NORTH = { lat: B.north + 0.2, lng: midLng }
const OUT_SOUTHWEST = { lat: B.south - 0.05, lng: B.west - 0.03 }

describe('isWithinClampBounds', () => {
  it('keeps the center of the configured bounds', () => {
    expect(isWithinClampBounds(CENTER.lat, CENTER.lng)).toBe(true)
  })

  it('keeps points near the eastern edge', () => {
    expect(isWithinClampBounds(IN_EAST.lat, IN_EAST.lng)).toBe(true)
  })

  it('keeps points near the north and south edges', () => {
    expect(isWithinClampBounds(IN_NORTH.lat, IN_NORTH.lng)).toBe(true)
    expect(isWithinClampBounds(IN_SOUTH.lat, IN_SOUTH.lng)).toBe(true)
  })

  it('excludes far out-of-region points', () => {
    expect(isWithinClampBounds(OUT_FAR_EAST.lat, OUT_FAR_EAST.lng)).toBe(false)
  })

  it('excludes points just beyond the bounds', () => {
    expect(isWithinClampBounds(OUT_NORTH.lat, OUT_NORTH.lng)).toBe(false)
    expect(isWithinClampBounds(OUT_SOUTHWEST.lat, OUT_SOUTHWEST.lng)).toBe(false)
  })
})

describe('collectFitPoints', () => {
  it('drops distant outliers but keeps in-bounds events', () => {
    const events = [CENTER, IN_EAST, OUT_FAR_EAST]
    const points = collectFitPoints(events, [])
    expect(points).toContainEqual([CENTER.lat, CENTER.lng])
    expect(points).toContainEqual([IN_EAST.lat, IN_EAST.lng])
    expect(points).not.toContainEqual([OUT_FAR_EAST.lat, OUT_FAR_EAST.lng])
    expect(points).toHaveLength(2)
  })

  it('always appends geo-filter corner points', () => {
    const gf = { lat: CENTER.lat, lng: CENTER.lng, radiusKm: 5 }
    const points = collectFitPoints([CENTER], [gf])
    const latDeg = gf.radiusKm / 111
    const lngDeg = gf.radiusKm / (111 * Math.cos(gf.lat * Math.PI / 180))
    expect(points).toContainEqual([gf.lat + latDeg, gf.lng + lngDeg])
    expect(points).toContainEqual([gf.lat - latDeg, gf.lng - lngDeg])
  })

  it('falls back to all events when none are in-bounds', () => {
    const points = collectFitPoints([OUT_FAR_EAST], [])
    expect(points).toContainEqual([OUT_FAR_EAST.lat, OUT_FAR_EAST.lng])
    expect(points).toHaveLength(1)
  })

  it('ignores events missing coordinates', () => {
    const points = collectFitPoints([CENTER, { summary: 'no coords' }], [])
    expect(points).toHaveLength(1)
  })

  it('trims sparse tails so far-flung in-bounds events do not stretch the fit', () => {
    // A dense central cluster plus a few legitimate-but-distant in-bounds
    // events at the far south and far north edges.
    const events = []
    for (let i = 0; i < 100; i++) {
      events.push({ lat: CENTER.lat + (i % 5) * 0.001, lng: CENTER.lng + (i % 5) * 0.001 })
    }
    events.push({ ...IN_SOUTH }, { ...IN_SOUTH })
    events.push({ ...IN_NORTH }, { ...IN_NORTH })

    const points = collectFitPoints(events, [])
    const lats = points.map((p) => p[0])
    // The framed box should pull in to the dense mass, not the edge tails.
    expect(Math.min(...lats)).toBeGreaterThan(IN_SOUTH.lat)
    expect(Math.max(...lats)).toBeLessThan(IN_NORTH.lat)
    expect(Math.min(...lats)).toBeGreaterThanOrEqual(CENTER.lat)
  })

  it('does not trim small (filtered-view) point sets — frames them in full', () => {
    const events = [
      { lat: CENTER.lat, lng: CENTER.lng },
      { ...IN_SOUTH }, // far-south in-bounds event must stay framed
    ]
    const points = collectFitPoints(events, [])
    expect(points).toContainEqual([IN_SOUTH.lat, IN_SOUTH.lng])
    expect(points).toHaveLength(2)
  })
})

describe('isMappable', () => {
  const ev = (summary, date = '2026-06-10T19:00-07:00[America/Los_Angeles]', extra = {}) => ({
    summary, date, lat: CENTER.lat, lng: CENTER.lng, icsUrl: 'a.ics', ...extra,
  })

  it('requires coordinates', () => {
    expect(isMappable({ summary: 'x', date: 'd' }, {})).toBe(false)
    expect(isMappable(ev('x'), {})).toBe(true)
  })

  it('honors the date window via dateInScope', () => {
    const e = ev('x')
    expect(isMappable(e, { dateInScope: () => false })).toBe(false)
    expect(isMappable(e, { dateInScope: () => true })).toBe(true)
  })

  describe('queryKeySet (live search)', () => {
    it('null is a no-op — every (in-scope) event maps', () => {
      expect(isMappable(ev('jazz night'), { queryKeySet: null })).toBe(true)
    })

    it('drops events whose key is not in the set', () => {
      const match = ev('jazz night')
      const miss = ev('comedy hour')
      const set = new Set([eventKey(match)])
      expect(isMappable(match, { queryKeySet: set })).toBe(true)
      expect(isMappable(miss, { queryKeySet: set })).toBe(false)
    })

    it('intersects with the date window (in the set but out of window → false)', () => {
      const e = ev('jazz night')
      const set = new Set([eventKey(e)])
      expect(isMappable(e, { queryKeySet: set, dateInScope: () => false })).toBe(false)
    })

    it('applies even when a channel is open (search narrows every scope)', () => {
      const inCh = ev('jazz night', undefined, { icsUrl: 'open.ics' })
      const set = new Set() // matches nothing
      expect(isMappable(inCh, { calendarFilter: 'open.ics', queryKeySet: set })).toBe(false)
      const set2 = new Set([eventKey(inCh)])
      expect(isMappable(inCh, { calendarFilter: 'open.ics', queryKeySet: set2 })).toBe(true)
    })
  })
})
