import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App206Context } from './context.js'
import { PagedDayList } from './views.jsx'

// `.a-content` is keyed by view in App206, so opening an event unmounts the
// whole list — component state cannot survive it. PagedDayList therefore parks
// its page window in a module-scope store keyed by `restoreKey`, and seeds from
// it during render, so a back-navigation re-renders every row the reader had
// paged to. Without that the list came back one page tall and the saved scroll
// offset was clamped to the bottom of it (docs/event-list-scroll-restoration.md).
//
// The counterweight is the reset: a GENUINE list swap (filter edit, soon→full
// index swap, saved-search matches landing) must still drop back to one page and
// discard the saved offset. These tests pin both halves.
//
// Each test uses its own restoreKey — the store is module state shared across
// the file.

const ICS = 'test-ripper-cal1.ics'
const PAGE = 60

// Events an hour apart from a fixed future instant, so grouping is
// deterministic and every row parses. The date shape matches what the index
// emits — `parseIndexDate` rejects milliseconds, so no `toISOString()` here.
function makeEvents(n, tag = 'a') {
  const base = new Date('2099-09-15T19:00:00Z')
  const pad = (v) => String(v).padStart(2, '0')
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base.getTime() + i * 3600 * 1000)
    const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
      + `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00Z`
    return {
      icsUrl: ICS,
      summary: `Show ${tag}${String(i).padStart(3, '0')}`,
      description: 'Live',
      location: 'Neumos',
      date: stamp,
    }
  })
}

function makeModel(overrides = {}) {
  return {
    openEvent: vi.fn(),
    openChannel: vi.fn(),
    resetViewScroll: vi.fn(),
    // The view this list renders in; the list hands it back when asking for the
    // saved offset to be dropped, so the right view's entry is cleared.
    scrollKey: 'discover',
    channelByIcsUrl: new Map(),
    eventAttributions: new Map(),
    ...overrides,
  }
}

function renderList(model, props) {
  return render(
    <App206Context.Provider value={model}>
      <PagedDayList {...props} />
    </App206Context.Provider>,
  )
}

const rowCount = (container) => container.querySelectorAll('.ev').length

describe('PagedDayList paging window', () => {
  it('renders one page up front and grows a page at a time', () => {
    const model = makeModel()
    const { container } = renderList(model, { events: makeEvents(150), restoreKey: 'grow' })

    expect(rowCount(container)).toBe(PAGE)

    // jsdom has no IntersectionObserver, so the sentinel stays a plain button —
    // the same fallback keyboard/AT users get.
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(rowCount(container)).toBe(PAGE * 2)
  })

  it('re-renders the reader’s full page window after a remount', () => {
    const events = makeEvents(150)
    const model = makeModel()

    const first = renderList(model, { events, restoreKey: 'remount' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(rowCount(first.container)).toBe(PAGE * 2)
    // Opening an event unmounts the list.
    first.unmount()

    // Coming back: same list, fresh component instance.
    const second = renderList(model, { events, restoreKey: 'remount' })
    expect(rowCount(second.container)).toBe(PAGE * 2)
  })

  it('keeps windows separate per restoreKey', () => {
    const events = makeEvents(150)
    const model = makeModel()

    const grown = renderList(model, { events, restoreKey: 'separate-a' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(rowCount(grown.container)).toBe(PAGE * 2)
    grown.unmount()

    const other = renderList(model, { events, restoreKey: 'separate-b' })
    expect(rowCount(other.container)).toBe(PAGE)
  })

  it('falls back to one page when the list is replaced, and drops the saved scroll', () => {
    const model = makeModel()
    const { container, rerender } = renderList(model, { events: makeEvents(150), restoreKey: 'swap' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(rowCount(container)).toBe(PAGE * 2)
    expect(model.resetViewScroll).not.toHaveBeenCalled()

    // A filter edit / corpus swap: a new array, so the reader is looking at a
    // different list and must start near the top of it.
    rerender(
      <App206Context.Provider value={model}>
        <PagedDayList events={makeEvents(150, 'b')} restoreKey="swap" />
      </App206Context.Provider>,
    )
    expect(rowCount(container)).toBe(PAGE)
    expect(model.resetViewScroll).toHaveBeenCalled()

    // ...and the discarded window doesn't come back on the next remount.
    const { container: remounted } = renderList(model, { events: makeEvents(150, 'b'), restoreKey: 'swap' })
    expect(rowCount(remounted)).toBe(PAGE)
  })

  it('drops the window and the saved scroll when the list changed while unmounted', () => {
    const model = makeModel()

    const first = renderList(model, { events: makeEvents(150), restoreKey: 'away' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(rowCount(first.container)).toBe(PAGE * 2)
    // Opening an event unmounts the list — but the search box and date filter
    // are still on screen, so the result set can change while it's away.
    first.unmount()
    model.resetViewScroll.mockClear()

    const second = renderList(model, { events: makeEvents(150, 'b'), restoreKey: 'away' })
    expect(rowCount(second.container)).toBe(PAGE)
    // The offset must go too: otherwise the restore chases it as pagination
    // grows and drives the reader deep into a list they never scrolled.
    expect(model.resetViewScroll).toHaveBeenCalled()
  })

  it('keeps the window when the same list is rebuilt with a fresh identity', () => {
    const model = makeModel()

    const first = renderList(model, { events: makeEvents(150), restoreKey: 'rebuilt' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    first.unmount()
    model.resetViewScroll.mockClear()

    // A remount recomputes the filtered array, so identity always differs even
    // when nothing about the list changed. Only the contents decide.
    const second = renderList(model, { events: makeEvents(150), restoreKey: 'rebuilt' })
    expect(rowCount(second.container)).toBe(PAGE * 2)
    expect(model.resetViewScroll).not.toHaveBeenCalled()
  })

  it('clears the offset of the view it renders in, not whichever was last active', () => {
    const model = makeModel({ scrollKey: 'following' })

    const first = renderList(model, { events: makeEvents(150), restoreKey: 'own-view' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    first.unmount()
    model.resetViewScroll.mockClear()

    renderList(model, { events: makeEvents(150, 'b'), restoreKey: 'own-view' })
    expect(model.resetViewScroll).toHaveBeenCalledWith('following')
  })

  it('still notices a later swap after one that left the window at a single page', () => {
    const model = makeModel()

    // Swap while mounted, from a list that was never paged past one page. The
    // count doesn't change, so React bails out of the re-render — the stored
    // window has to be re-seeded rather than deleted, or the next mount reads
    // "never visited" and skips the staleness check entirely.
    const { rerender, unmount } = renderList(model, { events: makeEvents(150), restoreKey: 'bailout' })
    rerender(
      <App206Context.Provider value={model}>
        <PagedDayList events={makeEvents(150, 'b')} restoreKey="bailout" />
      </App206Context.Provider>,
    )
    unmount()
    model.resetViewScroll.mockClear()

    // Away from the list, the result set changes again.
    renderList(model, { events: makeEvents(150, 'c'), restoreKey: 'bailout' })
    expect(model.resetViewScroll).toHaveBeenCalledWith('discover')
  })

  it('never seeds a window larger than the list it is rendering', () => {
    const model = makeModel()
    const big = renderList(model, { events: makeEvents(150), restoreKey: 'clamp' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(rowCount(big.container)).toBe(PAGE * 2)
    big.unmount()

    // The same view, now backed by fewer events than the saved window.
    const small = renderList(model, { events: makeEvents(15), restoreKey: 'clamp' })
    expect(rowCount(small.container)).toBe(15)
  })
})
