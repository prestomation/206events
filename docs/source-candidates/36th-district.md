---
name: 36th District Meetings
status: added
platform: WordPress (Custom HTML)
url: https://36th.org/attend-a-meeting
tags: [Political]
firstSeen: 2026-08-14
lastChecked: 2026-08-19
pr: 1233
---

36th Legislative District Democrats meetings and political events in Seattle.

**Checked 2026-08-14:** Live WordPress site, not religious. Confirmed
recurring pattern: "Membership Meetings" on the third Wednesday of each
month, January through October, 7:00-9:00 PM at Phinney Neighborhood
Center, 6615 Dayton Ave N, Seattle. Next occurrence Aug 19, 2026. No
ICS/iCal export found. Low but predictable volume (~10 meetings/year) —
would suit a `sources/recurring/` YAML entry more than an HTML ripper.
Seattle-focused.

**Implemented 2026-08-19:** Added as
`sources/recurring/36th-district-democrats.yaml`, a `3rd Wednesday`
schedule restricted to months 1-10, 7:00-9:00 PM, PT2H duration, tagged
`Political`/`Phinney`. Geo resolved via Nominatim to the PNA Phinney
Center Campus (osm way 41702870), 47.6773572,-122.3528557 — the "lower
building" at 6615 Dayton Ave N referenced on the source page. Confirmed
via `ONLY_SOURCE=36th-district-democrats npm run generate-calendars`:
1 event generated, 0 errors, first occurrence Wed Aug 19 2026 7:00 PM
(today), matching the site's stated next meeting date.
