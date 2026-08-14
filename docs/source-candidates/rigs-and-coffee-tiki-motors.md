---
name: "Rigs & Coffee at Tiki Motors"
status: candidate
platform: Recurring (no ICS/API — pattern confirmed via third-party listing sites)
url: https://www.tikimotors.com/
tags: ["Cars", "SoDo"]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
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

Also has a recurring Facebook Events listing
(facebook.com/events/tiki-motors-adventure-cars/rigs-and-coffee-tiki-motors/).
Similar in shape to `sources/recurring/lake-washington-cars-and-coffee.yaml`
(already implemented) — could be added as
`sources/recurring/rigs-and-coffee-tiki-motors.yaml` with
`schedule: 3rd Saturday`, `start_time: "10:00"`, `duration: PT2H`.
