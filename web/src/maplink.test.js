import { describe, it, expect } from 'vitest'
import { googleMapsUrl, osmFeatureUrl, geoUri, isAndroid, bestMapHref } from './lib/maplink.js'

// ---------------------------------------------------------------------------
// PARITY FIXTURES — keep identical to lib/maplink.test.ts (MAPLINK_CASES).
// Both suites assert the same inputs produce the same URLs; that's the
// contract that stops the JS builder (browser) and the TS builder (venues.json)
// from silently diverging.
// ---------------------------------------------------------------------------
const MAPLINK_CASES = [
  {
    name: 'venue with osm identity',
    input: { lat: 47.61, lng: -122.32, label: 'Neumos, 925 E Pike St, Seattle, WA 98122', osmType: 'way', osmId: 123456 },
    google: 'https://www.google.com/maps/search/?api=1&query=Neumos%2C%20925%20E%20Pike%20St%2C%20Seattle%2C%20WA%2098122',
    osm: 'https://www.openstreetmap.org/way/123456',
    geo: 'geo:47.61,-122.32?q=Neumos%2C%20925%20E%20Pike%20St%2C%20Seattle%2C%20WA%2098122',
  },
  {
    name: 'venue without osm identity',
    input: { lat: 47.6, lng: -122.33, label: 'Some Hall, Seattle' },
    google: 'https://www.google.com/maps/search/?api=1&query=Some%20Hall%2C%20Seattle',
    osm: undefined,
    geo: 'geo:47.6,-122.33?q=Some%20Hall%2C%20Seattle',
  },
  {
    name: 'event with location string only (no label)',
    input: { location: 'The Crocodile, Belltown', lat: 47.614, lng: -122.346 },
    google: 'https://www.google.com/maps/search/?api=1&query=The%20Crocodile%2C%20Belltown',
    osm: undefined,
    geo: 'geo:47.614,-122.346?q=The%20Crocodile%2C%20Belltown',
  },
  {
    name: 'coordinates only',
    input: { lat: 47.62, lng: -122.35 },
    google: 'https://www.google.com/maps/search/?api=1&query=47.62%2C-122.35',
    osm: undefined,
    geo: 'geo:47.62,-122.35?q=47.62%2C-122.35',
  },
  {
    name: 'nothing usable',
    input: {},
    google: undefined,
    osm: undefined,
    geo: undefined,
  },
]

describe('maplink builders (parity with lib/maplink.ts)', () => {
  for (const c of MAPLINK_CASES) {
    it(`googleMapsUrl: ${c.name}`, () => {
      expect(googleMapsUrl(c.input)).toBe(c.google)
    })
    it(`osmFeatureUrl: ${c.name}`, () => {
      expect(osmFeatureUrl(c.input)).toBe(c.osm)
    })
    it(`geoUri: ${c.name}`, () => {
      expect(geoUri(c.input)).toBe(c.geo)
    })
  }
})

describe('bestMapHref device selection', () => {
  const venue = { lat: 47.61, lng: -122.32, label: 'Neumos, Seattle' }

  it('uses geo: on Android', () => {
    expect(isAndroid('Mozilla/5.0 (Linux; Android 14) AppleWebKit')).toBe(true)
    expect(bestMapHref(venue, 'Mozilla/5.0 (Linux; Android 14)')).toBe(geoUri(venue))
  })

  it('uses Google URL on iOS', () => {
    const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit'
    expect(isAndroid(iosUa)).toBe(false)
    expect(bestMapHref(venue, iosUa)).toBe(googleMapsUrl(venue))
  })

  it('uses Google URL on desktop', () => {
    const desktopUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit'
    expect(bestMapHref(venue, desktopUa)).toBe(googleMapsUrl(venue))
  })

  it('falls back to Google URL on Android when coords are missing', () => {
    const noCoords = { label: 'Somewhere' }
    expect(bestMapHref(noCoords, 'Android')).toBe(googleMapsUrl(noCoords))
  })
})
