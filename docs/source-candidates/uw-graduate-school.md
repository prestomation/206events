---
name: "University of Washington — Graduate School"
status: added
platform: ICS (Trumba)
url: https://grad.uw.edu/
tags: [Education, "University District"]
firstSeen: 2026-09-23
lastChecked: 2026-09-23
pr: 1577
---

Found by probing the UW Trumba calendar namespace (`sea_<dept>`) after
noticing the repo's existing UW external calendars (`uw-campus-events`,
`uw-school-of-music`, etc.) all follow the same `trumba.com/calendars/sea_*.ics`
pattern. `sea_grad.ics` returned 200 with 284 `VEVENT`s, real future dates
(workshops, office hours, professional-development sessions for grad/postdoc
students), confirmed live 2026-09-23. Added as
`sources/external/uw-graduate-school.yaml`. Verified via
`ONLY_SOURCE=uw-graduate-school npm run generate-calendars`: 284 events, 0
fatal errors (some expected non-fatal `GeocodeError`s for Zoom/online
sessions, same pattern as other UW external calendars).
