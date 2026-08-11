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
//      the moment the reader takes over — hence the stable-height give-up, and
//      a scroll listener that compares where the container ended up against
//      what this hook last put there.
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
// fetch in App.jsx gives up at 10s, so nothing legitimate lands after this. It
// also covers the case the stability rule above can't see: a view that is
// statically shorter than the offset and never changes height (the viewport was
// resized, or the phone rotated, between visits), where `contentArrived` never
// flips. Each waiting frame costs two layout reads, no write — see `chase`.
const RESTORE_CAP_MS = 12000
// Sub-pixel slack: scrollTop can read back fractionally under the assigned
// value on fractional-DPR displays.
const LANDED_SLACK_PX = 1

export function useViewScrollRestore(viewKey) {
  const containerRef = useRef(null)
  const positionsRef = useRef(new Map())
  // { target, deadline } while a restore is being chased; null once settled.
  const pendingRef = useRef(null)
  // The last *committed* view key. Written only from the layout effect below,
  // never during render: navigation runs inside `startTransition`, and a
  // render-phase write survives a discarded transition render — which would
  // leave this pointing at a view that never appeared, and delete the wrong
  // entry. (App206 documents the same hazard for its map keep-alive latch.)
  const committedKeyRef = useRef(viewKey)
  // Set by a caller that wants the NEXT restore skipped. See `resetViewScroll`.
  const resetRequestedRef = useRef(false)

  const remember = useCallback((key, top) => {
    const positions = positionsRef.current
    // Re-insert so Map iteration order is least-recently-written first.
    positions.delete(key)
    positions.set(key, top)
    if (positions.size > MAX_TRACKED_VIEWS) {
      positions.delete(positions.keys().next().value)
    }
  }, [])

  // Drop the saved offset for the view being restored — called when the
  // underlying list turns out to have been replaced (a filter edit, a corpus
  // swap), so a stale deep offset isn't restored into a different set of rows.
  //
  // It does two things because it serves two orderings. A caller that notices
  // the swap in its own layout effect runs BEFORE this hook's (children first),
  // so the key it wants cleared isn't committed yet — hence the request flag,
  // consumed below. A caller that notices later, in a passive effect, runs
  // after, so the committed key is already correct and can be deleted outright.
  // Doing both means the first case also drops the view just left, which is a
  // detail page whose offset barely matters and only when its list was stale.
  const resetViewScroll = useCallback(() => {
    resetRequestedRef.current = true
    positionsRef.current.delete(committedKeyRef.current)
    pendingRef.current = null
  }, [])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    committedKeyRef.current = viewKey
    if (resetRequestedRef.current) {
      resetRequestedRef.current = false
      positionsRef.current.delete(viewKey)
    }

    const target = positionsRef.current.get(viewKey) ?? 0
    let frame = 0

    // True once the offset has been reached (or there was nothing to restore).
    // `applied` records what the container actually took, which is how the
    // scroll listener tells our own writes apart from the reader's scrolling.
    let applied = -1
    const apply = () => {
      el.scrollTop = target
      applied = el.scrollTop
      return applied >= target - LANDED_SLACK_PX
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

    // The scroll listener is also how the reader takes over. Every position we
    // put there is recorded in `applied`, so anything else the container ends
    // up at came from them — wheel, touch, keyboard, a scrollbar drag, the day
    // scrubber, anything. Watching the outcome rather than guessing at input
    // events avoids both halves of the trap: native scrollbar drags dispatch no
    // pointer events at all in Chromium, while `pointerdown` fires for every
    // tap on a button or link, where yielding would be wrong.
    const onScroll = () => {
      if (!settled()) {
        if (Math.abs(el.scrollTop - applied) <= LANDED_SLACK_PX) return
        pendingRef.current = null // the reader moved it, not us
      }
      remember(viewKey, el.scrollTop)
    }
    // Wheel and touch still get an explicit yield: they arrive *before* the
    // scroll they cause, so the chase stops a frame earlier and never fights
    // the very first movement.
    const yieldToReader = () => { pendingRef.current = null }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', yieldToReader, { passive: true })
    el.addEventListener('touchstart', yieldToReader, { passive: true })

    // Re-apply on each frame while content is still arriving under us. Skipped
    // entirely whenever the first try landed, which is the common case.
    let lastHeight = el.scrollHeight
    let contentArrived = false
    let stableFrames = 0
    const chase = () => {
      frame = 0
      if (settled()) return
      // Only touch scrollTop when the range can actually hold the offset —
      // otherwise this is a write plus a read-back, i.e. a forced reflow every
      // frame, for an assignment guaranteed to be clamped away.
      if (el.scrollHeight - el.clientHeight >= target - LANDED_SLACK_PX && apply()) {
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
    }
  }, [viewKey, remember])

  return { containerRef, resetViewScroll }
}
