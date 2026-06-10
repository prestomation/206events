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
//   cost      -> costFilter    ('free' | '10' | '25'; omitted when null)
//   date      -> dateWindow    (number of days, or 'all'; omitted when 'all')
//   emphasis  -> emphasis      (omitted when 'calendars')
//   tab       -> healthTab     (health section only; omitted when 'sources')
//   source    -> healthSource  (health section only; the drilled-into source name)

const DEFAULTS = {
  section: 'discover',
  event: null,
  channel: null,
  q: '',
  category: null,
  neighborhood: null,
  cost: null,
  dateWindow: 'all',
  emphasis: 'calendars',
  healthTab: 'sources',
  healthSource: null,
}

// Legacy `date=` values from the old preset filter, mapped onto the nearest
// window stop so old deep-links keep working.
const LEGACY_DATE = { today: 0, weekend: 7, all: 'all' }

// Parse a `date=` token into a window value: a number of days, or 'all'.
function parseDateWindow(raw) {
  if (raw == null) return DEFAULTS.dateWindow
  if (raw in LEGACY_DATE) return LEGACY_DATE[raw]
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULTS.dateWindow
}

// The only sections App206 renders. An unknown `section` from an untrusted /
// stale URL falls back to the default rather than dropping into App206's
// else-branch (YouView). React's JSX escaping already prevents injection; this
// is defense-in-depth plus sane fallback behavior.
const VALID_SECTIONS = new Set(['discover', 'following', 'you', 'map', 'health'])

// The health dashboard's tab ids. An unknown `tab` token falls back to the
// default ('sources') rather than rendering an empty panel.
const VALID_HEALTH_TABS = new Set(['sources', 'errors', 'geo', 'uncertain', 'discovery'])

// Cost-filter buckets (must match COST_FILTER_OPTIONS in viewModels.js).
// An unknown `cost` token falls back to no filter.
const VALID_COSTS = new Set(['free', '10', '25'])

// Build the canonical, fully-defaulted token object from a partial state.
function normalize(state) {
  return { ...DEFAULTS, ...(state || {}) }
}

/**
 * Serialize a token state object into a hash string (no leading '#').
 * Returns '' when every field is at its default, so the caller can write a
 * clean pathname instead of a dangling '#'.
 *
 * `state` shape: { section, event, channel, q, category, neighborhood, dateWindow, emphasis }
 * where `event` and `channel` are already-stringified tokens (or null).
 */
export function serializeHash(state) {
  const s = normalize(state)
  const params = new URLSearchParams()

  if (s.section && s.section !== DEFAULTS.section) params.set('section', s.section)

  // The health dashboard has no event/channel overlay, but it carries its own
  // tab + drilled-into-source state; emit those only for the health section.
  if (s.section === 'health') {
    if (s.healthTab && s.healthTab !== DEFAULTS.healthTab) params.set('tab', s.healthTab)
    if (s.healthSource) params.set('source', s.healthSource)
  } else {
    if (s.event) params.set('event', s.event)
    else if (s.channel) params.set('channel', s.channel)
  }

  if (s.q && s.q.trim()) params.set('q', s.q)
  if (s.category) params.set('category', s.category)
  if (s.neighborhood) params.set('hood', s.neighborhood)
  if (s.cost) params.set('cost', s.cost)
  if (s.dateWindow !== undefined && s.dateWindow !== DEFAULTS.dateWindow) params.set('date', String(s.dateWindow))
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

  // Health has its own tab/source state instead of an event/channel overlay.
  let healthTab = DEFAULTS.healthTab
  let healthSource = DEFAULTS.healthSource
  if (section === 'health') {
    event = null
    channel = null
    const rawTab = params.get('tab')
    healthTab = VALID_HEALTH_TABS.has(rawTab) ? rawTab : DEFAULTS.healthTab
    healthSource = params.get('source') || null
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
    cost: VALID_COSTS.has(params.get('cost')) ? params.get('cost') : null,
    dateWindow: parseDateWindow(params.get('date')),
    emphasis: params.get('emphasis') || DEFAULTS.emphasis,
    healthTab,
    healthSource,
  }
}
