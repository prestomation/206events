---
name: "Beacon Food Forest"
status: added
platform: recurring YAML
url: https://www.beaconfoodforest.org/work-parties
tags: [Community, Beacon Hill, Parks]
firstSeen: 2026-06-13
lastChecked: 2026-06-22
pr: pending
---

Beacon Food Forest is a 7-acre community food forest in North Beacon Hill — one of the largest in the country. They host monthly Third Saturday Work Parties, educational workshops (foraging, fungi farming, pollinator tours, basket weaving), and special events throughout the year.

Investigated 2026-06-13:
- Platform: Squarespace confirmed
- `?format=json` endpoint accessible: returns `"upcoming":[]` (empty) as of 2026-06-13
- Last published event: "Beacon Food Forest Foraging Fun Tours #3" (October 4, 2025)
- Calendar appears inactive since Oct 2025; organization is still active but may be using a different platform for event promotion

Re-checked 2026-06-16: Squarespace `?format=json` still returns `"upcoming":[]`. No new events.

Implemented 2026-06-22: Added as `sources/recurring/beacon-food-forest-work-party.yaml` — a recurring YAML with `schedule: 3rd Saturday`, 10am–2pm, at 15th Ave S & S Dakota St (Jefferson Park). Bypasses the dormant Squarespace calendar; the Work Parties are documented on their website as a consistent year-round monthly event. Tags: Community, Beacon Hill, Parks.
