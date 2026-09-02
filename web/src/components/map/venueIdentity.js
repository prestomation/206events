// web/src/components/map/venueIdentity.js
//
// One resolver for "what is this venue called", shared by the map PIN and the
// popup it opens. They must not disagree: the pin's whole premise is that a
// venue name is short and stable, and `venue.label` -- the modal event
// `location` string -- is a bare street address for most sources in this repo.
import { quantizeCoord, venueNameKey } from '../../lib/event-grouping.js'

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
 * `venues.json` is enrichment, never an override. It only covers sources whose
 * declared `geo` is non-null (lib/discovery.ts), and that single declared point
 * is the SOURCE's location, not the event's: `discover-slu` is an aggregator
 * whose events happen all over South Lake Union, so letting its entry win would
 * label The Spheres "Discover South Lake Union".
 *
 * So the events' own name wins whenever they give one. The entry fills in when
 * they give nothing or give a bare street address (most sources in this repo
 * write `location` as an address), and supplies the street address only when it
 * is demonstrably about the same place.
 */
export function resolveVenueIdentity(venue, venueByIcsUrl) {
  const split = splitVenueLabel(venue.label)
  const entry = matchingEntry(venue, venueByIcsUrl)
  if (!entry) return split

  const entryName = entry.friendlyName || entry.name || ''
  if (split.name && !looksLikeStreetAddress(split.name)) {
    return {
      name: split.name,
      // geo.label is a street address — right as a subtitle, but only this
      // venue's when the entry names the same place.
      address: samePlace(entryName, split.name) ? (entry.geo.label || split.address) : split.address,
    }
  }
  return { name: entryName || split.name, address: entry.geo.label || split.address }
}

// A `venues.json` entry for one of this venue's feeds, sitting at this venue's
// own coordinate. An entry somewhere else describes a different place.
function matchingEntry(venue, venueByIcsUrl) {
  if (!venueByIcsUrl) return null
  for (const g of venue.series) {
    const entry = venueByIcsUrl.get(g.instances[0]?.icsUrl)
    if (!entry?.geo) continue
    if (quantizeCoord(entry.geo.lat) !== quantizeCoord(venue.lat)) continue
    if (quantizeCoord(entry.geo.lng) !== quantizeCoord(venue.lng)) continue
    return entry
  }
  return null
}

// A house number where a name should be: "5805 Airport Way S", "15th Ave S & S
// Dakota St". 102 of this repo's 171 recurring sources write `location` this
// way, and for those the source's own venue name is the better label.
function looksLikeStreetAddress(name) {
  return /^\d/.test(name.trim())
}

function samePlace(a, b) {
  return venueNameKey(a) !== '' && venueNameKey(a) === venueNameKey(b)
}
