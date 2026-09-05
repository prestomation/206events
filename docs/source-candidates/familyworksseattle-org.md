---
name: FamilyWorks Seattle
status: added
platform: WordPress (The Events Calendar plugin, generic ?ical=1 export)
url: https://www.familyworksseattle.org/events/?ical=1
tags: ["Community", "Wallingford"]
firstSeen: 2026-08-25
lastChecked: 2026-09-05
---

Seattle nonprofit running food banks and family resource centers in
Wallingford, Roosevelt/Ravenna, and Fremont (playgroups, parenting classes,
food distribution, community events for families with young children).

The events page uses the WordPress "The Events Calendar" plugin, which
exposes a generic ICS export at `?ical=1` regardless of the theme — confirmed
live with 27 future `VEVENT`s across 5 distinct Seattle addresses (Family
Resource Center/Roosevelt, Wallingford Food Bank, Green Lake and Broadview
SPL branches, Cedar Crossing).

Implemented as `sources/external/familyworks.yaml` (`geo: null`,
`sourceRole: venue`, per-event location strings geocoded via Nominatim).
27 events confirmed in a local `ONLY_SOURCE=familyworks` build.
