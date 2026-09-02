import { EventPopup } from './EventPopup.jsx'
import { VenuePopup } from './VenuePopup.jsx'
import { googleMapsUrl } from '../../lib/maplink.js'
import { eventKey } from '../../lib/eventKey.js'
import { cadence } from '../../lib/eventCadence.js'
import { resolveVenueIdentity } from './venueIdentity.js'

/**
 * The shell a selection actually commits to, which is not always the layout it
 * was offered: a venue's content is one list, so it declines the expanded map's
 * two-column `wide` card rather than stranding a header and two buttons in a
 * column of nothing.
 *
 * This lives here, next to the component that picks which popup to render, and
 * `MapPanel` consults it too — the floating map chrome has to retreat to the
 * side the card is ACTUALLY docked to, and guessing from the offered layout put
 * it under the card instead.
 */
export function popupShell(layout, selection) {
  const venue = selection?.venue
  if (!venue) return layout
  const showsVenue = !selection.group && venue.seriesCount > 1
  return layout === 'wide' && showsVenue ? 'panel' : layout
}

/**
 * Chooses and feeds the popup for the clicked pin, and is the one place that
 * knows about app state (favorites, navigation, the calendar-add preference).
 * Everything under `components/map/` below it stays pure and prop-driven.
 *
 * A pin that hosts exactly one series opens straight into its event popup —
 * there is no list worth showing. A pin hosting several opens the venue popup,
 * and picking a series drills in with a back affordance.
 */
export function MapPopupHost({
  selection, layout = 'panel',
  venueByIcsUrl, channelByIcsUrl, calendarNameByIcsUrl, eventAttributions,
  favoritesSet, calendarAddMode = 'auto', descriptionsPending = false,
  onToggleFollow, onOpenEvent, onZoomImage, onSelect, onClose, rootRef, escapeEnabled,
}) {
  if (!selection?.venue) return null
  const { venue, group } = selection
  const shell = popupShell(layout, selection)
  const { name, address } = resolveVenueIdentity(venue, venueByIcsUrl)
  const mapsUrl = googleMapsUrl({ location: venue.label, lat: venue.lat, lng: venue.lng })
  const colorFor = (g) => channelByIcsUrl?.get(g.instances[0]?.icsUrl)?.color || 'var(--blue)'

  // A single-series pin has nothing to list, so it opens its event popup
  // directly — and has no venue level to go back to.
  const open = group || (venue.seriesCount === 1 ? venue.series[0] : null)

  if (!open) {
    // Following is per-calendar in this app. A venue whose series all come from
    // one feed has an unambiguous thing to follow; one spanning several feeds
    // does not, so it offers no venue-level pill and each series row leads to
    // an event popup where following means exactly one calendar.
    const icsUrls = new Set(venue.series.map((g) => g.instances[0]?.icsUrl))
    const soleIcsUrl = icsUrls.size === 1 ? [...icsUrls][0] : null
    return (
      <VenuePopup
        rootRef={rootRef}
        escapeEnabled={escapeEnabled}
        venue={{ ...venue, name, address }}
        layout={shell}
        attributions={eventAttributions?.get(eventKey(venue.series[0].instances[0]))}
        mapsUrl={mapsUrl}
        seriesColor={colorFor}
        followTarget={soleIcsUrl ? (calendarNameByIcsUrl?.[soleIcsUrl] || name) : null}
        following={soleIcsUrl ? !!favoritesSet?.has(soleIcsUrl) : false}
        onFollow={soleIcsUrl ? () => onToggleFollow?.(soleIcsUrl) : undefined}
        onOpenSeries={(g) => onSelect?.({ venue, group: g })}
        onPickDate={(g, inst) => onSelect?.({ venue, group: g, selected: inst })}
        onClose={onClose}
      />
    )
  }

  const rep = open.instances[0]
  const icsUrl = rep?.icsUrl
  const calendarName = calendarNameByIcsUrl?.[icsUrl] || icsUrl?.replace('.ics', '')

  return (
    <EventPopup
      rootRef={rootRef}
      escapeEnabled={escapeEnabled}
      group={open}
      venue={{ ...venue, name, address }}
      layout={shell}
      selected={selection.selected}
      calendarName={calendarName}
      channelColor={colorFor(open)}
      attributions={eventAttributions?.get(eventKey(rep))}
      calendarAddMode={calendarAddMode}
      descriptionsPending={descriptionsPending}
      following={!!favoritesSet?.has(icsUrl)}
      mapsUrl={mapsUrl}
      alsoHere={venue.series.filter((g) => g !== open)}
      seriesMeta={(g) => cadence(g.instances)}
      onFollow={() => onToggleFollow?.(icsUrl)}
      onDetails={(inst) => onOpenEvent?.(inst)}
      onPickDate={(inst) => onSelect?.({ venue, group: open, selected: inst })}
      onOpenSeries={(g) => onSelect?.({ venue, group: g })}
      onZoomImage={onZoomImage}
      onBack={venue.seriesCount > 1 ? () => onSelect?.({ venue, group: null }) : undefined}
      backLabel={venue.seriesCount > 1 ? `Back to ${name || 'this venue'}` : undefined}
      onClose={onClose}
    />
  )
}
