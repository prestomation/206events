---
name: "Needlehook"
status: notviable
platform: WordPress / The Events Calendar (ICS export confirmed working)
url: https://www.needlehook.com/events/
tags: []
firstSeen: 2026-08-05
lastChecked: 2026-08-30
pr:
---

Community calendar for PNW fiber arts (knitting, crochet, spinning,
weaving) events, spanning multiple cities/shops. ICS export works
(`?ical=1` returns a valid VCALENDAR, confirmed via `curl`), but the
site is explicitly regional (PNW-wide), not Seattle-specific — and the
only 2 events currently in the feed (`Free Beginner Knitting Class`,
`Free Beginner Crochet Class`) are both at Northwest Yarns & Mercantile
in **Bellingham, WA**, well outside Seattle. Not viable as a Seattle
source right now; the technical pipeline (ICS) would be trivial if it
later fills up with Seattle-area listings, so worth a re-check in a
future cycle rather than a hard pass on the platform.

**Re-checked 2026-08-30:** Feed unchanged — still exactly the same 2
Bellingham-only events, no Seattle listings. No change in disposition.
