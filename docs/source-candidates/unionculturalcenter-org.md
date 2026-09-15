---
name: "Union Cultural Center"
status: added
platform: Webflow (server-rendered CMS collection)
url: https://www.unionculturalcenter.org/classes-and-events
tags: [Dance, Sports, "International District"]
firstSeen: 2026-08-25
lastChecked: 2026-09-15
pr:
---

Nonprofit cultural center at 803 S King St, Seattle, WA 98104
(Chinatown-International District) offering Afro-Diasporic dance,
Capoeira, and martial-arts classes with a live band/community focus.

Discovered via aggregator gap analysis (2026-08-25): 1 sample event
("Capoeira Angola") from `unionculturalcenter.org`.

**Investigated/implemented 2026-09-15:** confirmed Webflow site — the
`/classes-and-events` collection page and each `/workshop-event-program/<slug>`
detail page are server-rendered static HTML (no JS execution needed). The
9 listed programs split into two kinds: 5 have an open-ended weekly or
monthly "Class Schedule"/"Date & Time" block (fixed day-of-week + time,
no end date) — these were implemented as `sources/recurring/` entries,
one per class per the multi-file-per-venue pattern (`magnolia-yoga-*`):
- `union-cultural-center-capoeira-angola` (Tue/Thu 7-9pm, Sun 4-6pm)
- `union-cultural-center-capoeira-rodas` (1st Sunday, 4-6pm, donation-based)
- `union-cultural-center-west-african-dance` (Wed 7:30-9pm)
- `union-cultural-center-wing-chun` (Sat 10am-12pm)
- `union-cultural-center-samba-no-pe` (Mon 6:30-7:30pm — only the first
  of two back-to-back Monday classes; the second, "Samba de Roda com
  Saia" starting 7:30pm, states no end time and was intentionally left
  unimplemented rather than guessed)

The other 4 were intentionally **not** implemented:
- **Kids/Family Capoeira Classes** — bounded paid 8-week series
  (Tue, Sept 29-Nov 17) rather than an ongoing recurring class; a
  different shape than the other 5 and lower priority
- **School Partnerships** — a year-round institutional program, not a
  public event
- **Nourishian Training** — page explicitly states "DATES: TBD"

Verified via `ONLY_SOURCE=union-cultural-center-capoeira-angola,union-cultural-center-capoeira-rodas,union-cultural-center-west-african-dance,union-cultural-center-wing-chun,union-cultural-center-samba-no-pe`:
7 upcoming events across the 5 calendars, 0 errors. Geo resolved via
Nominatim (OSM node 2434527420). Not previously covered under `sources/`
or `sources/recurring/` (confirmed via `grep -ril "union cultural"`).
