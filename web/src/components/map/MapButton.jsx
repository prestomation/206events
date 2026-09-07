// The map surface's button. The app's shared `.btn` is 46px tall, which is
// right for a full-width action row and far too tall for a popup that has to
// fit a header, a description, a date list and a footer inside a 45dvh sheet.
// So the design system's tighter button lives here, scoped to `.mp-*`, rather
// than being retrofitted onto `.btn` across every screen in the app.
//
// Renders an <a> when given `href`, so navigation stays navigation.
export function MapButton({
  variant = 'secondary', size = 'sm', href, target, onClick,
  title, ariaLabel, children, className = '',
}) {
  const cls = `mp-btn mp-btn--${variant} mp-btn--${size}${className ? ` ${className}` : ''}`
  if (href) {
    return (
      <a
        className={cls}
        href={href}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        title={title}
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >{children}</a>
    )
  }
  return (
    <button
      type="button"
      className={cls}
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => { e.stopPropagation(); onClick?.(e) }}
    >{children}</button>
  )
}
