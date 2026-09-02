import { eventDateParts } from '../../lib/dateFormat.js'
import { relativeDay } from '../../lib/eventCadence.js'
import { Ico } from '../../redesign/icons.jsx'

// Hard cap on rendered dates so a very long run (a nightly show over a wide
// window) can't balloon the DOM. Overflow is summarised as "+N more dates".
export const MAX_GROUP_DATES = 50

// Only emit http(s) links -- guards against javascript:/data: URLs in source
// data. (React escapes text by default, so no manual HTML escaping.)
function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u)
}

/**
 * A series' dates at the two densities the map needs: `chips` for the narrow
 * sheet (a wrapping strip you scan sideways) and `rows` when there is width for
 * detail (date, time, how far off, month dividers).
 *
 * Picking a date is a SELECTION -- the popup's next-date block follows it. An
 * instance that carries its own event-page URL also gets a trailing external
 * link, so the row is the selector and the icon is the only navigation. That
 * split is the same idiom the app already uses for location lines.
 *
 * Nothing is marked selected unless `value` says so. A venue popup peeking at
 * three separate series has no selection to show, and highlighting each list's
 * first row there would claim a choice the reader never made.
 */
export function EventDateList({
  instances = [], variant = 'rows', value, max = MAX_GROUP_DATES, onPick, showMonths = true,
}) {
  const shown = instances.slice(0, max)
  const overflow = instances.length - shown.length
  const selected = value

  if (variant === 'chips') {
    return (
      <div className="mp-dates mp-dates--chips">
        {shown.map((inst, i) => {
          const p = eventDateParts(inst.date)
          const on = inst.date === selected
          return (
            <button
              key={`${inst.date}-${i}`}
              type="button"
              className={`mp-chip${on ? ' mp-chip--on' : ''}`}
              aria-pressed={on}
              onClick={(e) => { e.stopPropagation(); onPick?.(inst) }}
            >
              <span className="mp-chip-dow">{p ? p.dow : '·'}</span>
              <span className="mp-chip-day">{p ? p.dayMonth : inst.date}</span>
            </button>
          )
        })}
        {overflow > 0 && <span className="mp-dates-more">+{overflow} more</span>}
      </div>
    )
  }

  const rows = []
  let lastMonth = null
  shown.forEach((inst, i) => {
    const p = eventDateParts(inst.date)
    if (showMonths && p && p.monthLabel !== lastMonth) {
      lastMonth = p.monthLabel
      rows.push(<li key={`m-${p.monthLabel}-${i}`} className="mp-month">{p.monthLabel}</li>)
    }
    const on = inst.date === selected
    rows.push(
      <li key={`${inst.date}-${i}`}>
        <div className={`mp-daterow${on ? ' mp-daterow--on' : ''}`}>
          <button
            type="button"
            className="mp-daterow-pick"
            aria-pressed={on}
            onClick={(e) => { e.stopPropagation(); onPick?.(inst) }}
          >
            <span className="mp-daterow-day">{p ? `${p.dow} ${p.dayMonth}` : inst.date}</span>
            {p && <span className="mp-daterow-time">{p.time}</span>}
            <span className="mp-daterow-rel">{p ? relativeDay(inst.date) : ''}</span>
          </button>
          {isHttpUrl(inst.url) && (
            <a
              className="mp-daterow-go"
              href={inst.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this event's own page"
              aria-label="Open this event's own page"
              onClick={(e) => e.stopPropagation()}
            >{Ico.link}</a>
          )}
        </div>
      </li>,
    )
  })

  return (
    <ul className="mp-dates mp-dates--rows">
      {rows}
      {overflow > 0 && (
        <li className="mp-dates-more">+{overflow} more date{overflow === 1 ? '' : 's'}</li>
      )}
    </ul>
  )
}
