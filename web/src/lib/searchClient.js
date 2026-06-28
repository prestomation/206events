import { createSearchEngine } from './searchEngine.js'

// Main-thread handle around the search worker (web/src/lib/searchWorker.js).
//
// Exposes a small promise-based API:
//   index(events)        — (re)index an already-parsed corpus (the "soon" payload)
//   parse(arrayBuffer)   — parse the full index in the worker; resolves to the
//                          parsed events array (and indexes it for search)
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

  if (!worker) {
    let engine = createSearchEngine([])
    return {
      isWorker: false,
      index(events) {
        engine = createSearchEngine(events)
      },
      async parse(buffer) {
        const events = JSON.parse(new TextDecoder().decode(buffer))
        engine = createSearchEngine(events)
        return events
      },
      async search(q) {
        return engine.search(q)
      },
      destroy() {},
    }
  }

  // Worker path: correlate each reply to its request by a monotonic reqId.
  let nextId = 1
  const pending = new Map()
  // If the worker dies at runtime (load 404, module parse error, CSP at load),
  // `onmessage` never fires and in-flight promises would hang forever. On error
  // we reject everything pending and switch to a main-thread engine so future
  // calls degrade gracefully instead of leaving the UI stuck "Searching…".
  let fallbackEngine = null
  const rejectAll = (err) => {
    for (const { reject } of pending.values()) reject(err)
    pending.clear()
  }
  worker.onmessage = (e) => {
    const msg = e.data
    if (!msg || msg.reqId == null) return
    const entry = pending.get(msg.reqId)
    if (!entry) return
    pending.delete(msg.reqId)
    if (msg.type === 'parseError') entry.reject(new Error(msg.error))
    else if (msg.type === 'parsed') entry.resolve(msg.events)
    else if (msg.type === 'result') entry.resolve(msg.keys)
  }
  worker.onerror = () => {
    if (!fallbackEngine) fallbackEngine = createSearchEngine([])
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
      if (fallbackEngine) { fallbackEngine = createSearchEngine(events); return }
      worker.postMessage({ type: 'index', events })
    },
    parse(buffer) {
      if (fallbackEngine) {
        const events = JSON.parse(new TextDecoder().decode(buffer))
        fallbackEngine = createSearchEngine(events)
        return Promise.resolve(events)
      }
      // Transfer the ArrayBuffer (zero-copy) so the big payload isn't cloned.
      return call({ type: 'parse', buffer }, [buffer])
    },
    search(q) {
      if (fallbackEngine) return Promise.resolve(fallbackEngine.search(q))
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
