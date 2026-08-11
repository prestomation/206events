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
// Give up once the content has stopped growing for this many consecutive
// frames and the offset still isn't reachable — the view is genuinely shorter
// than it was (a filter narrowed it, a source now returns less). Roughly half a
// second at 60fps, which is the signal to stop rather than a timeout: a venue
// page fetching and parsing its ICS can take much longer than that to arrive,
// and the height is flat until it does.
const MAX_STABLE_FRAMES = 30
// Absolute backstop so a pathological page can't hold a rAF loop forever.
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

    // A restore is only "pending" while it still has somewhere to get to. The
    // common case — the view remounts at its full height — settles here, on the
    // first synchronous try, and nothing below ever runs.
    // `clientHeight === 0` means the container is hidden (the Map tab flips
    // `.a-content` to display:none), where assigning scrollTop is a no-op.
    pendingRef.current = target > 0 && el.clientHeight > 0 && !apply()
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

    // Re-apply on each frame while content is still arriving under us, and stop
    // once the height goes quiet without ever getting tall enough. Skipped
    // entirely whenever the first try landed, which is the common case.
    let lastHeight = -1
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
        stableFrames = 0
      } else if (++stableFrames > MAX_STABLE_FRAMES) {
        pendingRef.current = null
        remember(viewKey, el.scrollTop)
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
    }
  }, [viewKey, remember])

  return { containerRef, resetViewScroll }
}
