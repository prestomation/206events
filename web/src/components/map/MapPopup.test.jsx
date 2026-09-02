import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MapPopup, MapMedia } from './MapPopup.jsx'
import { SHEET_PEEK_DVH } from './sheet.js'

// The popup shell. Layout is chosen by the caller (MapPanel) rather than read
// from a breakpoint hook, so these tests name it directly.
const popup = (container) => container.querySelector('.mp-popup')

describe('MapPopup', () => {
  it('renders the header pieces it is given, and omits the ones it is not', () => {
    const { container } = render(
      <MapPopup eyebrow="3 dates" title="Cats" subtitle="Paramount Theatre" source="Paramount" />,
    )
    expect(screen.getByText('3 dates')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cats' })).toBeInTheDocument()
    expect(container.querySelector('.mp-sub')).toHaveTextContent('Paramount Theatre')
    expect(container.querySelector('.mp-source')).toHaveTextContent('Paramount')
    expect(container.querySelector('.mp-foot')).toBeNull()
    expect(container.querySelector('.mp-back')).toBeNull()
  })

  it('names itself for assistive tech', () => {
    render(<MapPopup title="Cats" />)
    expect(screen.getByRole('dialog', { name: 'Cats' })).toBeInTheDocument()
  })

  // Guards the hook-order bug (React #310) the old panel was shaped around:
  // every hook must run above any early return, so toggling stays stable.
  it('survives open -> closed -> open without a hook-order error', () => {
    const { rerender, container } = render(<MapPopup title="Cats" />)
    expect(popup(container)).not.toBeNull()
    rerender(<div />)
    expect(popup(container)).toBeNull()
    rerender(<MapPopup title="Cats" />)
    expect(popup(container)).not.toBeNull()
  })

  it('gives the panel layout no drag handle and no inline height', () => {
    const { container } = render(<MapPopup layout="panel" title="Cats" />)
    expect(container.querySelector('.mp-handle')).toBeNull()
    expect(popup(container).style.height).toBe('')
    expect(popup(container).className).toContain('mp-popup--panel')
  })

  it('opens the sheet layout at the peek height with a drag handle', () => {
    const { container } = render(<MapPopup layout="sheet" title="Cats" />)
    expect(container.querySelector('.mp-handle')).not.toBeNull()
    expect(popup(container).style.height).toBe(`${SHEET_PEEK_DVH}dvh`)
  })

  it('drags the sheet up to grow and down to shrink, keeping where it was left', () => {
    const { container } = render(<MapPopup layout="sheet" title="Cats" />)
    const el = popup(container)
    const handle = container.querySelector('.mp-handle')

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 600 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 450 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 450 })
    expect(parseFloat(el.style.height)).toBeGreaterThan(SHEET_PEEK_DVH)

    fireEvent.pointerDown(handle, { pointerId: 2, clientY: 300 })
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 650 })
    fireEvent.pointerUp(handle, { pointerId: 2, clientY: 650 })
    expect(parseFloat(el.style.height)).toBeLessThan(SHEET_PEEK_DVH)
  })

  it('clamps the sheet so it never flies off the top or vanishes off the bottom', () => {
    const { container } = render(<MapPopup layout="sheet" title="Cats" />)
    const el = popup(container)
    const handle = container.querySelector('.mp-handle')
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 800 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: -5000 })
    expect(parseFloat(el.style.height)).toBeLessThanOrEqual(90)
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 9000 })
    expect(parseFloat(el.style.height)).toBeGreaterThanOrEqual(16)
  })

  it('ignores drag on a layout that is not the sheet', () => {
    const { container } = render(<MapPopup layout="panel" title="Cats" />)
    expect(container.querySelector('.mp-handle')).toBeNull()
  })

  it('closes via the close button and on Escape', () => {
    const onClose = vi.fn()
    const { unmount } = render(<MapPopup title="Cats" onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2) // listener removed on unmount
  })

  it('steps BACK on Escape when there is a level to go back to, rather than closing', () => {
    const onClose = vi.fn()
    const onBack = vi.fn()
    render(<MapPopup title="Cats" onClose={onClose} onBack={onBack} backLabel="Back to Neumos" />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Back to Neumos'))
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('makes the aside a real second column only in the wide layout', () => {
    const wide = render(<MapPopup layout="wide" title="C" aside={<p>dates</p>}>body</MapPopup>)
    expect(wide.container.querySelector('.mp-split')).not.toBeNull()
    expect(wide.container.querySelector('.mp-aside')).toHaveTextContent('dates')

    const panel = render(<MapPopup layout="panel" title="C" aside={<p>dates</p>}>body</MapPopup>)
    expect(panel.container.querySelector('.mp-split')).toBeNull()
    // Still rendered, just in flow rather than in a column.
    expect(panel.container.querySelector('.mp-body')).toHaveTextContent('dates')
  })
})

describe('MapMedia', () => {
  it('renders the image when there is one', () => {
    const { container } = render(<MapMedia imageUrl="https://example.com/i.jpg" title="Cats" />)
    expect(container.querySelector('img.mp-media')).toHaveAttribute('src', 'https://example.com/i.jpg')
  })

  it('falls back to a tinted initial so a series without art still has identity', () => {
    const { container } = render(<MapMedia title="Cats" color="var(--c-music)" />)
    expect(container.querySelector('.mp-media-initial')).toHaveTextContent('C')
  })

  it('takes a whole astral character as the initial, not half a surrogate pair', () => {
    const { container } = render(<MapMedia title="🎷 Jazz Night" />)
    expect(container.querySelector('.mp-media-initial').textContent).toBe('🎷')
  })

  it('is zoomable only when a zoom handler is given', () => {
    const onZoom = vi.fn()
    const { container } = render(<MapMedia imageUrl="https://example.com/i.jpg" title="C" onZoom={onZoom} />)
    const img = container.querySelector('img.mp-media')
    expect(img.className).toContain('mp-media--zoom')
    fireEvent.click(img)
    expect(onZoom).toHaveBeenCalledTimes(1)

    const plain = render(<MapMedia imageUrl="https://example.com/j.jpg" title="C" />)
    expect(plain.container.querySelector('img.mp-media').className).not.toContain('mp-media--zoom')
  })
})
