---
name: "Seattle Art Book Fair"
status: dead
pr: 267
firstSeen: 2026-05-07
lastChecked: 2026-05-28
removedInPr: 419
---
Cargo.site, custom HTML ripper at `sources/seattle_art_book_fair/`.
Annual free festival at Washington Hall (153 14th Ave, Central District)
celebrating independent publishing, book design, and artist books. 85+
exhibitors plus talks, activities, art installations.

The ripper parses the homepage for the fair date range (one event per
day, 11am–5pm) and the Prepress Launch Party (the evening before).
`expectEmpty: true` since the source is intentionally dormant outside
the annual event window.

**Removed 2026-05-28 (PR #419)** — `seattleartbookfair.org` returned HTTP
503. The source had not appeared in the deployed `manifest.json` since
the new-source detection check overrides `expectEmpty: true` for sources
that have never been deployed, so this was blocking unrelated PRs from
merging on every empty-window day. Removed via `allowed-removals/seattle-art-book-fair.ics`;
revisit if the upstream site comes back online and a future fair date is
announced.

