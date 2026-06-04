# Add-to-Calendar Button

Every event row and the event detail view in the redesigned web UI (`App206`)
show a 📅 quick-add button. It performs **exactly one** action — there is no
dropdown. What that action is depends on a user preference (the **mode**),
defaulting to a platform guess.

## Modes

The mode is one of:

| Mode     | Behavior                                                            |
|----------|--------------------------------------------------------------------|
| `auto`   | Guess from the platform (default).                                  |
| `google` | Open the Google Calendar "add event" template in a new tab.        |
| `ics`    | Download a single-event `.ics` file (Apple Calendar, Outlook, …).  |

`auto` resolves per-platform: **mobile (Android or iOS) → `google`**, **desktop
→ `ics`**. Mobile users overwhelmingly live in Google Calendar and the template
link drops straight into their app; desktop users are better served by a
downloadable `.ics`.

## Where the preference lives

- Stored in `localStorage` under the key **`calendar-ripper-add-mode`**.
  Client-only — it is **not** synced to the server (unlike followed calendars /
  saved searches). Default when unset: `auto`.
- State + setter live in `web/src/App.jsx` alongside the other localStorage
  preferences, threaded into `App206` and exposed on the app context as
  `calendarAddMode` / `setCalendarAddMode`.
- The picker UI is a segmented set of pills in the **You** tab
  (`YouView` in `web/src/redesign/views.jsx`). No login required.

## Implementation

- **Registry + resolver:** `web/src/utils/calendarTargets.js`
  - `CALENDAR_TARGETS` — one entry per concrete provider. Each declares a
    `kind`: `'link'` (renders an `<a href>`, with an `href(ev)` builder) or
    `'download'` (renders a `<button>` that the component wires to the `.ics`
    download).
  - `CALENDAR_MODE_OPTIONS` — the ordered list the picker renders (`auto`
    first).
  - `resolveCalendarMode(mode, ua)` — maps `auto`/unknown to a concrete id
    using `isAndroid` (`web/src/lib/maplink.js`) and `isIOS`
    (`web/src/utils/platform.js`). Explicit `google`/`ics` pass through.
- **Button:** `web/src/components/AddToCalendar.jsx` resolves the mode once,
  looks up the target, and renders either the link or the download button.
  Reuses `buildGoogleCalendarUrl` / `generateICS` from
  `web/src/utils/calendar.js`.

## Adding a provider (e.g. Outlook, Yahoo, Apple)

Two small additions, no button changes:

1. Add an entry to `CALENDAR_TARGETS` — typically `kind: 'link'` with an
   `href(ev)` that builds the provider's add-event URL.
2. Add a matching entry to `CALENDAR_MODE_OPTIONS` so it appears in the You-tab
   picker.

Optionally extend `resolveCalendarMode` if the new provider should participate
in the `auto` platform guess.

The unit test `web/src/utils/calendarTargets.test.js` asserts every non-`auto`
picker option maps to a registered target, so a half-added provider fails CI.

## Not a feed-filter concern

This preference only affects the per-event quick-add control. It does **not**
touch personal-feed filtering, so the "Favorites Filter Parity" rule
(Worker ↔ web client) does not apply here.
