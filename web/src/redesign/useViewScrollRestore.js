// Per-view scroll restoration for the single `.a-content` scroll container.
//
// The container is keyed by view in App206.jsx, so navigating into an event or
// venue page unmounts the list subtree and mounts a fresh container at
// scrollTop 0. This hook records the live offset per view and puts it back when
// that view returns — via the in-app back arrow or the browser's Back button,
// which land on the same state.
//
// Three things make that harder than a single assignment:
//
//   1. The content is often SHORTER at restore time than it was when the offset
//      was recorded — a paged list remounts at one page, a venue page hasn't
//      parsed its ICS yet. Assigning a larger offset is silently clamped by the
//      browser, so `chase` re-applies it as the content grows in.
//   2. Assigning `scrollTop` makes the browser fire a `scroll` event a frame
//      later. Without a guard the listener writes that clamped value straight
//      back over the saved one, destroying the real position on the first
//      failed restore. `pendingRef` suppresses recording while a restore is in
//      flight.
//   3. A restore that can't be satisfied must not spin forever, and must yield
//      the moment the reader takes over — hence the stable-height give-up and
//      the gesture listeners.
//
// Keys are per-view (`ev:<eventKey>`, `ch:<icsUrl>`, or the section name), so
// one detail page's offset is never restored onto a different one. The map is
// bounded and evicts least-recently-written entries.

import { useRef, useCallback, useLayoutEffect } from 'react'

// Views to remember offsets for. Keys are per-event/per-venue, so this is
// unbounded without a cap; 50 covers any realistic back-and-forth session.
const MAX_TRACKED_VIEWS = 50
// Once content HAS arrived and then holds the same height for this many frames
// while the offset still isn't reachable, the view is genuinely shorter than it
// was (a filter narrowed it, a source now returns less) — stop chasing. The
// "has arrived" precondition matters: a venue page's height is flat for as long
// as its ICS fetch takes, which is exactly the case the chase exists for, so a
// bare stability check would abort during the wait it was meant to survive.
const MAX_STABLE_FRAMES = 30
// Absolute backstop for content that never arrives at all — the channel ICS
// fetch in App.jsx gives up at 10s, so nothing legitimate lands after this.
const RESTORE_CAP_MS = 15000
// Sub-pixel slack: scrollTop can read back fractionally under the assigned
// value on fractional-DPR displays.
const LANDED_SLACK_PX = 1

export function useViewScrollRestore(viewKey) {
  const containerRef = useRef(null)
  const positionsRef = useRef(new Map())
  // { target, deadline } while a restore is being chased; null once settled.
  const pendingRef = useRef(null)
  // Mirrors `viewKey` so the returned callback keeps a stable identity.
  const viewKeyRef = useRef(viewKey)
  viewKeyRef.current = viewKey

  const remember = useCallback((key, top) => {
    const positions = positionsRef.current
    // Re-insert so Map iteration order is least-recently-written first.
    positions.delete(key)
    positions.set(key, top)
    if (positions.size > MAX_TRACKED_VIEWS) {
      positions.delete(positions.keys().next().value)
    }
  }, [])

  // Drop the current view's saved offset — used when the underlying list is
  // replaced (a filter edit, a corpus swap), so a stale deep offset can't be
  // restored into a different set of rows.
  const resetViewScroll = useCallback(() => {
    positionsRef.current.delete(viewKeyRef.current)
    pendingRef.current = null
  }, [])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const target = positionsRef.current.get(viewKey) ?? 0
    let frame = 0

    // True once the offset has been reached (or there was nothing to restore).
    const apply = () => {
      el.scrollTop = target
      return el.scrollTop >= target - LANDED_SLACK_PX
    }

    // `clientHeight === 0` means the container is hidden (the Map tab flips
    // `.a-content` to display:none), where assigning scrollTop is a no-op.
    //
    // `apply()` runs even when the target is 0, and that matters: the React
    // `key` on `.a-content` is coarser than this hook's key, so moving between
    // two events (an "other dates" / "more from" row on a detail page) REUSES
    // the same DOM node. Without an explicit assignment the new event would
    // open still scrolled to the previous one's offset.
    const visible = el.clientHeight > 0
    const landed = visible ? apply() : false

    // A restore stays "pending" only while it still has somewhere to get to.
    // The common case — the view remounts at its full height — settles here, on
    // the first synchronous try, and nothing below ever runs.
    pendingRef.current = target > 0 && visible && !landed
      ? { target, deadline: Date.now() + RESTORE_CAP_MS }
      : null

    const settled = () => {
      const pending = pendingRef.current
      if (!pending) return true
      if (Date.now() > pending.deadline) {
        pendingRef.current = null
        return true
      }
      return false
    }

    const onScroll = () => {
      if (!settled()) return
      remember(viewKey, el.scrollTop)
    }
    // Any real gesture means the reader has taken over; stop chasing and start
    // recording where they actually are.
    const yieldToReader = () => {
      if (!pendingRef.current) return
      pendingRef.current = null
      remember(viewKey, el.scrollTop)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', yieldToReader, { passive: true })
    el.addEventListener('touchstart', yieldToReader, { passive: true })
    el.addEventListener('keydown', yieldToReader)
    // Scrollbar drags and day-scrubber drags produce neither wheel nor touch
    // events, so without this the chase would fight them for up to half a
    // second while discarding where the reader actually went.
    el.addEventListener('pointerdown', yieldToReader, { passive: true })

    // Re-apply on each frame while content is still arriving under us. Skipped
    // entirely whenever the first try landed, which is the common case.
    let lastHeight = el.scrollHeight
    let contentArrived = false
    let stableFrames = 0
    const chase = () => {
      frame = 0
      if (settled()) return
      if (apply()) {
        pendingRef.current = null
        return
      }
      if (el.scrollHeight !== lastHeight) {
        lastHeight = el.scrollHeight
        contentArrived = true
        stableFrames = 0
      } else if (contentArrived && ++stableFrames > MAX_STABLE_FRAMES) {
        // Content came in, settled, and still can't reach the offset: the view
        // is genuinely shorter now. Stop — but leave the saved offset alone, so
        // a later visit that IS tall enough can still honour it.
        pendingRef.current = null
        return
      }
      frame = requestAnimationFrame(chase)
    }
    if (pendingRef.current) frame = requestAnimationFrame(chase)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      pendingRef.current = null
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', yieldToReader)
      el.removeEventListener('touchstart', yieldToReader)
      el.removeEventListener('keydown', yieldToReader)
      el.removeEventListener('pointerdown', yieldToReader)
    }
  }, [viewKey, remember])

  return { containerRef, resetViewScroll }
}
