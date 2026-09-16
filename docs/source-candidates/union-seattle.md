---
name: Union Seattle
status: added
platform: Wix
url: https://www.unionseattle.com
tags: [Nightlife, LGBTQ, "Capitol Hill"]
firstSeen: 2026-08-14
lastChecked: 2026-09-16
pr: 1498
---

Seattle nightclub and event space hosting dance music and live performances.

Real, live site — Union is an LGBTQ+ bar/restaurant at 1009 E Union St,
Capitol Hill (est. 2018), built on Wix. No dedicated events calendar; content
is ~4-5 recurring weekly items (Team Tuesdays, Wing Wednesdays, Sunday
Funday) plus a featured 2026 Pride Block Party. Low volume but real and not
already covered — best modeled as `sources/recurring/` entries for the
weekly series plus a manual entry for Pride. Consider re-tagging `Queer` in
addition to Nightlife/Music. Not religious.

**Implemented 2026-09-16:** Added two `sources/recurring/` entries —
`union-seattle-wing-wednesdays` (every Wednesday 16:00–22:00, 10 wings for
$5, explicit hours stated on the page) and `union-seattle-sunday-funday`
(every Sunday 12:00–16:00, brunch/patio party, explicit hours stated on the
page). Geocoded via Nominatim (`47.6127716, -122.3189306`, OSM node
2159322642, matches the bar's Google Maps pin). Skipped "Team Tuesdays" —
the page names it but states no specific start/end time, and the "2026
PRIDE Block Party" — its date (June 2026) has already passed as of this
implementation, so nothing to schedule. Used the `LGBTQ` tag (matching the
convention in `queer_social_club/ripper.yaml`) instead of a bespoke `Queer`
tag.
