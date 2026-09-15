---
name: "Furniture Repair Bank"
status: added
pr: 1492
platform: Squarespace (custom location parsing)
url: https://www.repairbank.org/repair-bank-events
tags: ["Volunteer", "Community"]
firstSeen: 2026-08-25
lastChecked: 2026-09-15
---

Discovered via aggregator gap analysis. 3 events in the Seattle
metro sample. Source domain: repairbank.org.

Sample event: "Repair Day" (2026-08-25T17:00:00.000Z)
Description: Furniture Repair Bank volunteer repair day

**Implemented 2026-09-15:** Nonprofit furniture repair/reuse shop at
1938B Occidental Ave S, Seattle (SODO). Confirmed Squarespace events
collection (`/repair-bank-events?format=json` → `events-stacked`,
`itemCount: 762`, 45 upcoming). The structured `location` field is
always empty — every event's address lives as prose in the body
("Address: <street>, Seattle, WA <zip>") instead. Extracted via a
custom subclass of the built-in `SquarespaceRipper` (same
body-postprocessing pattern as `sources/kenyon_hall`,
`sources/seattle_film_society`) rather than the plain built-in
`squarespace` type.

Despite corporate-sounding titles ("Microsoft Repair Day", "T-Mobile
Repair Day", "Rotary Club of Edmonds Repair Day" — volunteer group
names, not locations) every event resolves to one of three addresses,
all Seattle-proper: the SODO shop itself, or one of two "Collection
Event" days at the South Transfer Station (South Park) / North
Transfer Station (Fremont). 100% Seattle-focused. Implemented as
`sources/furniture_repair_bank/` with `geo: null` (per-event location
string, auto-geocoded — only 3 unique addresses, all resolved
cleanly). 45 upcoming events, 0 parse errors verified via
`ONLY_SOURCE=furniture-repair-bank`.
