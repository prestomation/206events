---
name: "TeenTix"
status: notviable
platform: Craft CMS (headless, SEOmatic)
url: https://www.teentix.org/calendar/
tags: [Arts, Community]
firstSeen: 2026-09-11
lastChecked: 2026-09-23
---

Seattle nonprofit ($5 arts-access ticket program for teens, 305 Harrison
St) publishing a **monthly calendar aggregating events from its partner
arts organizations** — SAM, STG (Paramount/Moore/Neptune), museums,
theaters, dance, film, comedy, etc. across the city (28-50 events/day
in the September 2026 view).

**Previously evaluated** in `docs/discovery-log/2026-04-23.md` (before
the per-candidate-file system existed, so no file was created then):
`❌ Not Viable: TeenTix — Aggregator/calendar at teentix.org/calendar.
No public ICS feed. Would need custom scraper.` This is the first
per-candidate file for it — reopening as `investigating` rather than
re-closing as `notviable` because this pass narrowed the gap further
(confirmed the exact platform and that per-day event detail may exist
behind a not-yet-located endpoint) without fully resolving it either
way; see below.

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

**2026-09-23:** Closed as notviable. Found the data: `/calendar/day/?date=YYYY-MM-DD` server-renders the per-day list (title, venue, time, event link), so it is scrapable. But the listing is overwhelmingly long-running "All Day" exhibitions and runs at partner orgs this repo already covers directly (SAM, Henry, Burke, STG, etc.), plus a meaningful share outside Seattle (Bellevue Botanical Garden, Lakewold Gardens in Lakewood, etc.). As a pure aggregator it would mostly add cross-source duplicates and months-long all-day entries rather than net-new events. Not worth a custom scraper.
