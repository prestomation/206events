---
name: Savoy Swing
status: added
platform: Squarespace
url: https://www.savoyswing.org/events
tags: [Dance, "Capitol Hill"]
firstSeen: 2026-08-14
lastChecked: 2026-08-16
pr: 1212
---

Seattle-based swing dance organization hosting regular dances, lessons, and workshops.

**Vetting notes (2026-08-14):** Strong find. Real, active swing dance org
operating out of the Lowdown Ballroom. Confirmed Squarespace
(`images.squarespace-cdn.com`). 20+ specific dated events found spanning
March–August 2026 ("Speakeasy at Savoy" live music socials, DJ socials,
workshops, Tuesday practice sessions). Each event has a per-event ICS export
link (`?format=ical`); the Squarespace events collection likely also supports
a full-collection `?format=json`/`?format=ical` feed, which would be the
preferred implementation path over per-event scraping. Not yet covered by any
existing source.

**Implemented 2026-08-16:** Confirmed live `?format=json` returns 2
`upcoming` events with future `startDate` epoch values (Aug 22 and Aug 29,
2026). Added as `sources/savoy_swing/ripper.yaml` using the built-in
`squarespace` type (`sourceRole: venue`), geocoded to Lowdown Ballroom
(628 11th Ave E, Seattle, WA 98102) via Nominatim, tags `["Dance", "Capitol
Hill"]` (used the canonical `Dance` spelling from `lib/config/tags.ts`
rather than the earlier note's `Dancing`/`Swing`). `ONLY_SOURCE=savoy-swing`
build confirmed 2 events, 0 errors.
