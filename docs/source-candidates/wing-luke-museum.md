---
name: "Wing Luke Museum"
status: added
platform: Squarespace
url: https://www.wingluke.org/eventscalendar
tags: ["Arts", "Museums", "Community", "International District"]
firstSeen: 2026-06-12
lastChecked: 2026-06-12
pr: TBD
---

Asian Pacific American history and culture museum located at 719 S King St in Seattle's
International District. Hosts community events, film screenings, cultural workshops,
block parties, exhibitions, and Free First Thursday evenings (free admission 5–8 PM,
May–Oct).

Squarespace events page at `https://www.wingluke.org/eventscalendar`. Confirmed 6+
upcoming events via `?format=json` on 2026-06-12, including C-ID Summer Kickoff
(June 18), Intergenerational Mahjong 101 (June 27), and recurring Free First Thursday
events through October 2026.

Implemented as `sources/wing_luke_museum/ripper.yaml` with `type: squarespace`.
Free First Thursday events appear in their Squarespace calendar as explicit dated
events — no synthesis needed.
