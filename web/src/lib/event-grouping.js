// web/src/lib/event-grouping.js
//
// Temporal grouping for the events map: collapse the many instances of a
// conceptually-same recurring event at one venue (a nightly musical, a weekly
// show) into a single map marker whose drill-down lists every date.
//
// This is a pure, map-DISPLAY-only transform. It runs AFTER `isMappable` in
// EventsMap (which owns filter/feed/date-window membership and the
// favorites-worker parity contract), so it never changes which events are in
// scope — only how the already-filtered instances are rendered. Because it
// operates on the post-filter set, a group's `count`/date-list automatically
// reflects the active date window with no extra date logic.
//
// Grouping is heuristic (client-side, no schema change). If the build ever
// stamps a stable `seriesId` onto events-index entries, `groupEvents` already
// prefers it (see the seriesId short-circuit below), making that migration a
// no-op for this consumer.

import { titleSimilarity } from './event-dedup.js'

// ~50m grid for venue identity, matching event-dedup.js's 0.05km neighborhood,
// so geocoding jitter doesn't split one series across two markers.
export const GROUP_COORD_EPSILON_DEG = 0.00045

// Token (Jaccard) similarity at/above which two normalized titles at the same
// venue+source are treated as the same series. Tunable; conservative enough to
// avoid merging clearly-different shows.
export const GROUP_TITLE_SIMILARITY = 0.7

// Per-occurrence qualifier words. A trailing delimiter-separated segment made up
// only of these (and/or a time token) is a showtime/occurrence label, not part
// of the show's name, so it's stripped before comparison ("Hamilton - Evening"
// and "Hamilton" both normalize to "hamilton").
const QUALIFIER_WORDS = new Set([
  'evening', 'matinee', 'night', 'nightly', 'afternoon', 'morning', 'midday',
  'late', 'early', 'show', 'showing', 'performance', 'encore', 'preview',
  'opening', 'closing', 'final', 'am', 'pm', 'noon', 'midnight', 'doors',
  // Occurrence status annotations — a sold-out/cancelled night is still the
  // same show, so a tail made only of these collapses to the base title.
  'sold', 'out', 'cancelled', 'canceled', 'rescheduled', 'postponed',
])

// True when every whitespace token in `text` is a qualifier word, a clock time
// (e.g. "8pm", "7:30", "8:00pm"), or pure punctuation.
function isAllQualifierTokens(text) {
  const tokens = String(text).toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every((t) => {
    const w = t.replace(/[^a-z0-9:]/g, '')
    if (!w) return true // token was pure punctuation
    if (QUALIFIER_WORDS.has(w)) return true
    if (/^\d{1,2}(:\d{2})?(am|pm)?$/.test(w)) return true // 8 / 8pm / 7:30 / 8:00pm
    return false
  })
}

// Peel trailing occurrence qualifiers from an already-lowercased, single-spaced
// title. Repeats so multiple qualifiers ("show - evening (sold out)") all come
// off. Only strips a segment when it is ENTIRELY qualifier/time tokens, so real
// subtitles ("Hamilton - An American Musical") are preserved.
function stripTrailingQualifier(s) {
  let prev
  do {
    prev = s
    // Trailing parenthetical: "show (matinee)" -> "show"
    s = s.replace(/\s*\(([^)]*)\)\s*$/, (m, inner) => (isAllQualifierTokens(inner) ? '' : m)).trim()
    // Trailing delimiter-separated tail: "show - evening" / "show: 8pm" -> "show"
    const m = s.match(/^(.*\S)\s*[-–—|:]\s*(\S.*)$/)
    if (m && isAllQualifierTokens(m[2])) s = m[1].trim()
  } while (s !== prev)
  return s
}

/**
 * Normalize an event title for grouping: lowercase, collapse whitespace, and
 * drop trailing per-occurrence qualifiers (showtime, "- Evening", "(Matinee)").
 * Conservative — distinct show names stay distinct.
 */
export function normalizeTitle(summary) {
  const s = String(summary ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  return stripTrailingQualifier(s)
}

/**
 * Snap a coordinate to a ~50m grid and return a stable string token. Non-finite
 * values (missing coords) yield 'na' — though `isMappable` already excludes
 * coordless events before grouping sees them.
 */
export function quantizeCoord(value, epsilonDeg = GROUP_COORD_EPSILON_DEG) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'na'
  return (Math.round(value / epsilonDeg) * epsilonDeg).toFixed(5)
}

/**
 * Exact (non-fuzzy) grouping key for an event: a future `seriesId` when present,
 * else normalized-title + quantized-venue + source feed. Two events with equal
 * keys are always the same group; the fuzzy pass in `groupEvents` may also merge
 * events whose keys differ only by a near-identical title.
 */
export function groupKey(event) {
  if (event?.seriesId != null) return `series:${event.seriesId}`
  return `${normalizeTitle(event?.summary)}|${quantizeCoord(event?.lat)}|${quantizeCoord(event?.lng)}|${event?.icsUrl ?? ''}`
}

// Date sort value: strip the js-joda IANA bracket so ISO strings (sharing one
// timezone) compare chronologically by lexical order.
function dateSortValue(event) {
  return String(event?.date ?? '').replace(/\[.*\]$/, '')
}

function compareByDate(a, b) {
  const av = dateSortValue(a)
  const bv = dateSortValue(b)
  return av < bv ? -1 : av > bv ? 1 : 0
}

// Build a group object from its instances. Instances are sorted chronologically;
// the earliest instance supplies the representative coords/title.
function makeGroup(key, instances) {
  const sorted = [...instances].sort(compareByDate)
  const rep = sorted[0]
  return {
    key,
    lat: rep.lat,
    lng: rep.lng,
    summary: rep.summary,
    count: sorted.length,
    instances: sorted,
  }
}

/**
 * Group event instances into one entry per conceptual event.
 *
 * Two phases (cheap + deterministic):
 *   1. Bucket by venue+source: quantized coords + icsUrl. Different venues or
 *      different source feeds never merge.
 *   2. Within each bucket, greedily cluster by normalized-title similarity
 *      (>= GROUP_TITLE_SIMILARITY) so showtime/title variants of one run merge.
 *
 * Events carrying a `seriesId` short-circuit both phases (grouped purely by id).
 *
 * Returns Array<{ key, lat, lng, summary, count, instances }>, instances sorted
 * by date ascending. Group order is deterministic (first-seen by input order:
 * seriesId groups first in first-seen order, then venue buckets in first-seen
 * order, then their clusters in first-seen order).
 */
export function groupEvents(events) {
  const seriesGroups = new Map() // seriesId key -> instances[]
  const seriesOrder = []
  const venueBuckets = new Map() // venue+source key -> instances[]
  const venueOrder = []

  for (const ev of events) {
    if (ev?.seriesId != null) {
      const k = `series:${ev.seriesId}`
      if (!seriesGroups.has(k)) { seriesGroups.set(k, []); seriesOrder.push(k) }
      seriesGroups.get(k).push(ev)
      continue
    }
    const vk = `${quantizeCoord(ev?.lat)}|${quantizeCoord(ev?.lng)}|${ev?.icsUrl ?? ''}`
    if (!venueBuckets.has(vk)) { venueBuckets.set(vk, []); venueOrder.push(vk) }
    venueBuckets.get(vk).push(ev)
  }

  const groups = []

  for (const k of seriesOrder) {
    groups.push(makeGroup(k, seriesGroups.get(k)))
  }

  for (const vk of venueOrder) {
    // Cluster in first-seen (input) order for determinism.
    const clusters = [] // { norm, items[] }
    for (const ev of venueBuckets.get(vk)) {
      const norm = normalizeTitle(ev.summary)
      const match = clusters.find((c) => titleSimilarity(norm, c.norm) >= GROUP_TITLE_SIMILARITY)
      if (match) match.items.push(ev)
      else clusters.push({ norm, items: [ev] })
    }
    for (const c of clusters) {
      groups.push(makeGroup(`${c.norm}|${vk}`, c.items))
    }
  }

  return groups
}
