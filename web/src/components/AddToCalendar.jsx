import { generateICS } from '../utils/calendar.js'
import { CALENDAR_TARGETS, resolveCalendarMode } from '../utils/calendarTargets.js'
import { Ico } from '../redesign/icons.jsx'

// Calendar button that performs a single contextual add-to-calendar action. The
// action is chosen by `mode` (a user preference set in the You tab); 'auto'
// guesses from the platform. See utils/calendarTargets.js for the target
// registry. `showLabel` renders a full-width labeled ghost button (used on the
// event-detail action row, matching the Follow / Copy buttons beside it);
// otherwise it's a compact icon-only button (a trailing control on event rows).
export function AddToCalendar({ title, startDate, endDate, description, location, url, mode = 'auto', showLabel = false }) {
  // Without a start date there's nothing to add to a calendar; render nothing
  // rather than crash on toISOString() inside the URL/ICS builders.
  if (!startDate) return null

  const ev = { title, startDate, endDate, description, location, url }
  const target = CALENDAR_TARGETS[resolveCalendarMode(mode)]

  // `add-to-cal-btn` stays on both variants as the stable hook for tests. The
  // labeled variant layers on the redesign's `btn btn-ghost`; the icon variant
  // carries its own compact square styling via `add-to-cal-icon`.
  const className = showLabel
    ? 'btn btn-ghost add-to-cal-btn add-to-cal-full'
    : 'add-to-cal-btn add-to-cal-icon'
  const content = showLabel
    ? <>{Ico.cal}<span>Add to calendar</span></>
    : <span className="add-to-cal-ico" aria-hidden="true">{Ico.cal}</span>

  const handleDownloadICS = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const ics = generateICS(ev)
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = (title || 'event').replace(/[^a-z0-9]+/gi, '-').slice(0, 50) + '.ics'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(href)
  }

  if (target.kind === 'link') {
    return (
      <a
        className={className}
        title={`Add to ${target.label}`}
        href={target.href(ev)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </a>
    )
  }

  return (
    <button className={className} title="Download .ics" onClick={handleDownloadICS}>
      {content}
    </button>
  )
}
