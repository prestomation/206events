---
name: "Kandelia"
status: notviable
platform: WordPress (Modern Events Calendar plugin)
url: https://www.kandelia.org/events
tags: []
firstSeen: 2026-07-10
lastChecked: 2026-09-23
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

Re-checked 2026-08-24: `/events/feed/` still has 0 `<item>` entries
(`lastBuildDate` now Aug 6, 2026 but feed body is empty). No change.

Re-checked 2026-09-16: `/events/feed/` still 0 `<item>` entries
(`lastBuildDate` now Sep 10, 2026). No change.

Checked 2026-09-23 (notviable): MEC `/events/feed/` still 0 `<item>` entries (4th check, Jul–Sep 2026). Programs are mostly for enrolled families, not public events; closing.
