---
name: "Picklewood"
status: notviable
platform: Framer
url: https://www.picklewood.net/
tags: [Sports]
firstSeen: 2026-05-27
lastChecked: 2026-09-06
---
**Picklewood Paddle Club** — SODO Urbanworks, 4121 1st Ave S, Seattle — pickleball facility with
restaurant/bar by Chef Ethan Stowell. Opened December 2025. Offers open play, classes, and leagues.

Investigated 2026-05-27:
- Site built on Framer (not Squarespace/WordPress)
- `/events/` page is a private event inquiry form, not a public calendar
- No public events calendar or ICS feed found
- Not viable — no machine-readable event data

Re-checked 2026-09-06: still no dedicated events/calendar page on the
marketing site. Program info (Leagues/Classes/Open Play, plus one-off
programming like Pride Night and the Gopher Cup tournament) links out to
a separate booking portal at `play.picklewood.net`, which wasn't inspected
directly in the earlier pass. That portal is a court-reservation system,
not confirmed to expose a public events feed — no new evidence of
viability found, so leaving as `notviable`. Worth a closer look at
`play.picklewood.net` directly (network trace for a schedule API) in a
future cycle if it turns out to be a recognized booking platform.
