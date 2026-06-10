import { useEffect } from 'react'

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

// Internal health dashboard: scrape source status, build errors, geo/uncertainty stats.
// Layout: pinned summary cards (display-only) + tabbed detail views, with a
// per-source detail drawer for drill-down.
//
// The active tab and drilled-into source are *controlled* via props so they can
// be deep-linked in the URL hash (and so the browser back button closes the
// drawer instead of leaving the dashboard). App206 owns the state; this
// component renders it and reports changes through onTabChange / onSelectSource.
export function HealthDashboard({
  buildErrors,
  calendars,
  healthTab = 'sources',
  healthSource = null,
  onTabChange = () => {},
  onSelectSource = () => {},
}) {
  const activeTab = healthTab

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

  const healthyCount = sources.filter(s => s.status === 'ok').length
  const errorCount = sources.filter(s => s.status === 'error').length
  const warningCount = sources.filter(s => s.status === 'warning').length
  const expectedEmptyCount = sources.filter(s => s.status === 'expected-empty').length
  const unexpectedNonEmptyCount = sources.filter(s => s.status === 'unexpected-non-empty').length
  // Use geoStats.totalEvents for unique event count (deduplicated across tag-aggregate feeds)
  // Fall back to sum of per-source counts if geoStats not available
  const uniqueEventCount = buildErrors.geoStats?.totalEvents ?? sources.reduce((sum, s) => sum + s.events, 0)

  const configErrors = buildErrors.configErrors || []
  const externalFailures = buildErrors.externalCalendarFailures || []
  const geocodeErrors = buildErrors.geocodeErrors || []
  const uncertainEvents = buildErrors.uncertainEvents || []
  const pendingProxyVerification = buildErrors.pendingProxyVerification || []
  const proxyStaleServes = buildErrors.proxyStaleServes || []
  const photoGaps = buildErrors.photoGaps || { venueGaps: [], eventGaps: [] }
  const photoGapCount = (photoGaps.venueGaps?.length || 0) + (photoGaps.eventGaps?.length || 0)
  const costGapCount = (buildErrors.costGaps || []).length
  const urlEntityErrors = buildErrors.urlEntityErrors || []

  const tabs = [
    { id: 'sources', label: 'Sources', count: sources.length, tone: 'neutral' },
    { id: 'errors', label: 'Errors', count: configErrors.length + externalFailures.length + urlEntityErrors.length, tone: 'error' },
    { id: 'geo', label: 'Geo', count: geocodeErrors.length, tone: 'warning' },
    { id: 'uncertain', label: 'Uncertain', count: uncertainEvents.length, tone: 'warning' },
    { id: 'proxy', label: 'Proxy', count: pendingProxyVerification.length, tone: 'warning' },
    { id: 'discovery', label: 'Discovery', count: null, tone: 'neutral' },
  ]

  // Resolve the deep-linked source name to its row object (null if absent or
  // stale — e.g. a shared link to a source that no longer exists in this build).
  const selectedSource = healthSource ? sources.find(s => s.name === healthSource) || null : null

  // Per-source drill-down data for the drawer (best-effort name matching).
  const drawerUncertain = selectedSource
    ? uncertainEvents.filter(u => u.source === selectedSource.name)
    : []
  const drawerGeo = selectedSource
    ? geocodeErrors.filter(g => g.source === selectedSource.name)
    : []

  return (
    <div className="health-dashboard">
      <h1>Source Health Dashboard</h1>
      <p className="health-subtitle">
        Last built: {new Date(buildErrors.buildTime).toLocaleString()}
      </p>

      <div className="health-summary">
        <div className="health-card">
          <div className="health-card-value">{sources.length}</div>
          <div className="health-card-label">Total Sources</div>
        </div>
        <div className="health-card health-card--ok">
          <div className="health-card-value">{healthyCount}</div>
          <div className="health-card-label">Healthy</div>
        </div>
        <div className="health-card health-card--error">
          <div className="health-card-value">{errorCount}</div>
          <div className="health-card-label">With Errors</div>
        </div>
        <div className="health-card health-card--warning">
          <div className="health-card-value">{warningCount}</div>
          <div className="health-card-label">Zero Events</div>
        </div>
        {expectedEmptyCount > 0 && (
          <div className="health-card">
            <div className="health-card-value">{expectedEmptyCount}</div>
            <div className="health-card-label">Expected Empty</div>
          </div>
        )}
        {unexpectedNonEmptyCount > 0 && (
          <div className="health-card health-card--info">
            <div className="health-card-value">{unexpectedNonEmptyCount}</div>
            <div className="health-card-label">Expected Empty w/ Events</div>
          </div>
        )}
        <div className="health-card">
          <div className="health-card-value">{uniqueEventCount.toLocaleString()}</div>
          <div className="health-card-label">Unique Events</div>
        </div>
        {buildErrors.geoStats && (
          <div className="health-card health-card--ok">
            <div className="health-card-value">{buildErrors.geoStats.eventsWithGeo.toLocaleString()} / {buildErrors.geoStats.totalEvents.toLocaleString()}</div>
            <div className="health-card-label">Events with Geo</div>
          </div>
        )}
        <div className="health-card health-card--warning">
          <div className="health-card-value">📍 {buildErrors.geoStats?.geocodeErrors ?? geocodeErrors.length}</div>
          <div className="health-card-label">Geo Misses</div>
        </div>
        {buildErrors.uncertaintyStats && (
          <div className="health-card health-card--warning">
            <div className="health-card-value">❓ {buildErrors.uncertaintyStats.outstanding}</div>
            <div className="health-card-label">Uncertain Events</div>
          </div>
        )}
        {buildErrors.photoStats && (
          <div className="health-card health-card--ok">
            <div className="health-card-value">🖼️ {buildErrors.photoStats.eventsWithImage.toLocaleString()} / {buildErrors.photoStats.totalEvents.toLocaleString()}</div>
            <div className="health-card-label">Events with Photo</div>
          </div>
        )}
        {photoGapCount > 0 && (
          <div className="health-card health-card--warning">
            <div className="health-card-value">🖼️ {photoGapCount.toLocaleString()}</div>
            <div className="health-card-label">Missing Photos</div>
          </div>
        )}
        {buildErrors.costStats && (
          <div className="health-card health-card--ok">
            <div className="health-card-value">💲 {buildErrors.costStats.eventsWithCost.toLocaleString()} / {buildErrors.costStats.totalEvents.toLocaleString()}</div>
            <div className="health-card-label">Events with Cost</div>
          </div>
        )}
        {costGapCount > 0 && (
          <div className="health-card health-card--warning">
            <div className="health-card-value">💲 {costGapCount.toLocaleString()}</div>
            <div className="health-card-label">Missing Costs</div>
          </div>
        )}
        {pendingProxyVerification.length > 0 && (
          <div className="health-card health-card--warning">
            <div className="health-card-value">🪜 {pendingProxyVerification.length}</div>
            <div className="health-card-label">Proxy Verification</div>
          </div>
        )}
        {proxyStaleServes.length > 0 && (
          <div className="health-card health-card--warning">
            <div className="health-card-value">🕒 {proxyStaleServes.length}</div>
            <div className="health-card-label">Stale Browserbase</div>
          </div>
        )}
        {urlEntityErrors.length > 0 && (
          <div className="health-card health-card--error">
            <div className="health-card-value">🔗 {urlEntityErrors.length}</div>
            <div className="health-card-label">URL Entities</div>
          </div>
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
          sources.length > 0 ? (
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
                  {sources.map(source => (
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
            <p className="health-empty">No source data in this build.</p>
          )
        )}

        {activeTab === 'errors' && (
          (configErrors.length + externalFailures.length + urlEntityErrors.length) > 0 ? (
            <>
              {urlEntityErrors.length > 0 && (
                <div className="health-section">
                  <h2>🔗 URL Entity Errors ({urlEntityErrors.length})</h2>
                  <p className="health-subtitle">
                    HTML entities (e.g. <code>&amp;amp;</code>) found in URL fields. These are
                    always broken links and fail the build — decode the entity in the ripper
                    (<code>html-entities</code>) or write the literal character in the YAML.
                  </p>
                  <div className="health-error-list">
                    {urlEntityErrors.map((err, i) => (
                      <div key={i} className="health-error-item">
                        <span className="health-error-type">{err.source}{err.calendar ? ` / ${err.calendar}` : ''}</span>
                        <span className="health-error-reason">{err.field} ({err.entities.join(', ')}): {err.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {configErrors.length > 0 && (
                <div className="health-section">
                  <h2>Configuration Errors ({configErrors.length})</h2>
                  <div className="health-error-list">
                    {configErrors.map((err, i) => (
                      <div key={i} className="health-error-item">
                        <span className="health-error-type">{err.type}</span>
                        <span className="health-error-reason">{err.reason || err.error}</span>
                        {err.path && <span className="health-error-path">{err.path}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {externalFailures.length > 0 && (
                <div className="health-section">
                  <h2>External Calendar Failures ({externalFailures.length})</h2>
                  <div className="health-error-list">
                    {externalFailures.map((f, i) => (
                      <div key={i} className="health-error-item">
                        <span className="health-error-type">{f.friendlyName || f.name}</span>
                        <span className="health-error-reason">{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="health-empty">✅ No configuration or external calendar errors.</p>
          )
        )}

        {activeTab === 'geo' && (
          geocodeErrors.length > 0 ? (
            <div className="health-section">
              <h2>📍 Geocode Errors ({geocodeErrors.length})</h2>
              <div className="health-error-list">
                {geocodeErrors.map((err, i) => (
                  <div key={i} className="health-error-item">
                    <span className="health-error-type">{err.source}</span>
                    <span className="health-error-reason">{err.location}</span>
                    <span className="health-error-path">{err.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No geocode errors.</p>
          )
        )}

        {activeTab === 'uncertain' && (
          uncertainEvents.length > 0 ? (
            <div className="health-section">
              <h2>❓ Uncertain Events ({uncertainEvents.length})</h2>
              <p className="health-subtitle">
                Events where the ripper couldn't determine one or more fields (typically start time).
                The placeholder values you see in the calendar will be replaced once the
                event-uncertainty-resolver skill investigates and writes a resolution into
                the cache. Resolved this build: {buildErrors.uncertaintyStats?.resolvedFromCache ?? 0};
                marked unresolvable: {buildErrors.uncertaintyStats?.acknowledgedUnresolvable ?? 0}.
              </p>
              <div className="health-error-list">
                {uncertainEvents.slice(0, 50).map((u, i) => (
                  <div key={i} className="health-error-item">
                    <span className="health-error-type">{u.source}</span>
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
                {uncertainEvents.length > 50 && (
                  <p>…and {uncertainEvents.length - 50} more.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="health-empty">✅ No uncertain events pending resolution.</p>
          )
        )}

        {activeTab === 'proxy' && (
          pendingProxyVerification.length > 0 ? (
            <div className="health-section">
              <h2>🪜 Proxy Verification Queue ({pendingProxyVerification.length})</h2>
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
                    {pendingProxyVerification.map(p => (
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
            <p className="health-empty">✅ No proxy sources pending verification.</p>
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
