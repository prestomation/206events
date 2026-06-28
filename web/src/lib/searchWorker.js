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

let engine = createSearchEngine([])

self.onmessage = (e) => {
  const msg = e.data
  if (!msg) return

  if (msg.type === 'index') {
    // Already-parsed corpus pushed from the main thread (the small "soon"
    // payload, which is parsed on-main for fast first paint). Cheap clone.
    engine = createSearchEngine(msg.events)
    return
  }

  if (msg.type === 'parse') {
    // The heavy one: decode + JSON.parse the transferred ArrayBuffer here, build
    // the index, and hand the parsed array back for rendering. The parse never
    // touches the main thread.
    try {
      const events = JSON.parse(new TextDecoder().decode(msg.buffer))
      engine = createSearchEngine(events)
      self.postMessage({ type: 'parsed', reqId: msg.reqId, events })
    } catch (err) {
      self.postMessage({ type: 'parseError', reqId: msg.reqId, error: String((err && err.message) || err) })
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
    self.postMessage({ type: 'result', reqId: msg.reqId, keys })
  }
}
