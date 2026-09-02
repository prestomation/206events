import { useEffect } from 'react'
import { Ico } from '../../redesign/icons.jsx'
import { useSheetDrag } from './sheet.js'
import { isHttpUrl } from './isHttpUrl.js'

/**
 * The chrome every map popup shares. Three layouts, one component:
 *
 *   sheet — the mobile bottom sheet: one narrow column, draggable by its
 *           handle, and the density the design system calls "compact"
 *   panel — docked to the right edge of the desktop map column, full height
 *   wide  — the expanded full-screen map, where there is finally room for the
 *           right-hand column of dates and neighbours
 *
 * The design system's fourth layout (a card anchored beside the pin) has no
 * home here: this app abandoned pin-anchored Leaflet popups, and the sheet is
 * what carries that density instead.
 *
 * The shell owns the surface, the scroll region, Escape, the close button and
 * the optional back affordance. `aside` renders as a second column only in
 * `wide` and simply follows the body otherwise, so a caller can always pass it.
 */
export function MapPopup({
  layout = 'panel', eyebrow, title, subtitle, source, media,
  onClose, onBack, backLabel, children, aside, footer, dialogLabel, rootRef,
  escapeEnabled = true,
}) {
  const isSheet = layout === 'sheet'
  const { dvh, handlers } = useSheetDrag(isSheet)

  // Escape closes -- or, mid-drill-down, steps back one level first. Bound
  // above any early return so the hook order never shifts.
  //
  // `escapeEnabled` is how the caller hands Escape to something in front: the
  // popup's own artwork opens the app lightbox, and without this one press
  // would close the lightbox AND the popup underneath it, dumping the reader
  // back to a bare map.
  useEffect(() => {
    if (!escapeEnabled) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (onBack) onBack()
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [escapeEnabled, onBack, onClose])

  const body = layout === 'wide' && aside
    ? (
      <div className="mp-split">
        <div className="mp-col">{children}</div>
        <div className="mp-aside">{aside}</div>
      </div>
    )
    : <>{children}{aside}</>

  return (
    <aside
      ref={rootRef}
      className={`mp-popup mp-popup--${layout}`}
      role="dialog"
      aria-label={dialogLabel || (typeof title === 'string' ? title : undefined)}
      data-testid="map-popup"
      style={isSheet ? { height: `${dvh}dvh` } : undefined}
    >
      {isSheet && (
        <div className="mp-handle" role="separator" aria-label="Drag to resize" {...handlers} />
      )}

      <header className="mp-head">
        {onBack && (
          <button type="button" className="mp-back" onClick={onBack} aria-label={backLabel || 'Back'} title={backLabel || 'Back'}>
            {Ico.back}
          </button>
        )}
        {media}
        <div className="mp-headtext">
          {eyebrow && <div className="mp-eyebrow">{eyebrow}</div>}
          <h2 className="mp-title">{title}</h2>
          {subtitle && <div className="mp-sub">{subtitle}</div>}
          {source && <div className="mp-source">{source}</div>}
        </div>
        {onClose && (
          <button type="button" className="mp-close" onClick={onClose} aria-label="Close">{Ico.close}</button>
        )}
      </header>

      <div className="mp-body">{body}</div>

      {footer && <footer className="mp-foot">{footer}</footer>}
    </aside>
  )
}

/** Hairline divider on the popup's own surface. */
export function Rule() {
  return <div className="mp-rule" />
}

/**
 * The artwork square that leads a popup header or a series row: the event's own
 * image when it has one, else a category-tinted initial so a series without a
 * photo still has an identity. `onZoom` makes the image itself openable in the
 * app's lightbox.
 */
export function MapMedia({ imageUrl, title, color = 'var(--blue)', size, onZoom }) {
  const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.42) } : undefined
  if (isHttpUrl(imageUrl)) {
    return (
      <img
        className={`mp-media mp-media-img${onZoom ? ' mp-media--zoom' : ''}`}
        src={imageUrl}
        alt=""
        loading="lazy"
        style={style}
        onClick={onZoom ? (e) => { e.stopPropagation(); onZoom() } : undefined}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
    )
  }
  // Array.from, not [0] -- an emoji or other astral character would otherwise
  // be sliced in half into a lone surrogate.
  const initial = typeof title === 'string' ? (Array.from(title)[0] || '') : ''
  return (
    <span
      className="mp-media mp-media-initial"
      aria-hidden="true"
      style={{ ...style, background: `linear-gradient(145deg, ${color}, color-mix(in oklab, ${color} 55%, transparent))` }}
    >{initial}</span>
  )
}
