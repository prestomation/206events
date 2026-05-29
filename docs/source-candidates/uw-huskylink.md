---
name: UW HuskyLink (Student Organization Events)
status: added
platform: Anthology Engage (CampusLabs) — JSON discovery API
url: https://huskylink.washington.edu/events
tags: [Community, University District]
firstSeen: 2026-05-28
lastChecked: 2026-05-28
pr:
---

UW's official Registered Student Organization (RSO) event platform,
running on the Anthology Engage / CampusLabs Engage stack. Public JSON
discovery endpoint at
`https://huskylink.washington.edu/api/discovery/event/search` returns
all approved, public future events with full metadata (title,
description, location string, lat/lng, imagePath, organizationName,
theme, categoryNames).

Identified via a source-from-event lookup on a UW Night Market poster
(May 23 2026 at Red Square, hosted by TSAUW). The Night Market itself
was not posted to HuskyLink, but the platform is the natural "general"
source for the broader category of UW student-org events that the
existing `uw-campus-events` Trumba feed misses (cultural celebrations,
club showcases, dance/music nights, networking events, etc.).

Sample response — small set near end-of-spring-quarter (8 events 2026-05-23
→ 2026-06-03), 247 events over the prior year. Volume should rebound in
fall quarter as student programming ramps up; not flagged
`expectEmpty` for the initial PR per the discovery rule that brand-new
sources must produce >0 events.

Event venues are scattered across UW Seattle campus (Kane Hall, Mary
Gates, Savery, MEB, Odegaard, HUB, etc.), so the ripper sets
ripper-level `geo: null` and emits per-event `lat`/`lng` from the API
payload when present. Image URLs resolve under
`https://se-images.campuslabs.com/clink/images/{imagePath}`; event
pages at `https://huskylink.washington.edu/event/{id}`.
