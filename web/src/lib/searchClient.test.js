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

  it('streams NDJSON chunks, delivering batches and indexing the full corpus', async () => {
    const client = createSearchClient()
    const ndjson = EVENTS.map(e => JSON.stringify(e)).join('\n') + '\n'
    // Split mid-line to prove remainder handling across chunk boundaries.
    const cut = ndjson.indexOf('Movie') + 3
    const chunks = [ndjson.slice(0, cut), ndjson.slice(cut)]
    const batches = []
    const stream = client.stream(batch => batches.push(...batch))
    for (const c of chunks) await stream.push(new TextEncoder().encode(c).buffer)
    const { count, meta } = await stream.end()
    expect(count).toBe(2)
    expect(meta).toBeNull() // no header line in this fixture
    expect(batches.map(e => e.summary)).toEqual(['Jazz Night', 'Movie Premiere'])
    const keys = await client.search('premiere')
    expect(keys.has(eventKey(EVENTS[1]))).toBe(true)
    client.destroy()
  })

  it('parses a final line without a trailing newline', async () => {
    const client = createSearchClient()
    const ndjson = EVENTS.map(e => JSON.stringify(e)).join('\n') // no trailing \n
    const batches = []
    const stream = client.stream(batch => batches.push(...batch))
    await stream.push(new TextEncoder().encode(ndjson).buffer)
    expect((await stream.end()).count).toBe(2)
    expect(batches).toHaveLength(2)
    client.destroy()
  })

  it('recognizes the metadata header line, keeps it out of batches, and returns it from end()', async () => {
    const client = createSearchClient()
    const header = { format: 'events-stream/1', generated: '2026-01-01T00:00:00.000Z' }
    const ndjson = [header, ...EVENTS].map(e => JSON.stringify(e)).join('\n') + '\n'
    const batches = []
    const stream = client.stream(batch => batches.push(...batch))
    await stream.push(new TextEncoder().encode(ndjson).buffer)
    const { count, meta } = await stream.end()
    expect(count).toBe(2)
    expect(meta).toEqual(header)
    expect(batches.map(e => e.summary)).toEqual(['Jazz Night', 'Movie Premiere'])
    client.destroy()
  })

  it('resolves an empty stream to a zero-event corpus', async () => {
    const client = createSearchClient()
    const stream = client.stream(() => {})
    expect((await stream.end()).count).toBe(0)
    client.destroy()
  })

  it('applyDescriptions attaches dictionary texts by d-ref and makes them searchable', async () => {
    const client = createSearchClient()
    const streamed = [
      { summary: 'Jazz Night', location: 'Neumos', date: '2026-07-01T19:00-07:00', d: 0 },
      { summary: 'Movie Premiere', location: 'SIFF', date: '2026-07-02T20:00-07:00' },
    ]
    const ndjson = streamed.map(e => JSON.stringify(e)).join('\n') + '\n'
    const stream = client.stream(() => {})
    await stream.push(new TextEncoder().encode(ndjson).buffer)
    await stream.end()
    // Not searchable before the dictionary lands…
    expect((await client.search('saxophone')).size).toBe(0)
    await client.applyDescriptions(['A night of saxophone standards'])
    // …searchable after.
    const keys = await client.search('saxophone')
    expect(keys.has(eventKey(streamed[0]))).toBe(true)
    expect(keys.has(eventKey(streamed[1]))).toBe(false)
    client.destroy()
  })

  it('does not mutate the caller-visible batch objects when applying descriptions', async () => {
    const client = createSearchClient()
    const streamed = [{ summary: 'Jazz Night', date: '2026-07-01T19:00-07:00', d: 0 }]
    const ndjson = streamed.map(e => JSON.stringify(e)).join('\n') + '\n'
    const received = []
    const stream = client.stream(batch => received.push(...batch))
    await stream.push(new TextEncoder().encode(ndjson).buffer)
    await stream.end()
    await client.applyDescriptions(['Some text'])
    expect(received[0].description).toBeUndefined()
    client.destroy()
  })
})
