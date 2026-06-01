// Branded full-screen loader shown while the app's core data loads. Mirrors
// the pre-paint boot splash in index.html (same "206" mark + spinner ring)
// so the hand-off from the inline boot screen to React is seamless, then adds
// a cycling Seattle-flavored status line. Wrapped in `.app206` to inherit the
// warm "paper" palette.

import { useEffect, useState } from 'react'

const MESSAGES = [
  "Gathering Seattle's calendars…",
  'Rounding up the venues…',
  'Sorting the week ahead…',
  'Tuning the dials…',
]

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function LoadingScreen({ message }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (message || prefersReducedMotion()) return
    const t = setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 1600)
    return () => clearInterval(t)
  }, [message])

  const line = message || MESSAGES[idx]

  return (
    <div className="mk app206 loading-screen" role="status" aria-label="Loading 206.events">
      <div className="loading-mark">206</div>
      <div className="loading-ring" aria-hidden="true" />
      <div className="loading-screen-msg" key={line}>{line}</div>
    </div>
  )
}
