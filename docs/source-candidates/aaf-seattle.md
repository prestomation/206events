---
name: "AAF Seattle"
status: candidate
platform: Squarespace
url: https://www.aafseattle.org/calendar
tags: [Community]
firstSeen: 2026-09-13
lastChecked: 2026-09-13
pr:
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

Not yet implemented — next cycle should follow the built-in Squarespace
pattern (see `lib/config/squarespace.ts`), `sourceRole: venue` (first-party
org calendar), `geo: null` (events at rotating locations/venues).
