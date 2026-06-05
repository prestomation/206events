import { describe, it, expect, vi, afterEach } from 'vitest'
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
// are plain divs. (Month dividers are .egp-month, not .egp-row.)
const dateLinks = (container) => container.querySelectorAll('a.egp-row')
const dateRows = (container) => container.querySelectorAll('.egp-row')

// Force the responsive breakpoint by setting the jsdom window width that
// useBreakpoint reads at mount (< 768 => mobile). No resize dispatch needed —
// each test sets the width before rendering.
function setWidth(px) {
  window.innerWidth = px
}

afterEach(() => {
  setWidth(1024)
  try { localStorage.removeItem('egp-sheet-mode') } catch { /* ignore */ }
})

describe('EventGroupPanel', () => {
  it('renders nothing when no group is selected', () => {
    const { container } = render(<EventGroupPanel group={null} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  // Guards the hook-order bug (React #310): every hook must be called above the
  // `if (!group) return null` early return, so toggling open/closed is stable.
  it('survives toggling group open -> closed -> open without a hook-order error', () => {
    const { rerender, container } = render(<EventGroupPanel group={group()} onClose={() => {}} />)
    expect(container.querySelector('.event-group-panel')).not.toBeNull()
    rerender(<EventGroupPanel group={null} onClose={() => {}} />)
    expect(container.querySelector('.event-group-panel')).toBeNull()
    rerender(<EventGroupPanel group={group()} onClose={() => {}} />)
    expect(container.querySelector('.event-group-panel')).not.toBeNull()
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

  it('inserts a month divider when the month changes', () => {
    const instances = [
      instance({ date: '2026-07-30T19:00:00-07:00', url: 'https://example.com/a' }),
      instance({ date: '2026-08-01T19:00:00-07:00', url: 'https://example.com/b' }),
    ]
    const { container } = render(<EventGroupPanel group={group({ instances })} onClose={() => {}} />)
    const months = [...container.querySelectorAll('.egp-month')].map((e) => e.textContent)
    expect(months).toEqual(['July 2026', 'August 2026'])
  })

  it('only links http(s) rows (javascript:/missing urls render as plain rows)', () => {
    const instances = [
      instance({ date: '2026-07-01T19:00:00-07:00', url: 'https://example.com/ok' }),
      instance({ date: '2026-07-02T19:00:00-07:00', url: 'javascript:alert(1)' }), // eslint-disable-line no-script-url
      instance({ date: '2026-07-03T19:00:00-07:00', url: undefined }),
    ]
    const { container } = render(<EventGroupPanel group={group({ instances })} onClose={() => {}} />)
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

  it('shows the event image on desktop', () => {
    const { container } = render(
      <EventGroupPanel group={group({ instances: [instance({ imageUrl: 'https://example.com/i.jpg' })] })} onClose={() => {}} />,
    )
    expect(container.querySelector('.egp-image')).not.toBeNull()
    // No mobile preview control on desktop.
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
  })

  it('on mobile: shows the preview sheet-mode control, hides the image, and switches mode', () => {
    setWidth(500)
    const { container } = render(
      <EventGroupPanel group={group({ instances: [instance({ imageUrl: 'https://example.com/i.jpg' })] })} onClose={() => {}} />,
    )
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByText('Sticky')).toBeInTheDocument()
    expect(screen.getByText('Drag')).toBeInTheDocument()
    expect(screen.getByText('Peek')).toBeInTheDocument()
    // Image is hidden on mobile (dates-first).
    expect(container.querySelector('.egp-image')).toBeNull()
    // Default mode is sticky; choosing Peek updates the data attribute.
    const panel = container.querySelector('.event-group-panel')
    expect(panel.getAttribute('data-sheet-mode')).toBe('sticky')
    fireEvent.click(screen.getByText('Peek'))
    expect(panel.getAttribute('data-sheet-mode')).toBe('peek')
  })

  it('on mobile drag mode: dragging the handle up grows the sheet, release snaps to full', () => {
    setWidth(500)
    try { localStorage.setItem('egp-sheet-mode', 'drag') } catch { /* ignore */ }
    const { container } = render(<EventGroupPanel group={group()} onClose={() => {}} />)
    const panel = container.querySelector('.event-group-panel')
    const handle = container.querySelector('.egp-handle')
    expect(panel.getAttribute('data-sheet-mode')).toBe('drag')
    expect(panel.style.height).toBe('44vh') // default peek height

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 600 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 300 }) // drag up 300px
    expect(parseFloat(panel.style.height)).toBeGreaterThan(44)

    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 300 })
    expect(panel.style.height).toBe('90vh') // snapped to full
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
