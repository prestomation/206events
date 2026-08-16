---
name: "The Cloud Room"
status: notviable
platform: Squarespace
url: https://www.cloudroomseattle.com/events
tags: [Community, "Capitol Hill"]
firstSeen: 2026-08-16
lastChecked: 2026-08-16
---

Coworking space in the Chophouse Row building, 1424 11th Ave, Capitol
Hill. Confirmed Squarespace with a working events collection
(`/events?format=json` → 16 `upcoming` entries with future `startDate`
values, e.g. "Tuesday Cheers Club", "Writing Happy Hour", "Summer Sounds
at Chophouse Row").

**Already covered:** `sources/chophouse_row/ripper.yaml` scrapes
`chophouserow.com/events`, which is the same address (1424 11th Ave) and
already aggregates every Chophouse Row tenant's events — including all
of Cloud Room's, prefixed `"Cloud Room: ..."` in the feed (confirmed by
comparing titles: "Cloud Room: Small Business Meetup", "Cloud Room:
Writing Happy Hour", "Cloud Room: Open House Week" all appear in
`chophouserow.com/events?format=json`, 27 upcoming vs. Cloud Room's own
16 — Chophouse Row's collection is the superset). Adding Cloud Room
separately would duplicate an already-covered source. No action needed.
