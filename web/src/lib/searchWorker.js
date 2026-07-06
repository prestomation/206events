// Dedicated Web Worker that owns the live-search index off the main thread.
//
// Why: parsing the multi-MB events index (JSON.parse), building the Fuse
// index over ~10k events, and running each query's whole-field bitap scan
// (~120 ms desktop / ~0.5 s mobile) all used to run on the main thread and froze
// typing/scrolling. Here they run in a worker; the main thread only hands over
// raw bytes (zero-copy, transferred) and receives small results. See
// docs/web-search-worker.md and docs/event-payload-scaling.md.
//
// Protocol (every request carries a `reqId` the client correlates replies by):
//   { type: 'index',  events }                 → engine rebuilt; no reply
//   { type: 'parse',  reqId, buffer }          → reply { type:'parsed', reqId, events }
//                                                  or { type:'parseError', reqId, error }
//   { type: 'search', reqId, q }               → reply { type:'result', reqId, keys }
//   NDJSON streaming (docs/event-payload-scaling.md §5 step 2) — one stream at
//   a time per reqId; chunks must arrive in order (guaranteed: they're posted
//   sequentially from one reader loop):
//   { type: 'streamChunk', reqId, buffer }     → reply { type:'streamBatch', reqId, events }
//                                                  (only when the chunk completed ≥1 line)
//   { type: 'streamEnd', reqId }               → reply { type:'streamDone', reqId, count }
//                                                  or { type:'parseError', reqId, error }
//   { type: 'descriptions', reqId, texts }     → attach texts[e.d] to the streamed
//                                                  corpus, rebuild the index;
//                                                  reply { type:'descriptionsDone', reqId }
import { createSearchEngine } from './searchEngine.js'

// The message handler as a pure factory: holds the engine in a closure and
// replies via the injected `post` callback (`self.postMessage` in the real
// worker, a test double in unit tests). Keeping the logic here — rather than
// inline on `self.onmessage` — lets it be exercised deterministically without a
// real Worker (jsdom has none). See searchClient.worker.test.js.
export function createWorkerHandler() {
  let engine = createSearchEngine([])
  // Streamed corpus state. The worker keeps its own copy of the parsed events
  // (it produced them — no extra transfer cost) so `descriptions` can enrich
  // and re-index without the main thread resending the corpus.
  let stream = null // { reqId, decoder, remainder, events }
  let corpus = []

  const parseLines = (text, into) => {
    let start = 0
    for (;;) {
      const nl = text.indexOf('\n', start)
      if (nl === -1) break
      const line = text.slice(start, nl).trim()
      if (line) into.push(JSON.parse(line))
      start = nl + 1
    }
    return text.slice(start)
  }

  return function handle(msg, post) {
    if (!msg) return

    if (msg.type === 'index') {
      // Already-parsed corpus pushed from the main thread (the small "soon"
      // payload, parsed on-main for fast first paint). Cheap clone.
      corpus = Array.isArray(msg.events) ? msg.events : []
      engine = createSearchEngine(corpus)
      return
    }

    if (msg.type === 'parse') {
      // The monolithic path (fallback for deploys without the NDJSON stream):
      // decode + JSON.parse the transferred ArrayBuffer here, build the index,
      // and hand the parsed array back for rendering.
      try {
        const events = JSON.parse(new TextDecoder().decode(msg.buffer))
        corpus = Array.isArray(events) ? events : []
        engine = createSearchEngine(corpus)
        post({ type: 'parsed', reqId: msg.reqId, events })
      } catch (err) {
        post({ type: 'parseError', reqId: msg.reqId, error: String((err && err.message) || err) })
      }
      return
    }

    if (msg.type === 'streamChunk') {
      try {
        if (!stream || stream.reqId !== msg.reqId) {
          stream = { reqId: msg.reqId, decoder: new TextDecoder(), remainder: '', events: [] }
        }
        const batch = []
        const text = stream.remainder + stream.decoder.decode(msg.buffer, { stream: true })
        stream.remainder = parseLines(text, batch)
        if (batch.length > 0) {
          stream.events.push(...batch)
          post({ type: 'streamBatch', reqId: msg.reqId, events: batch })
        }
      } catch (err) {
        stream = null
        post({ type: 'parseError', reqId: msg.reqId, error: String((err && err.message) || err) })
      }
      return
    }

    if (msg.type === 'streamEnd') {
      try {
        if (!stream || stream.reqId !== msg.reqId) {
          post({ type: 'parseError', reqId: msg.reqId, error: 'streamEnd without matching stream' })
          return
        }
        // Flush the decoder and any final unterminated line.
        const batch = []
        const text = stream.remainder + stream.decoder.decode()
        const tail = text.trim()
        if (tail) parseLines(tail + '\n', batch)
        if (batch.length > 0) {
          stream.events.push(...batch)
          post({ type: 'streamBatch', reqId: msg.reqId, events: batch })
        }
        corpus = stream.events
        engine = createSearchEngine(corpus)
        post({ type: 'streamDone', reqId: msg.reqId, count: corpus.length })
      } catch (err) {
        post({ type: 'parseError', reqId: msg.reqId, error: String((err && err.message) || err) })
      } finally {
        stream = null
      }
      return
    }

    if (msg.type === 'descriptions') {
      // Attach dictionary texts to the streamed corpus (events carry `d` — an
      // index into event-descriptions.json) and rebuild the Fuse index so the
      // live search covers descriptions again. Mutating in place is safe: the
      // corpus is worker-local (structuredClone already copied what the main
      // thread received).
      const texts = Array.isArray(msg.texts) ? msg.texts : []
      for (const e of corpus) {
        if (e && typeof e.d === 'number' && texts[e.d] !== undefined) e.description = texts[e.d]
      }
      engine = createSearchEngine(corpus)
      post({ type: 'descriptionsDone', reqId: msg.reqId })
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
