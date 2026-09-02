import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventPopup } from './EventPopup.jsx'

const inst = (day, over = {}) => ({
  icsUrl: 'test-ripper-cal1.ics',
  summary: 'Cats',
  date: `2026-07-${String(day).padStart(2, '0')}T19:00:00[America/Los_Angeles]`,
  url: `https://example.com/${day}`,
  location: 'Paramount Theatre, Downtown',
  lat: 47.6131,
  lng: -122.3318,
  ...over,
})

const group = (instances = [inst(1)], over = {}) => ({
  key: 'cats|venue',
  lat: instances[0].lat,
  lng: instances[0].lng,
  summary: instances[0].summary,
  count: instances.length,
  instances,
  ...over,
})

const VENUE = { key: 'v', label: 'Paramount Theatre, Downtown', name: 'Paramount Theatre', address: 'Downtown', seriesCount: 1 }

describe('EventPopup', () => {
  it('renders nothing without a group', () => {
    const { container } = render(<EventPopup group={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('uses an "Event" eyebrow for a single date and a count for a run', () => {
    render(<EventPopup group={group()} venue={VENUE} />)
    expect(screen.getByText('Event')).toBeInTheDocument()

    render(<EventPopup group={group([inst(1), inst(2), inst(3)])} venue={VENUE} />)
    expect(screen.getByText('3 dates')).toBeInTheDocument()
  })

  it('leads with the title, the venue and the source calendar', () => {
    const { container } = render(<EventPopup group={group()} venue={VENUE} calendarName="Paramount" />)
    expect(screen.getByRole('heading', { name: 'Cats' })).toBeInTheDocument()
    expect(container.querySelector('.mp-sub')).toHaveTextContent('Paramount Theatre, Downtown')
    expect(container.querySelector('.mp-source')).toHaveTextContent('Paramount')
  })

  it('shows the next date, and switches to "Selected" once a date is picked', () => {
    const g = group([inst(1), inst(8)])
    const plain = render(<EventPopup group={g} venue={VENUE} />)
    expect(plain.getByText('Next')).toBeInTheDocument()
    expect(plain.container.querySelector('.mp-next-when')).toHaveTextContent('Jul 1')

    const picked = render(<EventPopup group={g} venue={VENUE} selected={g.instances[1]} />)
    expect(picked.getByText('Selected')).toBeInTheDocument()
    expect(picked.container.querySelector('.mp-next-when')).toHaveTextContent('Jul 8')
  })

  it('spells out the rhythm in the rich layouts', () => {
    const { container } = render(
      <EventPopup layout="panel" group={group([inst(2), inst(9), inst(16)])} venue={VENUE} />,
    )
    expect(container.querySelector('.mp-next-rel')).toHaveTextContent('Every Thursday')
  })

  it('gives the sheet a chip strip and a cadence line instead of date rows', () => {
    const { container } = render(
      <EventPopup layout="sheet" group={group([inst(2), inst(9), inst(16)])} venue={VENUE} />,
    )
    expect(container.querySelectorAll('.mp-chip')).toHaveLength(3)
    expect(container.querySelectorAll('.mp-daterow')).toHaveLength(0)
    expect(container.querySelector('.mp-cadence')).toHaveTextContent('Every Thursday')
    expect(container.querySelector('.mp-cadence')).toHaveTextContent('3 dates')
  })

  it('gives the panel every date as a row under an "All dates" head', () => {
    const { container } = render(
      <EventPopup layout="panel" group={group([inst(1), inst(2), inst(3)])} venue={VENUE} />,
    )
    expect(container.querySelectorAll('.mp-daterow')).toHaveLength(3)
    expect(container.querySelectorAll('.mp-chip')).toHaveLength(0)
    expect(screen.getByText('All dates')).toBeInTheDocument()
  })

  it('clamps the description in the sheet and lets it run in the panel', () => {
    const g = group([inst(1, { description: 'A long description of the show.' })])
    const sheet = render(<EventPopup layout="sheet" group={g} venue={VENUE} />)
    expect(sheet.container.querySelector('.mp-desc').className).toContain('mp-desc--clamp')

    const panel = render(<EventPopup layout="panel" group={g} venue={VENUE} />)
    expect(panel.container.querySelector('.mp-desc').className).not.toContain('mp-desc--clamp')
  })

  it('reserves the description space in the sheet while descriptions are still loading', () => {
    const pending = render(<EventPopup layout="sheet" group={group()} venue={VENUE} descriptionsPending />)
    expect(pending.container.querySelector('.mp-desc--pending')).not.toBeNull()

    const settled = render(<EventPopup layout="sheet" group={group()} venue={VENUE} />)
    expect(settled.container.querySelector('.mp-desc')).toBeNull()
  })

  it('lists the venue’s other series, and reports a click on one', () => {
    const other = group([inst(4, { summary: 'Punk Matinee' })], { key: 'punk|venue' })
    const onOpenSeries = vi.fn()
    const { container } = render(
      <EventPopup layout="panel" group={group()} venue={{ ...VENUE, seriesCount: 2 }}
        alsoHere={[other]} onOpenSeries={onOpenSeries} />,
    )
    expect(screen.getByText('Also at Paramount Theatre')).toBeInTheDocument()
    const row = container.querySelector('.mp-series')
    expect(row).toHaveTextContent('Punk Matinee')
    fireEvent.click(row)
    expect(onOpenSeries).toHaveBeenCalledWith(other)
  })

  it('toggles following, and says which calendar it means', () => {
    const onFollow = vi.fn()
    const off = render(<EventPopup group={group()} venue={VENUE} calendarName="Paramount" onFollow={onFollow} />)
    const pill = off.container.querySelector('.mp-follow')
    expect(pill).toHaveTextContent('Follow')
    expect(pill).toHaveAttribute('title', 'Follow Paramount')
    fireEvent.click(pill)
    expect(onFollow).toHaveBeenCalledTimes(1)

    const on = render(<EventPopup group={group()} venue={VENUE} calendarName="Paramount" following onFollow={onFollow} />)
    expect(on.container.querySelector('.mp-follow--on')).toHaveTextContent('Following')
  })

  it('opens the in-app detail for the SELECTED date, not always the first', () => {
    const g = group([inst(1), inst(8)])
    const onDetails = vi.fn()
    render(<EventPopup group={g} venue={VENUE} selected={g.instances[1]} onDetails={onDetails} />)
    fireEvent.click(screen.getByText('Details ›'))
    expect(onDetails).toHaveBeenCalledWith(g.instances[1])
  })

  it('links out to maps only when given a url', () => {
    const withUrl = render(<EventPopup group={group()} venue={VENUE} mapsUrl="https://maps.example/x" />)
    expect(withUrl.getByText('Open in maps').closest('a')).toHaveAttribute('href', 'https://maps.example/x')
    const without = render(<EventPopup group={group()} venue={VENUE} />)
    expect(without.container.querySelector('.mp-foot')).not.toHaveTextContent('Open in maps')
  })

  it('offers a back affordance only when the pin has a venue level to return to', () => {
    const onBack = vi.fn()
    const drilled = render(
      <EventPopup group={group()} venue={{ ...VENUE, seriesCount: 3 }} onBack={onBack} backLabel="Back to Paramount Theatre" />,
    )
    fireEvent.click(drilled.getByLabelText('Back to Paramount Theatre'))
    expect(onBack).toHaveBeenCalledTimes(1)

    const single = render(<EventPopup group={group()} venue={VENUE} />)
    expect(single.container.querySelector('.mp-back')).toBeNull()
  })
})
