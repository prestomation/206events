---
name: "Baila District"
status: investigating
platform: Squarespace
url: https://www.bailadistrict.com/social-dancing
tags: [Dance, "University District"]
firstSeen: 2026-07-31
lastChecked: 2026-07-31
---

**Baila District** — `https://www.bailadistrict.com/` — Latin dance studio at
2920 NE Blakeley St (Suite F), Seattle, WA 98105 (University District).
Offers salsa, bachata, cumbia, and Latin Hustle classes plus a "Monthly Salsa
Bachata Social Dancing" event and occasional free outdoor socials.

Investigated 2026-07-31:
- Squarespace confirmed (`server: Squarespace` header)
- `/social-dancing?format=json` returns a plain content page (no `upcoming`/
  `items` collection)
- `/events` redirects (302) to `/dimitris-yolena` — not a real events page
- `/calendar?format=json` returns a Squarespace collection page but with
  `calendarView: false` and 0 `upcoming`/`items` — not a populated events
  collection either; likely a static calendar-block page or classes are
  scheduled through a separate booking system (MindBody-style) not exposed
  here
- No ICS, Tribe Events, or Eventbrite integration found

No structured event feed found via straightforward probing. Re-evaluate by
checking for an embedded class-scheduling widget (e.g. MindBody, Punchpass)
or confirming the recurring monthly social's fixed day/time for a
`sources/recurring/` entry instead of a ripper.
