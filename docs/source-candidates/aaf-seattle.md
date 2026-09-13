---
name: "AAF Seattle"
status: added
platform: Squarespace
url: https://www.aafseattle.com/calendar
tags: [Community]
firstSeen: 2026-09-13
lastChecked: 2026-09-13
pr: 1464
---

American Advertising Federation Seattle chapter — professional org for the
local advertising/marketing/creative industry. Hosts board meetings, career
workshops, and mixers.

Investigated 2026-09-13:
- Squarespace calendar collection, verified via
  `https://aafseattle.squarespace.com/calendar?format=json`: **13 upcoming
  events** with real epoch `startDate` timestamps in the near future
  (Sept–Nov 2026), e.g. "Bring Human Intelligence to Artificial
  Intelligence" (2026-09-18), "Adspirations" (2026-10-16). 30 past events
  also present, confirming an active, regularly-updated calendar.
- Event mix includes both member-only-ish items ("Board of Directors
  Meeting", recurring monthly) and public-facing programming ("AAF Seattle
  Career Lab", "SCS x AAF Seattle", workshops) — comparable in shape to
  already-added professional/community orgs like Seattle CityClub and Sync
  Seattle.
- 🔥 High confidence — built-in `squarespace` type, confirmed working via
  the JSON endpoint above with `itemCount` > 0 and future-dated events.
- Not currently covered elsewhere in `sources/` or `sources/external/`
  (checked for `aaf-seattle`/`aafseattle`/`american advertising federation`).
- Seattle-based chapter serving the Seattle-area ad/marketing community —
  passes the Seattle-focus gate. Not a religious org.

Implemented 2026-09-13: `sources/aaf_seattle/ripper.yaml`, built-in
`squarespace` type, `sourceRole: venue`, `geo: null`. Note: the primary
domain is `aafseattle.com`, not `.org` as originally recorded above —
the `.org` domain doesn't resolve; the site's own Squarespace config
confirms `primaryDomain: www.aafseattle.com`. Verified 13 events in a
local `ONLY_SOURCE=aaf-seattle` build.
