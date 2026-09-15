---
name: "National Nordic Museum"
status: added
platform: Custom HTML (FusionCMS)
url: https://nordicmuseum.org/calendar
tags: [Arts, Museums, Ballard]
firstSeen: 2026-09-15
lastChecked: 2026-09-15
pr:
---

Seattle's National Nordic Museum, 2655 NW Market Street, Ballard —
dedicated to Nordic culture and history (Denmark, Finland, Iceland,
Norway, Sweden). Public events calendar at `/calendar` (redirected from
`/events`).

Investigated 2026-09-15:
- Not FusionCMS-native ICS/API found; page is server-rendered HTML
  (`generator: FusionCMS v5.22.43`), no JSON-LD, no `wp-json`/Tribe REST
  endpoint (not WordPress).
- `/calendar` list page renders 18 `card-event` blocks directly in HTML:
  title, a date-text subheading (single date, multi-day range, or a
  recurring-pattern phrase like "Every Thursday" / "First and third
  Wednesday of every month"), a time range, and a link to a per-event
  detail page.
- Each detail page (`/events/<slug>`) has clean structured info: `<h1>`
  title, a "Date" `info-detail` block with the date + time range, a
  "Contact" `info-detail` block with the venue's street address
  (`2655 NW Market Street, Seattle, WA 98107` for in-person events),
  and an "Admission" block with pricing text (e.g. "Members: $12 /
  General Admission: $14"), plus a header image.
- Good volume: 18 upcoming listings at time of check, including a
  9-film SEA-Nordic Film Festival (Sept 15-19, 2026), recurring docent
  tours, language classes, and a members' event.
- Viable as a custom `HTMLRipper` following the `frye_art_museum` /
  `museum_of_flight` pattern (list page → per-event detail-page fetch).
  Single-date events parse directly; the multi-day festival "summary"
  card is redundant with its own per-film screening cards already on
  the list (each film has its own dated card) so should be skipped with
  a clear `ParseError`, not silently dropped; the 3 recurring-phrase
  cards (weekly docent tours, two language-class series) need bounded
  occurrence synthesis rather than a single mis-dated event, following
  the Free First Thursday synthesis precedent (`sources/burke_museum`,
  `sources/sam`).
- Confirmed via Nominatim: lat 47.6682856, lng -122.3917729 (OSM way
  438457488).
- Not a religious org; not found under `sources/` or `sources/external/`.
- 🟡 Medium-ish confidence custom HTML source — implementing.

**Implemented 2026-09-15:** custom `HTMLRipper` (`sources/nordic_museum/`)
following the `frye_art_museum`/`museum_of_flight` list-page +
per-event-detail-page pattern. Single-date cards parse directly; the
multi-day SEA-Nordic Film Festival summary card is skipped with a
`ParseError` (its individual screenings already have their own dated
cards); recurring-phrase cards ("Every Thursday", bounded
"Every Thursday, Sept 24-Nov 19", "First and third Wednesday of every
month") synthesize concrete occurrences up to 63 days out. 42 upcoming
events, 1 intentional `ParseError`, 9 non-fatal `Uncertainty` entries
(ambiguous multi-section class times, one detail page missing its
Contact/address block) verified via `ONLY_SOURCE=nordic-museum`.
