import { generateICS } from '../utils/calendar.js'
import { CALENDAR_TARGETS, resolveCalendarMode } from '../utils/calendarTargets.js'

// 📅 button that performs a single contextual add-to-calendar action. The action
// is chosen by `mode` (a user preference set in the You tab); 'auto' guesses from
// the platform. See utils/calendarTargets.js for the target registry.
export function AddToCalendar({ title, startDate, endDate, description, location, url, mode = 'auto' }) {
  // Without a start date there's nothing to add to a calendar; render nothing
  // rather than crash on toISOString() inside the URL/ICS builders.
  if (!startDate) return null

  const ev = { title, startDate, endDate, description, location, url }
  const target = CALENDAR_TARGETS[resolveCalendarMode(mode)]

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
        className="add-to-cal-btn"
        title={`Add to ${target.label}`}
        href={target.href(ev)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        📅
      </a>
    )
  }

  return (
    <button className="add-to-cal-btn" title="Download .ics" onClick={handleDownloadICS}>
      📅
    </button>
  )
}
