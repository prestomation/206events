import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventGroupPanel, MAX_GROUP_DATES } from './EventGroupPanel.jsx'

function instance(overrides = {}) {
  return {
    summary: 'Cats',
    date: '2026-07-01T19:00:00-07:00',
    formattedDate: 'Wed, Jul 1, 7:00 PM',
    url: 'https://example.com/cats/1',
    location: 'Paramount Theatre',
    lat: 47.6131,
    lng: -122.3318,
    calendarName: 'Paramount',
    ...overrides,
  }
}

function group(overrides = {}) {
  const instances = overrides.instances || [instance()]
  return {
    key: 'cats|venue',
    lat: instances[0].lat,
    lng: instances[0].lng,
    summary: instances[0].summary,
    count: instances.length,
    instances,
    ...overrides,
  }
}

describe('EventGroupPanel', () => {
  it('renders nothing when no group is selected', () => {
    const { container } = render(<EventGroupPanel group={null} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a single-date group with one row and no count subheader', () => {
    render(<EventGroupPanel group={group()} onClose={() => {}} />)
    expect(screen.getByText('Cats')).toBeInTheDocument()
    expect(screen.queryByText(/dates$/)).not.toBeInTheDocument()
    expect(screen.getAllByText('View event →')).toHaveLength(1)
  })

  it('lists every date for a multi-date group with a count subheader', () => {
    const instances = [
      instance({ date: '2026-07-01T19:00:00-07:00', formattedDate: 'Jul 1', url: 'https://example.com/1' }),
      instance({ date: '2026-07-02T19:00:00-07:00', formattedDate: 'Jul 2', url: 'https://example.com/2' }),
      instance({ date: '2026-07-03T19:00:00-07:00', formattedDate: 'Jul 3', url: 'https://example.com/3' }),
    ]
    render(<EventGroupPanel group={group({ instances })} onClose={() => {}} />)
    expect(screen.getByText('3 dates')).toBeInTheDocument()
    expect(screen.getByText('Jul 1')).toBeInTheDocument()
    expect(screen.getByText('Jul 2')).toBeInTheDocument()
    expect(screen.getByText('Jul 3')).toBeInTheDocument()
    expect(screen.getAllByText('View event →')).toHaveLength(3)
  })

  it('only emits http(s) event links (drops javascript:/missing urls)', () => {
    const instances = [
      instance({ formattedDate: 'Safe', url: 'https://example.com/ok' }),
      instance({ formattedDate: 'Evil', url: 'javascript:alert(1)' }),
      instance({ formattedDate: 'None', url: undefined }),
    ]
    render(<EventGroupPanel group={group({ instances })} onClose={() => {}} />)
    // All three rows render, but only the https one gets a link.
    expect(screen.getByText('Safe')).toBeInTheDocument()
    expect(screen.getByText('Evil')).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
    expect(screen.getAllByText('View event →')).toHaveLength(1)
  })

  it('caps the rendered rows at MAX_GROUP_DATES and summarises overflow', () => {
    const instances = Array.from({ length: MAX_GROUP_DATES + 7 }, (_, i) =>
      instance({ date: `2026-07-${String(i + 1).padStart(2, '0')}T19:00:00-07:00`, formattedDate: `D${i}`, url: `https://example.com/${i}` }),
    )
    render(<EventGroupPanel group={group({ instances })} onClose={() => {}} />)
    expect(screen.getAllByText('View event →')).toHaveLength(MAX_GROUP_DATES)
    expect(screen.getByText('+7 more')).toBeInTheDocument()
  })

  it('closes via the close button', () => {
    const onClose = vi.fn()
    render(<EventGroupPanel group={group()} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<EventGroupPanel group={group()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
