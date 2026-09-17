---
name: "Screwdriver Bar"
status: notviable
platform: Squarespace
url: https://screwdriverbar.com/events
tags: [Music, Belltown]
firstSeen: 2026-09-17
lastChecked: 2026-09-17
---

Belltown basement rock 'n' roll bar (2320 1st Ave) hosting live music and
curated vinyl DJ nights.

Investigated 2026-09-17:
- Squarespace confirmed (`squarespace-cdn.com` assets, a
  `squarespace-calendar-block-renderer` script reference).
- `/events?format=json` returns `typeName: "page"`, `itemCount: 0` — the
  nav's `/events` link is a static page, not a real Squarespace Events
  collection. No dated content found anywhere in the sitemap (`/work`,
  `/about`, `/home`, `/byc`, `/screwdriver`, `/services`, `/menu`,
  `/merch/*` — no events/shows page).

Not viable as a scraped source today — no machine-readable dated event
listing found. Re-check if the site adds a real Events collection.
