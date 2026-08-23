---
name: "Maiden Voyage HiFi"
status: notviable
platform: Squarespace
url: https://www.maidenvoyagehifi.com/events
tags: [Music]
firstSeen: 2026-08-23
lastChecked: 2026-08-23
---

Japanese-inspired, hi-fi vinyl listening pop-up series curated by an
independent organizer (not a fixed venue of their own).

Investigated 2026-08-23:
- Confirmed Squarespace with a real Events collection (`?format=json` →
  `collection.typeName: "events-stacked"`, `itemCount: 33`, 3 upcoming
  events with future `startDate` values — e.g. "Coltrane 100 with Impulse
  Records", "Earshot Jazz Festival Preview")
- Every sampled event (upcoming and past) has `location.addressTitle:
  "Populus Seattle"` — all programming happens at the already-covered
  `sources/external/populus-seattle.yaml` venue (Tribe Events ICS,
  `proxy: browserbase`)
- Confirmed the Populus ICS feed already lists a generic "Maiden Voyage"
  SUMMARY entry among its events, so this organizer's programming is
  already represented (at coarser granularity) by the existing venue
  source
- Adding Maiden Voyage as its own source would substantially duplicate
  Populus Seattle's feed for the same physical events, just with more
  descriptive per-instance titles — not enough independent coverage to
  justify a second source
- Not viable as a standalone source; the finer per-event titles could be
  worth a future look if Maiden Voyage ever expands beyond Populus
