---
name: "Rigs & Coffee at Tiki Motors"
status: added
platform: Recurring (no ICS/API — pattern confirmed via third-party listing sites)
url: https://www.tikimotors.com/
tags: ["Cars", "Georgetown"]
firstSeen: 2026-08-14
lastChecked: 2026-08-26
pr: 1287
---

Monthly car meet (overland rigs, classic trucks, sports cars) at Tiki Motors
Adventure Cars, 5201 1st Ave S, Seattle, WA 98108 (SoDo). Free, open to the
public, no formal registration.

Investigated 2026-08-14: no dedicated ICS/API feed or event page on
tikimotors.com. Schedule confirmed cross-referencing third-party car-meet
directories (carsandcoffeeevents.com, getoutgarage.com) — consistently the
**3rd Saturday of each month, 10:00 AM–12:00 PM**:
- Sat Aug 15, 2026
- Sat Sep 19, 2026
- Sat Oct 17, 2026

Implemented 2026-08-26 as `sources/recurring/rigs-and-coffee-tiki-motors.yaml`
(schedule: `3rd Saturday`, `start_time: "10:00"`, `duration: PT2H`,
`cost: free`). Cross-checked the 3rd-Saturday pattern against three more
dates from third-party listing sites — Mar 21, Jul 18, and Dec 19, 2026 —
all land on the 3rd Saturday of their month, confirming the cadence.
Nominatim places 5201 1st Ave S in Georgetown (not SoDo as originally
tagged), so the tag was corrected to `Georgetown`. Coordinates and OSM way
id (428018929) resolved via Nominatim. `tikimotors.com` itself was
unreachable from this environment (DNS timeout) at implementation time, but
since this is a hand-authored recurring schedule (not a live scrape), the
venue's continued operation and event cadence were confirmed instead via
Yelp (Aug 2026) and multiple 2026-dated third-party car-meet listings.

Also has a recurring Facebook Events listing
(facebook.com/events/tiki-motors-adventure-cars/rigs-and-coffee-tiki-motors/).
Similar in shape to `sources/recurring/lake-washington-cars-and-coffee.yaml`
(already implemented) — could be added as
`sources/recurring/rigs-and-coffee-tiki-motors.yaml` with
`schedule: 3rd Saturday`, `start_time: "10:00"`, `duration: PT2H`.
