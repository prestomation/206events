// Google-Photos-style day scrubber for the events list. A slim handle pinned to
// the right edge of the scroll viewport tracks how far through the day timeline
// the reader is; grabbing it (mouse, touch, or keyboard) reveals a date bubble
// and jumps the list to a specific day on release.
//
// It lives INSIDE the `.a-content` scroll container (it finds that container by
// walking up the DOM) and pins itself with `position: sticky; top: 0` on a
// zero-height mount, so it never perturbs the list's layout. The actual track is
// an absolutely-positioned overlay sized to the container's visible height.
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
  const mountRef = useRef(null)
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const rafRef = useRef(0)

  // Fraction [0,1] of the handle along the track. Driven by scroll position
  // (which day is at the top) except while dragging, when the finger drives it.
  const [fraction, setFraction] = useState(0)
  const [active, setActive] = useState(false) // dragging or hovering → show bubble
  const [dragging, setDragging] = useState(false)
  const [trackH, setTrackH] = useState(0)
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

  // Resolve the scroll container once mounted and keep its visible height in
  // sync (viewport resize, orientation change) so the track spans it exactly.
  useEffect(() => {
    if (!enabled) return
    const container = mountRef.current?.closest('.a-content')
    containerRef.current = container
    if (!container) return
    const measure = () => setTrackH(container.clientHeight)
    measure()
    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(container)
    }
    return () => ro?.disconnect()
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

  // Translate a pointer Y into a timeline fraction + nearest tick index. The
  // fraction is measured over the handle's usable travel (track height minus the
  // handle), offset by half the handle, so the grip's CENTER tracks the finger
  // rather than trailing it toward the middle.
  const fromPointer = useCallback((clientY) => {
    const track = trackRef.current
    if (!track) return { f: 0, idx: 0 }
    const r = track.getBoundingClientRect()
    const usable = r.height - HANDLE_H
    const f = usable > 0 ? Math.min(1, Math.max(0, (clientY - r.top - HANDLE_H / 2) / usable)) : 0
    const idx = Math.round(f * (count - 1))
    return { f, idx }
  }, [count])

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    setDragging(true)
    setActive(true)
    const { f, idx } = fromPointer(e.clientY)
    setFraction(f)
    setLabelIdx(idx)
  }, [enabled, fromPointer])

  // Track the drag on the WINDOW rather than via pointer capture: the handle is
  // a small target and capture doesn't hold reliably across engines (Firefox
  // dropped it mid-drag), so once the finger leaves the handle the moves must
  // still be heard. Window listeners catch every move/up regardless of what's
  // under the cursor.
  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const { f, idx } = fromPointer(e.clientY)
      setFraction(f)
      setLabelIdx(idx)
    }
    const onUp = (e) => {
      const { idx } = fromPointer(e.clientY)
      setDragging(false)
      setActive(false)
      onSeek?.(dayIndex[idx])
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, fromPointer, onSeek, dayIndex])

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

  const usable = Math.max(0, trackH - HANDLE_H)
  const handleTop = Math.round(fraction * usable)
  const tick = dayIndex[Math.min(labelIdx, count - 1)]

  return (
    <div className="a-scrubber-mount" ref={mountRef}>
      <div
        className={`a-scrubber${active ? ' a-scrubber--active' : ''}${dragging ? ' a-scrubber--drag' : ''}`}
        style={{ height: trackH }}
        ref={trackRef}
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
    </div>
  )
}
