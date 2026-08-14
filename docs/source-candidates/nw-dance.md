---
name: NW Dance
status: candidate
platform: WordPress (Modern Events Calendar plugin)
url: https://nwdance.net/events
tags: [Dancing]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Pacific Northwest dance organization hosting social dance events and lessons.

**Findings (2026-08-14):** Live, active WordPress site running the "Modern Events Calendar
Lite" plugin (`wp-content/plugins/modern-events-calendar-lite`, `mec-*` CSS classes
throughout). Real events confirmed Aug-Nov 2026: "Boot Scootin' Fun at the Barn", "Casey
MacGill Quintet" free dance, "Seattle Houserockers", swing/blues bands at Leif Erikson Hall,
plus recurring class series (Bachata, Salsa for Beginners, Nightclub Two-Step). MEC
typically exposes an ICS export — worth checking for a `?mec-ical-export=1`-style endpoint
before writing an HTML scraper. Good event volume and mostly Seattle-area venues.
