// Shared E2E fixtures. Shapes mirror the unit-test mocks in
// web/src/App.test.jsx so the browser suite exercises the same data contract.

// Format a Date as a js-joda-style string: "2026-02-15T19:00:00-08:00".
function toJoda(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}
const future = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(19, 30, 0, 0)
  return d
}

export const mockManifest = {
  lastUpdated: '2024-12-13T17:00:00.000Z',
  rippers: [{
    name: 'test-ripper',
    friendlyName: 'Test Ripper',
    calendars: [
      { name: 'cal1', friendlyName: 'Neumos', icsUrl: 'test-ripper-cal1.ics', rssUrl: 'test-ripper-cal1.rss', tags: ['Music', 'Capitol Hill'] },
      { name: 'cal2', friendlyName: 'SIFF', icsUrl: 'test-ripper-cal2.ics', rssUrl: 'test-ripper-cal2.rss', tags: ['Movies'] },
    ],
  }],
  externalCalendars: [],
  recurringCalendars: [],
  tags: ['Music', 'Movies', 'Capitol Hill'],
}

export const mockEvents = [
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Jazz Night', description: 'Live jazz', location: 'Neumos, Capitol Hill', date: toJoda(future(2)), lat: 47.61, lng: -122.32 },
  { icsUrl: 'test-ripper-cal2.ics', summary: 'Movie Premiere', description: 'A film', location: 'SIFF', date: toJoda(future(3)) },
]

export const mockVenues = {
  generated: '',
  venues: [{
    name: 'neumos', friendlyName: 'Neumos', tags: ['Music', 'Capitol Hill'], kind: 'ripper',
    geo: { lat: 47.61, lng: -122.32, label: 'Capitol Hill' },
    calendars: [{ name: 'cal1', friendlyName: 'Neumos', links: { ics: { href: 'test-ripper-cal1.ics' } } }],
  }],
}

export const mockBuildErrors = { buildTime: '', totalErrors: 0, sources: [] }

// A minimal valid ICS body for any per-calendar .ics fetch.
export const mockIcs = 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR'
