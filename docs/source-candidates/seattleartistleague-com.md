---
name: Beginning Drawing TUESDAY EVENING begins 8.25
status: notviable
platform: "WordPress (WooCommerce products? — no dedicated class/event REST type)"
url: https://www.seattleartistleague.com/art-classes/beginning-drawing-tuesday-evening-begins-8-25/
tags: ["creation", "learning"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: seattleartistleague.com.

Sample event: "Beginning Drawing TUESDAY EVENING begins 8.25" (2026-08-26T01:00:00.000Z)
Description: In-person 8-week beginning drawing course at Seattle Artist League. Learn core observational skills: line, shape, value, proportion, perspective, and composition. Teacher: Anne Marie. No experience ne

Re-checked 2026-09-16: confirmed WordPress with an open `/wp-json/wp/v2/types`
endpoint, but no dedicated `class`/`event` custom post type registered —
each class page (like the sample above) appears to live under
`/art-classes/<slug>/` with a `product` post type present sitewide
(WooCommerce), suggesting classes may be sold as WooCommerce products with
per-session scheduling, but this needs confirming against the WooCommerce
Store API before further work. Left `investigating`.

2026-09-23: Duplicate — already covered by the existing source `sources/seattle_artist_league/` (`seattle-artist-league`, WooCommerce Store API; see candidate `seattle-artist-league.md`). Closing.
