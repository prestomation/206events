import React, { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { HealthDashboard } from './HealthDashboard.jsx'

// HealthDashboard is controlled (tab + drilled-into source live in App206 so
// they can be deep-linked). This harness mirrors that wiring: switching tabs
// clears the open drawer, selecting a source opens it.
function Harness() {
  const [tab, setTab] = useState('sources')
  const [source, setSource] = useState(null)
  return (
    <HealthDashboard
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

// Dispatch on URL. The dashboard fetches build-errors.json and
// event-history.json separately; answering both with the same payload fed the
// error report to the history fetch, which failed Array.isArray and silently
// left the chart with an empty series.
function mockFetch(data, history = []) {
  vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
    ok: true,
    json: async () => (String(url).includes('event-history') ? history : data),
  })))
}

describe('HealthDashboard', () => {
  beforeEach(() => { mockFetch(buildErrors) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders summary cards and defaults to the Sources tab', async () => {
    render(<Harness />)
    expect(await screen.findByText('Source Health Dashboard')).toBeTruthy()
    expect(screen.getByText('broken-source')).toBeTruthy()
    expect(screen.getByText('good-source')).toBeTruthy()
  })

  it('shows a graceful message when build data is missing', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    render(<HealthDashboard />)
    expect(screen.getByText(/Build errors data is not available/)).toBeTruthy()
  })

  it('renders photo coverage summary cards', async () => {
    render(<Harness />)
    expect(await screen.findByText('Events with Photo')).toBeTruthy()
    expect(screen.getByText('🖼️ 9 / 12')).toBeTruthy()
    // 1 venue gap + 1 event gap = 2 missing
    expect(screen.getByText('Missing Photos')).toBeTruthy()
    expect(screen.getByText('🖼️ 2')).toBeTruthy()
  })

  it('renders cost coverage summary cards', async () => {
    render(<Harness />)
    expect(await screen.findByText('Events with Cost')).toBeTruthy()
    expect(screen.getByText('💲 4 / 12')).toBeTruthy()
    expect(screen.getByText('Missing Costs')).toBeTruthy()
    expect(screen.getByText('💲 1')).toBeTruthy()
  })

  it('switches tabs to reveal errors, geo, and uncertain detail', async () => {
    render(<Harness />)
    // Wait for loaded state — 'Source Health Dashboard' also appears in the unavailable
    // state, so we wait for a tab that only renders once build data is fetched.
    fireEvent.click(await screen.findByRole('tab', { name: /Errors/ }))
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

  it('renders URL entity errors in the Errors tab and a summary card', async () => {
    const withEntities = {
      ...buildErrors,
      urlEntityErrors: [
        { scope: 'event', source: 'nectar', calendar: 'all-events', field: 'event.url', value: 'https://x.com/?a=1&amp;b=2', entities: ['&amp;'] },
      ],
    }
    mockFetch(withEntities)
    render(<Harness />)
    // Summary card — also serves as the loaded-state wait (only rendered once data arrives)
    expect(await screen.findByText('URL Entities')).toBeTruthy()
    // Errors tab badge includes the entity count; the section renders on click
    fireEvent.click(screen.getByRole('tab', { name: /Errors/ }))
    expect(screen.getByText(/URL Entity Errors/)).toBeTruthy()
    expect(screen.getByText(/event\.url/)).toBeTruthy()
  })

  it('opens a drill-down drawer with parse errors when a source row is clicked', async () => {
    render(<Harness />)
    await screen.findByText('broken-source')
    fireEvent.click(screen.getByText('broken-source'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('broken-source')).toBeTruthy()
    expect(within(dialog).getByText('bad date')).toBeTruthy()
    expect(within(dialog).getByText('missing title')).toBeTruthy()
  })

  it('surfaces matching uncertain events and geo misses in the drawer', async () => {
    render(<Harness />)
    await screen.findByText('good-source')
    fireEvent.click(screen.getByText('good-source'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Mystery Show/)).toBeTruthy()
    expect(within(dialog).getByText('nowhere')).toBeTruthy()
  })

  it('closes the drawer with the close button', async () => {
    render(<Harness />)
    await screen.findByText('broken-source')
    fireEvent.click(screen.getByText('broken-source'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Close details/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clicking a failure-class card opens that class\'s detail panel', async () => {
    render(<Harness />)
    // Wait for loaded state via an element only present after data arrives.
    fireEvent.click(await screen.findByRole('button', { name: /Missing Photos/ }))
    expect(screen.getByText(/Venue Photo Gaps/)).toBeTruthy()
    expect(screen.getByText('Photoless Show — 2026-05-10')).toBeTruthy()

    // The "Missing Costs" card activates the cost tab.
    fireEvent.click(screen.getByRole('button', { name: /Missing Costs/ }))
    expect(screen.getByText(/Cost Gaps/)).toBeTruthy()
    expect(screen.getByText('Priceless Show — 2026-05-11')).toBeTruthy()
  })

  it('filters every list and count by the search box', async () => {
    render(<Harness />)
    // findByLabelText waits for the loaded state (input not present in unavailable state).
    const input = await screen.findByLabelText('Filter all health data')

    // Narrow to a single source — the others drop out of the table.
    fireEvent.change(input, { target: { value: 'broken' } })
    expect(screen.getByText('broken-source')).toBeTruthy()
    expect(screen.queryByText('good-source')).toBeNull()

    // A query that matches nothing yields the empty state.
    fireEvent.change(input, { target: { value: 'zzz-no-match' } })
    expect(screen.getByText(/No sources match your search/)).toBeTruthy()

    // Clearing restores the full list.
    fireEvent.click(screen.getByRole('button', { name: /Clear filter/ }))
    expect(screen.getByText('good-source')).toBeTruthy()
  })

  it('shows the debug-mode toggle and reports its state', async () => {
    const onToggleDebug = vi.fn()
    render(
      <HealthDashboard
        healthTab="sources" healthSource={null}
        onTabChange={() => {}} onSelectSource={() => {}}
        debugMode={false} onToggleDebug={onToggleDebug}
      />,
    )
    const toggle = await screen.findByRole('switch', { name: /Debug mode/ })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(onToggleDebug).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------- coverage chart

// jsdom has no ResizeObserver and reports clientWidth 0, so the component
// falls back to the 760-wide layout. These assertions pin that fallback: if it
// were removed, every test below would silently render an empty chart.
const history = (n = 6) =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, '0')}`,
    events: 1000 + i * 100,
    calendars: 50 + i * 5,
    candidates: i >= 3 ? 10 + i : undefined,
    queue: 200 + i,
    errors: 5,
  })).map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)))

describe('CoverageChart', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const renderChart = async (points) => {
    mockFetch(buildErrors, points)
    render(<Harness />)
    return await screen.findByRole('slider', { name: /coverage history date/i })
  }

  it('renders one panel per series with the 760-wide fallback viewBox', async () => {
    const slider = await renderChart(history())
    const svg = slider.querySelector('svg')
    expect(svg.getAttribute('viewBox')).toMatch(/^0 0 760 /)
    for (const key of ['events', 'calendars', 'candidates']) {
      expect(svg.querySelector(`[data-panel="${key}"]`)).toBeTruthy()
    }
  })

  it('renders nothing below two points', async () => {
    mockFetch(buildErrors, [{ date: '2026-05-01', events: 1, calendars: 1 }])
    render(<Harness />)
    await screen.findByText('Source Health Dashboard')
    expect(screen.queryByRole('slider', { name: /coverage history date/i })).toBeNull()
  })

  // The regression the maxOf reducer exists for: Math.max over a partially
  // present field yields NaN, which propagates into every coordinate and
  // blanks the chart with no error at all.
  it('emits no NaN coordinates when a series is only partly present', async () => {
    const slider = await renderChart(history())
    const svg = slider.querySelector('svg')
    for (const el of svg.querySelectorAll('polyline, circle, line, text, rect')) {
      for (const attr of ['points', 'cx', 'cy', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height']) {
        const v = el.getAttribute(attr)
        if (v !== null) expect(v).not.toMatch(/NaN/)
      }
    }
  })

  it('defaults the readout to the latest point before any interaction', async () => {
    await renderChart(history())
    const readout = document.querySelector('.health-chart-readout')
    expect(readout.textContent).toContain('May 6, 2026')
    expect(readout.textContent).toContain('1,500')
  })

  it('scrubs with the keyboard and reports position via aria', async () => {
    const slider = await renderChart(history())
    expect(slider.getAttribute('aria-valuenow')).toBe('5')

    fireEvent.keyDown(slider, { key: 'Home' })
    expect(slider.getAttribute('aria-valuenow')).toBe('0')
    expect(slider.getAttribute('aria-valuetext')).toBe('May 1, 2026')

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider.getAttribute('aria-valuenow')).toBe('1')

    fireEvent.keyDown(slider, { key: 'End' })
    expect(slider.getAttribute('aria-valuenow')).toBe('5')
  })

  it('clamps arrow scrubbing at both ends', async () => {
    const slider = await renderChart(history())
    fireEvent.keyDown(slider, { key: 'Home' })
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(slider.getAttribute('aria-valuenow')).toBe('0')
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider.getAttribute('aria-valuenow')).toBe('5')
  })

  // A date where a series has no value must read as "not recorded", never 0.
  it('shows an em-dash where a series has no value at that date', async () => {
    const slider = await renderChart(history())
    fireEvent.keyDown(slider, { key: 'Home' })
    const row = document.querySelector('.health-chart-readout-row[data-metric="candidates"]')
    expect(row.textContent).toContain('—')
    fireEvent.keyDown(slider, { key: 'End' })
    expect(row.textContent).toContain('15')
  })

  it('notes when a plotted series starts partway through the range', async () => {
    await renderChart(history())
    expect(document.querySelector('.health-chart-note').textContent)
      .toMatch(/Viable candidates tracked from May 4, 2026/)
  })

  it('exposes every point as a row in the visually-hidden table', async () => {
    await renderChart(history())
    const table = screen.getByRole('table', { name: /coverage history/i })
    expect(within(table).getAllByRole('row')).toHaveLength(7) // header + 6 points
    expect(within(table).getAllByText('Not recorded').length).toBeGreaterThan(0)
  })
})
