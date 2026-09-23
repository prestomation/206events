---
name: Pitch Please #10
status: added
platform: Unknown
url: https://foundercal.com/events/pitch-please-10-WfJffOGKOmmbHPy
tags: ["tech", "learning", "outdoors", "fitness"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Discovered via aggregator gap analysis. 3 events in the Seattle
metro sample. Source domain: foundercal.com.

Sample event: "Pitch Please #10" (2026-08-25T20:00:00.000Z)
Description: Monthly pitch session at AI House with 5 founders pitching, candid feedback from AI2 Incubator experts, and networking mixer. Audience votes for favorite pitch.

Checked 2026-09-23 (added): Added as custom ripper `sources/foundercal/` (source name `foundercal`, calendar `seattle`, `sourceRole: aggregator`, tag `Tech`). foundercal is a startup/founder event aggregator; its Seattle city page (`https://foundercal.com/cities/seattle`) lists event cards, and each event page carries schema.org Event JSON-LD (start/end, venue + street address, upstream Luma/Meetup registration URL, free flag). The ripper reads the city page, then fetches each future event page. Missing end times or city-only locations emit `Uncertainty` errors. Verified with `ONLY_SOURCE=foundercal`: 66 events, 0 parse errors, 22 uncertainty entries. Expect cross-source duplicates with `ai-house`, `wtia-community-events` and other tech sources; dedup handles those since this source is an aggregator.
