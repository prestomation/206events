---
name: BodyPump
status: candidate
platform: Unknown
url: https://www.olympicathleticclub.com/classes/
tags: ["fitness", "dancing", "playing-sports", "wellness"]
firstSeen: 2026-08-25
lastChecked: 2026-08-26
---

Discovered via aggregator gap analysis. 18 events in the Seattle
metro sample. Source domain: olympicathleticclub.com.

Sample event: "BodyPump" (2026-08-25T01:45:00.000Z)
Description: Group fitness class at Olympic Athletic Club.

**Investigated 2026-08-26:** Single location, Ballard (5301 Leary Ave
NW, Seattle, WA 98107) — passes the geographic gate. However the sample
events are recurring group-fitness class instances (BodyPump, Tae Kwon
Do-style class slots), not one-off events — closer to a class schedule
than a calendar of happenings. `/classes/` is a JS-rendered schedule
widget; no ICS/JSON API found on a quick pass. Leaving as `candidate`
rather than promoting to implementation — would need to confirm the
class-schedule content fits the calendar's purpose and find the
underlying data source (likely a booking platform API) before treating
this as a 🔥/🟡 pick.
