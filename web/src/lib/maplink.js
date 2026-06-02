/**
 * Map-link builders for the browser — turn an event/venue location into a
 * clickable map URL.
 *
 * PARITY CONTRACT: this is a byte-for-byte mirror of `lib/maplink.ts` (the
 * builder used to stamp `map` links onto venues.json at build time). When you
 * change a URL shape in one, change it in the other — `web/src/maplink.test.js`
 * asserts both produce identical output for a shared fixture set. (Same
 * convention as the haversine helper duplicated between `feed.ts` and
 * `App.jsx`.)
 */

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

function bestQuery(i) {
  const text = (i.label && i.label.trim()) || (i.location && i.location.trim())
  if (text) return text
  if (isFiniteNumber(i.lat) && isFiniteNumber(i.lng)) return `${i.lat},${i.lng}`
  return undefined
}

/** Google Maps universal URL — works everywhere; mobile OSes deep-link it into the app. */
export function googleMapsUrl(i) {
  const q = bestQuery(i)
  if (!q) return undefined
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** Exact OpenStreetMap feature URL, only when an OSM identity is present. */
export function osmFeatureUrl(i) {
  if (!i.osmType || !isFiniteNumber(i.osmId)) return undefined
  return `https://www.openstreetmap.org/${i.osmType}/${i.osmId}`
}

/** `geo:` URI — opens the device's default maps app (robust on Android). Requires coords. */
export function geoUri(i) {
  if (!isFiniteNumber(i.lat) || !isFiniteNumber(i.lng)) return undefined
  const q = (i.label && i.label.trim()) || (i.location && i.location.trim()) || `${i.lat},${i.lng}`
  return `geo:${i.lat},${i.lng}?q=${encodeURIComponent(q)}`
}

/**
 * True when the current device is Android, where the `geo:` scheme reliably
 * opens the default maps app. iOS Safari ignores `geo:`, so we send iOS to the
 * Google universal URL (which iOS deep-links into Apple/Google Maps).
 */
export function isAndroid(ua) {
  const s = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  return /android/i.test(s)
}

/**
 * The best map href for the current device: Android → `geo:` (default maps
 * app), everything else (iOS, desktop) → Google Maps universal URL. Falls back
 * to the Google URL if coords are missing for the geo: form.
 */
export function bestMapHref(i, ua) {
  if (isAndroid(ua)) {
    const geo = geoUri(i)
    if (geo) return geo
  }
  return googleMapsUrl(i)
}
