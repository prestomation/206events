/**
 * Map-link builders — turn a venue/event location into a clickable map URL.
 *
 * Pure functions, no I/O. Used by the discovery API builder
 * (`lib/discovery.ts`) to stamp `map` links onto `venues.json`.
 *
 * PARITY CONTRACT: `web/src/maplink.js` is a byte-for-byte mirror of these
 * builders for the browser. When you change a URL shape here, change it there
 * too — `web/src/maplink.test.js` asserts the two produce identical output for
 * a shared fixture set. (Same convention as the haversine helper duplicated
 * between `feed.ts` and `App.jsx`.)
 */

export interface MapLinkInput {
  lat?: number;
  lng?: number;
  /** Human-readable "Venue Name, Address" — best query for landing on the business. */
  label?: string;
  /** Per-event location string; used when there's no venue label. */
  location?: string;
  osmType?: "node" | "way" | "relation";
  osmId?: number;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * The query that best lands a maps search on the actual business: prefer the
 * venue label, then the event location string, then bare coordinates.
 * Returns undefined when there's nothing to search for.
 */
function bestQuery(i: MapLinkInput): string | undefined {
  const text = i.label?.trim() || i.location?.trim();
  if (text) return text;
  if (isFiniteNumber(i.lat) && isFiniteNumber(i.lng)) return `${i.lat},${i.lng}`;
  return undefined;
}

/**
 * Google Maps universal URL. Works in every browser; mobile OSes deep-link it
 * into the Maps/Apple Maps app. Lands on the business listing when given a
 * name+address query rather than bare coordinates.
 */
export function googleMapsUrl(i: MapLinkInput): string | undefined {
  const q = bestQuery(i);
  if (!q) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * Exact OpenStreetMap feature URL, only when the venue carries an OSM identity.
 */
export function osmFeatureUrl(i: MapLinkInput): string | undefined {
  if (!i.osmType || !isFiniteNumber(i.osmId)) return undefined;
  return `https://www.openstreetmap.org/${i.osmType}/${i.osmId}`;
}

/**
 * `geo:` URI — opens the device's default maps app (robust on Android). The
 * `q` parameter carries the venue name/address so the app can resolve the
 * business; the leading coords center the map. Requires coordinates.
 */
export function geoUri(i: MapLinkInput): string | undefined {
  if (!isFiniteNumber(i.lat) || !isFiniteNumber(i.lng)) return undefined;
  const q = i.label?.trim() || i.location?.trim() || `${i.lat},${i.lng}`;
  return `geo:${i.lat},${i.lng}?q=${encodeURIComponent(q)}`;
}
