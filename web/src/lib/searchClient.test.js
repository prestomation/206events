import { describe, it, expect } from 'vitest'
import { createSearchClient } from './searchClient.js'
import { eventKey } from './eventKey.js'

// jsdom does not implement `Worker`, so createSearchClient transparently falls
// back to the main-thread engine. These tests exercise that fallback path (the
// real worker path is covered end-to-end by the Playwright suite in a real
// browser). The API surface and results are identical across both paths.

const EVENTS = [
  { summary: 'Jazz Night', description: 'Live trio', location: 'Neumos', date: '2026-07-01T19:00-07:00' },
  { summary: 'Movie Premiere', description: 'Indie film', location: 'SIFF', date: '2026-07-02T20:00-07:00' },
]

function bufferFor(events) {
  return new TextEncoder().encode(JSON.stringify(events)).buffer
}

describe('createSearchClient (main-thread fallback)', () => {
  it('reports it is not running on a worker under jsdom', () => {
    const client = createSearchClient()
    expect(client.isWorker).toBe(false)
    client.destroy()
  })

  it('indexes a corpus and resolves search to a Set of event keys', async () => {
    const client = createSearchClient()
    client.index(EVENTS)
    const keys = await client.search('jazz')
    expect(keys).toBeInstanceOf(Set)
    expect(keys.has(eventKey(EVENTS[0]))).toBe(true)
    expect(keys.has(eventKey(EVENTS[1]))).toBe(false)
    client.destroy()
  })

  it('resolves an empty query to null (no filter)', async () => {
    const client = createSearchClient()
    client.index(EVENTS)
    expect(await client.search('')).toBeNull()
    client.destroy()
  })

  it('parses an ArrayBuffer, returns the events, and indexes them for search', async () => {
    const client = createSearchClient()
    const events = await client.parse(bufferFor(EVENTS))
    expect(Array.isArray(events)).toBe(true)
    expect(events).toHaveLength(2)
    const keys = await client.search('premiere')
    expect(keys.has(eventKey(EVENTS[1]))).toBe(true)
    client.destroy()
  })

  it('rejects parse on malformed JSON', async () => {
    const client = createSearchClient()
    const bad = new TextEncoder().encode('{not json').buffer
    await expect(client.parse(bad)).rejects.toThrow()
    client.destroy()
  })

  it('searches an empty corpus without throwing (resolves to empty Set)', async () => {
    const client = createSearchClient()
    const keys = await client.search('anything')
    expect(keys).toBeInstanceOf(Set)
    expect(keys.size).toBe(0)
    client.destroy()
  })
})
