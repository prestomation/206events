import { Ico } from '../../redesign/icons.jsx'

// Following is a heart everywhere in the app, so the map uses the same one.
// Off is a tinted pill with an outline heart; on is solid ink with a filled
// heart, which reads as "done" without needing a second colour.
//
// Following is per-CALENDAR in this app (favorites are keyed by icsUrl), so the
// caller decides which calendar a given pill toggles -- `label` says so.
export function MapFollowPill({ on = false, label = 'Follow', onLabel = 'Following', iconOnly = false, onClick, title }) {
  return (
    <button
      type="button"
      className={`mp-follow${on ? ' mp-follow--on' : ''}${iconOnly ? ' mp-follow--icon' : ''}`}
      aria-pressed={on}
      aria-label={iconOnly ? (on ? onLabel : label) : undefined}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick?.(e) }}
    >
      <span className="mp-follow-ico" aria-hidden="true">{Ico.heart}</span>
      {iconOnly ? null : <span>{on ? onLabel : label}</span>}
    </button>
  )
}
