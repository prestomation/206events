import { describe, it, expect } from 'vitest'
import { serializeHash, deserializeHash } from './urlHash.js'

// A fully-defaulted token object, for comparing deserialize output.
const DEFAULTS = {
  section: 'discover',
  event: null,
  channel: null,
  q: '',
  category: null,
  neighborhood: null,
  cost: null,
  dateWindow: 'all',
  emphasis: 'calendars',
  healthTab: 'sources',
  healthSource: null,
}

const roundTrip = (state) => deserializeHash(serializeHash(state))

describe('urlHash codec', () => {
  it('serializes all-default state to an empty hash', () => {
    expect(serializeHash({})).toBe('')
    expect(serializeHash(DEFAULTS)).toBe('')
  })

  it('deserializes an empty hash to defaults', () => {
    expect(deserializeHash('')).toEqual(DEFAULTS)
    expect(deserializeHash('#')).toEqual(DEFAULTS)
  })

  it('omits default values from the hash', () => {
    expect(serializeHash({ section: 'discover', dateWindow: 'all', emphasis: 'calendars', q: '' })).toBe('')
  })

  it('round-trips a section-only state', () => {
    expect(roundTrip({ section: 'following' })).toEqual({ ...DEFAULTS, section: 'following' })
  })

  it('round-trips a fully-filtered browse state', () => {
    const state = {
      section: 'discover',
      q: 'jazz night',
      category: 'Music',
      neighborhood: 'Capitol Hill',
      cost: 'free',
      dateWindow: 7,
      emphasis: 'events',
    }
    expect(roundTrip(state)).toEqual({ ...DEFAULTS, ...state })
  })

  it.each(['free', '10', '25'])('round-trips the cost bucket %s', (cost) => {
    expect(roundTrip({ cost })).toEqual({ ...DEFAULTS, cost })
  })

  it('drops an unknown cost token', () => {
    expect(deserializeHash('cost=cheap')).toEqual(DEFAULTS)
    expect(deserializeHash('cost=999')).toEqual(DEFAULTS)
  })

  it('serializes a numeric date window and round-trips it', () => {
    expect(serializeHash({ dateWindow: 14 })).toBe('date=14')
    expect(roundTrip({ dateWindow: 0 })).toEqual({ ...DEFAULTS, dateWindow: 0 })
    expect(roundTrip({ dateWindow: 30 })).toEqual({ ...DEFAULTS, dateWindow: 30 })
  })

  it('maps legacy date presets onto window stops', () => {
    expect(deserializeHash('date=today').dateWindow).toBe(0)
    expect(deserializeHash('date=weekend').dateWindow).toBe(7)
    expect(deserializeHash('date=all').dateWindow).toBe('all')
  })

  it('falls back to "all" for an unparseable date window', () => {
    expect(deserializeHash('date=bogus').dateWindow).toBe('all')
    expect(deserializeHash('date=-5').dateWindow).toBe('all')
  })

  it('round-trips an open channel', () => {
    expect(roundTrip({ channel: 'test-ripper-cal1.ics' })).toEqual({
      ...DEFAULTS,
      channel: 'test-ripper-cal1.ics',
    })
  })

  it('round-trips an open event', () => {
    const event = 'Jazz Night|2026-02-15T19:00-08:00[America/Los_Angeles]'
    expect(roundTrip({ event })).toEqual({ ...DEFAULTS, event })
  })

  it('enforces event > channel precedence on serialize', () => {
    const hash = serializeHash({ event: 'A|2026-01-01T00:00', channel: 'foo.ics' })
    const parsed = deserializeHash(hash)
    expect(parsed.event).toBe('A|2026-01-01T00:00')
    expect(parsed.channel).toBeNull()
  })

  it('enforces event > channel precedence on deserialize', () => {
    const parsed = deserializeHash('event=A%7C2026-01-01T00%3A00&channel=foo.ics')
    expect(parsed.event).toBe('A|2026-01-01T00:00')
    expect(parsed.channel).toBeNull()
  })

  it('drops event/channel for the health section', () => {
    expect(serializeHash({ section: 'health', event: 'X|2026', channel: 'y.ics' })).toBe('section=health')
    const parsed = deserializeHash('section=health&event=X%7C2026&channel=y.ics')
    expect(parsed).toEqual({ ...DEFAULTS, section: 'health' })
  })

  it('round-trips a health tab', () => {
    expect(roundTrip({ section: 'health', healthTab: 'errors' })).toEqual({
      ...DEFAULTS, section: 'health', healthTab: 'errors',
    })
  })

  it('round-trips a drilled-into health source (drawer open)', () => {
    expect(roundTrip({ section: 'health', healthSource: 'seattle-showlists' })).toEqual({
      ...DEFAULTS, section: 'health', healthSource: 'seattle-showlists',
    })
  })

  it('omits the default health tab but keeps the source', () => {
    expect(serializeHash({ section: 'health', healthTab: 'sources', healthSource: 'foo' }))
      .toBe('section=health&source=foo')
  })

  it('only emits tab/source for the health section', () => {
    expect(serializeHash({ section: 'discover', healthTab: 'errors', healthSource: 'foo' })).toBe('')
    const parsed = deserializeHash('section=discover&tab=errors&source=foo')
    expect(parsed.healthTab).toBe('sources')
    expect(parsed.healthSource).toBeNull()
  })

  it('falls back to the default tab for an unknown tab token', () => {
    expect(deserializeHash('section=health&tab=bogus').healthTab).toBe('sources')
  })

  it.each([
    'Jazz & Blues|2026-02-15T19:00',
    'A|B|C with | pipes',
    'Hash #tag party|2026-03-01T20:00',
    'What? Where & When|2026-04-02T18:30',
    'Café Allegro · Música|2026-05-05T17:00',
    'Spaces   and\ttabs|2026-06-06T12:00',
  ])('round-trips special characters in event keys: %s', (event) => {
    expect(roundTrip({ event }).event).toBe(event)
  })

  it('falls back to discover for an unknown or malicious section', () => {
    expect(deserializeHash('section=bogus')).toEqual(DEFAULTS)
    expect(deserializeHash('section=<script>alert(1)</script>')).toEqual(DEFAULTS)
  })

  it.each(['discover', 'following', 'you', 'map', 'health'])('preserves the valid section %s', (s) => {
    expect(deserializeHash(`section=${s}`).section).toBe(s)
  })

  it('ignores unknown params and tolerates malformed hashes', () => {
    expect(deserializeHash('tag=__favorites__&view=health&foo=bar')).toEqual(DEFAULTS)
    expect(() => deserializeHash('&&==&')).not.toThrow()
    expect(deserializeHash('&&==&')).toEqual(DEFAULTS)
  })

  it('accepts input with or without a leading #', () => {
    expect(deserializeHash('#section=map')).toEqual({ ...DEFAULTS, section: 'map' })
    expect(deserializeHash('section=map')).toEqual({ ...DEFAULTS, section: 'map' })
  })
})
