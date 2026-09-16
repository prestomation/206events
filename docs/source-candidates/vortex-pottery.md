---
name: Vortex Pottery Classes
status: added
platform: Squarespace (store/product collection, custom IRipper)
url: https://vortexpottery.com/pottery-classes-seattle-washington
tags: [Creation, Uptown]
firstSeen: 2026-08-14
lastChecked: 2026-09-16
pr:
---

Seattle pottery studio offering wheel-throwing and handbuilding classes.

Real, live site (517 Aloha St, Seattle, WA 98109), built on Squarespace
(squarespace-cdn.com asset URLs). Page lists ~5 recurring class offerings
with day/time (e.g. "Beginners Wheel, Mondays 6-9pm, 8 classes, $525") for
the current Fall session rather than a dated events calendar. Low volume,
recurring-class structure — a good fit for the `sources/recurring/` pattern
(one entry per weekly class slot) rather than a discrete-event ripper. Not
already covered, not religious.

Re-checked 2026-09-11: the page has changed shape since the August pass —
it's now rendered as a Squarespace commerce/subscription product listing
("from {price} every month/week" billing text) rather than prose
describing day/time class slots. The specific "Beginners Wheel, Mondays
6-9pm" text found in August is no longer present in the fetched HTML.
Would need a fresh investigation of the new page structure (product
listing may include per-class schedule metadata, or may not expose
day/time at all) before this can move forward as a recurring-YAML
candidate. No change to status.

**Implemented 2026-09-16:** re-investigated with a plain `curl` of
`?format=json`. The page is a Squarespace **store/product** collection
(`typeName: "products"`), not an events collection — same shape as the
already-implemented Reclaim Clay Collective. 4 live class-slot products
(Beginners Wheel Mondays, Beginners Wheel Tuesdays, Continuing Wheel
Wednesdays, Hand Sculpture Wednesdays), each edited in place every term:
the product's `excerpt` states an explicit dated 6-week range in its
first heading (e.g. "Wednesdays - November 4 to December 9, 2026" —
sometimes split across two `<strong>` tags inside that heading) and the
`title` states the time-of-day range ("6 to 9 pm" / "6 pm to 9 pm" / "6
To 9 pm"). Unlike Reclaim Clay's hyphen-separated date ranges, these use
the word "to", so a fresh, self-contained custom `IRipper`
(`sources/vortex_pottery/`) was written rather than reusing that ripper's
private parsing helpers — one regex on the excerpt heading, one on the
title's time range, then a weekly expansion identical in spirit to
Reclaim Clay's "Case C" weekly range. Single fixed venue (517 Aloha St,
Seattle, WA 98109 — Uptown/Lower Queen Anne, exact OSM way match, node
coordinates corroborated by the site's own embedded map data), `geo` set
at the ripper level (no per-event geocoding needed), `sourceRole: venue`,
tags `Creation`, `Uptown`. $500 (variant price) attributed to each
generated event, matching how Reclaim Clay attributes a multi-session
class's price to every occurrence. 24 events (4 slots × 6 weeks), 0 parse
errors, verified via `ONLY_SOURCE=vortex-pottery npm run
generate-calendars`; full `npm run test` (3767 tests) still green.
