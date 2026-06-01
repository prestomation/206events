// Pure, DOM-free codec for the App206 deep-link hash.
//
// State <-> hash translation lives here so it can be unit-tested without React
// or a browser. The functions operate on plain string tokens — the App206 glue
// is responsible for turning an open event object into its `eventKey`
// (`summary|date`) token and back. URLSearchParams handles percent-encoding of
// special characters (`|`, `&`, `#`, spaces, unicode) on both set and get.
//
// Hash schema (read precedence mirrors App206's content cascade: event > channel > section):
//   section   -> section      (omitted when 'discover')
//   event     -> openEventObj  (eventKey token; presence wins over channel)
//   channel   -> openCh        (icsUrl; ignored on read if event present)
//   q         -> query         (omitted when empty)
//   category  -> category      (omitted when null)
//   hood      -> neighborhood  (omitted when null)
//   date      -> dateScope     (omitted when 'all')
//   emphasis  -> emphasis      (omitted when 'calendars')

const DEFAULTS = {
  section: 'discover',
  event: null,
  channel: null,
  q: '',
  category: null,
  neighborhood: null,
  dateScope: 'all',
  emphasis: 'calendars',
}

// The only sections App206 renders. An unknown `section` from an untrusted /
// stale URL falls back to the default rather than dropping into App206's
// else-branch (YouView). React's JSX escaping already prevents injection; this
// is defense-in-depth plus sane fallback behavior.
const VALID_SECTIONS = new Set(['discover', 'following', 'you', 'map', 'health'])

// Build the canonical, fully-defaulted token object from a partial state.
function normalize(state) {
  return { ...DEFAULTS, ...(state || {}) }
}

/**
 * Serialize a token state object into a hash string (no leading '#').
 * Returns '' when every field is at its default, so the caller can write a
 * clean pathname instead of a dangling '#'.
 *
 * `state` shape: { section, event, channel, q, category, neighborhood, dateScope, emphasis }
 * where `event` and `channel` are already-stringified tokens (or null).
 */
export function serializeHash(state) {
  const s = normalize(state)
  const params = new URLSearchParams()

  if (s.section && s.section !== DEFAULTS.section) params.set('section', s.section)

  // The health dashboard has no overlay — never emit stale event/channel for it.
  if (s.section !== 'health') {
    if (s.event) params.set('event', s.event)
    else if (s.channel) params.set('channel', s.channel)
  }

  if (s.q && s.q.trim()) params.set('q', s.q)
  if (s.category) params.set('category', s.category)
  if (s.neighborhood) params.set('hood', s.neighborhood)
  if (s.dateScope && s.dateScope !== DEFAULTS.dateScope) params.set('date', s.dateScope)
  if (s.emphasis && s.emphasis !== DEFAULTS.emphasis) params.set('emphasis', s.emphasis)

  return params.toString()
}

/**
 * Parse a hash string (with or without a leading '#') into a fully-defaulted
 * token state object. Unknown params are ignored; malformed input never throws.
 * Enforces event > channel precedence (if both present, channel is dropped).
 */
export function deserializeHash(hash) {
  const raw = typeof hash === 'string' ? hash : ''
  const params = new URLSearchParams(raw.startsWith('#') ? raw.slice(1) : raw)

  const rawSection = params.get('section')
  const section = VALID_SECTIONS.has(rawSection) ? rawSection : DEFAULTS.section
  let event = params.get('event') || null
  let channel = params.get('channel') || null

  // Health has no overlay; event/channel are precedence-cascaded.
  if (section === 'health') {
    event = null
    channel = null
  } else if (event) {
    channel = null
  }

  return {
    section,
    event,
    channel,
    q: params.get('q') || DEFAULTS.q,
    category: params.get('category') || null,
    neighborhood: params.get('hood') || null,
    dateScope: params.get('date') || DEFAULTS.dateScope,
    emphasis: params.get('emphasis') || DEFAULTS.emphasis,
  }
}
