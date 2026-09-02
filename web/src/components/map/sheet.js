// Mobile bottom-sheet drag, lifted verbatim from EventGroupPanel so the
// hard-won gesture handling survives the design-system port.
//
// Bounds are in dynamic viewport height units (dvh tracks the *visible*
// viewport, so the handle never ends up behind the browser's address bar). The
// sheet opens at PEEK and can be dragged down to MIN (just the header) or up to
// MAX -- never past MAX, so the handle always stays reachable.
import { useRef, useState } from 'react'

export const SHEET_MIN_DVH = 16
export const SHEET_PEEK_DVH = 45
export const SHEET_MAX_DVH = 85

/**
 * Drag state for the sheet's grab handle. Returns the current height in dvh
 * and the pointer handlers to spread onto the handle element.
 *
 * Pointer capture routes all moves to the handle even as the finger leaves it,
 * and pointercancel is handled -- without these, Android Chrome claims the
 * gesture as a scroll (firing pointercancel, never delivering moves) and the
 * drag dies. `touch-action: none` on the handle (CSS) stops the browser
 * scrolling instead.
 */
export function useSheetDrag(enabled) {
  const [dvh, setDvh] = useState(SHEET_PEEK_DVH)
  const dragRef = useRef(null)

  const onPointerDown = (e) => {
    if (!enabled) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* unsupported */ }
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY, startDvh: dvh }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dy = d.startY - e.clientY // dragging up grows the sheet
    const next = d.startDvh + (dy / window.innerHeight) * 100
    setDvh(Math.min(SHEET_MAX_DVH, Math.max(SHEET_MIN_DVH, next)))
  }
  const onPointerEnd = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null // free positioning -- keep wherever the user left it
  }

  return {
    dvh,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  }
}
