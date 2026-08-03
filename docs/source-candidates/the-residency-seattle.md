---
name: "The Residency"
status: candidate
platform: Squarespace
url: https://www.theresidencyseattle.org/upcoming-events
tags: [Community, "Pioneer Square"]
firstSeen: 2026-08-03
lastChecked: 2026-08-03
---

Seattle youth hip-hop nonprofit (theresidencyseattle.org) running an
all-ages performing-arts program for teens. Hosts a handful of public
events per year across Pioneer Square and other Seattle venues — e.g.
"Second Sunday Jam" (Black and Tan Hall), an annual fundraiser at the
Showbox, and a Spring Showcase at Baba Yaga.

Investigated 2026-08-03:
- `?format=json` on `/upcoming-events` confirms Squarespace, collection
  type `events-stacked`.
- `upcoming: []` at time of check — the 4 items in the collection
  (Second Sunday Jam, "Music's in our blood," An Evening with the
  Residency, Spring Showcase) are all dated Sept 2025–Mar 2026 and have
  already passed relative to today.
- Secular youth arts nonprofit, not religious. Multi-venue (`geo: null`
  if implemented).

Per the quality gate, 0 upcoming events at check time means do not
implement yet — re-check next cycle since the org clearly runs a live
annual cadence of public shows.
