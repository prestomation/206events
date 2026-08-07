---
name: "Vertical World (Seattle climbing gym)"
status: notviable
platform: Rock Gym Pro (WordPress)
url: https://seattle.verticalworld.com/calendar/
tags: [Sports]
firstSeen: 2026-08-07
lastChecked: 2026-08-07
---

Seattle's original indoor climbing gym (est. 1987). Calendar page links a
"public" Rock Gym Pro iCal feed:
`https://app.rockgympro.com/ical/public/8ecf46d6e07a4ec8a9fc82d9d88246a3`

Investigated 2026-08-07:
- The linked ICS URL returns the plain-text body `Invalid guid` (HTTP 200,
  zero `VEVENT` entries) rather than a calendar — the public guid embedded
  in the page appears stale/rotated.
- No alternate calendar/ical link found on `/calendar/`, `/calendar-2/`, or
  `/climbing/events/`.

**Verdict**: Not viable as-is — the only discoverable feed is broken.
Re-check if Vertical World republishes a working Rock Gym Pro public guid.
