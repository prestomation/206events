---
name: Open Fencing (E/F)
status: added
platform: Squarespace (Squarespace page embeds a ZenPlanner calendar iframe; hand-coded as recurring)
url: http://www.salleauriol.com/calendar
tags: [Sports, Interbay]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
pr:
---

Discovered via aggregator gap analysis. 2 events in the Seattle
metro sample. Source domain: salleauriol.com.

Sample event: "Open Fencing (E/F)" (2026-08-25T02:30:00.000Z)
Description: Open fencing session for epee and foil at Salle Auriol Seattle. Downstairs.

Investigated 2026-09-16: Salle Auriol ("A 50 year Seattle institution"), 1419
Elliott Avenue West, Interbay/Queen Anne, Seattle, WA 98119. The Squarespace
`/calendar` page itself is a static shell (`?format=json` → `typeName: page`,
`itemCount: 0`) — the real schedule is a `seattlefencing.sites.zenplanner.com`
calendar iframe, client-rendered (no data present in the plain-fetched HTML,
confirmed via headless-browser inspection). Not a fit for a live `HTMLRipper`
without browser automation, which this repo's ripper infrastructure doesn't
run at build time — but the weekly pattern is stable and well-suited to the
hand-coded `sources/recurring/` pattern instead:

- **Open Fencing (Saber)** — Tue/Thu/Fri 7:30–9:00 PM, Main Location
- **Open Fencing (Epee/Foil)** — Mon/Wed 7:30–9:30 PM + Sat 10:30 AM–12:30 PM,
  Downstairs

Confirmed via the ZenPlanner list view across 4 consecutive weeks
(2026-09-01 through 2026-09-30) — schedule and per-session duration
(read from individual `enrollment.cfm?appointmentId=...` detail pages) were
consistent throughout. Sessions require a current club membership + USA
Fencing membership (noted in the recurring-event description), same pattern
as other membership-gated recurring sources already in the repo (climbing
club nights, etc.).

Address/coords confirmed via Nominatim: 47.6307008, -122.3743874
(OSM node 2462428041).

Implemented as `sources/recurring/salle-auriol-open-fencing-saber.yaml` and
`sources/recurring/salle-auriol-open-fencing-epee-foil.yaml` (two files,
since the two schedules differ in location/weapon-type and the recurring
schema shares one summary/description/location per file). Verified locally
with `ONLY_SOURCE=salle-auriol-open-fencing-saber,salle-auriol-open-fencing-epee-foil npm run generate-calendars`
— 3 events each, 0 errors.
