import { useEffect, useRef, useState } from 'react'
import { googleMapsUrl } from '../lib/maplink.js'
import { eventKey } from '../lib/eventKey.js'
import { useBreakpoint } from '../hooks/useBreakpoint.js'
import { AttributionChips } from './AttributionChips.jsx'

// Hard cap on rendered date rows so a very long run (a nightly show over a wide
// window) can't balloon the DOM. Overflow is summarised as "+N more dates".
export const MAX_GROUP_DATES = 50

// Mobile bottom-sheet drag bounds, in dynamic viewport height units (dvh tracks
// the *visible* viewport, so the handle never ends up behind the browser's
// address bar). The sheet opens at PEEK and can be dragged down to MIN (just the
// header) or up to MAX — never past MAX, so the handle always stays reachable.
const SHEET_MIN_DVH = 16
const SHEET_PEEK_DVH = 45
const SHEET_MAX_DVH = 85

// Only emit http(s) links/images — guards against javascript:/data: URLs in
// source data. (React escapes text by default, so no manual HTML escaping.)
function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u)
}

// Split a js-joda-style date string ("…T19:00:00-07:00[America/Los_Angeles]")
// into display parts. Returns null if unparseable, in which case the caller
// falls back to the preformatted string.
function dateParts(dateStr) {
  const cleaned = String(dateStr ?? '').replace(/\[.*\]$/, '')
  const d = new Date(cleaned)
  if (Number.isNaN(d.getTime())) return null
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d.toLocaleDateString('en-US', { day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    monthLabel: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

/**
 * EventGroupPanel — the drill-down drawer shown when a map marker is clicked.
 * Renders a temporal group (one conceptual event) with its venue details and
 * the full list of dates, each row linking to that instance's event page.
 *
 * Desktop: a right-side panel. Mobile (≤ tablet breakpoint): a draggable bottom
 * sheet — opens at a peek height and is resized by dragging its handle (clamped
 * so it never slides off the top). The event image is hidden on mobile to keep
 * the sheet dates-first. Date rows use a compact weekday + day-number cell with
 * month dividers between months.
 *
 * Props:
 *   group             - { key, lat, lng, summary, count, instances } from groupEvents,
 *                       or null/undefined when nothing is selected (renders nothing)
 *   eventAttributions - optional Map<compositeKey, Attribution[]> for the "why it
 *                       appears" chips (uses the representative instance)
 *   onClose           - called on the close button or Esc
 */
export function EventGroupPanel({ group, eventAttributions, onClose }) {
  const isMobile = useBreakpoint() === 'mobile'
  // Mobile sheet height in dvh; opens at the peek size, dragged to resize.
  const [sheetDvh, setSheetDvh] = useState(SHEET_PEEK_DVH)
  // Active drag gesture state. Declared with the other hooks (above the early
  // return) so the hook order stays stable when the panel opens/closes.
  const dragRef = useRef(null)

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

  // Drag the bottom sheet by its handle (mobile only). Pointer capture routes
  // all moves to the handle even as the finger leaves it, and pointercancel is
  // handled — without these, Android Chrome claims the gesture as a scroll
  // (firing pointercancel, never delivering moves) and the drag dies.
  // `touch-action: none` on the handle (CSS) stops the browser scrolling instead.
  // The height is clamped to [MIN, MAX] so the sheet can shrink to just its
  // header and can never grow past the top (where the handle would be lost).
  const onHandlePointerDown = (e) => {
    if (!isMobile) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* unsupported */ }
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY, startDvh: sheetDvh }
  }
  const onHandlePointerMove = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dy = d.startY - e.clientY // dragging up grows the sheet
    const dvh = d.startDvh + (dy / window.innerHeight) * 100
    setSheetDvh(Math.min(SHEET_MAX_DVH, Math.max(SHEET_MIN_DVH, dvh)))
  }
  const onHandlePointerEnd = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null // free positioning — keep wherever the user left it
  }

  const sheetStyle = isMobile ? { height: `${sheetDvh}dvh` } : undefined

  // Build the date list with a month divider whenever the month changes.
  const dateItems = []
  let lastMonth = null
  shown.forEach((inst, i) => {
    const p = dateParts(inst.date)
    if (p && p.monthLabel !== lastMonth) {
      lastMonth = p.monthLabel
      dateItems.push(<li key={`m-${p.monthLabel}-${i}`} className="egp-month">{p.monthLabel}</li>)
    }
    const body = (
      <>
        <span className="egp-cal">
          <span className="dow">{p ? p.dow : ''}</span>
          <span className="num">{p ? p.day : '•'}</span>
        </span>
        <span className="egp-when">{p ? p.time : (inst.formattedDate || inst.date)}</span>
        {isHttpUrl(inst.url) && <span className="egp-go" aria-hidden="true">→</span>}
      </>
    )
    dateItems.push(
      <li key={`${inst.date}-${i}`}>
        {isHttpUrl(inst.url)
          ? <a className="egp-row" href={inst.url} target="_blank" rel="noopener noreferrer">{body}</a>
          : <div className="egp-row egp-row--plain">{body}</div>}
      </li>,
    )
  })

  return (
    <aside
      className="event-group-panel"
      role="dialog"
      aria-label={summary}
      data-testid="event-group-panel"
      style={sheetStyle}
    >
      {isMobile && (
        <div
          className="egp-handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerEnd}
          onPointerCancel={onHandlePointerEnd}
          role="separator"
          aria-label="Drag to resize"
        />
      )}

      <header className="egp-head">
        <div className="egp-eyebrow">{count > 1 ? `${count} dates` : 'Event'}</div>
        <h2 className="egp-title">{summary}</h2>
        {rep.calendarName && <div className="egp-source">{rep.calendarName}</div>}
        <button type="button" className="egp-close" onClick={() => onClose?.()} aria-label="Close">×</button>
      </header>

      {!isMobile && isHttpUrl(rep.imageUrl) && (
        <img
          className="egp-image"
          src={rep.imageUrl}
          alt=""
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}

      <ul className="egp-dates">
        {dateItems}
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
