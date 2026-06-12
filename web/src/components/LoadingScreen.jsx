// Branded full-screen loader shown while the app's core data loads. Mirrors
// the pre-paint boot splash in index.html (same logo mark + breathing pulse
// and sliding progress bar) so the hand-off from the inline boot screen to
// React is seamless, then adds a cycling status line. Wrapped in `.app206`
// to inherit the warm "paper" palette.

import { useEffect, useState } from 'react'
import cityConfig from '../../../city.config.ts'

const MESSAGES = [
  `Gathering ${cityConfig.city.name}'s calendars…`,
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
    <div className="mk app206 loading-screen" role="status" aria-busy="true" aria-label={`Loading ${cityConfig.site.name}`}>
      <div className="loading-mark">{cityConfig.site.bootLogoText}</div>
      <div className="loading-bar" aria-hidden="true" />
      <div className="loading-screen-msg" key={line}>{line}</div>
    </div>
  )
}
