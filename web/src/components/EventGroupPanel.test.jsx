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

// Date rows that link out are anchors with the egp-row class; non-linked rows
// are plain divs. Count the clickable date links.
const dateLinks = (container) => container.querySelectorAll('a.egp-row')
const dateRows = (container) => container.querySelectorAll('.egp-row')

describe('EventGroupPanel', () => {
  it('renders nothing when no group is selected', () => {
    const { container } = render(<EventGroupPanel group={null} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a single-date group with one row and the "Event" eyebrow (no count)', () => {
    const { container } = render(<EventGroupPanel group={group()} onClose={() => {}} />)
    expect(screen.getByText('Cats')).toBeInTheDocument()
    expect(screen.getByText('Event')).toBeInTheDocument()
    expect(screen.queryByText(/dates$/)).not.toBeInTheDocument()
    expect(dateRows(container)).toHaveLength(1)
    expect(dateLinks(container)).toHaveLength(1)
  })

  it('lists every date for a multi-date group with a count eyebrow', () => {
    const instances = [
      instance({ date: '2026-07-01T19:00:00-07:00', url: 'https://example.com/1' }),
      instance({ date: '2026-07-02T19:00:00-07:00', url: 'https://example.com/2' }),
      instance({ date: '2026-07-03T19:00:00-07:00', url: 'https://example.com/3' }),
    ]
    const { container } = render(<EventGroupPanel group={group({ instances })} onClose={() => {}} />)
    expect(screen.getByText('3 dates')).toBeInTheDocument()
    const links = dateLinks(container)
    expect(links).toHaveLength(3)
    expect([...links].map((a) => a.getAttribute('href'))).toEqual([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
    ])
  })

  it('only links http(s) rows (javascript:/missing urls render as plain rows)', () => {
    const instances = [
      instance({ date: '2026-07-01T19:00:00-07:00', url: 'https://example.com/ok' }),
      instance({ date: '2026-07-02T19:00:00-07:00', url: 'javascript:alert(1)' }), // eslint-disable-line no-script-url
      instance({ date: '2026-07-03T19:00:00-07:00', url: undefined }),
    ]
    const { container } = render(<EventGroupPanel group={group({ instances })} onClose={() => {}} />)
    // All three rows render, but only the https one is an anchor.
    expect(dateRows(container)).toHaveLength(3)
    const links = dateLinks(container)
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://example.com/ok')
  })

  it('caps the rendered rows at MAX_GROUP_DATES and summarises overflow', () => {
    const instances = Array.from({ length: MAX_GROUP_DATES + 7 }, (_, i) =>
      instance({ date: `2026-07-${String(i + 1).padStart(2, '0')}T19:00:00-07:00`, url: `https://example.com/${i}` }),
    )
    const { container } = render(<EventGroupPanel group={group({ instances })} onClose={() => {}} />)
    expect(dateRows(container)).toHaveLength(MAX_GROUP_DATES)
    expect(screen.getByText('+7 more dates')).toBeInTheDocument()
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
