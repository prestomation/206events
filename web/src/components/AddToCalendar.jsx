import { useState, useEffect, useRef } from 'react'
import { generateICS, buildGoogleCalendarUrl } from '../utils/calendar.js'

// 📅 button that opens a small popover offering .ics download or Google Calendar.
export function AddToCalendar({ title, startDate, endDate, description, location, url }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Without a start date there's nothing to add to a calendar; render nothing
  // rather than crash on toISOString() when the dropdown opens.
  if (!startDate) return null

  const handleDownloadICS = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const ics = generateICS({ title, startDate, endDate, description, location, url })
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = (title || 'event').replace(/[^a-z0-9]+/gi, '-').slice(0, 50) + '.ics'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(href)
    setOpen(false)
  }

  const handleGoogleCalendar = (e) => {
    e.stopPropagation()
    setOpen(false)
  }

  return (
    <span className="add-to-cal-wrap" ref={wrapRef}>
      <button
        className="add-to-cal-btn"
        title="Add to calendar"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
      >
        📅
      </button>
      {open && (
        <div className="add-to-cal-dropdown">
          <button className="add-to-cal-option" onClick={handleDownloadICS}>
            Download .ics
          </button>
          <a
            className="add-to-cal-option"
            href={buildGoogleCalendarUrl({ title, startDate, endDate, description, location, url })}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleGoogleCalendar}
          >
            Google Calendar
          </a>
        </div>
      )}
    </span>
  )
}
