// Dedicated Web Worker that owns the live-search index off the main thread.
//
// Why: parsing the ~9.6 MB `events-index.json` (JSON.parse), building the Fuse
// index over ~10k events, and running each query's whole-field bitap scan
// (~120 ms desktop / ~0.5 s mobile) all used to run on the main thread and froze
// typing/scrolling. Here they run in a worker; the main thread only hands over
// raw bytes (zero-copy, transferred) and receives small results. See
// docs/web-search-worker.md.
//
// Protocol (every request carries a `reqId` the client correlates replies by):
//   { type: 'index',  events }                 → engine rebuilt; no reply
//   { type: 'parse',  reqId, buffer }          → reply { type:'parsed', reqId, events }
//                                                  or { type:'parseError', reqId, error }
//   { type: 'search', reqId, q }               → reply { type:'result', reqId, keys }
import { createSearchEngine } from './searchEngine.js'

// The message handler as a pure factory: holds the engine in a closure and
// replies via the injected `post` callback (`self.postMessage` in the real
// worker, a test double in unit tests). Keeping the logic here — rather than
// inline on `self.onmessage` — lets it be exercised deterministically without a
// real Worker (jsdom has none). See searchClient.worker.test.js.
export function createWorkerHandler() {
  let engine = createSearchEngine([])
  return function handle(msg, post) {
    if (!msg) return

    if (msg.type === 'index') {
      // Already-parsed corpus pushed from the main thread (the small "soon"
      // payload, parsed on-main for fast first paint). Cheap clone.
      engine = createSearchEngine(msg.events)
      return
    }

    if (msg.type === 'parse') {
      // The heavy one: decode + JSON.parse the transferred ArrayBuffer here,
      // build the index, and hand the parsed array back for rendering. The parse
      // never touches the main thread.
      try {
        const events = JSON.parse(new TextDecoder().decode(msg.buffer))
        engine = createSearchEngine(events)
        post({ type: 'parsed', reqId: msg.reqId, events })
      } catch (err) {
        post({ type: 'parseError', reqId: msg.reqId, error: String((err && err.message) || err) })
      }
      return
    }

    if (msg.type === 'search') {
      let keys = null
      try {
        keys = engine.search(msg.q)
      } catch {
        keys = null
      }
      // `keys` is a Set | null; structuredClone round-trips a Set faithfully.
      post({ type: 'result', reqId: msg.reqId, keys })
    }
  }
}

// Worker entry: wire the handler to the real worker globals. Guarded on
// `window === undefined` so it runs ONLY inside an actual dedicated worker (no
// `window` there) and is a no-op import in jsdom/tests (where `window` exists),
// keeping the module side-effect-free to import.
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  const handle = createWorkerHandler()
  self.onmessage = (e) => handle(e.data, (reply) => self.postMessage(reply))
}
