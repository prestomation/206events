import { isIOS } from './platform.js'
import { isAndroid } from '../lib/maplink.js'
import { buildGoogleCalendarUrl } from './calendar.js'

// Registry of concrete actions the 📅 quick-add button can perform.
// Each target declares how it is rendered:
//   kind 'link'     → an <a href> opening the provider's add-event page
//   kind 'download' → a <button> that downloads a generated .ics
// Adding a new provider (Outlook, Yahoo, Apple…) is one entry here plus one
// entry in CALENDAR_MODE_OPTIONS below — the button needs no changes.
export const CALENDAR_TARGETS = {
  google: {
    id: 'google',
    label: 'Google Calendar',
    kind: 'link',
    href: (ev) => buildGoogleCalendarUrl(ev),
  },
  ics: {
    id: 'ics',
    label: 'Download .ics',
    kind: 'download',
  },
}

export const DEFAULT_CALENDAR_MODE = 'auto'

// Ordered options shown in the Profile (You) preference picker. 'auto' resolves
// per-platform via resolveCalendarMode; every other id must exist in
// CALENDAR_TARGETS.
export const CALENDAR_MODE_OPTIONS = [
  { id: 'auto', label: 'Automatic', hint: 'Google Calendar on phones, .ics on desktop' },
  { id: 'google', label: 'Google Calendar' },
  { id: 'ics', label: 'Download .ics file' },
]

// Resolves a stored preference to a concrete target id. 'auto' (and any unknown
// value) guesses from the platform: mobile → Google Calendar, desktop → .ics.
export function resolveCalendarMode(mode, ua = navigator.userAgent) {
  if (mode === 'google' || mode === 'ics') return mode
  return isAndroid(ua) || isIOS() ? 'google' : 'ics'
}
