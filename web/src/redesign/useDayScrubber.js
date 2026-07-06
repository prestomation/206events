// Shared host-side plumbing for the DayScrubber (DayScrubber.jsx). The scrubber
// itself is presentation-only: it emits `onSeek(day)` and leaves it to the host
// to make that day visible. Both paged lists that carry a scrubber — the
// Discover events feed (EventsMode) and the Following feed (FollowingView) —
// need the identical "scroll to the day, growing the paged list first if that
// day isn't rendered yet" behavior, so it lives here once.
//
// Usage: attach the returned `listRef` to the list wrapper (its closest
// `.a-content` is the scroll container) and pass `seekToDay` as the scrubber's
// `onSeek`. `grow(day)` is the host's pager — asked to render far enough to
// include `day` (via `day.firstIndex`) when it isn't on screen yet; omit it for
// a fully-rendered list. `commitDep` is the value that changes when new rows
// commit to the DOM (the rendered `groups`), so the deferred scroll can retry
// after `grow` expands the page.

import { useRef, useCallback, useLayoutEffect } from 'react'

export function useDayScrubberSeek({ grow, commitDep } = {}) {
  const listRef = useRef(null)
  const seekTargetRef = useRef(null)

  // Scroll the `.a-content` container so the given day's `.a-daystick` header
  // sits at the top. Returns false when that day isn't rendered yet.
  const scrollToDayKey = useCallback((key) => {
    const container = listRef.current?.closest('.a-content')
    if (!container) return false
    const header = container.querySelector(`.a-daystick[data-day="${key}"]`)
    if (!header) return false
    container.scrollTop += header.getBoundingClientRect().top - container.getBoundingClientRect().top
    return true
  }, [])

  // If the target day is already rendered, scroll to it now; otherwise stash it
  // and ask the host to page further — the layout effect finishes the scroll
  // once that day's header commits (before paint, so no flash).
  const seekToDay = useCallback((day) => {
    if (!day) return
    if (scrollToDayKey(day.dayKey)) return
    seekTargetRef.current = day.dayKey
    grow?.(day)
  }, [scrollToDayKey, grow])

  useLayoutEffect(() => {
    if (seekTargetRef.current && scrollToDayKey(seekTargetRef.current)) seekTargetRef.current = null
  }, [commitDep, scrollToDayKey])

  // Drop a pending seek when the underlying list is replaced (e.g. a filter
  // edit) so a stale target can't hijack a later scroll.
  const clearSeekTarget = useCallback(() => { seekTargetRef.current = null }, [])

  return { listRef, seekToDay, clearSeekTarget }
}
