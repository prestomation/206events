---
name: The Tin Lizzie Lounge
status: added
platform: Custom HTML (fixed recurring schedule)
url: https://thetinlizzielounge.com/live-music/
tags: ["Music", "Nightlife", "Dance", "QueenAnne"]
firstSeen: 2026-08-25
lastChecked: 2026-09-02
pr: 1352
---

Discovered via aggregator gap analysis (sample event: "Balboa, Booze and
a Dash o' Blues", 2nd/4th Mondays). The lounge is inside the MarQueen
Hotel, 600 Queen Anne Ave N, Seattle (Lower Queen Anne).

**Investigated 2026-09-02:** `/live-music/` is a plain, server-rendered
WordPress page (no ICS/JSON feed) but lists a fixed weekly/monthly
recurring schedule of four distinct live-music programs, each with a
clean ordinal-weekday pattern — a direct fit for
`sources/recurring/<name>.yaml`:

- "Balboa, Booze and a Dash o' Blues" (Hot Rhythm Club swing dance) — 2nd
  and 4th Mondays, 8pm
- "Josh Philpott and Tim Wetmiller" (bluegrass) — every Thursday, 8pm
- "Enrique Henao" (international recording artist) — 1st Sundays, 7pm
- "Christian Smith Quartet" (jazz) — 2nd and 4th Sundays, 7pm

(The page also lists "Uptown Art Walk" and "Featured Sunday Artist";
Uptown Art Walk is already covered by the existing
`sources/recurring/uptown-artwalk.yaml` neighborhood source, and
"Featured Sunday Artist" is a rotating-name placeholder with no fixed
performer to title an event after, so both were left out.)

Implemented as four separate recurring-YAML files (mirroring the
existing `jazztime-seattle-*` pattern of one file per distinct
recurring program sharing a venue), all `sourceRole: venue`, geo
resolved via OSM Nominatim (node 1773269726, "Tin Lizzie Lounge"):
`tin-lizzie-lounge-balboa-blues.yaml`,
`tin-lizzie-lounge-bluegrass.yaml`,
`tin-lizzie-lounge-enrique-henao.yaml`,
`tin-lizzie-lounge-christian-smith-quartet.yaml`. 1 event each (4
total), 0 errors confirmed via
`ONLY_SOURCE=tin-lizzie-lounge-balboa-blues,tin-lizzie-lounge-bluegrass,tin-lizzie-lounge-enrique-henao,tin-lizzie-lounge-christian-smith-quartet npm run generate-calendars`.
