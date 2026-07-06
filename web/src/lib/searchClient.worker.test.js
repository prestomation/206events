import { describe, it, expect } from 'vitest'
import { createSearchClient } from './searchClient.js'
import { createWorkerHandler } from './searchWorker.js'
import { eventKey } from './eventKey.js'

// jsdom has no real `Worker`, so searchClient.test.js only exercises the
// main-thread fallback. These tests cover the *worker path* of the client
// deterministically by injecting a fake Worker whose `postMessage` drives the
// REAL worker message handler (createWorkerHandler) and delivers replies back
// via `onmessage` — so the client's reqId correlation, promise plumbing, and the
// onerror→fallback transition are all under test without a browser. (The real
// browser worker is additionally covered end-to-end by the Playwright suite.)

const EVENTS = [
  { summary: 'Jazz Night', description: 'Live trio', location: 'Neumos', date: '2026-07-01T19:00-07:00' },
  { summary: 'Movie Premiere', description: 'Indie film', location: 'SIFF', date: '2026-07-02T20:00-07:00' },
]
const bufferFor = (events) => new TextEncoder().encode(JSON.stringify(events)).buffer

// A fake dedicated worker: routes posted messages through the real handler and
// delivers replies asynchronously (microtask) to mimic the real message channel.
function makeFakeWorker() {
  const handle = createWorkerHandler()
  const w = {
    onmessage: null,
    onerror: null,
    posted: [],
    postMessage(msg) {
      w.posted.push(msg)
      handle(msg, (reply) => {
        queueMicrotask(() => { if (w.onmessage) w.onmessage({ data: reply }) })
      })
    },
    terminate() { w.terminated = true },
  }
  return w
}

describe('createSearchClient (worker path, injected fake worker)', () => {
  it('reports it is running on a worker when a factory is supplied', () => {
    const client = createSearchClient({ workerFactory: makeFakeWorker })
    expect(client.isWorker).toBe(true)
    client.destroy()
  })

  it('parses a transferred buffer via the worker handler and returns events', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    const events = await client.parse(bufferFor(EVENTS))
    expect(events).toHaveLength(2)
    // the parse message carried a reqId and the transfer-shaped payload
    expect(fake.posted.some((m) => m.type === 'parse' && m.reqId != null)).toBe(true)
    client.destroy()
  })

  it('resolves search to the matched event-key Set across the message round-trip', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    await client.parse(bufferFor(EVENTS))
    const keys = await client.search('jazz')
    expect(keys).toBeInstanceOf(Set)
    expect(keys.has(eventKey(EVENTS[0]))).toBe(true)
    expect(keys.has(eventKey(EVENTS[1]))).toBe(false)
    client.destroy()
  })

  it('correlates concurrent requests by reqId (no cross-talk)', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    await client.parse(bufferFor(EVENTS))
    const [a, b] = await Promise.all([client.search('jazz'), client.search('premiere')])
    expect(a.has(eventKey(EVENTS[0]))).toBe(true)
    expect(a.has(eventKey(EVENTS[1]))).toBe(false)
    expect(b.has(eventKey(EVENTS[1]))).toBe(true)
    expect(b.has(eventKey(EVENTS[0]))).toBe(false)
    client.destroy()
  })

  it('index() pushes a corpus to the worker without expecting a reply', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    client.index(EVENTS)
    expect(fake.posted.some((m) => m.type === 'index')).toBe(true)
    const keys = await client.search('premiere')
    expect(keys.has(eventKey(EVENTS[1]))).toBe(true)
    client.destroy()
  })

  it('on worker onerror, switches to the main-thread fallback (no hung promises)', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    // Seed the worker, then simulate a runtime worker failure.
    client.index(EVENTS)
    fake.onerror(new Error('boom'))
    // Subsequent calls must still resolve (now via the main-thread engine).
    client.index(EVENTS)
    const keys = await client.search('jazz')
    expect(keys).toBeInstanceOf(Set)
    expect(keys.has(eventKey(EVENTS[0]))).toBe(true)
    // And parse still works on the fallback path.
    const events = await client.parse(bufferFor(EVENTS))
    expect(events).toHaveLength(2)
    client.destroy()
  })

  it('rejects in-flight promises when the worker errors', async () => {
    const fake = makeFakeWorker()
    // Swallow the post so the request stays in-flight until onerror fires.
    fake.postMessage = (msg) => { fake.posted.push(msg) }
    const client = createSearchClient({ workerFactory: () => fake })
    const inflight = client.search('jazz')
    fake.onerror(new Error('boom'))
    await expect(inflight).rejects.toThrow()
    client.destroy()
  })

  it('streams NDJSON chunks through the real handler: batches, count, and search', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    const ndjson = EVENTS.map(e => JSON.stringify(e)).join('\n') + '\n'
    // Cut mid-line so the worker's remainder buffering is exercised.
    const cut = ndjson.indexOf('Indie') + 2
    const batches = []
    const stream = client.stream(batch => batches.push(...batch))
    await stream.push(new TextEncoder().encode(ndjson.slice(0, cut)).buffer)
    await stream.push(new TextEncoder().encode(ndjson.slice(cut)).buffer)
    const count = await stream.end()
    expect(count).toBe(2)
    expect(batches.map(e => e.summary)).toEqual(['Jazz Night', 'Movie Premiere'])
    const keys = await client.search('jazz')
    expect(keys.has(eventKey(EVENTS[0]))).toBe(true)
    client.destroy()
  })

  it('splits multi-byte UTF-8 across chunks without corruption', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    const ev = { summary: 'Fiesta de Verano — Ballard', date: '2026-07-03T18:00-07:00' }
    const bytes = new TextEncoder().encode(JSON.stringify(ev) + '\n')
    // Split inside the em-dash's 3-byte sequence.
    const dashByte = bytes.findIndex(b => b === 0xe2)
    const batches = []
    const stream = client.stream(batch => batches.push(...batch))
    await stream.push(bytes.slice(0, dashByte + 1).buffer)
    await stream.push(bytes.slice(dashByte + 1).buffer)
    await stream.end()
    expect(batches[0].summary).toBe('Fiesta de Verano — Ballard')
    client.destroy()
  })

  it('rejects end() when the stream contains malformed NDJSON', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    const stream = client.stream(() => {})
    await stream.push(new TextEncoder().encode('{broken\n').buffer)
    await expect(stream.end()).rejects.toThrow()
    client.destroy()
  })

  it('descriptions message enriches the worker corpus for search', async () => {
    const fake = makeFakeWorker()
    const client = createSearchClient({ workerFactory: () => fake })
    const streamed = [{ summary: 'Jazz Night', date: '2026-07-01T19:00-07:00', d: 0 }]
    const stream = client.stream(() => {})
    await stream.push(new TextEncoder().encode(JSON.stringify(streamed[0]) + '\n').buffer)
    await stream.end()
    expect((await client.search('saxophone')).size).toBe(0)
    await client.applyDescriptions(['A night of saxophone standards'])
    const keys = await client.search('saxophone')
    expect(keys.has(eventKey(streamed[0]))).toBe(true)
    client.destroy()
  })
})
