---
name: "Press Then Press Cider Events"
status: added
firstSeen: 2026-08-02
lastChecked: 2026-08-02
tags: [Beer]
pr: 1086
---

Seattle cider shop (`pressthenpress.com`) publishing a "Cider Events"
calendar via a published iCloud (`webcal://p161-caldav.icloud.com/...`)
feed, linked from
`https://www.pressthenpress.com/pages/pop-up-cider-tastings`.

Live probe 2026-08-02: fetching the `https://` form of the webcal URL
returns a valid `VCALENDAR` with 3 events:
- 🍎 Cider Tasting Pop-Up — monthly `RRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3`
  at Watershed Pub & Kitchen, 10104 Third Ave NE, Seattle (Northgate) —
  their own recurring event
- 🍎 Vashon Island Cider Fest (annual, Vashon Island — outside Seattle
  proper, but a minority of the feed)
- 🍎 Cider Summit Seattle (annual, South Lake Union) — already covered by
  `sources/recurring/cider-summit-seattle.yaml`; cross-source dedup will
  merge the overlapping instance

Added as `sources/external/press-then-press-cider.yaml` (ICS feed,
`sourceRole: aggregator` since it republishes Vashon/Cider Summit
alongside its own event, `geo: null` since it spans multiple venues).
Tagged `Beer` only — no neighborhood tag, since tags apply to the whole
feed and only the shop's own pop-up is actually in Northgate (Vashon
Island and South Lake Union are not); follows the `seafair.yaml`
precedent for multi-location aggregators.
`ONLY_SOURCE=press-then-press-cider npm run generate-calendars` confirmed
3 events, 0 errors after adding a `KNOWN_VENUE_COORDS` entry for
"watershed pub & kitchen" (Nominatim didn't resolve the raw ICS address
string; used the geo coords embedded in the feed's own
`X-APPLE-STRUCTURED-LOCATION`).
