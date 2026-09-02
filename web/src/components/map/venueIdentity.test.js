import { describe, it, expect } from 'vitest'
import { resolveVenueIdentity } from './venueIdentity.js'

const inst = (over = {}) => ({
  icsUrl: 'test-ripper-cal1.ics',
  location: 'Neumos, Capitol Hill',
  lat: 47.61,
  lng: -122.32,
  ...over,
})

const series = (summary, days, over = {}) => {
  const instances = days.map(() => inst({ summary, ...over }))
  return { key: `${summary}|v`, lat: 47.61, lng: -122.32, summary, count: days.length, instances }
}

const venue = (s) => ({
  key: 'v', lat: 47.61, lng: -122.32, label: 'Neumos, Capitol Hill',
  series: s, seriesCount: s.length, dateCount: s.reduce((n, g) => n + g.count, 0),
})

describe('resolveVenueIdentity', () => {
  it('splits the events-index location on its first comma', () => {
    expect(resolveVenueIdentity(venue([series('A', [1])]))).toEqual({ name: 'Neumos', address: 'Capitol Hill' })
  })

  it('keeps a comma-less label whole', () => {
    const v = { ...venue([series('A', [1])]), label: 'Gas Works Park' }
    expect(resolveVenueIdentity(v)).toEqual({ name: 'Gas Works Park', address: '' })
  })

  it('handles a venue no instance labelled', () => {
    const v = { ...venue([series('A', [1])]), label: '' }
    expect(resolveVenueIdentity(v)).toEqual({ name: '', address: '' })
  })

  // venues.json enriches, never overrides: it describes the SOURCE's declared
  // point, which for an aggregator is nowhere near most of its events.
  it('takes the street address from an entry that names the same place', () => {
    const byIcs = new Map([['test-ripper-cal1.ics', {
      name: 'neumos', friendlyName: 'Neumos', geo: { lat: 47.61, lng: -122.32, label: '925 E Pike St, Seattle' },
    }]])
    expect(resolveVenueIdentity(venue([series('A', [1])]), byIcs))
      .toEqual({ name: 'Neumos', address: '925 E Pike St, Seattle' })
  })

  // Regression: discover-slu is an aggregator whose events happen all over the
  // neighbourhood. Its entry must not rename The Spheres to "Discover SLU".
  it('keeps the name the events give, over an aggregator entry at the same point', () => {
    const v = { ...venue([series('A', [1], { location: 'The Spheres, South Lake Union, Seattle, WA' })]),
      label: 'The Spheres, South Lake Union, Seattle, WA' }
    const byIcs = new Map([['test-ripper-cal1.ics', {
      name: 'discover-slu', friendlyName: 'Discover South Lake Union',
      geo: { lat: 47.61, lng: -122.32, label: 'Discover SLU, 436 Minor Ave N, Seattle, WA 98109' },
    }]])
    expect(resolveVenueIdentity(v, byIcs))
      .toEqual({ name: 'The Spheres', address: 'South Lake Union, Seattle, WA' })
  })

  // The other half: when the events only give a street address, the source's
  // own venue name is the better label (102 of 171 recurring sources do this).
  it('uses the entry name when the events give a bare street address', () => {
    const v = { ...venue([series('A', [1], { location: '5805 Airport Way S, Seattle, WA 98108' })]),
      label: '5805 Airport Way S, Seattle, WA 98108' }
    const byIcs = new Map([['test-ripper-cal1.ics', {
      friendlyName: 'Georgetown Trailer Park Mall',
      geo: { lat: 47.61, lng: -122.32, label: '5805 Airport Way S, Seattle, WA 98108' },
    }]])
    expect(resolveVenueIdentity(v, byIcs).name).toBe('Georgetown Trailer Park Mall')
  })

  it('ignores a venues.json entry sitting somewhere else', () => {
    const byIcs = new Map([['test-ripper-cal1.ics', {
      friendlyName: 'Somewhere Else', geo: { lat: 47.70, lng: -122.20, label: 'Elsewhere' },
    }]])
    expect(resolveVenueIdentity(venue([series('A', [1])]), byIcs))
      .toEqual({ name: 'Neumos', address: 'Capitol Hill' })
  })
})
