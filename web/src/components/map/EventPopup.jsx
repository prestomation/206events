import { MapPopup, Rule, MapMedia } from './MapPopup.jsx'
import { EventDateList, MAX_GROUP_DATES } from './EventDateList.jsx'
import { SeriesRow } from './SeriesRow.jsx'
import { MapFollowPill } from './MapFollowPill.jsx'
import { MapButton } from './MapButton.jsx'
import { MapChips } from './MapChips.jsx'
import { EventDescription } from '../EventDescription.jsx'
import { AddToCalendar } from '../AddToCalendar.jsx'
import { eventDateParts } from '../../lib/dateFormat.js'
import { cadence, relativeDay } from '../../lib/eventCadence.js'
import { parseIndexDate } from '../../redesign/viewModels.js'
import { Ico } from '../../redesign/icons.jsx'

/**
 * What a clicked event pin says: where it is, what it is, when it next happens,
 * and the two things you can do about it.
 *
 * The sheet clamps the description and shows dates as a chip strip; panel and
 * wide spend the extra room on the full copy and a date row per occurrence.
 * `alsoHere` is the venue's other series, which the venue grouping already has
 * to hand -- no extra pass.
 */
export function EventPopup({
  group, venue, layout = 'panel', following = false, selected,
  calendarName, channelColor = 'var(--blue)', attributions, calendarAddMode = 'auto',
  mapsUrl, alsoHere = [], seriesMeta, descriptionsPending = false,
  onFollow, onDetails, onClose, onBack, backLabel, onPickDate, onOpenSeries, onZoomImage, rootRef,
}) {
  if (!group) return null
  const rich = layout !== 'sheet'
  const { summary, count, instances } = group
  const rep = instances[0]
  const sel = selected || rep
  const selParts = eventDateParts(sel?.date)
  const rhythm = cadence(instances)
  // The next-date line right above already carries the start time, so the
  // rhythm beside it drops its own copy rather than saying 7:00 PM twice.
  const rhythmNoTime = cadence(instances, { withTime: false })

  const media = (
    <MapMedia
      imageUrl={rep.imageUrl}
      title={summary}
      color={channelColor}
      size={rich ? 64 : 52}
      onZoom={onZoomImage && rep.imageUrl ? () => onZoomImage(rep.imageUrl, summary) : undefined}
    />
  )

  const nextBlock = (
    <div className="mp-next">
      <div className="mp-next-text">
        <div className="mp-eyebrow">{selected ? 'Selected' : 'Next'}</div>
        <div className="mp-next-when">
          {selParts ? `${selParts.dow}, ${selParts.dayMonth} · ${selParts.time}` : 'No upcoming dates'}
        </div>
        {rich && selParts && (
          <div className="mp-next-rel">{relativeDay(sel.date)}{rhythmNoTime ? ` · ${rhythmNoTime}` : ''}</div>
        )}
      </div>
      <AddToCalendar
        title={summary}
        startDate={parseIndexDate(sel?.date)?.date}
        endDate={parseIndexDate(sel?.endDate)?.date}
        description={sel?.description ?? rep.description}
        location={sel?.location ?? rep.location}
        url={sel?.url ?? rep.url}
        mode={calendarAddMode}
        className="mp-btn mp-btn--primary mp-btn--md"
      />
    </div>
  )

  const neighbours = alsoHere.length ? (
    <>
      <Rule />
      <div className="mp-listhead">Also at {venue?.name || venue?.label || 'this venue'}</div>
      <div className="mp-serieslist">
        {alsoHere.map((g) => (
          <SeriesRow
            key={g.key}
            title={g.summary}
            meta={seriesMeta ? seriesMeta(g) : cadence(g.instances)}
            imageUrl={g.instances[0]?.imageUrl}
            color={channelColor}
            size={36}
            onClick={onOpenSeries ? () => onOpenSeries(g) : undefined}
          />
        ))}
      </div>
    </>
  ) : null

  const aside = (
    <>
      {rich && (
        <>
          <Rule />
          <div className="mp-listhead">
            <span>All dates</span>
            <span className="mp-listhead-n">{count}</span>
          </div>
          <EventDateList instances={instances} variant="rows" value={sel?.date} onPick={onPickDate} />
        </>
      )}
      {neighbours}
    </>
  )

  return (
    <MapPopup
      rootRef={rootRef}
      layout={layout}
      eyebrow={count > 1 ? `${count} dates` : 'Event'}
      title={summary}
      subtitle={venue?.label || rep.location}
      source={calendarName}
      media={media}
      onClose={onClose}
      onBack={onBack}
      backLabel={backLabel}
      aside={aside}
      footer={(
        <>
          <MapFollowPill
            on={following}
            label="Follow"
            title={following ? `Following ${calendarName || 'this calendar'}` : `Follow ${calendarName || 'this calendar'}`}
            onClick={onFollow}
          />
          <span className="mp-foot-gap" />
          {mapsUrl && (
            <MapButton href={mapsUrl} target="_blank" title="Open this venue in Google Maps">
              {Ico.pin}<span>Open in maps</span>
            </MapButton>
          )}
          {onDetails && (
            <MapButton variant="quiet" onClick={() => onDetails(sel)}>Details ›</MapButton>
          )}
        </>
      )}
    >
      <MapChips attributions={attributions} />
      {/* Descriptions arrive on a later payload than the events themselves, so
          the clamped sheet reserves their three lines while they are pending
          rather than reflowing under the reader's thumb when they land. */}
      {(rep.description || (!rich && descriptionsPending)) && (
        <div className={`mp-desc${rich ? '' : ' mp-desc--clamp'}${rep.description ? '' : ' mp-desc--pending'}`}>
          <EventDescription text={rep.description} />
        </div>
      )}
      <Rule />
      {nextBlock}
      {!rich && (
        <>
          <Rule />
          {rhythm && (
            <div className="mp-cadence">
              {rhythmNoTime}
              {count > 1 && <> · <b>{count} dates</b></>}
            </div>
          )}
          <EventDateList
            instances={instances}
            variant="chips"
            value={sel?.date}
            max={MAX_GROUP_DATES}
            onPick={onPickDate}
          />
        </>
      )}
    </MapPopup>
  )
}
