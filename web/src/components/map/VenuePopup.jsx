import { MapPopup, Rule } from './MapPopup.jsx'
import { EventDateList } from './EventDateList.jsx'
import { SeriesRow } from './SeriesRow.jsx'
import { MapFollowPill } from './MapFollowPill.jsx'
import { MapButton } from './MapButton.jsx'
import { MapChips } from './MapChips.jsx'
import { cadence } from '../../lib/eventCadence.js'
import { Ico } from '../../redesign/icons.jsx'

/**
 * A pin is a place, so a venue popup answers "what is at this dot": the
 * address, then every series running there with a peek at its next dates.
 *
 * Following in this app is per-CALENDAR, not per-venue. When every series at a
 * venue comes from one feed, the venue-level pill is unambiguous and shows;
 * when the venue's series span several feeds there is no single thing to
 * follow, so the pill is omitted and each series row leads to an event popup
 * where following means exactly one calendar.
 */
export function VenuePopup({
  venue, layout = 'panel', following = false, followTarget, peek = 3,
  attributions, mapsUrl, seriesColor,
  onFollow, onOpenSeries, onClose, onPickDate, rootRef,
}) {
  if (!venue) return null
  // A venue's content is ONE list, so it declines the two-column `wide` layout
  // the expanded map offers: splitting it leaves a header and two buttons
  // stranded in a 376px column of nothing. The event popup does have two
  // columns' worth (copy and the next date on one side, every date and the
  // venue's other series on the other), so `wide` still earns its keep there.
  const shell = layout === 'wide' ? 'panel' : layout
  const rich = shell !== 'sheet'
  const { name, address, series, seriesCount, dateCount } = venue

  const list = (
    <>
      <div className="mp-listhead">
        <span>{rich ? "What's on" : `${seriesCount} series here`}</span>
        {rich && <span className="mp-listhead-n">{dateCount} dates</span>}
      </div>
      <div className={`mp-serieslist${rich ? ' mp-serieslist--peek' : ''}`}>
        {series.map((g) => (
          <div key={g.key}>
            <SeriesRow
              title={g.summary}
              meta={cadence(g.instances)}
              note={`${g.count} date${g.count === 1 ? '' : 's'}`}
              imageUrl={g.instances[0]?.imageUrl}
              color={seriesColor ? seriesColor(g) : undefined}
              size={rich ? 40 : 44}
              onClick={onOpenSeries ? () => onOpenSeries(g) : undefined}
            />
            {rich && (
              <EventDateList
                instances={g.instances}
                variant="rows"
                max={peek}
                showMonths={false}
                onPick={onPickDate ? (inst) => onPickDate(g, inst) : undefined}
              />
            )}
          </div>
        ))}
      </div>
    </>
  )

  return (
    <MapPopup
      rootRef={rootRef}
      layout={shell}
      eyebrow="Venue"
      title={name}
      subtitle={address}
      onClose={onClose}
      aside={list}
      dialogLabel={name}
    >
      <MapChips attributions={attributions} />
      <div className="mp-venue-actions">
        {followTarget && (
          <MapFollowPill
            on={following}
            label="Follow venue"
            title={following ? `Following ${followTarget}` : `Follow ${followTarget}`}
            onClick={onFollow}
          />
        )}
        {mapsUrl && (
          <MapButton href={mapsUrl} target="_blank" title="Open this venue in Google Maps">
            {Ico.pin}<span>Open in maps</span>
          </MapButton>
        )}
      </div>
      <Rule />
    </MapPopup>
  )
}
