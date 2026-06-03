import { describe, it, expect } from 'vitest'
import { isWithinKingCounty, collectFitPoints } from './EventsMap.jsx'

// Reference coordinates
const SEATTLE = { lat: 47.6062, lng: -122.3321 } // downtown
const BELLEVUE = { lat: 47.6101, lng: -122.2015 } // Eastside
const SHORELINE = { lat: 47.7557, lng: -122.3415 } // north King County
const FEDERAL_WAY = { lat: 47.3223, lng: -122.3126 } // south King County
const GORGE = { lat: 47.099, lng: -119.967 } // Gorge Amphitheatre, George WA
const EVERETT = { lat: 47.9789, lng: -122.2021 } // Snohomish County (north)
const TACOMA = { lat: 47.2529, lng: -122.4443 } // Pierce County (southwest)

describe('isWithinKingCounty', () => {
  it('keeps downtown Seattle', () => {
    expect(isWithinKingCounty(SEATTLE.lat, SEATTLE.lng)).toBe(true)
  })

  it('keeps an Eastside (Bellevue/Sammamish) point', () => {
    expect(isWithinKingCounty(BELLEVUE.lat, BELLEVUE.lng)).toBe(true)
  })

  it('keeps north (Shoreline) and south (Federal Way) King County', () => {
    expect(isWithinKingCounty(SHORELINE.lat, SHORELINE.lng)).toBe(true)
    expect(isWithinKingCounty(FEDERAL_WAY.lat, FEDERAL_WAY.lng)).toBe(true)
  })

  it('excludes the Gorge Amphitheatre', () => {
    expect(isWithinKingCounty(GORGE.lat, GORGE.lng)).toBe(false)
  })

  it('excludes neighbouring-county cities (Everett, Tacoma)', () => {
    expect(isWithinKingCounty(EVERETT.lat, EVERETT.lng)).toBe(false)
    expect(isWithinKingCounty(TACOMA.lat, TACOMA.lng)).toBe(false)
  })
})

describe('collectFitPoints', () => {
  it('drops distant outliers but keeps in-county events', () => {
    const events = [SEATTLE, BELLEVUE, GORGE]
    const points = collectFitPoints(events, [])
    expect(points).toContainEqual([SEATTLE.lat, SEATTLE.lng])
    expect(points).toContainEqual([BELLEVUE.lat, BELLEVUE.lng])
    expect(points).not.toContainEqual([GORGE.lat, GORGE.lng])
    expect(points).toHaveLength(2)
  })

  it('always appends geo-filter corner points', () => {
    const gf = { lat: 47.6, lng: -122.3, radiusKm: 5 }
    const points = collectFitPoints([SEATTLE], [gf])
    const latDeg = gf.radiusKm / 111
    const lngDeg = gf.radiusKm / (111 * Math.cos(gf.lat * Math.PI / 180))
    expect(points).toContainEqual([gf.lat + latDeg, gf.lng + lngDeg])
    expect(points).toContainEqual([gf.lat - latDeg, gf.lng - lngDeg])
  })

  it('falls back to all events when none are in-county', () => {
    const points = collectFitPoints([GORGE], [])
    expect(points).toContainEqual([GORGE.lat, GORGE.lng])
    expect(points).toHaveLength(1)
  })

  it('ignores events missing coordinates', () => {
    const points = collectFitPoints([SEATTLE, { summary: 'no coords' }], [])
    expect(points).toHaveLength(1)
  })

  it('trims sparse tails so far-flung in-county events do not stretch the fit', () => {
    // A dense Seattle cluster plus a few legitimate-but-distant in-county events
    // at the far south (Federal Way ~47.29) and far north (Shoreline ~47.77).
    const events = []
    for (let i = 0; i < 100; i++) {
      events.push({ lat: 47.62 + (i % 5) * 0.001, lng: -122.33 + (i % 5) * 0.001 })
    }
    events.push({ lat: 47.29, lng: -122.40 }, { lat: 47.29, lng: -122.40 })
    events.push({ lat: 47.77, lng: -122.40 }, { lat: 47.77, lng: -122.40 })

    const points = collectFitPoints(events, [])
    const lats = points.map((p) => p[0])
    // The framed box should pull in to the dense mass, not the 47.29/47.77 tails.
    expect(Math.min(...lats)).toBeGreaterThan(47.29)
    expect(Math.max(...lats)).toBeLessThan(47.77)
    expect(Math.min(...lats)).toBeGreaterThanOrEqual(47.6)
  })

  it('does not trim small (filtered-view) point sets — frames them in full', () => {
    const events = [
      { lat: 47.62, lng: -122.33 },
      { lat: 47.30, lng: -122.40 }, // far-south in-county event must stay framed
    ]
    const points = collectFitPoints(events, [])
    expect(points).toContainEqual([47.30, -122.40])
    expect(points).toHaveLength(2)
  })
})
