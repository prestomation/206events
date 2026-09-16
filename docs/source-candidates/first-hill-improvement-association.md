---
name: "First Hill Improvement Association"
status: added
platform: Squarespace
url: https://www.firsthill.org/neighborhoodcalendar
tags: [Community, "First Hill"]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
pr: 1496
---

Neighborhood improvement association for First Hill, curating a community
calendar of events at First Hill venues and public spaces (Frye Art Museum,
Stimson-Green Mansion, Hotel Sorrento, Freeway Park) plus its own committee
meetings.

Investigated 2026-09-16:
- Real Squarespace site. The nav-linked `/new-page-5` page only embeds a
  calendar *block* (no JSON collection there), but the actual events
  collection lives at a separate URL, `/neighborhoodcalendar` — found via
  `sitemap.xml`, which lists hundreds of dated
  `/neighborhoodcalendar/YYYY/M/D/<slug>` event permalinks.
- `/neighborhoodcalendar?format=json` confirms `collection.typeName: "events"`
  (`itemCount: 1006`). This collection uses Squarespace's **calendar view**
  pagination (month-by-month via `pagination.nextPage`/`nextPageUrl`, e.g.
  `?month=october-2026&view=calendar`) rather than the simpler
  `upcoming`/`past` split — it returns an `items` array for the current
  month instead. The existing built-in `SquarespaceRipper`
  (`lib/config/squarespace.ts`) already handles both shapes: it falls back
  to `data.items` when `upcoming` is absent, and follows
  `pagination.nextPage`/`nextPageUrl` (truthy string, not just boolean) for
  up to `MAX_PAGES` (10) months forward — no code changes needed.
- Verified live via `ONLY_SOURCE=first-hill-improvement-association`: 33
  upcoming events, 0 parse errors, real future dates (Sept–Dec 2026), real
  venue names/addresses, and per-event images.
- All sampled events are in Seattle (First Hill neighborhood addresses:
  98101/98104/98122) — passes the Seattle-focus gate. Not a religious org.
- Not currently covered elsewhere in `sources/` or `sources/external/`
  (checked for `firsthill`).
- `sourceRole: aggregator` (curated multi-venue neighborhood calendar,
  matching the precedent set by `visit-ballard.yaml`), `geo: null`
  (events scattered across First Hill venues, geocoded per-event).

Implemented 2026-09-16: `sources/first_hill_improvement_association/ripper.yaml`,
built-in `squarespace` type.
