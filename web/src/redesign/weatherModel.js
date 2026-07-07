// View model for the per-event weather badge (docs/weather-badges.md).
//
// The build stamps a compact `weather` field onto badge-eligible events-index
// rows: { hi, lo, pop, code, asOf, conf }. This module turns that into
// display strings and enforces the client-side staleness guard: a forecast
// older than WEATHER_HIDE_AFTER_HOURS is not shown at all (a stalled pipeline
// degrades to "no weather", never "wrong weather").

// Popup copy per confidence tier (lead time to the event, computed at build
// time — see confidenceForLead in lib/weather.ts).
const CONF_NOTE = {
  high: null,
  medium: 'Outlook — check closer to the date.',
  low: 'Long-range outlook — low confidence.',
}

// Show the precipitation number on the badge only when it's worth reading.
export const POP_DISPLAY_THRESHOLD = 20

// Staleness guard (client clock vs forecast asOf).
export const WEATHER_WARN_AFTER_HOURS = 30
export const WEATHER_HIDE_AFTER_HOURS = 48

// WMO weather interpretation codes → self-hosted glyph + label. Emoji only —
// no icon CDN (privacy rules forbid third-party asset requests).
function codeIcon(code) {
  if (code >= 95) return { emoji: '⛈️', label: 'Thunderstorms' }
  if (code === 85 || code === 86) return { emoji: '🌨️', label: 'Snow showers' }
  if (code >= 71 && code <= 77) return { emoji: '❄️', label: 'Snow' }
  if (code === 56 || code === 57 || code === 66 || code === 67) return { emoji: '🌧️', label: 'Freezing rain' }
  if (code >= 80 && code <= 82) return { emoji: '🌦️', label: 'Rain showers' }
  if (code >= 61 && code <= 65) return { emoji: '🌧️', label: 'Rain' }
  if (code >= 51 && code <= 55) return { emoji: '🌦️', label: 'Drizzle' }
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Fog' }
  if (code === 3) return { emoji: '☁️', label: 'Overcast' }
  if (code === 2) return { emoji: '⛅', label: 'Partly cloudy' }
  if (code === 1) return { emoji: '🌤️', label: 'Mostly clear' }
  if (code === 0) return { emoji: '☀️', label: 'Clear' }
  return { emoji: '🌡️', label: 'Forecast' }
}

// Normalize an events-index entry's `weather` into display fields, or null
// when the event has no badge to show (no weather field, malformed, or the
// forecast is too old to stand behind).
export function weatherView(event, nowMs = Date.now()) {
  const w = event && event.weather
  if (!w || typeof w.code !== 'number' || typeof w.hi !== 'number') return null
  const asOfMs = Date.parse(w.asOf)
  if (isNaN(asOfMs)) return null
  const ageHours = (nowMs - asOfMs) / 3_600_000
  if (ageHours > WEATHER_HIDE_AFTER_HOURS) return null

  const { emoji, label } = codeIcon(w.code)
  // Fail safe: an unrecognized tier renders as low, never with the full
  // visual authority of a verified near-term forecast.
  const conf = w.conf === 'high' || w.conf === 'medium' || w.conf === 'low' ? w.conf : 'low'
  const pop = typeof w.pop === 'number' ? w.pop : 0
  const showPop = pop >= POP_DISPLAY_THRESHOLD

  // Badge line. Low confidence tempers the numbers: icon + temp only, rain
  // worded as a possibility instead of a percentage (Decision 5 in the doc).
  const tempText = `${Math.round(w.hi)}°`
  let badgeText = tempText
  if (showPop) badgeText += conf === 'low' ? ' · rain possible' : ` · ${pop}% rain`

  // Popup: the receipts — window summary, confidence note, as-of stamp,
  // provider attribution (Open-Meteo data is CC-BY 4.0).
  const range = Math.round(w.lo) === Math.round(w.hi)
    ? `${Math.round(w.hi)}°`
    : `${Math.round(w.lo)}–${Math.round(w.hi)}°`
  const parts = [`Forecast for this event: ${label.toLowerCase()}, ${range}, ${pop}% chance of precipitation.`]
  if (CONF_NOTE[conf]) parts.push(CONF_NOTE[conf])
  const asOfText = new Date(asOfMs).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  parts.push(`Forecast as of ${asOfText}${ageHours > WEATHER_WARN_AFTER_HOURS ? ' (may be outdated)' : ''}.`)
  parts.push('Weather data by Open-Meteo.')

  return {
    emoji,
    label,
    badgeText,
    conf,
    explanation: parts.join(' '),
  }
}
