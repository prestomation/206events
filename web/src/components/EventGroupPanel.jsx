import { useEffect } from 'react'
import { googleMapsUrl } from '../lib/maplink.js'
import { eventKey } from '../lib/eventKey.js'
import { AttributionChips } from './AttributionChips.jsx'

// Hard cap on rendered date rows so a very long run (a nightly show over a wide
// window) can't balloon the DOM. Overflow is summarised as "+N more dates".
export const MAX_GROUP_DATES = 50

// Only emit http(s) links/images — guards against javascript:/data: URLs in
// source data. (React escapes text by default, so no manual HTML escaping.)
function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u)
}

// Split a js-joda-style date string ("…T19:00:00-07:00[America/Los_Angeles]")
// into display parts for the calendar-style date cell. Returns null if
// unparseable, in which case the caller falls back to the preformatted string.
function dateParts(dateStr) {
  const cleaned = String(dateStr ?? '').replace(/\[.*\]$/, '')
  const d = new Date(cleaned)
  if (Number.isNaN(d.getTime())) return null
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d.toLocaleDateString('en-US', { day: 'numeric' }),
    mon: d.toLocaleDateString('en-US', { month: 'short' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  }
}

/**
 * EventGroupPanel — the drill-down drawer shown when a map marker is clicked.
 * Renders a temporal group (one conceptual event) with its venue details and
 * the full list of dates, each row linking to that instance's event page. A
 * single-date group renders the same way with one row. Styled to match the
 * App206 design system (warm-paper surfaces, display/mono type, calendar-style
 * date cells mirroring the event-list rows).
 *
 * Props:
 *   group             - { key, lat, lng, summary, count, instances } from groupEvents,
 *                       or null/undefined when nothing is selected (renders nothing)
 *   eventAttributions - optional Map<compositeKey, Attribution[]> for the "why it
 *                       appears" chips (uses the representative instance)
 *   onClose           - called on the close button or Esc
 */
export function EventGroupPanel({ group, eventAttributions, onClose }) {
  // Esc-to-close. Bound only while a group is open.
  useEffect(() => {
    if (!group) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [group, onClose])

  if (!group) return null

  const { summary, count, instances } = group
  const rep = instances[0]
  const shown = instances.slice(0, MAX_GROUP_DATES)
  const overflow = instances.length - shown.length
  const mapUrl = googleMapsUrl({ location: rep.location, lat: rep.lat, lng: rep.lng })
  const attributions = eventAttributions?.get(eventKey(rep))

  return (
    <aside className="event-group-panel" role="dialog" aria-label={summary} data-testid="event-group-panel">
      <header className="egp-head">
        <div className="egp-eyebrow">{count > 1 ? `${count} dates` : 'Event'}</div>
        <h2 className="egp-title">{summary}</h2>
        {rep.calendarName && <div className="egp-source">{rep.calendarName}</div>}
        <button type="button" className="egp-close" onClick={() => onClose?.()} aria-label="Close">×</button>
      </header>

      {isHttpUrl(rep.imageUrl) && (
        <img
          className="egp-image"
          src={rep.imageUrl}
          alt=""
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}

      <ul className="egp-dates">
        {shown.map((inst, i) => {
          const p = dateParts(inst.date)
          const body = (
            <>
              <span className="egp-cal">
                <span className="dow">{p ? p.dow : ''}</span>
                <span className="num">{p ? p.day : '•'}</span>
                <span className="mon">{p ? p.mon : ''}</span>
              </span>
              <span className="egp-when">{p ? p.time : (inst.formattedDate || inst.date)}</span>
              {isHttpUrl(inst.url) && <span className="egp-go" aria-hidden="true">→</span>}
            </>
          )
          return (
            <li key={`${inst.date}-${i}`}>
              {isHttpUrl(inst.url)
                ? <a className="egp-row" href={inst.url} target="_blank" rel="noopener noreferrer">{body}</a>
                : <div className="egp-row egp-row--plain">{body}</div>}
            </li>
          )
        })}
        {overflow > 0 && (
          <li className="egp-more">+{overflow} more date{overflow === 1 ? '' : 's'}</li>
        )}
      </ul>

      <footer className="egp-foot">
        {mapUrl && (
          <a className="egp-maplink" href={mapUrl} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">📍</span> Open in maps
          </a>
        )}
        <AttributionChips attributions={attributions} />
      </footer>
    </aside>
  )
}
