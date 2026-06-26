import { useEffect, useRef, useState } from 'react'

// Human-readable label + tone for each source status.
const STATUS_META = {
  ok: { label: 'Healthy', dot: 'health-status-ok' },
  error: { label: 'Parse errors', dot: 'health-status-error' },
  uncertain: { label: 'Uncertain events (resolver pending)', dot: 'health-status-warning' },
  warning: { label: 'Zero events (unexpected)', dot: 'health-status-warning' },
  'expected-empty': { label: 'Zero events (expected)', dot: 'health-status-expected-empty' },
  'unexpected-non-empty': { label: 'Has events but marked expectEmpty', dot: 'health-status-unexpected-non-empty' },
}

function statusDot(status) {
  const meta = STATUS_META[status]
  if (!meta) return null
  return <span className={`health-status-dot ${meta.dot}`} title={meta.label} />
}

// One summary card. Clickable cards (those backed by a detail panel) render as a
// button that activates the matching tab; pure coverage-ratio stat cards render
// as a static div. Keeping both in one component keeps the grid markup uniform.
function HealthCard({ value, label, tone, tab, onActivate, active }) {
  const cls = `health-card${tone ? ` health-card--${tone}` : ''}${tab ? ' health-card--clickable' : ''}${active ? ' health-card--active' : ''}`
  const inner = (
    <>
      <div className="health-card-value">{value}</div>
      <div className="health-card-label">{label}</div>
    </>
  )
  if (tab) {
    return (
      <button type="button" className={cls} onClick={() => onActivate(tab)}
        aria-pressed={!!active} title={`Show ${label}`}>{inner}</button>
    )
  }
  return <div className={cls}>{inner}</div>
}

// A consistent row in a detail list: a bold type/label, a reason, and an
// optional muted path/link slot.
function ErrorItem({ type, reason, path, href }) {
  return (
    <div className="health-error-item">
      {type != null && <span className="health-error-type">{type}</span>}
      {reason != null && <span className="health-error-reason">{reason}</span>}
      {href
        ? <a className="health-error-path" href={href} target="_blank" rel="noopener noreferrer">source</a>
        : (path != null && <span className="health-error-path">{path}</span>)}
    </div>
  )
}

// Dual-axis line chart: events (left, blue) and calendars (right, orange).
// Pure SVG — no dependencies.
function CoverageChart({ history }) {
  const W = 760, H = 260
  const ML = 58, MR = 58, MT = 28, MB = 46
  const PW = W - ML - MR, PH = H - MT - MB

  const dates = history.map(p => p.date)
  const events = history.map(p => p.events)
  const calendars = history.map(p => p.calendars)

  const eMin = 0, eMax = niceCeil(Math.max(...events))
  const cMin = 0, cMax = niceCeil(Math.max(...calendars))

  const xOf = i => ML + (i / (history.length - 1)) * PW
  const yOfE = v => MT + PH - (v / eMax) * PH
  const yOfC = v => MT + PH - (v / cMax) * PH

  const ePoints = history.map((p, i) => `${xOf(i)},${yOfE(p.events)}`).join(' ')
  const cPoints = history.map((p, i) => `${xOf(i)},${yOfC(p.calendars)}`).join(' ')

  // X-axis ticks: one per month boundary
  const xTicks = []
  let lastMonth = null
  history.forEach((p, i) => {
    const m = p.date.slice(0, 7)
    if (m !== lastMonth) { xTicks.push({ i, label: fmtMonth(p.date) }); lastMonth = m }
  })

  // Y gridlines (5 steps)
  const eGrids = [0, 0.25, 0.5, 0.75, 1].map(t => ({ y: MT + PH - t * PH, val: Math.round(t * eMax) }))
  const cGrids = [0, 0.25, 0.5, 0.75, 1].map(t => ({ val: Math.round(t * cMax) }))

  const dots = history.length <= 90

  return (
    <div className="health-coverage-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Event and calendar coverage over time">
        {/* gridlines */}
        {eGrids.map((g, i) => (
          <line key={i} x1={ML} x2={ML + PW} y1={g.y} y2={g.y} stroke="var(--line)" strokeWidth="1" />
        ))}

        {/* event series (blue) */}
        <polyline points={ePoints} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
        {dots && history.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOfE(p.events)} r="3" fill="#2563eb" />
        ))}

        {/* calendar series (orange) */}
        <polyline points={cPoints} fill="none" stroke="#ea580c" strokeWidth="2" strokeLinejoin="round" />
        {dots && history.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOfC(p.calendars)} r="3" fill="#ea580c" />
        ))}

        {/* left y-axis labels (events) */}
        {eGrids.map((g, i) => (
          <text key={i} x={ML - 6} y={g.y} textAnchor="end" dominantBaseline="middle"
            fontSize="11" fill="var(--ink-3)">{g.val.toLocaleString()}</text>
        ))}

        {/* right y-axis labels (calendars) */}
        {cGrids.map((g, i) => (
          <text key={i} x={ML + PW + 6} y={MT + PH - (g.val / cMax) * PH}
            textAnchor="start" dominantBaseline="middle"
            fontSize="11" fill="var(--ink-3)">{g.val}</text>
        ))}

        {/* x-axis ticks */}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={xOf(t.i)} x2={xOf(t.i)} y1={MT + PH} y2={MT + PH + 5} stroke="var(--line)" strokeWidth="1" />
            <text x={xOf(t.i)} y={MT + PH + 16} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{t.label}</text>
          </g>
        ))}

        {/* axis lines */}
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} stroke="var(--line)" strokeWidth="1" />
        <line x1={ML + PW} x2={ML + PW} y1={MT} y2={MT + PH} stroke="var(--line)" strokeWidth="1" />
        <line x1={ML} x2={ML + PW} y1={MT + PH} y2={MT + PH} stroke="var(--line)" strokeWidth="1" />

        {/* legend */}
        <rect x={W - MR - 130} y={MT + 4} width={10} height={10} rx="2" fill="#2563eb" />
        <text x={W - MR - 116} y={MT + 13} fontSize="11" fill="var(--ink-2)">Events</text>
        <rect x={W - MR - 130} y={MT + 20} width={10} height={10} rx="2" fill="#ea580c" />
        <text x={W - MR - 116} y={MT + 29} fontSize="11" fill="var(--ink-2)">Calendars</text>
      </svg>
    </div>
  )
}

function niceCeil(v) {
  if (v <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const steps = [1, 2, 2.5, 5, 10]
  for (const s of steps) {
    const candidate = Math.ceil(v / (mag * s)) * (mag * s)
    if (candidate >= v) return candidate
  }
  return Math.ceil(v / mag) * mag
}

function fmtMonth(dateStr) {
  const [, m] = dateStr.split('-')
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10)]
}

// Internal health dashboard: scrape source status, build errors, geo/uncertainty
// stats, and every non-fatal gap queue. Layout: a free-text filter, pinned
// summary cards (clickable — each opens its class's detail panel), a tab bar,
// the active detail panel, and a per-source drill-down drawer.
//
// The active tab and drilled-into source are *controlled* via props so they can
// be deep-linked in the URL hash (and so the browser back button closes the
// drawer instead of leaving the dashboard). App206 owns the state; this
// component renders it and reports changes through onTabChange / onSelectSource.
// The text filter is intentionally local (ephemeral) — it's a transient
// spot-check tool, not a shareable view.
export function HealthDashboard({
  calendars,
  healthTab = 'sources',
  healthSource = null,
  onTabChange = () => {},
  onSelectSource = () => {},
  debugMode = false,
  onToggleDebug = null,
}) {
  const activeTab = healthTab
  const [buildErrors, setBuildErrors] = useState(null)
  const [filter, setFilter] = useState('')
  const [eventHistory, setEventHistory] = useState([])

  useEffect(() => {
    fetch('./build-errors.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setBuildErrors(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('./event-history.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data) && data.length > 0) setEventHistory(data) })
      .catch(() => {})
  }, [])

  // Close the drawer on Escape.
  useEffect(() => {
    if (!healthSource) return
    const onKey = (e) => { if (e.key === 'Escape') onSelectSource(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [healthSource, onSelectSource])

  if (!buildErrors) {
    return (
      <div className="health-dashboard">
        <h1>Source Health Dashboard</h1>
        <p className="health-unavailable">Build errors data is not available. The health dashboard requires a successful build to generate data.</p>
      </div>
    )
  }

  const errorMap = {}
  if (buildErrors.sources) {
    buildErrors.sources.forEach(s => {
      const key = `${s.source}-${s.calendar}`
      errorMap[key] = s
    })
  }

  // Build a unified source list from eventCounts (most complete) or fallback to calendars.
  // Split parse errors from uncertainty so a source with only uncertain
  // events isn't visually indistinguishable from one with a broken parser.
  const sources = buildErrors.eventCounts
    ? buildErrors.eventCounts.map(c => {
        const errorKey = Object.keys(errorMap).find(k => k.endsWith(`-${c.name}`) || k === c.name)
        const errorEntry = errorKey ? errorMap[errorKey] : null
        const parseErrors = errorEntry?.parseErrorCount ?? errorEntry?.errorCount ?? 0
        const uncertaintyErrors = errorEntry?.uncertaintyCount ?? 0
        let status = 'ok'
        if (parseErrors > 0) status = 'error'
        else if (uncertaintyErrors > 0) status = 'uncertain'
        else if (c.events === 0 && !c.expectEmpty) status = 'warning'
        else if (c.events === 0 && c.expectEmpty) status = 'expected-empty'
        else if (c.events > 0 && c.expectEmpty) status = 'unexpected-non-empty'
        return {
          name: c.name,
          type: c.type,
          events: c.events,
          errors: parseErrors,
          uncertainty: uncertaintyErrors,
          errorDetails: errorEntry?.errors || [],
          status,
          expectEmpty: c.expectEmpty,
        }
      })
    : [] // No eventCounts available in older builds

  // Sort: errors first, then uncertain, then warnings, then unexpected-non-empty, then expected-empty, then ok
  const statusOrder = { error: 0, uncertain: 1, warning: 2, 'unexpected-non-empty': 3, 'expected-empty': 4, ok: 5 }
  sources.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

  // -- Raw class arrays from build-errors.json --
  const configErrors = buildErrors.configErrors || []
  const externalFailures = buildErrors.externalCalendarFailures || []
  const geocodeErrors = buildErrors.geocodeErrors || []
  const uncertainEvents = buildErrors.uncertainEvents || []
  const pendingProxyVerification = buildErrors.pendingProxyVerification || []
  const proxyStaleServes = buildErrors.proxyStaleServes || []
  const photoGaps = buildErrors.photoGaps || { venueGaps: [], eventGaps: [] }
  const photoVenueGaps = photoGaps.venueGaps || []
  const photoEventGaps = photoGaps.eventGaps || []
  const costGaps = buildErrors.costGaps || []
  const osmGaps = buildErrors.osmGaps || []
  const duplicateCandidates = buildErrors.duplicateCandidates || []
  const urlEntityErrors = buildErrors.urlEntityErrors || []
  const zeroNames = buildErrors.zeroEventCalendars || []
  const expectedEmptyNames = buildErrors.expectedEmptyCalendars || []
  const unexpectedNonEmpty = buildErrors.unexpectedNonEmptyCalendars || []

  // -- Free-text filter applied to every list + count on the page --
  const q = filter.trim().toLowerCase()
  const matches = (...parts) => !q || parts.some(p => p != null && String(p).toLowerCase().includes(q))

  const fSources = sources.filter(s => matches(s.name, s.type, s.status))
  const fConfig = configErrors.filter(e => matches(e.type, e.reason, e.error, e.path))
  const fExternal = externalFailures.filter(f => matches(f.name, f.friendlyName, f.error))
  const fUrlEntity = urlEntityErrors.filter(e => matches(e.source, e.calendar, e.field, e.value))
  const fGeo = geocodeErrors.filter(e => matches(e.source, e.location, e.reason))
  const fUncertain = uncertainEvents.filter(u => matches(u.source, u.event?.summary, u.event?.date, ...(u.unknownFields || [])))
  const fProxy = pendingProxyVerification.filter(p => matches(p.name, p.rung, p.recommendation, p.lastError))
  const fStale = proxyStaleServes.filter(p => matches(p.source, p.url, p.error))
  const fPhotoVenue = photoVenueGaps.filter(v => matches(v.source, v.name, v.label))
  const fPhotoEvent = photoEventGaps.filter(e => matches(e.source, e.summary, e.date))
  const fCost = costGaps.filter(e => matches(e.source, e.summary, e.date))
  const fOsm = osmGaps.filter(o => matches(o.source, o.name, o.label))
  const fDup = duplicateCandidates.filter(d => matches(d.key, ...(d.events || []).flatMap(e => [e.summary, e.location, e.icsUrl])))
  const fZero = zeroNames.filter(n => matches(n))
  const fExpected = expectedEmptyNames.filter(n => matches(n))
  const fUnexpected = unexpectedNonEmpty.filter(c => matches(c.name))

  // -- Counts (filtered) for the summary cards --
  const healthyCount = fSources.filter(s => s.status === 'ok').length
  const errorCount = fSources.filter(s => s.status === 'error').length
  const warningCount = fSources.filter(s => s.status === 'warning').length
  const expectedEmptyCount = fSources.filter(s => s.status === 'expected-empty').length
  const unexpectedNonEmptyCount = fSources.filter(s => s.status === 'unexpected-non-empty').length
  // Unique event count: a global aggregate when unfiltered (deduplicated across
  // tag feeds via geoStats); a filtered subtotal when a query is active.
  const uniqueEventCount = q
    ? fSources.reduce((sum, s) => sum + s.events, 0)
    : (buildErrors.geoStats?.totalEvents ?? sources.reduce((sum, s) => sum + s.events, 0))
  const photoGapCount = fPhotoVenue.length + fPhotoEvent.length

  // Coverage-ratio stat cards (events-with-geo/photo/cost, cross-source merged)
  // are global ratios with no list behind them — a ratio over a filtered subset
  // would mislead, so they're hidden while a query is active.
  const showCoverage = !q

  const tabs = [
    { id: 'sources', label: 'Sources', count: fSources.length, tone: 'neutral' },
    { id: 'errors', label: 'Errors', count: fConfig.length + fExternal.length + fUrlEntity.length, tone: 'error' },
    { id: 'geo', label: 'Geo', count: fGeo.length, tone: 'warning' },
    { id: 'uncertain', label: 'Uncertain', count: fUncertain.length, tone: 'warning' },
    { id: 'photo', label: 'Photos', count: photoGapCount, tone: 'warning' },
    { id: 'cost', label: 'Costs', count: fCost.length, tone: 'warning' },
    { id: 'duplicates', label: 'Duplicates', count: fDup.length, tone: 'warning' },
    { id: 'osm', label: 'OSM', count: fOsm.length, tone: 'warning' },
    { id: 'proxy', label: 'Proxy', count: fProxy.length, tone: 'warning' },
    { id: 'stale', label: 'Stale', count: fStale.length, tone: 'warning' },
    { id: 'zero', label: 'Zero events', count: fZero.length, tone: 'warning' },
    { id: 'expectempty', label: 'Expected empty', count: fExpected.length + fUnexpected.length, tone: 'neutral' },
    { id: 'discovery', label: 'Discovery', count: null, tone: 'neutral' },
  ]

  // Resolve the deep-linked source name to its row object (null if absent or
  // stale — e.g. a shared link to a source that no longer exists in this build).
  // Uses the unfiltered list so a deep link still resolves under an active filter.
  const selectedSource = healthSource ? sources.find(s => s.name === healthSource) || null : null

  // Per-source drill-down data for the drawer (best-effort name matching).
  const drawerUncertain = selectedSource
    ? uncertainEvents.filter(u => u.source === selectedSource.name)
    : []
  const drawerGeo = selectedSource
    ? geocodeErrors.filter(g => g.source === selectedSource.name)
    : []

  const emptyNote = q ? ' match your search.' : '.'

  return (
    <div className="health-dashboard">
      <div className="health-header">
        <div>
          <h1>Source Health Dashboard</h1>
          <p className="health-subtitle">
            Last built: {new Date(buildErrors.buildTime).toLocaleString()}
          </p>
        </div>
        {onToggleDebug && (
          <button
            type="button"
            className={`health-debug-toggle ${debugMode ? 'health-debug-toggle--on' : ''}`}
            role="switch"
            aria-checked={debugMode}
            onClick={onToggleDebug}
            title="Show raw build data on every venue and event page"
          >
            <span className="health-debug-toggle-track"><span className="health-debug-toggle-thumb" /></span>
            🐞 Debug mode {debugMode ? 'on' : 'off'}
          </button>
        )}
      </div>

      {eventHistory.length > 0 && <CoverageChart history={eventHistory} />}

      <div className="health-search">
        <input
          type="search"
          className="health-search-input"
          placeholder="Filter sources, events, errors…"
          aria-label="Filter all health data"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {q && (
          <button type="button" className="health-search-clear" onClick={() => setFilter('')} aria-label="Clear filter">
            Clear
          </button>
        )}
      </div>

      <div className="health-summary">
        <HealthCard value={fSources.length} label="Total Sources" tab="sources" onActivate={onTabChange} active={activeTab === 'sources'} />
        <HealthCard value={healthyCount} label="Healthy" tone="ok" tab="sources" onActivate={onTabChange} active={activeTab === 'sources'} />
        <HealthCard value={errorCount} label="With Errors" tone="error" tab="sources" onActivate={onTabChange} active={activeTab === 'sources'} />
        <HealthCard value={warningCount} label="Zero Events" tone="warning" tab="zero" onActivate={onTabChange} active={activeTab === 'zero'} />
        {expectedEmptyCount > 0 && (
          <HealthCard value={expectedEmptyCount} label="Expected Empty" tab="expectempty" onActivate={onTabChange} active={activeTab === 'expectempty'} />
        )}
        {unexpectedNonEmptyCount > 0 && (
          <HealthCard value={unexpectedNonEmptyCount} label="Expected Empty w/ Events" tone="info" tab="expectempty" onActivate={onTabChange} active={activeTab === 'expectempty'} />
        )}
        <HealthCard value={uniqueEventCount.toLocaleString()} label="Unique Events" />
        {showCoverage && buildErrors.geoStats && (
          <HealthCard value={`${buildErrors.geoStats.eventsWithGeo.toLocaleString()} / ${buildErrors.geoStats.totalEvents.toLocaleString()}`} label="Events with Geo" tone="ok" />
        )}
        <HealthCard value={`📍 ${fGeo.length}`} label="Geo Misses" tone="warning" tab="geo" onActivate={onTabChange} active={activeTab === 'geo'} />
        {buildErrors.uncertaintyStats && (
          <HealthCard value={`❓ ${q ? fUncertain.length : buildErrors.uncertaintyStats.outstanding}`} label="Uncertain Events" tone="warning" tab="uncertain" onActivate={onTabChange} active={activeTab === 'uncertain'} />
        )}
        {showCoverage && buildErrors.photoStats && (
          <HealthCard value={`🖼️ ${buildErrors.photoStats.eventsWithImage.toLocaleString()} / ${buildErrors.photoStats.totalEvents.toLocaleString()}`} label="Events with Photo" tone="ok" />
        )}
        {photoGapCount > 0 && (
          <HealthCard value={`🖼️ ${photoGapCount.toLocaleString()}`} label="Missing Photos" tone="warning" tab="photo" onActivate={onTabChange} active={activeTab === 'photo'} />
        )}
        {showCoverage && buildErrors.costStats && (
          <HealthCard value={`💲 ${buildErrors.costStats.eventsWithCost.toLocaleString()} / ${buildErrors.costStats.totalEvents.toLocaleString()}`} label="Events with Cost" tone="ok" />
        )}
        {showCoverage && buildErrors.costStats && buildErrors.costStats.soldOutEvents > 0 && (
          <HealthCard value={`🎟️ ${buildErrors.costStats.soldOutEvents.toLocaleString()}`} label="Sold Out" tone="ok" />
        )}
        {fCost.length > 0 && (
          <HealthCard value={`💲 ${fCost.length.toLocaleString()}`} label="Missing Costs" tone="warning" tab="cost" onActivate={onTabChange} active={activeTab === 'cost'} />
        )}
        {showCoverage && buildErrors.duplicateStats && (buildErrors.duplicateStats.merged > 0 || buildErrors.duplicateStats.candidates > 0) && (
          <HealthCard value={`🔀 ${buildErrors.duplicateStats.merged.toLocaleString()}`} label="Cross-source Merged" tone="ok" />
        )}
        {fDup.length > 0 && (
          <HealthCard value={`🔀 ${fDup.length.toLocaleString()}`} label="Duplicate Candidates" tone="warning" tab="duplicates" onActivate={onTabChange} active={activeTab === 'duplicates'} />
        )}
        {fOsm.length > 0 && (
          <HealthCard value={`🗺️ ${fOsm.length.toLocaleString()}`} label="OSM Gaps" tone="warning" tab="osm" onActivate={onTabChange} active={activeTab === 'osm'} />
        )}
        {fProxy.length > 0 && (
          <HealthCard value={`🪜 ${fProxy.length}`} label="Proxy Verification" tone="warning" tab="proxy" onActivate={onTabChange} active={activeTab === 'proxy'} />
        )}
        {fStale.length > 0 && (
          <HealthCard value={`🕒 ${fStale.length}`} label="Stale Browserbase" tone="warning" tab="stale" onActivate={onTabChange} active={activeTab === 'stale'} />
        )}
        {fUrlEntity.length > 0 && (
          <HealthCard value={`🔗 ${fUrlEntity.length}`} label="URL Entities" tone="error" tab="errors" onActivate={onTabChange} active={activeTab === 'errors'} />
        )}
      </div>

      <div className="health-tabs" role="tablist" aria-label="Health detail views">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`health-tab ${activeTab === tab.id ? 'health-tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className={`health-tab-badge health-tab-badge--${tab.tone}`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="health-tab-panel" role="tabpanel">
        {activeTab === 'sources' && (
          fSources.length > 0 ? (
            <div className="health-table-wrapper">
              <table className="health-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Events</th>
                    <th>Errors</th>
                    <th>Uncertain</th>
                  </tr>
                </thead>
                <tbody>
                  {fSources.map(source => (
                    <tr
                      key={source.name}
                      className={`health-row health-row--${source.status} health-row--expandable ${selectedSource?.name === source.name ? 'health-row--selected' : ''}`}
                      onClick={() => onSelectSource(source.name)}
                    >
                      <td>{statusDot(source.status)}</td>
                      <td className="health-source-name">{source.name}</td>
                      <td>{source.type}</td>
                      <td>{source.events}{source.expectEmpty && source.events === 0 ? ' (expected)' : ''}{source.expectEmpty && source.events > 0 ? ' (remove expectEmpty)' : ''}</td>
                      <td>{source.errors > 0 ? source.errors : ''}</td>
                      <td>{source.uncertainty > 0 ? source.uncertainty : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="health-empty">No sources{emptyNote}</p>
          )
        )}

        {activeTab === 'errors' && (
          (fConfig.length + fExternal.length + fUrlEntity.length) > 0 ? (
            <>
              {fUrlEntity.length > 0 && (
                <div className="health-section">
                  <h2>🔗 URL Entity Errors ({fUrlEntity.length})</h2>
                  <p className="health-subtitle">
                    HTML entities (e.g. <code>&amp;amp;</code>) found in URL fields. These are
                    always broken links and fail the build — decode the entity in the ripper
                    (<code>html-entities</code>) or write the literal character in the YAML.
                  </p>
                  <div className="health-error-list">
                    {fUrlEntity.map((err, i) => (
                      <ErrorItem key={i}
                        type={`${err.source}${err.calendar ? ` / ${err.calendar}` : ''}`}
                        reason={`${err.field} (${err.entities.join(', ')}): ${err.value}`} />
                    ))}
                  </div>
                </div>
              )}
              {fConfig.length > 0 && (
                <div className="health-section">
                  <h2>Configuration Errors ({fConfig.length})</h2>
                  <div className="health-error-list">
                    {fConfig.map((err, i) => (
                      <ErrorItem key={i} type={err.type} reason={err.reason || err.error} path={err.path} />
                    ))}
                  </div>
                </div>
              )}
              {fExternal.length > 0 && (
                <div className="health-section">
                  <h2>External Calendar Failures ({fExternal.length})</h2>
                  <div className="health-error-list">
                    {fExternal.map((f, i) => (
                      <ErrorItem key={i} type={f.friendlyName || f.name} reason={f.error} />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="health-empty">✅ No configuration or external calendar errors{emptyNote}</p>
          )
        )}

        {activeTab === 'geo' && (
          fGeo.length > 0 ? (
            <div className="health-section">
              <h2>📍 Geocode Errors ({fGeo.length})</h2>
              <div className="health-error-list">
                {fGeo.map((err, i) => (
                  <ErrorItem key={i} type={err.source} reason={err.location} path={err.reason} />
                ))}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No geocode errors{emptyNote}</p>
          )
        )}

        {activeTab === 'uncertain' && (
          fUncertain.length > 0 ? (
            <div className="health-section">
              <h2>❓ Uncertain Events ({fUncertain.length})</h2>
              <p className="health-subtitle">
                Events where the ripper couldn't determine one or more fields (typically start time).
                The placeholder values you see in the calendar will be replaced once the
                event-uncertainty-resolver skill investigates and writes a resolution into
                the cache. Resolved this build: {buildErrors.uncertaintyStats?.resolvedFromCache ?? 0};
                marked unresolvable: {buildErrors.uncertaintyStats?.acknowledgedUnresolvable ?? 0}.
              </p>
              <div className="health-error-list">
                {fUncertain.slice(0, 50).map((u, i) => (
                  <ErrorItem key={i} type={u.source}
                    reason={`${u.event.summary} — ${u.event.date} (missing: ${u.unknownFields.join(', ')})`}
                    href={u.event.url || undefined} />
                ))}
                {fUncertain.length > 50 && (
                  <p>…and {fUncertain.length - 50} more.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No uncertain events pending resolution{emptyNote}</p>
          )
        )}

        {activeTab === 'photo' && (
          photoGapCount > 0 ? (
            <>
              <p className="health-subtitle">
                Missing photos are non-fatal. Backfill venue photos via the source YAML
                (<code>imageUrl:</code>) and event photos via the event-uncertainty-cache —
                see the photo-resolver skill.
              </p>
              {fPhotoVenue.length > 0 && (
                <div className="health-section">
                  <h2>🖼️ Venue Photo Gaps ({fPhotoVenue.length})</h2>
                  <div className="health-error-list">
                    {fPhotoVenue.map((v, i) => (
                      <ErrorItem key={i} type={v.name} reason={v.label || v.source} href={v.mapUrl || undefined} />
                    ))}
                  </div>
                </div>
              )}
              {fPhotoEvent.length > 0 && (
                <div className="health-section">
                  <h2>🖼️ Event Photo Gaps ({fPhotoEvent.length})</h2>
                  <div className="health-error-list">
                    {fPhotoEvent.slice(0, 100).map((e, i) => (
                      <ErrorItem key={i} type={e.source} reason={`${e.summary} — ${e.date}`} href={e.url || undefined} />
                    ))}
                    {fPhotoEvent.length > 100 && <p>…and {fPhotoEvent.length - 100} more.</p>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="health-empty">✅ No photo gaps{emptyNote}</p>
          )
        )}

        {activeTab === 'cost' && (
          fCost.length > 0 ? (
            <div className="health-section">
              <h2>💲 Cost Gaps ({fCost.length})</h2>
              <p className="health-subtitle">
                Events with no confirmed price. Non-fatal — backfill via the cost-resolver skill.
              </p>
              <div className="health-error-list">
                {fCost.slice(0, 100).map((e, i) => (
                  <ErrorItem key={i} type={e.source} reason={`${e.summary} — ${e.date}`} href={e.url || undefined} />
                ))}
                {fCost.length > 100 && <p>…and {fCost.length - 100} more.</p>}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No cost gaps{emptyNote}</p>
          )
        )}

        {activeTab === 'duplicates' && (
          fDup.length > 0 ? (
            <div className="health-section">
              <h2>🔀 Duplicate Candidates ({fDup.length})</h2>
              <p className="health-subtitle">
                MED-confidence cross-source pairs awaiting review — the same real-world event
                listed by two sources. Confirm or reject via the duplicate-resolver skill.
              </p>
              <div className="health-error-list">
                {fDup.slice(0, 100).map((d, i) => {
                  const evs = d.events || []
                  const score = d.score
                  const scoreText = score
                    ? `title ${score.title}, ${score.distanceM == null ? 'no coords' : `${score.distanceM} m`}`
                    : undefined
                  return (
                    <ErrorItem key={i}
                      type={evs[0]?.summary}
                      reason={`${evs.map(e => (e.icsUrl || '').replace(/\.ics$/, '')).join(' ↔ ')} — ${evs[0]?.date ?? ''}`}
                      path={scoreText} />
                  )
                })}
                {fDup.length > 100 && <p>…and {fDup.length - 100} more.</p>}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No duplicate candidates{emptyNote}</p>
          )
        )}

        {activeTab === 'osm' && (
          fOsm.length > 0 ? (
            <div className="health-section">
              <h2>🗺️ OSM Gaps ({fOsm.length})</h2>
              <p className="health-subtitle">
                Venues with coordinates but no OpenStreetMap feature id. Non-fatal — the
                geo-resolver / osm-resolver skill fills these in so map links resolve to a place.
              </p>
              <div className="health-error-list">
                {fOsm.slice(0, 100).map((o, i) => (
                  <ErrorItem key={i} type={o.name} reason={o.label || `${o.lat}, ${o.lng}`} path={o.source} />
                ))}
                {fOsm.length > 100 && <p>…and {fOsm.length - 100} more.</p>}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No OSM gaps{emptyNote}</p>
          )
        )}

        {activeTab === 'proxy' && (
          fProxy.length > 0 ? (
            <div className="health-section">
              <h2>🪜 Proxy Verification Queue ({fProxy.length})</h2>
              <p className="health-subtitle">
                Sources that need a proxy to be fetched at all, still climbing the
                escalation ladder (<code>outofband → browserbase → disabled</code>).
                These are non-fatal: a brand-new proxy source can't be proven in CI, so
                it's tracked here instead of failing the build. The proxy-escalation skill
                promotes a source to browserbase after 3 consecutive failures, and retires
                it (disable + mark blocked) if browserbase also fails 3 times.
              </p>
              <div className="health-table-wrapper">
                <table className="health-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Rung</th>
                      <th>Consecutive failures</th>
                      <th>Recommendation</th>
                      <th>Last error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fProxy.map(p => (
                      <tr key={p.name} className="health-row">
                        <td className="health-source-name">{p.name}</td>
                        <td>{p.rung}</td>
                        <td>{p.consecutiveFailures}</td>
                        <td>{p.recommendation}</td>
                        <td>{p.lastError || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No proxy sources pending verification{emptyNote}</p>
          )
        )}

        {activeTab === 'stale' && (
          fStale.length > 0 ? (
            <div className="health-section">
              <h2>🕒 Stale Cache Serves ({fStale.length})</h2>
              <p className="health-subtitle">
                Sources served from a cached copy older than the TTL because the live fetch
                failed. Counted in total errors. See <code>docs/fetch-cache.md</code>.
              </p>
              <div className="health-error-list">
                {fStale.map((p, i) => (
                  <ErrorItem key={i}
                    type={p.source || p.url}
                    reason={p.error || 'live fetch failed'}
                    path={p.ageHours != null ? `${Math.round(p.ageHours)}h old` : undefined} />
                ))}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No stale cache serves{emptyNote}</p>
          )
        )}

        {activeTab === 'zero' && (
          fZero.length > 0 ? (
            <div className="health-section">
              <h2>⚠️ Zero-Event Calendars ({fZero.length})</h2>
              <p className="health-subtitle">
                Calendars that produced 0 events unexpectedly. Investigate the source (404/403,
                format change) — or add <code>expectEmpty: true</code> if it's a legitimately
                intermittent venue.
              </p>
              <div className="health-error-list">
                {fZero.map((name, i) => (
                  <ErrorItem key={i} type={name} />
                ))}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No unexpected zero-event calendars{emptyNote}</p>
          )
        )}

        {activeTab === 'expectempty' && (
          (fExpected.length + fUnexpected.length) > 0 ? (
            <>
              {fExpected.length > 0 && (
                <div className="health-section">
                  <h2>Expected-Empty Calendars ({fExpected.length})</h2>
                  <p className="health-subtitle">
                    Calendars flagged <code>expectEmpty: true</code> that produced 0 events — not a problem.
                  </p>
                  <div className="health-error-list">
                    {fExpected.map((name, i) => (
                      <ErrorItem key={i} type={name} />
                    ))}
                  </div>
                </div>
              )}
              {fUnexpected.length > 0 && (
                <div className="health-section">
                  <h2>Marked expectEmpty but has events ({fUnexpected.length})</h2>
                  <p className="health-subtitle">
                    These now produce events — consider removing the <code>expectEmpty</code> flag so
                    a future regression to 0 is caught.
                  </p>
                  <div className="health-error-list">
                    {fUnexpected.map((c, i) => (
                      <ErrorItem key={i} type={c.name} reason={`${c.events} events`} />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="health-empty">No expected-empty calendars{emptyNote}</p>
          )
        )}

        {activeTab === 'discovery' && (
          <div className="health-section">
            <h2>Discovery API</h2>
            <p>
              Machine-readable data files for LLMs, scripts, and downstream apps.
              Start at <a href="index.json" target="_blank" rel="noopener noreferrer">index.json</a> —
              it links to every other file. See <a href="llms.txt" target="_blank" rel="noopener noreferrer">llms.txt</a>{' '}
              for usage info.
            </p>
          </div>
        )}
      </div>

      {buildErrors.totalErrors > 0 && (
        <p className="health-total-errors">
          Total errors across all sources: {buildErrors.totalErrors}
          {buildErrors.uncertaintyStats?.outstanding > 0
            ? ` (includes ${buildErrors.uncertaintyStats.outstanding} uncertain event(s) pending agent resolution)`
            : ''}
        </p>
      )}

      {selectedSource && (
        <SourceDrawer
          source={selectedSource}
          uncertain={drawerUncertain}
          geo={drawerGeo}
          onClose={() => onSelectSource(null)}
        />
      )}
    </div>
  )
}

// Right-side drill-down panel for a single source.
function SourceDrawer({ source, uncertain, geo, onClose }) {
  const statusLabel = STATUS_META[source.status]?.label ?? source.status
  const eventsLabel = `${source.events}${source.expectEmpty && source.events === 0 ? ' (expected empty)' : ''}${source.expectEmpty && source.events > 0 ? ' (remove expectEmpty)' : ''}`
  const clean = source.errorDetails.length === 0 && uncertain.length === 0 && geo.length === 0

  return (
    <div className="health-drawer-overlay" onClick={onClose}>
      <aside
        className="health-drawer"
        role="dialog"
        aria-label={`Details for ${source.name}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="health-drawer-header">
          <div className="health-drawer-title">
            {statusDot(source.status)}
            <h2>{source.name}</h2>
          </div>
          <button className="health-drawer-close" onClick={onClose} aria-label="Close details">✕</button>
        </div>

        <dl className="health-drawer-meta">
          <div><dt>Status</dt><dd>{statusLabel}</dd></div>
          <div><dt>Type</dt><dd>{source.type}</dd></div>
          <div><dt>Events</dt><dd>{eventsLabel}</dd></div>
          <div><dt>Parse errors</dt><dd>{source.errors}</dd></div>
          <div><dt>Uncertain</dt><dd>{source.uncertainty}</dd></div>
        </dl>

        {clean && (
          <p className="health-empty">✅ No errors, geocode misses, or uncertain events for this source.</p>
        )}

        {source.errorDetails.length > 0 && (
          <div className="health-section">
            <h2>Parse Errors ({source.errorDetails.length})</h2>
            <div className="health-error-list">
              {source.errorDetails.map((err, i) => (
                <div key={i} className="health-error-item">
                  <span className="health-error-type">{err.type}</span>
                  <span className="health-error-reason">{err.reason}</span>
                  {err.context && <span className="health-error-context">{err.context}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {uncertain.length > 0 && (
          <div className="health-section">
            <h2>❓ Uncertain Events ({uncertain.length})</h2>
            <div className="health-error-list">
              {uncertain.map((u, i) => (
                <div key={i} className="health-error-item">
                  <span className="health-error-reason">
                    {u.event.summary} — {u.event.date} (missing: {u.unknownFields.join(', ')})
                  </span>
                  {u.event.url && (
                    <a className="health-error-path" href={u.event.url} target="_blank" rel="noopener noreferrer">
                      source
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {geo.length > 0 && (
          <div className="health-section">
            <h2>📍 Geocode Errors ({geo.length})</h2>
            <div className="health-error-list">
              {geo.map((err, i) => (
                <div key={i} className="health-error-item">
                  <span className="health-error-reason">{err.location}</span>
                  <span className="health-error-path">{err.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
