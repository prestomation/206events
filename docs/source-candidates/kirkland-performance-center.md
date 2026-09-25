---
name: "Kirkland Performance Center"
status: blocked
platform: Salesforce Commerce Cloud
url: https://www.kpcenter.org/get-tickets/
tags: []
firstSeen: 2026-09-25
lastChecked: 2026-09-25
---

394-seat performing-arts theater in downtown Kirkland (King County).
`GET /get-tickets/` returns HTTP 403 directly from this environment.
Ticketing is hosted on `kpcenter.my.salesforce-sites.com` — the same
Salesforce Commerce Cloud platform already rejected for
`docs/source-candidates/artswest.md` (fully JS-rendered ticketing
frontend, no ICS/API). Even if the 403 lifts, the underlying platform
is the same dead end ArtsWest hit. Not stageable.
