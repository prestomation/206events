---
name: "Flight Club Seattle (Darts USA)"
status: notviable
platform: Custom
url: https://www.flightclubdartsusa.com/seattle
tags: ["South Lake Union"]
firstSeen: 2026-07-16
lastChecked: 2026-07-16
---

New "Social Darts" bar/entertainment venue at 300 Westlake Ave N,
South Lake Union — first West Coast location of the national Flight
Club Darts chain, opened ~March 2026.

Investigated 2026-07-16:
- Page includes `schema.org/Restaurant` + `EntertainmentBusiness`
  JSON-LD with address, geo, and `openingHoursSpecification`, but no
  `Event` entities — the business model is walk-in/reservation play
  during standard opening hours, not a calendar of discrete dated
  events (similar to a bowling alley or escape room).
- No `/events`, `/schedule`, `/calendar`, or `/whats-on` page found
  (all 404).

**Verdict**: Not viable — no calendar of events exists to scrape; this
is an activity venue with open hours, not an events source. Distinct
business from the already-`notviable` `flightclubseattle.com` (a
Capitol Hill live-music venue of the same name).
