import { createSearchEngine } from './searchEngine.js'

// Main-thread handle around the search worker (web/src/lib/searchWorker.js).
//
// Exposes a small promise-based API:
//   index(events)        — (re)index an already-parsed corpus (the "soon" payload)
//   parse(arrayBuffer)   — parse the full index in the worker; resolves to the
//                          parsed events array (and indexes it for search)
//   stream(onBatch)      — incremental NDJSON parse (docs/event-payload-scaling.md):
//                          returns { push(arrayBuffer), end() }. Each parsed batch
//                          of events is delivered via onBatch as it decodes;
//                          end() resolves with the total count once the worker
//                          has indexed the full corpus.
//   applyDescriptions(texts) — attach dictionary texts to the streamed corpus
//                          (events carry `d` refs) and rebuild the search index;
//                          resolves when re-indexed.
//   search(q)            — resolves to a Set of matched event keys, or null
//   destroy()            — tear down the worker
//
// When Workers are unavailable (jsdom unit tests, restrictive CSP, very old
// browsers) it transparently falls back to running the exact same engine on the
// main thread, so search behavior is identical everywhere — only the thread it
// runs on differs. Callers never branch on which path is active.
// `options.workerFactory` is a test seam: when provided it's used to build the
// worker (so unit tests can inject a fake that drives the real worker handler
// without a browser). Production passes nothing and gets the real module worker.

// The main-thread implementation, used when no worker can be spawned AND as
// the degraded runtime fallback when a worker dies mid-session. Semantics
// mirror the worker handler (searchWorker.js) exactly.
function createInlineClient() {
  let engine = createSearchEngine([])
  let corpus = []
  return {
    isWorker: false,
    index(events) {
      corpus = Array.isArray(events) ? events : []
      engine = createSearchEngine(corpus)
    },
    async parse(buffer) {
      const events = JSON.parse(new TextDecoder().decode(buffer))
      corpus = Array.isArray(events) ? events : []
      engine = createSearchEngine(corpus)
      return events
    },
    stream(onBatch) {
      // Same NDJSON semantics as the worker path, run inline. Batches are
      // delivered from push(); end() flushes the final line and rebuilds the
      // engine over the streamed corpus.
      const decoder = new TextDecoder()
      let remainder = ''
      const events = []
      const drain = (text, flush) => {
        const lines = text.split('\n')
        remainder = flush ? '' : lines.pop()
        const batch = []
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed) batch.push(JSON.parse(trimmed))
        }
        if (batch.length > 0) {
          events.push(...batch)
          onBatch(batch)
        }
      }
      return {
        async push(buffer) {
          drain(remainder + decoder.decode(buffer, { stream: true }), false)
        },
        async end() {
          drain(remainder + decoder.decode(), true)
          corpus = events
          engine = createSearchEngine(corpus)
          return corpus.length
        },
      }
    },
    async applyDescriptions(texts) {
      // Copy-on-enrich: unlike the worker path (where structuredClone
      // isolates the worker's corpus), these are the SAME objects the app
      // holds in React state — mutating them in place would change state
      // behind React's back.
      const list = Array.isArray(texts) ? texts : []
      corpus = corpus.map(e =>
        e && typeof e.d === 'number' && list[e.d] !== undefined
          ? { ...e, description: list[e.d] }
          : e,
      )
      engine = createSearchEngine(corpus)
    },
    async search(q) {
      return engine.search(q)
    },
    destroy() {},
  }
}

export function createSearchClient(options = {}) {
  const { workerFactory } = options
  let worker = null
  try {
    if (workerFactory) {
      worker = workerFactory()
    } else if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('./searchWorker.js', import.meta.url), { type: 'module' })
    }
  } catch {
    // Construction can throw under CSP or in environments that expose `Worker`
    // but can't spawn module workers — fall through to the main-thread engine.
    worker = null
  }

  if (!worker) return createInlineClient()

  // Worker path: correlate each reply to its request by a monotonic reqId.
  let nextId = 1
  const pending = new Map()
  // Streaming replies are multi-shot (many `streamBatch` per reqId before the
  // terminal `streamDone`/`parseError`), so batch callbacks live in their own
  // registry — `pending` stays strictly one-shot.
  const batchHandlers = new Map()
  // If the worker dies at runtime (load 404, module parse error, CSP at load),
  // `onmessage` never fires and in-flight promises would hang forever. On error
  // we reject everything pending and switch to a main-thread client so future
  // calls degrade gracefully instead of leaving the UI stuck "Searching…".
  let fallback = null
  const rejectAll = (err) => {
    for (const { reject } of pending.values()) reject(err)
    pending.clear()
    batchHandlers.clear()
  }
  worker.onmessage = (e) => {
    const msg = e.data
    if (!msg || msg.reqId == null) return
    if (msg.type === 'streamBatch') {
      const onBatch = batchHandlers.get(msg.reqId)
      if (onBatch) onBatch(msg.events)
      return
    }
    const entry = pending.get(msg.reqId)
    if (!entry) return
    pending.delete(msg.reqId)
    batchHandlers.delete(msg.reqId)
    if (msg.type === 'parseError') entry.reject(new Error(msg.error))
    else if (msg.type === 'parsed') entry.resolve(msg.events)
    else if (msg.type === 'streamDone') entry.resolve(msg.count)
    else if (msg.type === 'descriptionsDone') entry.resolve()
    else if (msg.type === 'result') entry.resolve(msg.keys)
  }
  worker.onerror = () => {
    if (!fallback) fallback = createInlineClient()
    rejectAll(new Error('search worker failed; using main-thread fallback'))
  }
  const call = (payload, transfer) =>
    new Promise((resolve, reject) => {
      const reqId = nextId++
      pending.set(reqId, { resolve, reject })
      worker.postMessage({ ...payload, reqId }, transfer || [])
    })

  return {
    isWorker: true,
    index(events) {
      if (fallback) { fallback.index(events); return }
      worker.postMessage({ type: 'index', events })
    },
    parse(buffer) {
      if (fallback) return fallback.parse(buffer)
      // Transfer the ArrayBuffer (zero-copy) so the big payload isn't cloned.
      return call({ type: 'parse', buffer }, [buffer])
    },
    stream(onBatch) {
      if (fallback) return fallback.stream(onBatch)
      // One reqId spans the whole stream: chunks are fire-and-forget posts
      // (transferred zero-copy), batches come back via `onBatch`, and end()
      // awaits the terminal streamDone (registered up front so a fast worker
      // can't race it).
      const reqId = nextId++
      batchHandlers.set(reqId, onBatch)
      const done = new Promise((resolve, reject) => {
        pending.set(reqId, { resolve, reject })
      })
      return {
        async push(buffer) {
          worker.postMessage({ type: 'streamChunk', reqId, buffer }, [buffer])
        },
        end() {
          worker.postMessage({ type: 'streamEnd', reqId })
          return done
        },
      }
    },
    applyDescriptions(texts) {
      if (fallback) return fallback.applyDescriptions(texts)
      return call({ type: 'descriptions', texts })
    },
    search(q) {
      if (fallback) return fallback.search(q)
      return call({ type: 'search', q })
    },
    destroy() {
      try {
        worker.terminate()
      } catch {
        /* already gone */
      }
      rejectAll(new Error('search client destroyed'))
    },
  }
}
