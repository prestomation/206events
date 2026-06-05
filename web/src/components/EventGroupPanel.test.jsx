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

  it('shows the event image on desktop and no drag handle', () => {
    const { container } = render(
      <EventGroupPanel group={group({ instances: [instance({ imageUrl: 'https://example.com/i.jpg' })] })} onClose={() => {}} />,
    )
    expect(container.querySelector('.egp-image')).not.toBeNull()
    // The draggable handle is mobile-only.
    expect(container.querySelector('.egp-handle')).toBeNull()
    expect(container.querySelector('.event-group-panel').style.height).toBe('')
  })

  it('on mobile: hides the image and opens a draggable sheet at the peek height', () => {
    setWidth(500)
    const { container } = render(
      <EventGroupPanel group={group({ instances: [instance({ imageUrl: 'https://example.com/i.jpg' })] })} onClose={() => {}} />,
    )
    // Image hidden (dates-first); a drag handle is present.
    expect(container.querySelector('.egp-image')).toBeNull()
    expect(container.querySelector('.egp-handle')).not.toBeNull()
    // Opens at the peek height, expressed in dvh.
    expect(container.querySelector('.event-group-panel').style.height).toBe('45dvh')
  })

  it('on mobile: dragging up grows, dragging down shrinks, and the height is clamped', () => {
    setWidth(500)
    const { container } = render(<EventGroupPanel group={group()} onClose={() => {}} />)
    const panel = container.querySelector('.event-group-panel')
    const handle = container.querySelector('.egp-handle')
    expect(panel.style.height).toBe('45dvh')

    // Drag up grows the sheet (no snap on release — stays where left).
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 600 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 450 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 450 })
    const grown = parseFloat(panel.style.height)
    expect(grown).toBeGreaterThan(45)

    // Drag down shrinks it below the peek height.
    fireEvent.pointerDown(handle, { pointerId: 2, clientY: 300 })
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 650 })
    fireEvent.pointerUp(handle, { pointerId: 2, clientY: 650 })
    expect(parseFloat(panel.style.height)).toBeLessThan(45)
  })

  it('on mobile: clamps the height so the sheet never exceeds the max (stays reachable)', () => {
    setWidth(500)
    const { container } = render(<EventGroupPanel group={group()} onClose={() => {}} />)
    const panel = container.querySelector('.event-group-panel')
    const handle = container.querySelector('.egp-handle')
    // A huge upward drag must clamp at the max, not fly off the top.
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 800 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: -5000 })
    expect(parseFloat(panel.style.height)).toBeLessThanOrEqual(90)
    // A huge downward drag clamps at the min (sheet doesn't vanish).
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 9000 })
    expect(parseFloat(panel.style.height)).toBeGreaterThanOrEqual(16)
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
