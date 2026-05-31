import { useState } from 'react'

// Internal health dashboard: scrape source status, build errors, geo/uncertainty stats.
export function HealthDashboard({ buildErrors, calendars }) {
  const [expandedSource, setExpandedSource] = useState(null)

  if (!buildErrors) {
    return (
      <div className="health-dashboard">
        <h1>Source Health Dashboard</h1>
        <p className="health-unavailable">Build errors data is not available. The health dashboard requires a successful build to generate data.</p>
      </div>
    )
  }

  const eventCountMap = {}
  if (buildErrors.eventCounts) {
    buildErrors.eventCounts.forEach(c => { eventCountMap[c.name] = c })
  }

  const errorMap = {}
  if (buildErrors.sources) {
    buildErrors.sources.forEach(s => {
      const key = `${s.source}-${s.calendar}`
      errorMap[key] = s
    })
  }

  const zeroSet = new Set(buildErrors.zeroEventCalendars || [])
  const expectedEmptySet = new Set(buildErrors.expectedEmptyCalendars || [])

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
  const uncertainSourceCount = sources.filter(s => s.status === 'uncertain').length
  const warningCount = sources.filter(s => s.status === 'warning').length
  const expectedEmptyCount = sources.filter(s => s.status === 'expected-empty').length
  const unexpectedNonEmptyCount = sources.filter(s => s.status === 'unexpected-non-empty').length
  // Use geoStats.totalEvents for unique event count (deduplicated across tag-aggregate feeds)
  // Fall back to sum of per-source counts if geoStats not available
  const uniqueEventCount = buildErrors.geoStats?.totalEvents ?? sources.reduce((sum, s) => sum + s.events, 0)

  const configErrors = buildErrors.configErrors || []
  const externalFailures = buildErrors.externalCalendarFailures || []

  const statusIcon = (status) => {
    if (status === 'ok') return <span className="health-status-dot health-status-ok" title="Healthy" />
    if (status === 'error') return <span className="health-status-dot health-status-error" title="Has parse errors" />
    if (status === 'uncertain') return <span className="health-status-dot health-status-warning" title="Has uncertain events (resolver pending)" />
    if (status === 'warning') return <span className="health-status-dot health-status-warning" title="Zero events (unexpected)" />
    if (status === 'expected-empty') return <span className="health-status-dot health-status-expected-empty" title="Zero events (expected)" />
    if (status === 'unexpected-non-empty') return <span className="health-status-dot health-status-unexpected-non-empty" title="Has events but marked expectEmpty" />
    return null
  }

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
          <div className="health-card-value">📍 {buildErrors.geoStats?.geocodeErrors ?? buildErrors.geocodeErrors?.length ?? 0}</div>
          <div className="health-card-label">Geo Misses</div>
        </div>
        {buildErrors.uncertaintyStats && (
          <div className="health-card health-card--warning">
            <div className="health-card-value">❓ {buildErrors.uncertaintyStats.outstanding}</div>
            <div className="health-card-label">Uncertain Events</div>
          </div>
        )}
      </div>

      <div className="health-section">
        <h2>Discovery API</h2>
        <p>
          Machine-readable data files for LLMs, scripts, and downstream apps.
          Start at <a href="index.json" target="_blank" rel="noopener noreferrer">index.json</a> —
          it links to every other file. See <a href="llms.txt" target="_blank" rel="noopener noreferrer">llms.txt</a>{' '}
          for usage info.
        </p>
      </div>

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

      {(buildErrors.uncertainEvents?.length || 0) > 0 && (
        <div className="health-section">
          <h2>❓ Uncertain Events ({buildErrors.uncertainEvents.length})</h2>
          <p className="health-subtitle">
            Events where the ripper couldn't determine one or more fields (typically start time).
            The placeholder values you see in the calendar will be replaced once the
            event-uncertainty-resolver skill investigates and writes a resolution into
            the cache. Resolved this build: {buildErrors.uncertaintyStats?.resolvedFromCache ?? 0};
            marked unresolvable: {buildErrors.uncertaintyStats?.acknowledgedUnresolvable ?? 0}.
          </p>
          <div className="health-error-list">
            {buildErrors.uncertainEvents.slice(0, 50).map((u, i) => (
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
            {buildErrors.uncertainEvents.length > 50 && (
              <p>…and {buildErrors.uncertainEvents.length - 50} more.</p>
            )}
          </div>
        </div>
      )}

      {(buildErrors.geocodeErrors?.length || 0) > 0 && (
        <div className="health-section">
          <h2>📍 Geocode Errors ({buildErrors.geocodeErrors.length})</h2>
          <div className="health-error-list">
            {buildErrors.geocodeErrors.map((err, i) => (
              <div key={i} className="health-error-item">
                <span className="health-error-type">{err.source}</span>
                <span className="health-error-reason">{err.location}</span>
                <span className="health-error-path">{err.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="health-section">
          <h2>Source Status</h2>
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
                    className={`health-row health-row--${source.status} ${source.errorDetails.length > 0 ? 'health-row--expandable' : ''}`}
                    onClick={() => source.errorDetails.length > 0 && setExpandedSource(expandedSource === source.name ? null : source.name)}
                  >
                    <td>{statusIcon(source.status)}</td>
                    <td className="health-source-name">
                      {source.name}
                      {source.errorDetails.length > 0 && (
                        <span className="health-expand-icon">{expandedSource === source.name ? '▼' : '▶'}</span>
                      )}
                      {expandedSource === source.name && (
                        <div className="health-error-details" onClick={e => e.stopPropagation()}>
                          {source.errorDetails.map((err, i) => (
                            <div key={i} className="health-error-detail">
                              <span className="health-error-type">{err.type}</span>
                              <span className="health-error-reason">{err.reason}</span>
                              {err.context && <span className="health-error-context">{err.context}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{source.type}</td>
                    <td>{source.events}{source.expectEmpty && source.events === 0 ? ' (expected)' : ''}{source.expectEmpty && source.events > 0 ? ' (remove expectEmpty)' : ''}</td>
                    <td>{source.errors > 0 ? source.errors : ''}</td>
                    <td>{source.uncertainty > 0 ? source.uncertainty : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {buildErrors.totalErrors > 0 && (
        <p className="health-total-errors">
          Total errors across all sources: {buildErrors.totalErrors}
          {buildErrors.uncertaintyStats?.outstanding > 0
            ? ` (includes ${buildErrors.uncertaintyStats.outstanding} uncertain event(s) pending agent resolution)`
            : ''}
        </p>
      )}
    </div>
  )
}
