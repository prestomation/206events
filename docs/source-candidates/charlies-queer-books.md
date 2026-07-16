---
name: "Charlie's Queer Books"
status: added
platform: BookManager (custom POS/CMS, React SPA)
url: https://charliesqueerbooks.com/events
tags: [Books, Fremont]
firstSeen: 2026-07-10
lastChecked: 2026-07-16
pr:
---

Seattle's first dedicated queer bookstore in ~20 years, opened 2023 in
Fremont. Hosts a regular calendar of author readings, writing clubs, panels,
and a monthly Queer Silent Book Club (4th Friday).

Investigated 2026-07-10:
- Site runs on the BookManager platform (`cdn1.bookmanager.com`), a React
  SPA — the initial HTML has no server-rendered event data (`<div id="root">`
  only), so a plain fetch/HTML scrape returns nothing.
- Found the underlying data API by reading the bundled JS
  (`cdn1.bookmanager.com/shop/static/js/main.*.chunk.js`): event data is
  fetched client-side via `POST https://api.bookmanager.com/customer/event/getList?_cb=<san>`
  (`san` = `9932925` for this store) with a `multipart/form-data` body
  (`session_id`, `uuid`, `store_id`, `from`/`to` as `YYYYMMDD`).
- `session_id`/`uuid` appear to be arbitrary client-generated tracking
  values — the API accepted a made-up `session_id` — but `store_id` is
  validated server-side and returned `{"error":"invalid store_id"}` for a
  guess of `9932925` (the `san`/`_cb` value). The real `store_id` wasn't
  found in the static HTML/bundle; it's likely set at runtime from a
  separate `sitesettings`/init call this investigation didn't trace down.
- No ICS/RSS feed found on the site.

Resolved 2026-07-16: found the missing piece. The React bundle calls
`store/getSettings` (`POST https://api.bookmanager.com/customer/store/getSettings`,
body `webstore_name=9932925`) before anything else, which returns
`store_info.id` — the real numeric `store_id` (`1188985`) needed by the
event endpoints. With that in hand, `session/get` (body `store_id` + a
client-generated `uuid`) mints a session token, and `event/v2/list` (this
store has `using_events_v2: true`, so `event/getList` alone 404s/empties —
must use the v2 endpoint) returns real dated events: 17 upcoming across
book clubs, author events, workshops, and a maker's fair, spanning
2026-07-16 through 2026-10-17. All three calls are unauthenticated/public
(no login, no API key — `session_id`/`uuid` are client-generated tracking
values, not credentials).

A few events are hosted off-site (`location_text`: "Ballard Branch - Seattle
Public Library", "Town Hall Seattle") or "Virtual" rather than in-store;
the ripper maps known off-site locations to their real address/coords and
leaves "Virtual" events at "Virtual" (no coordinate override — same minor
imprecision as `book_larder`'s off-site handling elsewhere in the repo).

Implemented as a custom JSON ripper, `sources/charlies_queer_books/`.
Verified via `ONLY_SOURCE=charlies-queer-books npm run generate-calendars`:
17 events, 0 errors.
