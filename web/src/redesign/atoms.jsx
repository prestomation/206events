// Leaf / presentational components for the redesigned UI.

import { useEffect } from 'react'
import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { colorForTag } from './categories.js'
import { rowFromIndexEvent, provFromAttributions, describeWindow, costLabel, COST_FILTER_OPTIONS } from './viewModels.js'
import { eventKey } from '../lib/eventKey.js'
import { bestMapHref } from '../lib/maplink.js'
import { formatTagLabel } from '../utils/format.js'

export function Brand() {
  return <div className="a-brand">206<b>.</b>events</div>
}

export function CatDot({ tag, color, size = 8 }) {
  return <span className="mk-dot" style={{ width: size, height: size, background: color || colorForTag(tag) }} />
}

export function ChannelAvatar({ color, size = 44 }) {
  return (
    <div className="ch-ava" style={{ width: size, height: size, background: color }}>
      <span style={{ width: size * 0.52, height: size * 0.52 }}>{Ico.cal}</span>
    </div>
  )
}

export function FollowPill({ on, onClick, labelOff = 'Follow', labelOn = 'Following' }) {
  return (
    <button className={`pill-follow ${on ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onClick && onClick() }}>
      {on ? <span style={{ width: 14, height: 14 }}>{Ico.check}</span> : '+'} {on ? labelOn : labelOff}
    </button>
  )
}

// Banner photo for a venue/source or event. Shows the image *whole* via
// object-fit: contain (so a wordmark like "Ballard Brood" isn't center-cropped)
// over a blurred, scaled copy of the same image that fills the box — the
// letterboxing reads as intentional rather than a gap. Clicking opens the full
// image in the lightbox. A load error hides the whole banner so a dead URL
// leaves no broken-image frame.
export function BannerImage({ src, alt, height = 160, radius = 14, marginBottom = 14 }) {
  const app = useApp206()
  if (!src) return null
  const open = () => app.openLightbox(src, alt)
  return (
    <div
      className="a-banner"
      style={{ height, borderRadius: radius, marginBottom }}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
      aria-label={alt ? `${alt} — view full image` : 'View full image'}
    >
      <img className="a-banner-bg" src={src} alt="" aria-hidden="true" loading="lazy" />
      <img
        className="a-banner-fg"
        src={src}
        alt={alt || ''}
        loading="lazy"
        onError={(e) => { const w = e.currentTarget.closest('.a-banner'); if (w) w.style.display = 'none' }}
      />
    </div>
  )
}

// Small square event thumbnail. Stays cover-cropped (a tiny square wants to be
// filled), but clicking opens the full uncropped image in the lightbox — event
// posters often carry readable detail (lineups, set times, fine print) that's
// lost at thumbnail size.
export function EventThumb({ src, alt, size = 56 }) {
  const app = useApp206()
  if (!src) return null
  return (
    <img
      className="a-evthumb"
      src={src}
      alt={alt || ''}
      loading="lazy"
      onClick={() => app.openLightbox(src, alt)}
      onError={(e) => { e.currentTarget.style.display = 'none' }}
      style={{ width: size, height: size, flex: '0 0 auto', marginRight: 10 }}
    />
  )
}

// Full-screen image viewer. Single instance mounted at the App206 root; opened
// from anywhere via app.openLightbox(src, alt). Dismissed by clicking the
// backdrop, the close button, or Escape. Locks body scroll while open.
export function Lightbox() {
  const { lightbox, closeLightbox } = useApp206()
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => { if (e.key === 'Escape') closeLightbox() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [lightbox, closeLightbox])
  if (!lightbox) return null
  return (
    <div className="a-lightbox" onClick={closeLightbox} role="dialog" aria-modal="true"
      aria-label={lightbox.alt || 'Full image'}>
      <button className="a-lightbox-close" onClick={closeLightbox} aria-label="Close image">
        <span style={{ width: 22, height: 22 }}>{Ico.close}</span>
      </button>
      {/* Stop propagation so clicking the image itself doesn't close the viewer. */}
      <img src={lightbox.src} alt={lightbox.alt || ''} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

// Generic centered-card dialog. Shares the Lightbox's proven behavior — Esc to
// close, backdrop click, body scroll lock, role="dialog"/aria-modal — but
// renders a content card (header + body + optional footer) rather than an
// edge-to-edge image. Used by the welcome and help modals (see Onboarding.jsx).
// Carries its own `.a-dlg*` namespace, distinct from FeedbackModal's `.a-modal*`.
export function Modal({ title, onClose, children, footer, labelledBy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])
  const titleId = labelledBy || 'a-dlg-title'
  return (
    <div className="a-dlg-backdrop" onClick={onClose}>
      <div className="a-dlg" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}>
        <div className="a-dlg-head">
          {title && <div className="a-dlg-title" id={titleId}>{title}</div>}
          <button className="a-dlg-close" onClick={onClose} aria-label="Close">
            <span style={{ width: 20, height: 20 }}>{Ico.close}</span>
          </button>
        </div>
        <div className="a-dlg-body">{children}</div>
        {footer && <div className="a-dlg-foot">{footer}</div>}
      </div>
    </div>
  )
}

const PROV = {
  cal: { cls: 'prov-cal', icon: Ico.cal },
  place: { cls: 'prov-place', icon: Ico.pin },
  search: { cls: 'prov-search', icon: Ico.search },
}
export function ProvChip({ reason }) {
  if (!reason) return null
  const p = PROV[reason.kind] || PROV.cal
  return (
    <span className={`prov-chip ${p.cls}`}>
      <span style={{ width: 12, height: 12, flex: '0 0 auto' }}>{p.icon}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reason.label}</span>
    </span>
  )
}

// A muted location line with a trailing ceramic-red pin that links to maps.
// The text itself is not a link — only the pin is the tap target. The pin's
// onClick stops propagation so it doesn't also trigger an enclosing row's
// open-event handler. Coords (from the ICS GEO line) drive a geo: link on
// Android when present; otherwise the location text drives the maps query.
export function LocationMapLink({ location, lat, lng, style }) {
  if (!location) return null
  const href = bestMapHref({ location, lat, lng })
  return (
    <div className="ev-meta" style={{ marginTop: 5, ...style }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{location}</span>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" title="Open in maps" aria-label="Open in maps"
          onClick={(e) => e.stopPropagation()}
          style={{ flex: '0 0 auto', width: 14, height: 14, color: 'var(--pin)', display: 'inline-flex', alignItems: 'center' }}>
          {Ico.pin}
        </a>
      )}
    </div>
  )
}

// A single day-grouped event row. `event` is an events-index entry.
export function EventRow({ event, noDate = false, showChip = true, showLoc = false, reason = null }) {
  const app = useApp206()
  const row = rowFromIndexEvent(event)
  const channel = app.channelByIcsUrl.get(event.icsUrl)
  const open = () => app.openEvent(event)
  return (
    <div className="ev" onClick={open}>
      {!noDate && (
        <div className="ev-date">
          <div className="dow">{row.day}</div>
          <div className="num">{row.dateNum.split(' ')[1]}</div>
        </div>
      )}
      <div className="ev-body">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          {noDate && row.time && <span className="ev-time">{row.timeRange}</span>}
          <span className="ev-title" style={{ flex: 1, minWidth: 0 }}>{event.summary}</span>
          {costLabel(event.cost) && (
            <span className={`ev-cost${event.cost && !event.cost.paid && event.cost.min === 0 ? ' ev-cost--free' : ''}`}>
              {costLabel(event.cost)}
            </span>
          )}
        </div>
        {!noDate && row.time && <div className="ev-meta"><span>{row.timeRange}</span></div>}
        {showLoc && <LocationMapLink location={event.location} lat={event.lat} lng={event.lng} />}
        {showChip && channel && (
          <div className="ev-chip" style={{ marginTop: 6 }}
            onClick={(e) => { e.stopPropagation(); app.openChannel(event.icsUrl) }}>
            <CatDot tag={channel.primaryCategory} color={channel.color} size={6} />
            <span className="nm">in {channel.name}</span>
            <span style={{ width: 12, height: 12, color: 'var(--blue)', flex: '0 0 auto' }}>{Ico.arrow}</span>
          </div>
        )}
        {reason && <div style={{ marginTop: 7 }}><ProvChip reason={reason} /></div>}
      </div>
    </div>
  )
}

// Sticky day-grouped list. `groups` = [{ label, dateSubtitle, events }]. When
// `withReason`, each event's first attribution renders as a provenance chip.
export function DayList({ groups, withReason = false }) {
  const app = useApp206()
  if (!groups.length) return null
  return (
    <div>
      {groups.map((g) => (
        <div key={g.label + g.dateSubtitle}>
          <div className="a-daystick">
            <span className="a-day-kick">{g.label}</span>
            <span className="a-day-sub">{g.dateSubtitle}</span>
            <span className="a-day-line" />
          </div>
          {g.events.map((event, i) => {
            const reason = withReason
              ? provFromAttributions(app.eventAttributions.get(eventKey(event)))
              : null
            const channel = app.channelByIcsUrl.get(event.icsUrl)
            return (
              <EventRow key={eventKey(event) + i} event={event} noDate
                showChip={!withReason}
                showLoc={withReason || (channel && channel.distributed)}
                reason={reason} />
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Dismissible chips showing every active filter, so the user always knows the
// list is filtered. Search also offers a one-tap "Save to feed".
// `costHiddenCount` (optional) is supplied by the host view: how many events
// pass every *other* active filter but are hidden solely because their price
// isn't confirmed. Quantifies the strict cost filter at the moment it bites.
export function ActiveFilters({ costHiddenCount = null }) {
  const app = useApp206()
  const q = app.query.trim()
  const scopeLabel = app.dateWindow !== 'all' ? describeWindow(app.dateWindow).relative : null
  const saved = q && app.searchFilters.some((f) => f.toLowerCase() === q.toLowerCase())
  if (!app.hasActiveFilters) return null
  return (
    <div className="a-activefilters">
      {q && (
        <span className="a-fchip a-fchip--search">
          <span style={{ width: 13, height: 13, flex: '0 0 auto' }}>{Ico.search}</span>
          <span className="a-fchip-label">Searching: “{q}”</span>
          {!saved && (
            <button className="a-fchip-save" onClick={() => app.addSearchFilter(q)} title="Save this search to your feed">Save</button>
          )}
          <button className="a-fchip-x" onClick={app.clearSearch} aria-label="Clear search">
            <span style={{ width: 12, height: 12 }}>{Ico.close}</span>
          </button>
        </span>
      )}
      {app.category && (
        <FilterChip icon={<CatDot tag={app.category} size={8} />} label={formatTagLabel(app.category)} onClear={() => app.setCategory(null)} />
      )}
      {app.neighborhood && (
        <FilterChip icon={<span style={{ width: 13, height: 13 }}>{Ico.pin}</span>} label={formatTagLabel(app.neighborhood)} onClear={() => app.setNeighborhood(null)} />
      )}
      {app.costFilter && (
        <FilterChip icon={<span style={{ width: 13, height: 13 }}>{Ico.spark}</span>}
          label={(COST_FILTER_OPTIONS.find((o) => o.value === app.costFilter) || {}).label || app.costFilter}
          onClear={() => app.setCostFilter(null)} />
      )}
      {scopeLabel && (
        <FilterChip icon={<span style={{ width: 13, height: 13 }}>{Ico.clock}</span>} label={scopeLabel} onClear={() => app.setDateWindow('all')} />
      )}
      {/* The cost filter is strict: events whose price the pipeline hasn't
          confirmed are hidden, so a shrunken list isn't a bug. */}
      {app.costFilter && (
        <span className="a-fcaption">
          Showing only events with confirmed pricing
          {costHiddenCount > 0 && ` — ${costHiddenCount.toLocaleString()} more ${costHiddenCount === 1 ? 'event has' : 'events have'} no listed price`}
          {!costHiddenCount && ' — most events don’t list a price yet'}.
        </span>
      )}
    </div>
  )
}

function FilterChip({ icon, label, onClear }) {
  return (
    <span className="a-fchip">
      <span style={{ display: 'inline-flex', flex: '0 0 auto' }}>{icon}</span>
      <span className="a-fchip-label">{label}</span>
      <button className="a-fchip-x" onClick={onClear} aria-label={`Clear ${label}`}>
        <span style={{ width: 12, height: 12 }}>{Ico.close}</span>
      </button>
    </span>
  )
}
