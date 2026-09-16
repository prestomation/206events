---
name: Twatties Open Mic
status: added
platform: Unknown
url: https://www.killersetproductions.com/open-mic-in-pnw
tags: ["OpenMic", "Comedy", "Capitol Hill"]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
---

Discovered via aggregator gap analysis. 7 events in the Seattle
metro sample. Source domain: killersetproductions.com.

Sample event: "Twatties Open Mic" (2026-08-25T03:00:00.000Z)
Description: Weekly Monday comedy open mic at Twatties. Sign-up online, start at 8pm. Wheelchair accessible.

Implemented 2026-09-16: `killersetproductions.com/open-mic-in-pnw` is a
static-HTML PNW-wide comedy open-mic directory (not itself a scrapable
per-venue feed — most listed mics are in Tacoma/Renton/Woodinville and
out of scope). Of the directory's entries, only **Twatties** is
Seattle-proper: 719 E Pike St, weekly Monday, sign-up online, 8:00pm
start, rotating host. That address matches the already-known venue
Saint John's Bar & Eatery (same geo as `hitc-trivia-saint-johns.yaml`),
and the schedule was independently corroborated via FireMics
(`firemics.com/events/twatties-haha-mic`, confirms venue = Saint John's
Bar and Eatery, 719 E Pike St, Monday, 8:00pm show start). Implemented
as `sources/recurring/twatties-open-mic.yaml` (`sourceRole: venue`,
`cost: free`), tags `OpenMic`, `Comedy`, `Capitol Hill`. 1 event, 0
parse errors, verified via
`ONLY_SOURCE=twatties-open-mic npm run generate-calendars`.
