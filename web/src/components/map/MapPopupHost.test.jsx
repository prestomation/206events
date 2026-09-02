import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MapPopupHost, resolveVenueIdentity } from './MapPopupHost.jsx'

const inst = (day, over = {}) => ({
  icsUrl: 'test-ripper-cal1.ics',
  summary: 'Jazz Night',
  date: `2026-07-${String(day).padStart(2, '0')}T19:00:00[America/Los_Angeles]`,
  location: 'Neumos, Capitol Hill',
  lat: 47.61,
  lng: -122.32,
  ...over,
})

const series = (summary, days, over = {}) => {
  const instances = days.map((d) => inst(d, { summary, ...over }))
  return { key: `${summary}|v`, lat: 47.61, lng: -122.32, summary, count: days.length, instances }
}

const venue = (s) => ({
  key: 'v', lat: 47.61, lng: -122.32, label: 'Neumos, Capitol Hill',
  series: s, seriesCount: s.length, dateCount: s.reduce((n, g) => n + g.count, 0),
})

describe('resolveVenueIdentity', () => {
  it('splits the events-index location on its first comma', () => {
    expect(resolveVenueIdentity(venue([series('A', [1])]))).toEqual({ name: 'Neumos', address: 'Capitol Hill' })
  })

  it('keeps a comma-less label whole', () => {
    const v = { ...venue([series('A', [1])]), label: 'Gas Works Park' }
    expect(resolveVenueIdentity(v)).toEqual({ name: 'Gas Works Park', address: '' })
  })

  it('handles a venue no instance labelled', () => {
    const v = { ...venue([series('A', [1])]), label: '' }
    expect(resolveVenueIdentity(v)).toEqual({ name: '', address: '' })
  })

  // venues.json only covers sources with a fixed declared geo, so it enriches
  // the label rather than replacing it as the primary source.
  it('prefers a venues.json entry that resolves to the same coordinate', () => {
    const byIcs = new Map([['test-ripper-cal1.ics', {
      name: 'neumos', friendlyName: 'Neumos', geo: { lat: 47.61, lng: -122.32, label: '925 E Pike St, Seattle' },
    }]])
    expect(resolveVenueIdentity(venue([series('A', [1])]), byIcs))
      .toEqual({ name: 'Neumos', address: '925 E Pike St, Seattle' })
  })

  it('ignores a venues.json entry sitting somewhere else', () => {
    const byIcs = new Map([['test-ripper-cal1.ics', {
      friendlyName: 'Somewhere Else', geo: { lat: 47.70, lng: -122.20, label: 'Elsewhere' },
    }]])
    expect(resolveVenueIdentity(venue([series('A', [1])]), byIcs))
      .toEqual({ name: 'Neumos', address: 'Capitol Hill' })
  })
})

describe('MapPopupHost', () => {
  it('renders nothing without a selection', () => {
    const { container } = render(<MapPopupHost selection={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  // A pin hosting one series has no list worth showing, so it skips the venue
  // level entirely -- and therefore has nothing to go back to.
  it('opens a single-series pin straight into its event popup, with no back', () => {
    const v = venue([series('Jazz Night', [2, 9])])
    const { container } = render(<MapPopupHost selection={{ venue: v }} />)
    expect(screen.getByRole('heading', { name: 'Jazz Night' })).toBeInTheDocument()
    expect(container.querySelector('.mp-back')).toBeNull()
  })

  it('opens a multi-series pin into the venue popup', () => {
    const v = venue([series('Jazz Night', [2]), series('Punk Matinee', [4])])
    const { container } = render(<MapPopupHost selection={{ venue: v }} />)
    expect(screen.getByRole('heading', { name: 'Neumos' })).toBeInTheDocument()
    expect(container.querySelectorAll('.mp-series')).toHaveLength(2)
  })

  it('drills from a venue row into that series, then offers a way back', () => {
    const s = [series('Jazz Night', [2]), series('Punk Matinee', [4])]
    const v = venue(s)
    const onSelect = vi.fn()
    const list = render(<MapPopupHost selection={{ venue: v }} onSelect={onSelect} />)
    fireEvent.click(list.container.querySelectorAll('.mp-series')[1])
    expect(onSelect).toHaveBeenCalledWith({ venue: v, group: s[1] })

    const drilled = render(<MapPopupHost selection={{ venue: v, group: s[1] }} onSelect={onSelect} />)
    expect(drilled.getByRole('heading', { name: 'Punk Matinee' })).toBeInTheDocument()
    fireEvent.click(drilled.getByLabelText('Back to Neumos'))
    expect(onSelect).toHaveBeenLastCalledWith({ venue: v, group: null })
  })

  it('offers the drilled event its siblings as "also here"', () => {
    const s = [series('Jazz Night', [2]), series('Punk Matinee', [4])]
    render(<MapPopupHost selection={{ venue: venue(s), group: s[0] }} />)
    expect(screen.getByText('Also at Neumos')).toBeInTheDocument()
    expect(screen.getByText('Punk Matinee')).toBeInTheDocument()
  })

  it('resolves the source line from calendarNameByIcsUrl', () => {
    const { container } = render(
      <MapPopupHost
        selection={{ venue: venue([series('Jazz Night', [2])]) }}
        calendarNameByIcsUrl={{ 'test-ripper-cal1.ics': 'Neumos' }}
      />,
    )
    expect(container.querySelector('.mp-source')).toHaveTextContent('Neumos')
  })

  it('falls back to the icsUrl-derived name with no lookup entry', () => {
    const { container } = render(<MapPopupHost selection={{ venue: venue([series('Jazz Night', [2])]) }} />)
    expect(container.querySelector('.mp-source')).toHaveTextContent('test-ripper-cal1')
  })

  it('follows the clicked series’ own calendar', () => {
    const onToggleFollow = vi.fn()
    const { container } = render(
      <MapPopupHost
        selection={{ venue: venue([series('Jazz Night', [2])]) }}
        favoritesSet={new Set(['test-ripper-cal1.ics'])}
        onToggleFollow={onToggleFollow}
      />,
    )
    expect(container.querySelector('.mp-follow--on')).not.toBeNull()
    fireEvent.click(container.querySelector('.mp-follow'))
    expect(onToggleFollow).toHaveBeenCalledWith('test-ripper-cal1.ics')
  })

  // Following is per-calendar, so a venue whose series span several feeds has
  // no single thing to follow and must not pretend otherwise.
  it('offers a venue-level follow only when every series shares one calendar', () => {
    const same = venue([series('Jazz Night', [2]), series('Punk Matinee', [4])])
    const one = render(<MapPopupHost selection={{ venue: same }} calendarNameByIcsUrl={{ 'test-ripper-cal1.ics': 'Neumos' }} />)
    expect(one.container.querySelector('.mp-follow')).toHaveTextContent('Follow venue')

    const mixed = venue([series('Jazz Night', [2]), series('Punk Matinee', [4], { icsUrl: 'other.ics' })])
    const many = render(<MapPopupHost selection={{ venue: mixed }} />)
    expect(many.container.querySelector('.mp-follow')).toBeNull()
    expect(many.container.querySelectorAll('.mp-series')).toHaveLength(2)
  })

  it('passes the picked date through to the event popup', () => {
    const s = [series('Jazz Night', [2, 9])]
    const v = venue(s)
    const { container } = render(
      <MapPopupHost selection={{ venue: v, group: s[0], selected: s[0].instances[1] }} />,
    )
    expect(container.querySelector('.mp-next-when')).toHaveTextContent('Jul 9')
    expect(screen.getByText('Selected')).toBeInTheDocument()
  })

  it('opens the in-app event detail from Details', () => {
    const s = [series('Jazz Night', [2])]
    const onOpenEvent = vi.fn()
    render(<MapPopupHost selection={{ venue: venue(s) }} onOpenEvent={onOpenEvent} />)
    fireEvent.click(screen.getByText('Details ›'))
    expect(onOpenEvent).toHaveBeenCalledWith(s[0].instances[0])
  })
})
