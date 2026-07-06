import { describe, it, expect } from 'vitest'
import { median, summarize, seedFavoritesFromManifest, SEED_SEARCHES } from './boot-profile.mjs'

describe('median', () => {
  it('picks the middle of an odd-length set regardless of order', () => {
    expect(median([900, 100, 500])).toBe(500)
  })
  it('averages the two middles of an even-length set', () => {
    expect(median([100, 200, 400, 800])).toBe(300)
  })
  it('handles a single run', () => {
    expect(median([42])).toBe(42)
  })
})

describe('summarize', () => {
  it('takes the per-metric median across runs', () => {
    const runs = [
      { worstTask: 900, tapResponse: 150 },
      { worstTask: 700, tapResponse: 400 },
      { worstTask: 800, tapResponse: 180 },
    ]
    expect(summarize(runs)).toEqual({ worstTask: 800, tapResponse: 180 })
  })
})

describe('seedFavoritesFromManifest', () => {
  const manifest = {
    rippers: [
      { calendars: [{ icsUrl: 'a.ics' }, { icsUrl: 'b.ics' }] },
      { calendars: [{ icsUrl: 'c.ics' }] },
    ],
    externalCalendars: [{ icsUrl: 'ext.ics' }],
    recurringCalendars: [{ icsUrl: 'rec.ics' }],
  }

  it('collects icsUrls across ripper, external, and recurring calendars', () => {
    expect(seedFavoritesFromManifest(manifest, 10)).toEqual(['a.ics', 'b.ics', 'c.ics', 'ext.ics', 'rec.ics'])
  })

  it('caps the list at the requested count', () => {
    expect(seedFavoritesFromManifest(manifest, 2)).toEqual(['a.ics', 'b.ics'])
  })

  it('throws on a manifest with no calendars (harness must fail loudly)', () => {
    expect(() => seedFavoritesFromManifest({})).toThrow(/no calendar icsUrls/)
  })

  it('seed profile matches the documented shape (14 searches)', () => {
    expect(SEED_SEARCHES).toHaveLength(14)
  })
})
