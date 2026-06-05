import { useEffect } from 'react'
import { googleMapsUrl } from '../lib/maplink.js'
import { eventKey } from '../lib/eventKey.js'
import { AttributionChips } from './AttributionChips.jsx'

// Hard cap on rendered date rows so a very long run (a nightly show over a wide
// window) can't balloon the DOM. Overflow is summarised as "+N more".
export const MAX_GROUP_DATES = 50

// Only emit http(s) links/images — guards against javascript:/data: URLs in
// source data. (React escapes text by default, so the manual escaping the old
// imperative map popup needed is gone.)
function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u)
}

/**
 * EventGroupPanel — the side drawer shown when a map marker is clicked. Renders
 * a temporal group (one conceptual event) with its venue details and the full
 * list of dates, each linking to that instance's event page. A single-date
 * group renders the same way with one row.
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
    <div className="event-group-panel" role="dialog" aria-label={summary} data-testid="event-group-panel">
      <button
        type="button"
        className="event-group-panel-close"
        onClick={() => onClose?.()}
        aria-label="Close"
      >
        ×
      </button>

      <div className="event-group-panel-header">
        <strong className="event-group-panel-title">{summary}</strong>
        {count > 1 && <div className="event-group-panel-count">{count} dates</div>}
      </div>

      {isHttpUrl(rep.imageUrl) && (
        <img
          className="event-group-panel-image"
          src={rep.imageUrl}
          alt=""
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}

      {rep.calendarName && <div className="event-group-panel-source">{rep.calendarName}</div>}

      {mapUrl && (
        <a className="event-group-panel-maplink" href={mapUrl} target="_blank" rel="noopener noreferrer">
          Open in maps →
        </a>
      )}

      <ul className="event-group-dates">
        {shown.map((instance, i) => (
          <li className="event-group-date-row" key={`${instance.date}-${i}`}>
            <span className="event-group-date">{instance.formattedDate || instance.date}</span>
            {isHttpUrl(instance.url) && (
              <a
                className="event-group-date-link"
                href={instance.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View event →
              </a>
            )}
          </li>
        ))}
        {overflow > 0 && (
          <li className="event-group-date-more">+{overflow} more</li>
        )}
      </ul>

      <AttributionChips attributions={attributions} />
    </div>
  )
}
