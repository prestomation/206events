---
name: "Beveridge Place Pub"
status: candidate
platform: "Recurring (hand-coded weekly schedule)"
url: https://beveridgeplacepub.com/events/
tags: [Trivia, "Pub Trivia", "West Seattle"]
firstSeen: 2026-07-17
lastChecked: 2026-07-17
pr:
---

West Seattle beer bar at 6413 California Ave SW, Seattle, WA 98136. Hosts
**Quiz Night every Wednesday at 8pm** ("two hours of mind-bending questions
and answers, hosted by Jerry"), confirmed on the venue's own `/events/` page.

Investigated 2026-07-17:
- `/events/` is a static WordPress page, not a structured calendar/ICS/API —
  it lists a couple of evergreen event blurbs (Quiz Night, plus occasional
  one-off posts like a World Cup viewing) rather than dated instances.
- The Quiz Night listing is a fixed weekly pattern with a known day/time, so
  this fits the `sources/recurring/` pattern (like the many
  `hitc-trivia-*` entries) rather than a custom HTML ripper — a single
  `schedules:` entry (`every Wednesday`, `20:00`, `PT2H`) would cover it.
- No other recurring programming found on the page beyond Quiz Night and
  sporadic one-off watch parties (not a stable recurring pattern).

**Verdict**: Viable as a low-volume `sources/recurring/` entry (Quiz Night
only). Queued for a future implementation cycle.
