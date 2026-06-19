import { describe, it, expect } from 'vitest'
import { indexBuildErrors, sourceDebug, eventDebug } from './debugData.js'

const buildErrors = {
  sources: [
    {
      source: 'broken-source', calendar: 'broken-source',
      errorCount: 3, parseErrorCount: 2, uncertaintyCount: 1,
      errors: [
        { type: 'ParseError', reason: 'bad date' },
        { type: 'ParseError', reason: 'missing title' },
        { type: 'Uncertainty', reason: 'no start time' },
      ],
    },
  ],
  geocodeErrors: [
    { source: 'good-source', location: 'nowhere', reason: 'not found' },
    { source: 'good-source', location: 'void', reason: 'ambiguous' },
  ],
  pendingProxyVerification: [
    { name: 'blocked-source', rung: 'outofband', consecutiveFailures: 2, lastError: 'HTTP 403' },
  ],
  proxyStaleServes: [
    { name: 'stale-source', ageHours: 30 },
  ],
  uncertainEvents: [
    { source: 'good-source', event: { summary: 'Mystery Show', date: '2026-05-10' }, unknownFields: ['startTime'] },
  ],
  costGaps: [
    { source: 'good-source', eventId: 'e2', summary: 'Priceless Show', date: '2026-05-11' },
  ],
  photoGaps: {
    venueGaps: [{ source: 'ripper', name: 'No Photo Venue', mapUrl: 'https://m/x' }],
    eventGaps: [{ source: 'good-source', eventId: 'e1', summary: 'Photoless Show', date: '2026-05-10' }],
  },
  duplicateCandidates: [
    {
      key: 'dup1',
      events: [
        { icsUrl: 'a.ics', summary: 'Shared Gig', date: '2026-05-12' },
        { icsUrl: 'b.ics', summary: 'Shared Gig', date: '2026-05-12' },
      ],
    },
  ],
  zeroEventCalendars: ['broken-source'],
  expectedEmptyCalendars: ['quiet-source'],
}

describe('indexBuildErrors', () => {
  it('tolerates a null document', () => {
    const idx = indexBuildErrors(null)
    expect(idx.bySource.size).toBe(0)
    expect(idx.uncertainByKey.size).toBe(0)
  })

  it('indexes sources, geocode, proxy, and per-event queues', () => {
    const idx = indexBuildErrors(buildErrors)
    expect(idx.bySource.get('broken-source').parseErrorCount).toBe(2)
    expect(idx.geocodeBySource.get('good-source')).toHaveLength(2)
    expect(idx.proxyBySource.get('blocked-source').rung).toBe('outofband')
    expect(idx.staleBySource.get('stale-source').ageHours).toBe(30)
    expect(idx.uncertainByKey.get('Mystery Show|2026-05-10')).toBeTruthy()
    expect(idx.costGapByKey.get('Priceless Show|2026-05-11')).toBeTruthy()
    expect(idx.photoGapByKey.get('Photoless Show|2026-05-10')).toBeTruthy()
    // Both events of a candidate pair resolve to the same candidate.
    expect(idx.duplicateByKey.get('Shared Gig|2026-05-12').key).toBe('dup1')
    expect(idx.zeroSet.has('broken-source')).toBe(true)
    expect(idx.expectedEmptySet.has('quiet-source')).toBe(true)
  })
})

describe('sourceDebug', () => {
  const idx = indexBuildErrors(buildErrors)

  it('joins parse errors and zero-event status by ripper name', () => {
    const d = sourceDebug(idx, { ripperName: 'broken-source', name: 'Broken', icsUrl: 'x.ics' }, { upcomingCount: 0 })
    expect(d.parseErrorCount).toBe(2)
    expect(d.uncertaintyCount).toBe(1)
    expect(d.errors).toHaveLength(3)
    expect(d.zeroEvent).toBe(true)
    expect(d.upcomingCount).toBe(0)
  })

  it('collects geocode errors across candidate keys', () => {
    const d = sourceDebug(idx, { ripperName: 'good-source', name: 'Good' })
    expect(d.geocodeErrors).toHaveLength(2)
  })

  it('falls back to the calendar name when there is no ripperName', () => {
    const d = sourceDebug(idx, { cal: { name: 'blocked-source' }, name: 'Blocked' })
    expect(d.proxy).toBeTruthy()
    expect(d.proxy.rung).toBe('outofband')
  })

  it('derives photo and OSM gaps from the channel object', () => {
    const noPhoto = sourceDebug(idx, { name: 'V', geo: { lat: 1, lng: 2 }, imageUrl: null, distributed: false })
    expect(noPhoto.missingPhoto).toBe(true)
    expect(noPhoto.osmGap).toBe(true)
    expect(noPhoto.hasOsmId).toBe(false)

    const complete = sourceDebug(idx, { name: 'V', geo: { lat: 1, lng: 2, osmId: 42 }, imageUrl: 'p.jpg', distributed: false })
    expect(complete.missingPhoto).toBe(false)
    expect(complete.osmGap).toBe(false)

    // A distributed (no fixed venue) channel never counts as a photo gap.
    const dist = sourceDebug(idx, { name: 'Agg', geo: null, imageUrl: null, distributed: true })
    expect(dist.missingPhoto).toBe(false)
    expect(dist.osmGap).toBe(false)
  })
})

describe('eventDebug', () => {
  const idx = indexBuildErrors(buildErrors)

  it('returns null for a missing event', () => {
    expect(eventDebug(idx, null)).toBeNull()
  })

  it('reports raw fields and queue membership joined by eventKey', () => {
    const d = eventDebug(idx, {
      summary: 'Photoless Show', date: '2026-05-10', icsUrl: 'good.ics',
      location: 'Somewhere', lat: 47.6, lng: -122.3, imageUrl: null,
    })
    expect(d.eventKey).toBe('Photoless Show|2026-05-10')
    expect(d.hasCoords).toBe(true)
    expect(d.queues.photoGap).toBeTruthy()
    expect(d.queues.uncertain).toBeNull()
  })

  it('flags uncertainty and duplicate-candidate membership', () => {
    const uncertain = eventDebug(idx, { summary: 'Mystery Show', date: '2026-05-10' })
    expect(uncertain.queues.uncertain).toBeTruthy()
    expect(uncertain.queues.uncertain.unknownFields).toEqual(['startTime'])

    const dup = eventDebug(idx, { summary: 'Shared Gig', date: '2026-05-12' })
    expect(dup.queues.duplicateCandidate.key).toBe('dup1')
  })
})
