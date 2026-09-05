---
name: FamilyWorks Seattle
status: proxy
platform: WordPress (The Events Calendar plugin, generic ?ical=1 export)
url: https://www.familyworksseattle.org/events/?ical=1
tags: ["Community"]
firstSeen: 2026-08-25
lastChecked: 2026-09-05
pr: 1380
---

Seattle nonprofit running food banks and family resource centers across
North Seattle (playgroups, parenting classes, food distribution, community
events for families with young children).

The events page uses the WordPress "The Events Calendar" plugin, which
exposes a generic ICS export at `?ical=1` regardless of the theme — confirmed
live locally with 27 future `VEVENT`s across 5 distinct Seattle addresses
(Family Resource Center/Roosevelt, Wallingford Food Bank, Green Lake and
Broadview SPL branches, Cedar Crossing). No single neighborhood tag was
applied since the feed spans several neighborhoods and tags apply
calendar-wide (see `seattle-emergency-hubs.yaml` for the same pattern).

Note for future duplicate-resolution: the Green Lake and Broadview addresses
are Seattle Public Library branches hosting FamilyWorks programming, not
FamilyWorks-owned sites — SPL's own calendar could independently list room
bookings at the same branches.

Implemented as `sources/external/familyworks.yaml` (`geo: null`,
`sourceRole: venue`, per-event location strings geocoded via Nominatim).
27 events confirmed in a local `ONLY_SOURCE=familyworks` build — but PR #1380's
CI build preview shows the feed 403ing from GitHub Actions' IP
(`External calendar failures: familyworks: Error: HTTP 403:`). Staged with
the `requires-proxy-testing` label at `proxy: false` for
`skills/proxy-escalation/SKILL.md` (out-of-band job) to test the
`outofband`/`browserbase` ladder and merge the lowest working rung, or close
the PR if neither works.
