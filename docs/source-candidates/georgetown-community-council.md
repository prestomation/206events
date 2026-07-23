---
name: "Georgetown Community Council"
status: notviable
platform: Wix
url: https://www.georgetowncommunitycouncil.com/events-1
tags: []
firstSeen: 2026-07-23
lastChecked: 2026-07-23
---

Neighborhood council covering monthly meetings plus community events
(Garden Walk, Georgetown Pride, cleanups, Haunted History Tours) — found
while searching "Georgetown Seattle neighborhood events calendar art
walk."

Investigated 2026-07-23:
- Wix site, no ICS/RSS/API found.
- Overlap with sources already tracked for Georgetown: Art Attack
  (`sources/recurring/georgetown-artwalk.yaml`) and Carnival
  (`sources/recurring/georgetown-carnival.yaml`) are already covered.
  Garden Walk is not currently covered by any live source — it was
  independently evaluated and rejected as a one-off annual event with no
  calendar/feed (see `docs/source-candidates/georgetown-garden-walk.md`,
  `status: notviable`), not because it's duplicated elsewhere.
  (`sources/external/gba-georgetown.yaml`, the Business Association
  calendar, is also relevant context here but is currently
  `disabled: true`, so it isn't live coverage either.)
- Not viable as a distinct source: no feed to scrape, and what little is
  unique (monthly GCC meetings, Georgetown Pride) is low-volume and
  largely internal/civic rather than public-facing programming.
