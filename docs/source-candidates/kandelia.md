---
name: "Kandelia"
status: candidate
platform: WordPress (Modern Events Calendar plugin)
url: https://www.kandelia.org/events
tags: []
firstSeen: 2026-07-10
lastChecked: 2026-07-10
---

Seattle-based nonprofit providing youth and family programs for immigrant
and refugee families (formerly known as Somali Family Safety Task Force).

Investigated 2026-07-10:
- WordPress site using the "Modern Events Calendar" (MEC) plugin
  (`modern-events-calendar-lite` assets), which publishes an RSS feed at
  `https://www.kandelia.org/events/feed/`.
- The RSS feed currently has **zero items** (`lastBuildDate` from over a
  month ago), and the `/events/` page itself shows no upcoming listings
  (only one `mec-event-article` block found, with no extractable title).
- Not a Seattle-specific public events venue in the usual sense — mostly
  internal programs for program participants — so even once populated,
  events found here may skew toward not-really-public-facing (similar to
  the Mountaineers finding). Worth a second look if the feed populates.

Re-evaluate in a future cycle: check `/events/feed/` for populated
`<item>` entries, and confirm any listed events are open to the general
public (not participant-only program sessions) before implementing.
