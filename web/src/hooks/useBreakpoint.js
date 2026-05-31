import { useState, useEffect } from 'react'
import { BREAKPOINT_MOBILE, BREAKPOINT_TABLET } from '../constants.js'

// Returns the current responsive breakpoint: 'mobile' | 'tablet' | 'desktop'.
export function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  if (width < BREAKPOINT_MOBILE) return 'mobile'
  if (width < BREAKPOINT_TABLET) return 'tablet'
  return 'desktop'
}
