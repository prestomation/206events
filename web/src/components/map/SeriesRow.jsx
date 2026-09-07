import { Ico } from '../../redesign/icons.jsx'
import { MapMedia } from './MapPopup.jsx'

/**
 * One event series inside a venue popup or an "also here" list: artwork, the
 * title, its rhythm, and where it came from. Artwork falls back to a
 * category-tinted initial, so a series without an image still has an identity.
 */
export function SeriesRow({ title, meta, note, imageUrl, color, size = 44, selected = false, onClick }) {
  return (
    <button
      type="button"
      className={`mp-series${selected ? ' mp-series--on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick?.(e) }}
    >
      <MapMedia imageUrl={imageUrl} title={title} color={color} size={size} />
      <span className="mp-series-text">
        <span className="mp-series-title">{title}</span>
        {meta && <span className="mp-series-meta">{meta}</span>}
        {note && <span className="mp-series-note">{note}</span>}
      </span>
      <span className="mp-series-trail" aria-hidden="true">{Ico.arrow}</span>
    </button>
  )
}
