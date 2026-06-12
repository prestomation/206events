import { stripHtml } from './html.js'
import cityConfig from '../../../city.config.ts'

// Formats a Date as a UTC iCalendar timestamp (YYYYMMDDTHHMMSSZ).
export function formatICSDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Builds a minimal single-event VCALENDAR string for download.
export function generateICS({ title, startDate, endDate, description, location, url }) {
  const start = formatICSDate(startDate)
  const end = formatICSDate(endDate || new Date(startDate.getTime() + 3600000))
  const plainDesc = stripHtml(description)
  const fullDesc = [plainDesc, url].filter(Boolean).join('\n\n')
  // Fold long lines per RFC 5545 (max 75 octets per line)
  const foldLine = (key, value) => {
    if (!value) return ''
    const line = `${key}:${value.replace(/\r?\n/g, '\\n')}`
    const folded = []
    for (let i = 0; i < line.length; i += 73) {
      folded.push((i > 0 ? ' ' : '') + line.slice(i, i + 73))
    }
    return folded.join('\r\n')
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${cityConfig.ics.prodId}//EN`,
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    foldLine('SUMMARY', title),
    foldLine('DESCRIPTION', fullDesc),
    foldLine('LOCATION', location),
    url ? foldLine('URL', url) : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

// Builds a Google Calendar "add event" template URL.
export function buildGoogleCalendarUrl({ title, startDate, endDate, description, location, url }) {
  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const start = fmt(startDate)
  const end = fmt(endDate || new Date(startDate.getTime() + 3600000))
  const plainDesc = stripHtml(description)
  const desc = [plainDesc, url].filter(Boolean).join('\n\n').slice(0, 1000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || '',
    dates: `${start}/${end}`,
  })
  if (desc) params.set('details', desc)
  if (location) params.set('location', location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
