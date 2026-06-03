import { describe, it, expect } from 'vitest'
import { isWithinKingCounty, collectFitPoints } from './EventsMap.jsx'

// Reference coordinates
const SEATTLE = { lat: 47.6062, lng: -122.3321 } // downtown
const BELLEVUE = { lat: 47.6101, lng: -122.2015 } // Eastside
const GORGE = { lat: 47.099, lng: -119.967 } // Gorge Amphitheatre, George WA

describe('isWithinKingCounty', () => {
  it('keeps downtown Seattle', () => {
    expect(isWithinKingCounty(SEATTLE.lat, SEATTLE.lng)).toBe(true)
  })

  it('keeps an Eastside (Bellevue/Sammamish) point', () => {
    expect(isWithinKingCounty(BELLEVUE.lat, BELLEVUE.lng)).toBe(true)
  })

  it('excludes the Gorge Amphitheatre', () => {
    expect(isWithinKingCounty(GORGE.lat, GORGE.lng)).toBe(false)
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
    const kmToDeg = gf.radiusKm / 111
    expect(points).toContainEqual([gf.lat + kmToDeg, gf.lng + kmToDeg])
    expect(points).toContainEqual([gf.lat - kmToDeg, gf.lng - kmToDeg])
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
})
