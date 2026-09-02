import { EventPopup } from './EventPopup.jsx'
import { VenuePopup } from './VenuePopup.jsx'
import { googleMapsUrl } from '../../lib/maplink.js'
import { eventKey } from '../../lib/eventKey.js'
import { cadence } from '../../lib/eventCadence.js'
import { quantizeCoord } from '../../lib/event-grouping.js'

// A venue label from the events index is usually "Name, Neighborhood" or a
// full street address. Split on the first comma so the popup can lead with the
// place and subordinate the rest, which is what the design system's title /
// subtitle pairing wants.
function splitVenueLabel(label) {
  const s = String(label ?? '').trim()
  if (!s) return { name: '', address: '' }
  const i = s.indexOf(',')
  if (i === -1) return { name: s, address: '' }
  return { name: s.slice(0, i).trim(), address: s.slice(i + 1).trim() }
}

/**
 * Resolve a clicked venue into the name and address the popup shows.
 *
 * `venues.json` is enrichment, never the primary source: it only covers sources
 * whose declared `geo` is non-null (lib/discovery.ts), so aggregator feeds that
 * carry per-event locations have no entry there. The event's own `location`
 * string always exists, so it leads; a venues.json entry that resolves to the
 * SAME coordinate then supplies the better street address.
 */
export function resolveVenueIdentity(venue, venueByIcsUrl) {
  const split = splitVenueLabel(venue.label)
  if (!venueByIcsUrl) return split
  for (const g of venue.series) {
    const entry = venueByIcsUrl.get(g.instances[0]?.icsUrl)
    if (!entry?.geo) continue
    const sameSpot = quantizeCoord(entry.geo.lat) === quantizeCoord(venue.lat)
      && quantizeCoord(entry.geo.lng) === quantizeCoord(venue.lng)
    if (!sameSpot) continue
    return {
      name: entry.friendlyName || entry.name || split.name,
      // geo.label is a raw street address — wrong as a section heading (which
      // is why channelFromCalendar refuses it) and exactly right as a subtitle.
      address: entry.geo.label || split.address,
    }
  }
  return split
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
  onToggleFollow, onOpenEvent, onZoomImage, onSelect, onClose, rootRef,
}) {
  if (!selection?.venue) return null
  const { venue, group } = selection
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
        venue={{ ...venue, name, address }}
        layout={layout}
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
      group={open}
      venue={{ ...venue, name, address }}
      layout={layout}
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
