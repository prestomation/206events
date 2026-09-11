---
name: "TeenTix"
status: investigating
platform: Craft CMS (headless, SEOmatic)
url: https://www.teentix.org/calendar/
tags: [Arts, Community]
firstSeen: 2026-09-11
lastChecked: 2026-09-11
---

Seattle nonprofit ($5 arts-access ticket program for teens, 305 Harrison
St) publishing a **monthly calendar aggregating events from its partner
arts organizations** — SAM, STG (Paramount/Moore/Neptune), museums,
theaters, dance, film, comedy, etc. across the city (28-50 events/day
in the September 2026 view).

Investigated 2026-09-11:
- Site runs on Craft CMS (`cdn.craft.cloud` asset URLs, `SEOmatic`
  generator meta tag), not WordPress/Squarespace/Tribe/Eventbrite.
- `/calendar/` is a month grid: each day cell carries a `data-event-count`
  but the actual per-event titles/venues are **not** present in that
  page's HTML — only the counts. No `wp-json`, ICS, or documented API
  endpoint found in the static markup; the single `application/ld+json`
  block on the page is site/organization metadata only, not event data.
- Per-event detail must live behind a per-day view (not yet located) or
  a client-side fetch — needs further investigation (network-tab
  inspection) to find the real data source before this can be graded a
  real 🟡/🔥 candidate.
- **Major caveat even if the feed is found**: this is a pure
  aggregator republishing events from partner orgs that mostly already
  have their own dedicated sources in this repo (SAM, STG, etc.) —
  `sourceRole: aggregator`, `geo: null`. Implementing it risks a large
  volume of cross-source duplicates unless the per-event venue is
  reliably parseable for dedup. Only the events from partner orgs *not*
  otherwise covered would add net-new value.

Left as `investigating` rather than `candidate` — the underlying event
data endpoint hasn't been found yet, so viability is unconfirmed.
