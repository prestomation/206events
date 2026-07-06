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
//
// searchEngine.js (and Fuse behind it) is dynamic-imported so the fallback
// engine stays out of the eager bundle — the worker path, which nearly every
// browser takes, never pays for it. Sync entry points (index, stream batches)
// record the corpus immediately and the engine build catches up when the
// module lands; every async entry point awaits the import, so search behavior
// is identical to the previous eager-import version — only first-call latency
// on the rare fallback path changes.
function createInlineClient() {
  let createEngine = null
  let engine = null
  let corpus = []
  const rebuild = () => {
    if (createEngine) engine = createEngine(corpus)
  }
  const engineReady = import('./searchEngine.js').then((m) => {
    createEngine = m.createSearchEngine
    rebuild()
  }).catch((err) => {
    // Chunk-load failure (offline mid-session, stale deploy). Degrade to a
    // stub whose search() resolves null — the documented "no result" value
    // callers already handle — instead of leaving every method rejecting
    // forever (and firing an unhandled rejection at client creation).
    console.warn('search engine failed to load; search inactive:', err)
    createEngine = () => ({ search: () => null })
    rebuild()
  })
  return {
    isWorker: false,
    index(events) {
      corpus = Array.isArray(events) ? events : []
      rebuild()
    },
    async parse(buffer) {
      const events = JSON.parse(new TextDecoder().decode(buffer))
      corpus = Array.isArray(events) ? events : []
      await engineReady
      rebuild()
      return events
    },
    stream(onBatch) {
      // Same NDJSON semantics as the worker path, run inline: an optional
      // first-line metadata header ({format:'events-stream/1', generated}) is
      // kept out of the corpus and returned from end(); batches are delivered
      // from push(); end() flushes the final line and rebuilds the engine
      // over the streamed corpus.
      const decoder = new TextDecoder()
      let remainder = ''
      let meta = null
      const events = []
      const drain = (text, flush) => {
        const lines = text.split('\n')
        remainder = flush ? '' : lines.pop()
        const batch = []
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const obj = JSON.parse(trimmed)
          if (meta === null && events.length === 0 && batch.length === 0 &&
              obj && typeof obj.format === 'string' && obj.format.startsWith('events-stream')) {
            meta = obj
            continue
          }
          batch.push(obj)
        }
        if (batch.length > 0) {
          for (const e of batch) events.push(e)
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
          await engineReady
          rebuild()
          return { count: corpus.length, meta }
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
      await engineReady
      rebuild()
    },
    async search(q) {
      await engineReady
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
    else if (msg.type === 'streamDone') entry.resolve({ count: msg.count, meta: msg.meta ?? null })
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
      // A mid-stream parseError settles `done` before the caller reaches
      // end() — mark it handled so the early rejection doesn't surface as an
      // unhandledrejection; end() still returns the original promise, so the
      // caller observes the failure normally.
      done.catch(() => {})
      return {
        async push(buffer) {
          // Once the request has settled (mid-stream parseError, worker
          // death), stop pumping — the worker would misread late chunks as a
          // fresh stream and could transiently index a garbage partial corpus.
          if (!pending.has(reqId)) return
          worker.postMessage({ type: 'streamChunk', reqId, buffer }, [buffer])
        },
        end() {
          if (pending.has(reqId)) worker.postMessage({ type: 'streamEnd', reqId })
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
