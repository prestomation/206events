import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VenuePopup } from './VenuePopup.jsx'

const inst = (day, over = {}) => ({
  icsUrl: 'a.ics',
  date: `2026-07-${String(day).padStart(2, '0')}T19:00:00[America/Los_Angeles]`,
  location: 'Neumos, Capitol Hill',
  ...over,
})

const series = (summary, days, over = {}) => ({
  key: `${summary}|v`,
  lat: 47.61,
  lng: -122.32,
  summary,
  count: days.length,
  instances: days.map((d) => inst(d, over)),
})

const venue = (s) => ({
  key: 'v', lat: 47.61, lng: -122.32,
  label: 'Neumos, Capitol Hill', name: 'Neumos', address: 'Capitol Hill',
  series: s, seriesCount: s.length,
  dateCount: s.reduce((n, g) => n + g.count, 0),
})

describe('VenuePopup', () => {
  it('renders nothing without a venue', () => {
    const { container } = render(<VenuePopup venue={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('leads with the place: a Venue eyebrow, the name and the address', () => {
    const { container } = render(<VenuePopup venue={venue([series('Jazz Night', [2, 9])])} />)
    expect(screen.getByText('Venue')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Neumos' })).toBeInTheDocument()
    expect(container.querySelector('.mp-sub')).toHaveTextContent('Capitol Hill')
  })

  it('lists every series running there with its rhythm and date count', () => {
    const { container } = render(<VenuePopup venue={venue([
      series('Jazz Night', [2, 9, 16]),
      series('Punk Matinee', [4]),
    ])} />)
    const rows = container.querySelectorAll('.mp-series')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Jazz Night')
    expect(rows[0]).toHaveTextContent('Every Thursday')
    expect(rows[0]).toHaveTextContent('3 dates')
    expect(rows[1]).toHaveTextContent('1 date')
  })

  it('peeks at each series’ next dates in the rich layouts, capped by `peek`', () => {
    const { container } = render(
      <VenuePopup layout="panel" peek={2} venue={venue([series('Jazz Night', [2, 9, 16, 23])])} />,
    )
    expect(container.querySelectorAll('.mp-daterow')).toHaveLength(2)
    expect(screen.getByText('+2 more dates')).toBeInTheDocument()
  })

  it('drops the per-series peek in the sheet, where there is no room', () => {
    const { container } = render(
      <VenuePopup layout="sheet" venue={venue([series('Jazz Night', [2, 9, 16])])} />,
    )
    expect(container.querySelectorAll('.mp-daterow')).toHaveLength(0)
    expect(screen.getByText('1 series here')).toBeInTheDocument()
  })

  it('reports which series was clicked', () => {
    const s = [series('Jazz Night', [2]), series('Punk Matinee', [4])]
    const onOpenSeries = vi.fn()
    const { container } = render(<VenuePopup venue={venue(s)} onOpenSeries={onOpenSeries} />)
    fireEvent.click(container.querySelectorAll('.mp-series')[1])
    expect(onOpenSeries).toHaveBeenCalledWith(s[1])
  })

  // Following is per-CALENDAR in this app, so a venue-level pill only makes
  // sense when the caller has resolved a single unambiguous calendar for it.
  it('offers a venue follow pill only when the caller names a follow target', () => {
    const v = venue([series('Jazz Night', [2])])
    const onFollow = vi.fn()
    const withTarget = render(<VenuePopup venue={v} followTarget="Neumos" onFollow={onFollow} />)
    const pill = withTarget.container.querySelector('.mp-follow')
    expect(pill).toHaveTextContent('Follow venue')
    fireEvent.click(pill)
    expect(onFollow).toHaveBeenCalledTimes(1)

    const without = render(<VenuePopup venue={v} />)
    expect(without.container.querySelector('.mp-follow')).toBeNull()
  })

  it('shows the follow pill as on when already following', () => {
    const { container } = render(
      <VenuePopup venue={venue([series('Jazz Night', [2])])} followTarget="Neumos" following />,
    )
    expect(container.querySelector('.mp-follow--on')).toHaveTextContent('Following')
  })

  it('sums the venue’s dates in the rich list head', () => {
    const { container } = render(
      <VenuePopup layout="panel" venue={venue([series('Jazz Night', [2, 9]), series('Punk', [4])])} />,
    )
    expect(container.querySelector('.mp-listhead')).toHaveTextContent("What's on")
    expect(container.querySelector('.mp-listhead-n')).toHaveTextContent('3 dates')
  })
})
