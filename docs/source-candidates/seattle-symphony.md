---
name: "Seattle Symphony"
status: added
platform: Sitecore GraphQL (Experience Edge / Item Service)
url: https://www.seattlesymphony.org/concerttickets/calendar
tags: [Music, Downtown]
firstSeen: 2026-06-07
lastChecked: 2026-06-08
---

Seattle Symphony at Benaroya Hall (200 University St, Downtown). Major
classical / film-with-orchestra venue.

## Implemented (2026-06-08)

The existing empty `benaroya_hall` Ticketmaster ripper was **replaced** by a
custom GraphQL ripper (`sources/benaroya_hall/ripper.ts`) against the Sitecore
endpoint documented below. Live run on 2026-06-08 produced **154 upcoming
events, 0 errors**, routed across three calendars by venue:

- `benaroya-taper` — S. Mark Taper Foundation Auditorium (111)
- `benaroya-nordstrom` — Illsley Ball Nordstrom Recital Hall (29)
- `benaroya-other` — Octave 9 & other Benaroya Hall rooms (14)

The two pre-existing calendar URLs (`benaroya-taper`, `benaroya-nordstrom`) are
preserved; `benaroya-other` is added. Off-site Symphony performances (schools,
parks) are skipped — this stays a Benaroya Hall venue source. The implemented
data model differs slightly from the research notes below: title comes from the
`Event Name` field, the venue resolves via the `Venue` `LookupField` →
`/sitecore/content/Site Content Settings/Venues/`, the image from
`Main Image` (`<image mediaid>` → `/-/media/{GUID}.ashx`), and a single deep
nested `item(path:.../Events){children{children{children{...}}}}` query returns
every event + performance in one request (the `search` resolver does not carry
performance dates). The public `sc_apikey` is committed in `ripper.ts` (a
read-only client key) since a runnable ripper needs it.

The research notes below are retained for posterity.

---

Seattle Symphony at Benaroya Hall (200 University St, Downtown). Major
classical / film-with-orchestra venue.

## Correction (2026-06-07): the venue is already partially covered

**The earlier "not covered anywhere" finding in this file was wrong.** A
`benaroya_hall` ripper already exists: `sources/benaroya_hall/ripper.yaml`,
`type: ticketmaster`, two calendars (`benaroya-taper`, `benaroya-nordstrom`),
both with `expectEmpty: true`. It is **live but empty** — it sits in
production's `expectedEmptyCalendars` — because the Seattle Symphony sells its
own concerts through **Tessitura**, not Ticketmaster, so a Ticketmaster venue
query against those venue ids returns ~0 events. The occasional touring/rental
show that *is* Ticketmaster-ticketed would still flow through it.

So the real gap is narrower: **the Symphony's actual season isn't ingested**,
because the existing pipeline (Ticketmaster) can't see Tessitura inventory.

## Viable implementation path found: Sitecore GraphQL (2026-06-07)

The seattlesymphony.org calendar is a Sitecore JSS (Vue/Apollo) app. The HTML
pages have intermittent bot protection (200 once, then 403s), but the calendar
data comes from a **public Sitecore GraphQL endpoint that has no bot protection
and a client-embedded API key** — fully fetchable from this environment and,
being a clean API POST rather than the protected HTML, should work from CI too.

- **Endpoint (published/web):**
  `https://www.seattlesymphony.org/sitecore/api/graph/items/web?sc_apikey=<public-key>`
  (POST, `Content-Type: application/json`). The `sc_apikey` is a **public**
  Sitecore Item Service key baked into the site's client bundle (`appjs.js`) and
  served to every browser visitor — it is not a secret. Read the current value
  at implementation time straight from the bundle (search `appjs.js` for
  `sitecore/api/graph/items/web?sc_apikey=`); it is intentionally left out of
  this doc so the repo doesn't carry a key string.
- **Event content:** items under
  `/sitecore/content/Shared Content/Events/<YYYY>/<MM>/<slug>`, template
  **`Event Page`**. Fields: `search_title` (title), `main_image`, `itemurl`,
  and a `Venue` reference (GUID).
- **Dates:** each Event Page has child items of template **`Performance`**,
  each carrying a `Date` field in ISO UTC, e.g. `20260920T010000Z`. One event
  may have multiple performances (multiple showtimes) — emit one calendar event
  per performance, with a stable id like `<event-slug>-<perf-date>`.
- **Venue:** resolve the `Venue` GUID against
  `/sitecore/content/Global Settings/Locations` (template `Location`), which
  exposes `locationName` / `address` / `coordinates`. Most concerts are Benaroya
  Hall (Taper or Nordstrom); some are offsite.

### Confirmed working queries

The app's own query is named `Searching` (a custom `search(...)` resolver).
Gotchas confirmed by probing:
- Date args use **`MM/dd/yyyy`** format; `dateFrom`/`dateTo` are accepted.
- `sortby` must be a valid enum — `sortby:"date"` throws
  `extensions.code: "FORMAT"`. Omit it or find the valid value.
- `templateName` is passed empty by the live calendar; pagination via
  `page` / `pagesize` (or `first:`).
- NB: `searchDate` on results is the **content edit timestamp**, not the
  performance date — do not use it for event timing. Use the child
  `Performance.Date` field.

Minimal proof query (returns Event Page items + paths):
```graphql
query { search(keyword:"concert", rootItem:"/sitecore/content", first:8){
  results{ totalCount items{
    searchTitle: field(name:"search_title")
    url: field(name:"itemurl")
    locations{ locationName }
    item{ path template{ name } } } } } }
```
Per-event dates:
```graphql
query { item(path:"/sitecore/content/Shared Content/Events/2026/01/26openingnight"){
  children{ name template{ name } fields{ name value } } } }
# -> child template "Performance", field Date = 20260920T010000Z
```

## Recommended next step

Implement a custom `JSONRipper` (or a thin GraphQL ripper) against the endpoint
above: enumerate `Event Page` items in the build window, expand each into its
`Performance` children, resolve the `Venue`, and emit one event per
performance. Then **retire/replace the empty `benaroya_hall` Ticketmaster
source** (or keep it only if it still catches non-Symphony Ticketmaster shows —
decide during implementation; if removing a calendar URL, add the
`allowed-removals/` entries). Only add `expectEmpty` after the GraphQL pipeline
has produced events at least once. Verify the GraphQL POST succeeds from CI; if
CI is blocked, escalate via the proxy ladder per `skills/proxy-escalation/`.

Surfaced 2026-06-07 from a poster-board photo (source-from-event): a "Top Gun
in Concert" poster (film-with-live-orchestra, a Seattle Symphony format) on a
community kiosk.
