// Google-Photos-style day scrubber for the events list. A slim scrollbar-like
// handle hugs the right edge of the scroll viewport and tracks how far through
// the day timeline the reader is; grabbing it (mouse, touch, or keyboard)
// reveals a date bubble and scrolls the list LIVE, day by day, as you drag.
//
// The track is `position: fixed`, sized/placed from the `.a-content` scroll
// container's rect (measured once, kept current on resize). Fixed — not sticky —
// so the track stays put while the list scrolls under it during a drag, and so
// its geometry is a stable reference (a sticky element shifts when the header
// scrolls off, which otherwise corrupts the pointer→day math mid-drag).
//
// `dayIndex` is the full-timeline tick list from dayIndexForScrubber() — one
// entry per distinct day with the index of its first event. `onSeek(day)` is
// asked to render far enough to include that day and scroll to it; the host
// (EventsMode) owns paging so the scrubber stays presentation-only.

import { useEffect, useRef, useState, useCallback } from 'react'

// Below this many days there's nothing worth scrubbing — the list fits a screen
// or two and the normal scrollbar is enough.
const MIN_DAYS = 4

// Handle height (px). Module-level so the pointer→fraction math and the render
// agree on the usable travel (track height minus the handle).
const HANDLE_H = 34

export function DayScrubber({ dayIndex, onSeek }) {
  const anchorRef = useRef(null)
  const containerRef = useRef(null)
  const rafRef = useRef(0)
  const dragCleanupRef = useRef(null)

  // Fraction [0,1] of the handle along the track. Driven by scroll position
  // (which day is at the top) except while dragging, when the finger drives it.
  const [fraction, setFraction] = useState(0)
  const [active, setActive] = useState(false) // dragging or hovering → show bubble
  const [dragging, setDragging] = useState(false)
  // Fixed-position geometry of the track, derived from the scroll container.
  const [geom, setGeom] = useState(null) // { top, height, right }
  // The day the bubble currently names. While idle it's the top-of-viewport day;
  // while dragging it's the day under the finger.
  const [labelIdx, setLabelIdx] = useState(0)

  const count = dayIndex.length
  const enabled = count >= MIN_DAYS

  // Map dayKey → tick index, rebuilt when the timeline changes.
  const keyToIdxRef = useRef(new Map())
  useEffect(() => {
    const m = new Map()
    dayIndex.forEach((d, i) => m.set(d.dayKey, i))
    keyToIdxRef.current = m
  }, [dayIndex])

  // Resolve the scroll container and mirror its viewport rect into `geom`. The
  // container's own rect only moves on layout/resize (never on the internal
  // scroll that the drag drives), so a ResizeObserver + window resize keep it
  // current without a scroll listener.
  useEffect(() => {
    if (!enabled) return
    const container = anchorRef.current?.closest('.a-content')
    containerRef.current = container
    if (!container) return
    const measure = () => {
      const r = container.getBoundingClientRect()
      setGeom({ top: r.top, height: container.clientHeight, right: Math.max(0, window.innerWidth - r.right) })
    }
    measure()
    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(container)
    }
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [enabled])

  // While idle, follow the scroll position: find the day header currently at the
  // top of the viewport and place the handle at that day's spot in the timeline.
  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return
    const onScroll = () => {
      if (dragging) return
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        const headers = container.querySelectorAll('.a-daystick[data-day]')
        const top = container.getBoundingClientRect().top
        let key = null
        for (const h of headers) {
          if (h.getBoundingClientRect().top <= top + 4) key = h.getAttribute('data-day')
          else break // headers are in DOM/date order; first one below the fold ends it
        }
        const idx = key != null && keyToIdxRef.current.has(key) ? keyToIdxRef.current.get(key) : 0
        setLabelIdx(idx)
        setFraction(count > 1 ? idx / (count - 1) : 0)
      })
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    }
  }, [enabled, dragging, count])

  // Translate a pointer Y into a timeline fraction + nearest tick index, using
  // the fixed track geometry (stable, never shifts mid-drag). The fraction spans
  // the handle's usable travel (height minus the handle) and is offset by half
  // the handle so the grip's CENTER tracks the finger rather than trailing it.
  const fromPointer = useCallback((clientY) => {
    if (!geom) return { f: 0, idx: 0 }
    const usable = geom.height - HANDLE_H
    const f = usable > 0 ? Math.min(1, Math.max(0, (clientY - geom.top - HANDLE_H / 2) / usable)) : 0
    const idx = Math.round(f * (count - 1))
    return { f, idx }
  }, [geom, count])

  // Drag: seek LIVE as the finger moves so the list scrolls in real time, not
  // only on release. Listeners live on the window (the handle is a small target
  // and pointer capture doesn't hold across engines), attached synchronously in
  // pointerdown so no early move is missed. Moves are coalesced to one seek per
  // frame, and a seek fires only when the day under the finger actually changes.
  const onPointerDown = useCallback((e) => {
    if (!enabled || !geom) return
    e.preventDefault()
    // Tear down any drag still in flight (a re-entrant / second-finger press)
    // so its window listeners can't orphan.
    dragCleanupRef.current?.()
    setActive(true)
    setDragging(true)

    let lastIdx = -1
    let pendingY = e.clientY
    let rafId = 0
    const apply = () => {
      rafId = 0
      const { f, idx } = fromPointer(pendingY)
      setFraction(f)
      setLabelIdx(idx)
      if (idx !== lastIdx) { lastIdx = idx; onSeek?.(dayIndex[idx]) }
    }
    const onMove = (ev) => {
      pendingY = ev.clientY
      if (!rafId) rafId = requestAnimationFrame(apply)
    }
    const cleanup = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      dragCleanupRef.current = null
    }
    const onUp = (ev) => {
      pendingY = ev.clientY
      cleanup()
      apply()
      setDragging(false)
      setActive(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    dragCleanupRef.current = cleanup

    // Seek to the initial press position immediately.
    const seed = fromPointer(e.clientY)
    setFraction(seed.f)
    setLabelIdx(seed.idx)
    lastIdx = seed.idx
    onSeek?.(dayIndex[seed.idx])
  }, [enabled, geom, fromPointer, onSeek, dayIndex])

  // Drop any live drag listeners if we unmount mid-drag.
  useEffect(() => () => dragCleanupRef.current?.(), [])

  const onKeyDown = useCallback((e) => {
    let next = null
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(count - 1, labelIdx + 1)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(0, labelIdx - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = count - 1
    else if (e.key === 'PageDown') next = Math.min(count - 1, labelIdx + 7)
    else if (e.key === 'PageUp') next = Math.max(0, labelIdx - 7)
    else return
    e.preventDefault()
    setLabelIdx(next)
    setFraction(count > 1 ? next / (count - 1) : 0)
    onSeek?.(dayIndex[next])
  }, [count, labelIdx, onSeek, dayIndex])

  if (!enabled) return null

  const usable = geom ? Math.max(0, geom.height - HANDLE_H) : 0
  const handleTop = Math.round(fraction * usable)
  const tick = dayIndex[Math.min(labelIdx, count - 1)]

  return (
    <>
      {/* Zero-size anchor: only used to locate the `.a-content` scroll container. */}
      <span ref={anchorRef} aria-hidden style={{ position: 'absolute', width: 0, height: 0 }} />
      {geom && (
        <div
          className={`a-scrubber${active ? ' a-scrubber--active' : ''}${dragging ? ' a-scrubber--drag' : ''}`}
          style={{ position: 'fixed', top: geom.top, height: geom.height, right: geom.right }}
        >
          <div className="a-scrubber-track" />
          {active && tick && (
            <div className="a-scrubber-bubble" style={{ top: handleTop + HANDLE_H / 2 }} role="status">
              <span className="a-scrubber-bubble-month">{tick.monthLabel}</span>
              <span className="a-scrubber-bubble-day">{tick.dayLabel}</span>
            </div>
          )}
          <button
            type="button"
            className="a-scrubber-handle"
            style={{ top: handleTop, height: HANDLE_H }}
            role="slider"
            aria-label="Date scrubber"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={count - 1}
            aria-valuenow={labelIdx}
            aria-valuetext={tick ? tick.dayLabel : ''}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            // Hover reveal is mouse-only: a touch tap synthesizes pointerenter with
            // no matching leave, which would strand the bubble on screen.
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') setActive(true) }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !dragging) setActive(false) }}
          >
            <span className="a-scrubber-grip" />
          </button>
        </div>
      )}
    </>
  )
}
