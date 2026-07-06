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

// Derive the streaming payload pair (events-index.ndjson + event-descriptions.json)
// from a plain events fixture, mirroring lib/discovery.ts buildEventsIndexStream:
// date-sorted NDJSON with `description` replaced by a `d` dictionary index.
export function streamPairFor(events) {
  const toMs = (s) => new Date(String(s).replace(/\[.*\]$/, '')).getTime()
  const sorted = [...events].sort((a, b) => toMs(a.date) - toMs(b.date))
  const descriptions = []
  const byText = new Map()
  const stream = sorted.map(({ description, ...rest }) => {
    if (description === undefined || description === '') return rest
    if (!byText.has(description)) { byText.set(description, descriptions.length); descriptions.push(description) }
    return { ...rest, d: byText.get(description) }
  })
  return { ndjson: stream.map((e) => JSON.stringify(e)).join('\n') + '\n', descriptions }
}

// Two-phase load fixtures (issue 649). The "soon" payload covers only the near
// term and omits `description`; the full index adds a far-future event that the
// soon payload doesn't contain. Used only by payload-split.spec.js, which
// overrides both events routes so the shared specs' counts are untouched.
export const mockEventsSoon = [
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Soon Jazz Show', location: 'Neumos, Capitol Hill', date: toJoda(future(2)), lat: 47.61, lng: -122.32 },
]
export const mockEventsFull = [
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Soon Jazz Show', description: 'Live jazz tonight', location: 'Neumos, Capitol Hill', date: toJoda(future(2)), lat: 47.61, lng: -122.32 },
  { icsUrl: 'test-ripper-cal2.ics', summary: 'Far Future Fest', description: 'A festival far ahead', location: 'SIFF', date: toJoda(future(20)) },
]

// Events carrying the structured `uncertainty` field (the replacement for the
// old raw "⚠️ …" description line). Used only by uncertainty.spec.js, which
// overrides the events-index route so the shared specs' event counts are
// untouched. One of each kind: `pending` (approximate, being verified) and
// `unresolvable` (not posted by the source).
export const mockUncertainEvents = [
  {
    icsUrl: 'test-ripper-cal1.ics', summary: 'Approximate Duration Show',
    description: 'Headliner plus support.', location: 'Neumos, Capitol Hill',
    date: toJoda(future(2)), lat: 47.61, lng: -122.32,
    uncertainty: { fields: ['duration'], kind: 'pending' },
  },
  {
    icsUrl: 'test-ripper-cal1.ics', summary: 'Unposted Details Show',
    description: 'Doors at an unannounced time.', location: 'Neumos, Capitol Hill',
    date: toJoda(future(3)), lat: 47.61, lng: -122.32,
    uncertainty: { fields: ['startTime', 'cost'], kind: 'unresolvable' },
  },
]

// A recurring event that is NOT modeled as recurring: four identical-title
// instances at one venue/source on different days (a weekly trivia night),
// scraped as independent dated events. Plus two distractors that must NOT be
// folded into the series:
//   - "Open Mic" — same venue/source, different title (belongs under
//     "More from <channel>", not "Other dates").
//   - "Tuesday Trivia Night" at a DIFFERENT venue/source — same title but a
//     different groupKey (different coords + icsUrl), so it must stay separate.
// Used only by recurring-dates.spec.js, which overrides the events-index route
// so the shared specs' counts are untouched.
export const mockRecurringEvents = [
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Tuesday Trivia Night', description: 'Weekly pub trivia.', location: 'Neumos, Capitol Hill', date: toJoda(future(1)), lat: 47.61, lng: -122.32 },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Tuesday Trivia Night', description: 'Weekly pub trivia.', location: 'Neumos, Capitol Hill', date: toJoda(future(8)), lat: 47.61, lng: -122.32 },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Tuesday Trivia Night', description: 'Weekly pub trivia.', location: 'Neumos, Capitol Hill', date: toJoda(future(15)), lat: 47.61, lng: -122.32 },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Tuesday Trivia Night', description: 'Weekly pub trivia.', location: 'Neumos, Capitol Hill', date: toJoda(future(22)), lat: 47.61, lng: -122.32 },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Open Mic', description: 'Sign-up at the door.', location: 'Neumos, Capitol Hill', date: toJoda(future(3)), lat: 47.61, lng: -122.32 },
  { icsUrl: 'test-ripper-cal2.ics', summary: 'Tuesday Trivia Night', description: 'A different bar entirely.', location: 'SIFF', date: toJoda(future(5)), lat: 47.70, lng: -122.40 },
]

// Cross-source duplicate marks as the BUILD-TIME dedup pass would emit them
// (lib/cross-source-dedup.ts). The canonical (cal1) carries `dedupedSources`;
// the suppressed copy (cal2) carries `duplicateOf` and must be hidden from
// lists and folded into the canonical's "Also listed in" attribution.
// Used only by cross-source-dedup.spec.js (overrides the events-index route).
const dupGroupId = 'test-ripper-cal1.ics Live Aloha Hawaiian Cultural Festival|' + toJoda(future(2))
export const mockDuplicateEvents = [
  {
    icsUrl: 'test-ripper-cal1.ics', summary: 'Live Aloha Hawaiian Cultural Festival',
    description: 'Hawaiian cultural festival.', location: 'Seattle Center, 305 Harrison St, Seattle, WA 98109',
    date: toJoda(future(2)), lat: 47.6235, lng: -122.3517,
    duplicateGroupId: dupGroupId, dedupedSources: ['test-ripper-cal2.ics'],
  },
  {
    icsUrl: 'test-ripper-cal2.ics', summary: 'Festal: Live Aloha Hawaiian Cultural Festival',
    description: 'Hawaiian cultural festival.', location: 'Seattle Center',
    date: toJoda(future(2)), lat: 47.6250, lng: -122.3517,
    duplicateGroupId: dupGroupId, duplicateOf: dupGroupId,
  },
  // A normal, unrelated event so the list isn't a single row.
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Jazz Night', description: 'Live jazz', location: 'Neumos, Capitol Hill', date: toJoda(future(4)), lat: 47.61, lng: -122.32 },
]

// Events carrying each `cost` shape, including the new `{ soldOut: true }`
// state. Used only by cost.spec.js, which overrides the events-index route so
// the shared specs' event counts are untouched. One row per shape so the
// rendered label/styling of each can be asserted and screenshotted.
export const mockCostEvents = [
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Sold Out Show', description: 'A packed house.', location: 'Neumos, Capitol Hill', date: toJoda(future(2)), lat: 47.61, lng: -122.32, cost: { soldOut: true } },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Free Show', description: 'No cover.', location: 'Neumos, Capitol Hill', date: toJoda(future(3)), lat: 47.61, lng: -122.32, cost: { min: 0 } },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Priced Show', description: 'Tickets from $25.', location: 'Neumos, Capitol Hill', date: toJoda(future(4)), lat: 47.61, lng: -122.32, cost: { min: 25, max: 75 } },
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Ticketed Show', description: 'Amount not posted.', location: 'Neumos, Capitol Hill', date: toJoda(future(5)), lat: 47.61, lng: -122.32, cost: { paid: true } },
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
