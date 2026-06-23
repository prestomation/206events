---
name: Seattle Arts & Lectures
status: added
platform: Custom HTML
url: https://lectures.org/events/
tags: [Books, Arts, Education]
firstSeen: 2026-06-23
lastChecked: 2026-06-23
pr:
---

Literary lecture series at Benaroya Hall and other Seattle venues. Hosts
author talks, literary festivals, youth and schools programs, and the
Seattle Arts & Lectures literary series. Events span Oct–Jun each season.

Event listing at `lectures.org/events/` uses a CSS grid with `data-in-month`
attributes per card and `.short-date` spans for day-of-month; start times are
not on the listing page (available on individual event pages). Custom ripper
emits `UncertaintyError` for `startTime` on every event so the resolver can
fill them in per-event.

35+ upcoming events as of 2026-06-23 (2026–2027 season, Jul 2026–May 2027).

Implemented as `sources/seattle_arts_lectures/`.
