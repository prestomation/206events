import Fuse from 'fuse.js'
import { eventKey } from './eventKey.js'

// The live-search index, factored out so the **search worker** and its
// **main-thread fallback** share one definition (no drift between threads).
//
// These options serve BOTH client search paths: the App206 live search box and
// the saved-filter matching (App.jsx routes saved filters through the search
// worker — docs/following-tab-performance.md, Fix 1). Fuzzy over
// summary/description/location, a near-exact threshold, and a whole-field scan
// (`ignoreLocation`) so a term anywhere in a long description still matches.
// The saved-filter path is parity-locked to the favorites worker
// (infra/favorites-worker/src/event-search.ts): these literals MUST match it,
// and web/src/filter-parity.test.js pins them.
export const SEARCH_FUSE_OPTIONS = {
  keys: ['summary', 'description', 'location'],
  threshold: 0.1,
  ignoreLocation: true,
}

// Build a search engine over a corpus of events-index entries. The returned
// `search(q)` runs the Fuse pass and collapses hits to a Set of stable event
// keys (`summary|date`) — the same membership key consumers filter their lists
// by. Returns `null` for an empty query (the "no filter" signal), never an
// empty Set, so callers can distinguish "no query" from "query, zero matches".
export function createSearchEngine(events) {
  const fuse = new Fuse(Array.isArray(events) ? events : [], SEARCH_FUSE_OPTIONS)
  return {
    search(q) {
      const term = (q || '').trim()
      if (!term) return null
      const set = new Set()
      for (const r of fuse.search(term)) set.add(eventKey(r.item))
      return set
    },
  }
}
