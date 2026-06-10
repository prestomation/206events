import React, { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { HealthDashboard } from './HealthDashboard.jsx'

// HealthDashboard is controlled (tab + drilled-into source live in App206 so
// they can be deep-linked). This harness mirrors that wiring: switching tabs
// clears the open drawer, selecting a source opens it.
function Harness({ buildErrors }) {
  const [tab, setTab] = useState('sources')
  const [source, setSource] = useState(null)
  return (
    <HealthDashboard
      buildErrors={buildErrors}
      healthTab={tab}
      healthSource={source}
      onTabChange={(t) => { setSource(null); setTab(t) }}
      onSelectSource={setSource}
    />
  )
}

const buildErrors = {
  buildTime: '2026-05-01T17:00:00.000Z',
  totalErrors: 3,
  eventCounts: [
    { name: 'good-source', type: 'Ripper', events: 12, expectEmpty: false },
    { name: 'broken-source', type: 'Ripper', events: 0, expectEmpty: false },
    { name: 'empty-source', type: 'Ripper', events: 0, expectEmpty: true },
  ],
  sources: [
    {
      source: 'broken-source',
      calendar: 'broken-source',
      parseErrorCount: 2,
      uncertaintyCount: 0,
      errors: [
        { type: 'ParseError', reason: 'bad date', context: 'row 4' },
        { type: 'ParseError', reason: 'missing title' },
      ],
    },
  ],
  configErrors: [{ type: 'ImportError', reason: 'cannot import', path: 'sources/x/ripper.ts' }],
  externalCalendarFailures: [{ name: 'feed', friendlyName: 'Feed', error: 'HTTP 404' }],
  geocodeErrors: [{ source: 'good-source', location: 'nowhere', reason: 'not found' }],
  uncertainEvents: [
    { source: 'good-source', event: { summary: 'Mystery Show', date: '2026-05-10', url: 'https://e.com' }, unknownFields: ['startTime'] },
  ],
  uncertaintyStats: { outstanding: 1, resolvedFromCache: 0, acknowledgedUnresolvable: 0 },
  pendingProxyVerification: [
    { name: 'el-centro-de-la-raza', rung: 'outofband', consecutiveFailures: 3, lastError: 'HTTP 403', lastAttempt: '2026-06-03', proven: false, recommendation: 'promote-to-browserbase' },
  ],
  geoStats: { totalEvents: 12, eventsWithGeo: 11, geocodeErrors: 1 },
  photoStats: { eventsWithImage: 9, totalEvents: 12, venuesWithImage: 1, totalVenues: 3, unresolvable: 0 },
  photoGaps: {
    venueGaps: [{ source: 'ripper', name: 'no-photo', mapUrl: 'https://maps.example/x' }],
    eventGaps: [{ source: 'good-source', eventId: 'e1', summary: 'Photoless Show', date: '2026-05-10' }],
  },
  costStats: { eventsWithCost: 4, freeEvents: 2, totalEvents: 12, unresolvable: 0 },
  costGaps: [
    { source: 'good-source', eventId: 'e2', summary: 'Priceless Show', date: '2026-05-11' },
  ],
}

describe('HealthDashboard', () => {
  it('renders summary cards and defaults to the Sources tab', () => {
    render(<Harness buildErrors={buildErrors} />)
    expect(screen.getByText('Source Health Dashboard')).toBeTruthy()
    // Source table is visible by default
    expect(screen.getByText('broken-source')).toBeTruthy()
    expect(screen.getByText('good-source')).toBeTruthy()
  })

  it('shows a graceful message when build data is missing', () => {
    render(<HealthDashboard buildErrors={null} />)
    expect(screen.getByText(/Build errors data is not available/)).toBeTruthy()
  })

  it('renders photo coverage summary cards', () => {
    render(<Harness buildErrors={buildErrors} />)
    expect(screen.getByText('Events with Photo')).toBeTruthy()
    expect(screen.getByText('🖼️ 9 / 12')).toBeTruthy()
    // 1 venue gap + 1 event gap = 2 missing
    expect(screen.getByText('Missing Photos')).toBeTruthy()
    expect(screen.getByText('🖼️ 2')).toBeTruthy()
  })

  it('renders cost coverage summary cards', () => {
    render(<Harness buildErrors={buildErrors} />)
    expect(screen.getByText('Events with Cost')).toBeTruthy()
    expect(screen.getByText('💲 4 / 12')).toBeTruthy()
    expect(screen.getByText('Missing Costs')).toBeTruthy()
    expect(screen.getByText('💲 1')).toBeTruthy()
  })

  it('switches tabs to reveal errors, geo, and uncertain detail', () => {
    render(<Harness buildErrors={buildErrors} />)

    fireEvent.click(screen.getByRole('tab', { name: /Errors/ }))
    expect(screen.getByText('cannot import')).toBeTruthy()
    expect(screen.getByText('HTTP 404')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Geo/ }))
    expect(screen.getByText('nowhere')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Uncertain/ }))
    expect(screen.getByText(/Mystery Show/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Proxy/ }))
    expect(screen.getByText(/Proxy Verification Queue/)).toBeTruthy()
    expect(screen.getByText('el-centro-de-la-raza')).toBeTruthy()
    expect(screen.getByText('promote-to-browserbase')).toBeTruthy()
  })

  it('renders URL entity errors in the Errors tab and a summary card', () => {
    const withEntities = {
      ...buildErrors,
      urlEntityErrors: [
        { scope: 'event', source: 'nectar', calendar: 'all-events', field: 'event.url', value: 'https://x.com/?a=1&amp;b=2', entities: ['&amp;'] },
      ],
    }
    render(<Harness buildErrors={withEntities} />)
    // Summary card
    expect(screen.getByText('URL Entities')).toBeTruthy()
    // Errors tab badge includes the entity count; the section renders on click
    fireEvent.click(screen.getByRole('tab', { name: /Errors/ }))
    expect(screen.getByText(/URL Entity Errors/)).toBeTruthy()
    expect(screen.getByText(/event\.url/)).toBeTruthy()
  })

  it('opens a drill-down drawer with parse errors when a source row is clicked', () => {
    render(<Harness buildErrors={buildErrors} />)
    fireEvent.click(screen.getByText('broken-source'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('broken-source')).toBeTruthy()
    expect(within(dialog).getByText('bad date')).toBeTruthy()
    expect(within(dialog).getByText('missing title')).toBeTruthy()
  })

  it('surfaces matching uncertain events and geo misses in the drawer', () => {
    render(<Harness buildErrors={buildErrors} />)
    fireEvent.click(screen.getByText('good-source'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Mystery Show/)).toBeTruthy()
    expect(within(dialog).getByText('nowhere')).toBeTruthy()
  })

  it('closes the drawer with the close button', () => {
    render(<Harness buildErrors={buildErrors} />)
    fireEvent.click(screen.getByText('broken-source'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Close details/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
