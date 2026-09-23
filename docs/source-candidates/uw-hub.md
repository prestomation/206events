---
name: "University of Washington — HUB"
status: added
platform: ICS (Trumba)
url: https://www.hub.washington.edu/
tags: [Community, "University District"]
firstSeen: 2026-09-23
lastChecked: 2026-09-23
pr: pending
---

Found alongside `uw-graduate-school` by probing the UW Trumba calendar
namespace. `sea_hub.ics` returned 200 with 5 `VEVENT`s (student-life events
and sales at the Husky Union Building), confirmed live 2026-09-23. Low
volume but real, recurring content — added per the "low-volume sources are
valid" directive. Added as `sources/external/uw-hub.yaml`. Verified via
`ONLY_SOURCE=uw-hub npm run generate-calendars`: 5 events, 0 fatal errors.
