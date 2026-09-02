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

// Jaccard token similarity with a memoized tokenization, equivalent to
// event-dedup.js's titleSimilarity for the already-lowercased normalized
// titles compared here (that file is parity-locked with the favorites worker,
// so the perf variant lives locally). The greedy clustering below compares
// each event against every existing cluster in its venue bucket, and a
// nightly run repeats one normalized title across all its instances —
// re-tokenizing both sides per comparison dominated the map-pipeline profile.
// The cache is bounded by the corpus's distinct normalized titles and lives
// for the session (same pattern as parseIndexDateCache in viewModels.js).
const titleTokenCache = new Map()

function titleTokens(s) {
  let tokens = titleTokenCache.get(s)
  if (!tokens) {
    tokens = new Set(s.split(/\s+/).filter(Boolean))
    titleTokenCache.set(s, tokens)
  }
  return tokens
}

function cachedTitleSimilarity(a, b) {
  const tokA = titleTokens(a)
  const tokB = titleTokens(b)
  if (tokA.size === 0 || tokB.size === 0) return 0
  let intersection = 0
  for (const t of tokA) if (tokB.has(t)) intersection++
  const union = tokA.size + tokB.size - intersection
  return intersection / union
}

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

export function compareByDate(a, b) {
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
      const match = clusters.find((c) => cachedTitleSimilarity(norm, c.norm) >= GROUP_TITLE_SIMILARITY)
      if (match) match.items.push(ev)
      else clusters.push({ norm, items: [ev] })
    }
    for (const c of clusters) {
      groups.push(makeGroup(`${c.norm}|${vk}`, c.items))
    }
  }

  return groups
}

// ---------------------------------------------------------------------------
// Venue grouping — one map pin per PLACE, not per series.
//
// `groupEvents` above buckets by venue AND source feed, so three different
// shows at Neumos (or one show listed by two feeds) produce three markers
// stacked on one coordinate. The map surface treats a pin as a place, so this
// second pass collapses those into a single venue whose popup lists every
// series running there.
//
// Keyed on the quantized coordinate ALONE — dropping `icsUrl` is the whole
// point: a venue is a place, and which feed happened to publish a show is not
// part of its identity. This runs on `groupEvents` output, never on raw events,
// so it inherits the same post-`isMappable` scoping and changes nothing about
// membership.
// ---------------------------------------------------------------------------

// First non-empty `location` string across a venue's instances, picking the
// most common one so a single mislabelled instance can't rename the venue.
// Ties resolve to first-seen, keeping the result deterministic.
function modalLocation(series) {
  const counts = new Map()
  for (const g of series) {
    for (const inst of g.instances) {
      const loc = String(inst?.location ?? '').trim()
      if (!loc) continue
      counts.set(loc, (counts.get(loc) || 0) + 1)
    }
  }
  let best = ''
  let bestCount = 0
  for (const [loc, n] of counts) {
    if (n > bestCount) { best = loc; bestCount = n }
  }
  return best
}

/**
 * Collapse temporal groups sharing a coordinate into one entry per venue.
 *
 * Returns Array<{ key, lat, lng, label, series, seriesCount, dateCount }>:
 *   key         stable `${lat}|${lng}` grid token
 *   label       the venue's modal location string ('' when none carry one)
 *   series      the venue's groups, earliest first (ties: more dates first,
 *               then input order) — deterministic for a given input
 *   seriesCount series.length; 1 means the pin opens an event popup directly
 *   dateCount   total instances across every series, for the pin's count badge
 *
 * Venue order is first-seen by input order, matching `groupEvents`.
 */
export function groupByVenue(groups) {
  const buckets = new Map() // venue key -> { key, lat, lng, series[] }
  const order = []

  for (const g of groups) {
    const key = `${quantizeCoord(g?.lat)}|${quantizeCoord(g?.lng)}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, lat: g.lat, lng: g.lng, series: [] }
      buckets.set(key, bucket)
      order.push(key)
    }
    bucket.series.push(g)
  }

  return order.map((key) => {
    const bucket = buckets.get(key)
    // Decorate with the input index so the sort stays stable across engines
    // (Array#sort is spec-stable in modern JS, but the map pipeline is hot
    // enough that being explicit is cheaper than trusting it later).
    const series = bucket.series
      .map((g, i) => ({ g, i }))
      .sort((a, b) => (
        compareByDate(a.g.instances[0], b.g.instances[0])
        || (b.g.count - a.g.count)
        || (a.i - b.i)
      ))
      .map((x) => x.g)
    return {
      key: bucket.key,
      lat: bucket.lat,
      lng: bucket.lng,
      label: modalLocation(series),
      series,
      seriesCount: series.length,
      dateCount: series.reduce((n, g) => n + g.count, 0),
    }
  })
}
