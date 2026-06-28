import { describe, it, expect } from 'vitest'
import { createSearchEngine, SEARCH_FUSE_OPTIONS } from './searchEngine.js'
import { eventKey } from './eventKey.js'

const EVENTS = [
  { summary: 'Jazz Night', description: 'Live trio at the bar', location: 'Neumos', date: '2026-07-01T19:00-07:00' },
  { summary: 'Movie Premiere', description: 'Indie film screening', location: 'SIFF Cinema', date: '2026-07-02T20:00-07:00' },
  { summary: 'Open Mic', description: 'Sign up for a jazz set', location: 'Capitol Hill', date: '2026-07-03T18:00-07:00' },
]

describe('createSearchEngine', () => {
  it('returns null for an empty / whitespace query (the "no filter" signal)', () => {
    const engine = createSearchEngine(EVENTS)
    expect(engine.search('')).toBeNull()
    expect(engine.search('   ')).toBeNull()
    expect(engine.search(null)).toBeNull()
    expect(engine.search(undefined)).toBeNull()
  })

  it('returns a Set of event keys for matching events', () => {
    const engine = createSearchEngine(EVENTS)
    const result = engine.search('jazz')
    expect(result).toBeInstanceOf(Set)
    // Matches "Jazz Night" (summary) and "Open Mic" (description "...jazz set").
    expect(result.has(eventKey(EVENTS[0]))).toBe(true)
    expect(result.has(eventKey(EVENTS[2]))).toBe(true)
    expect(result.has(eventKey(EVENTS[1]))).toBe(false)
  })

  it('matches against the location field (whole-field scan)', () => {
    const engine = createSearchEngine(EVENTS)
    const result = engine.search('Neumos')
    expect(result.has(eventKey(EVENTS[0]))).toBe(true)
    expect(result.size).toBe(1)
  })

  it('returns an empty Set (not null) when a non-empty query matches nothing', () => {
    const engine = createSearchEngine(EVENTS)
    const result = engine.search('zzzznomatch')
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('handles an empty / non-array corpus without throwing', () => {
    expect(createSearchEngine([]).search('jazz')).toBeInstanceOf(Set)
    expect(createSearchEngine(undefined).search('jazz').size).toBe(0)
  })

  it('exposes the live-search Fuse options (whole-field, near-exact)', () => {
    expect(SEARCH_FUSE_OPTIONS.ignoreLocation).toBe(true)
    expect(SEARCH_FUSE_OPTIONS.threshold).toBe(0.1)
    expect(SEARCH_FUSE_OPTIONS.keys).toEqual(['summary', 'description', 'location'])
  })
})
