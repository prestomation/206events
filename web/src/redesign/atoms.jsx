// Leaf / presentational components for the redesigned UI.

import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { colorForTag } from './categories.js'
import { rowFromIndexEvent, provFromAttributions } from './viewModels.js'
import { eventKey } from '../lib/eventKey.js'
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
          {noDate && row.time && <span className="ev-time">{row.time}</span>}
          <span className="ev-title" style={{ flex: 1, minWidth: 0 }}>{event.summary}</span>
        </div>
        {!noDate && row.time && <div className="ev-meta"><span>{row.time}</span></div>}
        {showLoc && event.location && (
          <div className="ev-meta" style={{ marginTop: 5 }}>
            <span style={{ width: 13, height: 13, flex: '0 0 auto', color: 'var(--ink-4)' }}>{Ico.pin}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.location}</span>
          </div>
        )}
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

export function CategoryChips({ categories, active, onSelect }) {
  return (
    <div className="a-chips">
      <button className={`mk-pill ${!active ? 'mk-pill--active' : 'mk-pill--ghost'}`}
        onClick={() => onSelect(null)} style={{ flex: '0 0 auto' }}>All</button>
      {categories.map((tag) => (
        <button key={tag} className={`mk-pill ${active === tag ? 'mk-pill--active' : 'mk-pill--ghost'}`}
          onClick={() => onSelect(active === tag ? null : tag)} style={{ flex: '0 0 auto' }}>
          <CatDot tag={tag} size={7} />{formatTagLabel(tag)}
        </button>
      ))}
    </div>
  )
}
