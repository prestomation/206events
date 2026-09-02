import { ProvChip } from '../../redesign/atoms.jsx'
import { provFromAttributions } from '../../redesign/viewModels.js'

/**
 * Why this pin is in front of you: a followed calendar, a saved search, a saved
 * area. Provenance, never a filter -- so these are the app's existing ProvChip,
 * not a second chip vocabulary invented for the map.
 *
 * `provFromAttributions` reduces a list to its single winning reason; here each
 * attribution gets its own chip, so a pin that is both inside a saved area and
 * on a followed calendar says both.
 */
export function MapChips({ attributions }) {
  const chips = (attributions || []).map((a) => provFromAttributions([a])).filter(Boolean)
  if (!chips.length) return null
  return (
    <div className="mp-chips">
      {chips.map((c, i) => <ProvChip key={`${c.kind}-${i}`} reason={c} />)}
    </div>
  )
}
