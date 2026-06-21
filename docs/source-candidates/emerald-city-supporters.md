---
name: "Emerald City Supporters (ECS)"
status: notviable
platform: WordPress / Tribe Events ICS
url: https://weareecs.com/events/
tags: [Sports]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Emerald City Supporters is the official supporters group for Seattle Sounders FC.

Investigated 2026-06-21:
- WordPress site with Tribe Events plugin confirmed
- ICS feed accessible: `https://weareecs.com/?post_type=tribe_events&ical=1`
- 15+ upcoming events confirmed
- **All events are Sounders FC match listings** (home and away games), identical to what `sources/external/sounders-fc.yaml` already covers
- No unique ECS-specific programming (tifo reveals, supporters meetups) visible in the feed

**Verdict**: Not viable — Sounders FC matches are already covered by `sources/external/sounders-fc.yaml` (FotMob ICS feed). Adding this source would create duplicate match listings with no new community value.
