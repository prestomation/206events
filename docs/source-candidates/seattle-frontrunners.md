---
name: "Seattle Frontrunners"
status: added
pr: 822
platform: recurring YAML
url: https://www.seattlefrontrunners.org/runs-walks
tags: [Running, LGBTQ, "Capitol Hill", "Green Lake"]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
---

**Seattle Frontrunners** — LGBTQ+ running and walking club with decades of history in Seattle, hosting several weekly group runs/walks open to all paces.

Investigated 2026-07-02:
- `https://www.seattlefrontrunners.org/runs-walks` lists several "year-round" recurring runs, each with its own dedicated page:
  - **Monday Mini-Runs** (`/monday-night-mini-runs`) — Mondays 6:30 PM, Cal Anderson Park Shelterhouse (north side of Bobby Morris Playfield), 1635 11th Ave, Seattle, WA 98122. ~3 mile routes, rotating courses.
  - **Wednesday Night Run/Walk** (`/wednesday-night`) — Wednesdays 6:30 PM, in front of the Seattle Asian Art Museum, Volunteer Park, 1400 E Prospect St, Seattle, WA 98112. 4 mile run/walk through Capitol Hill, rain or shine.
  - **Saturday Morning Run/Walk** (`/saturday-morning`) — Saturdays 9:15 AM, west of Green Lake Community Center by the lakeshore lifeguard station, 7201 East Green Lake Dr N, Seattle, WA 98115.
  - **Tuesday Night Track** (`/tuesday-night-track`) — Tuesdays 7:00 PM, Roosevelt High School track, 1410 NE 66th St, Seattle, WA 98115. Seasonal (roughly March–Thanksgiving per site copy); exact start/end dates not stated, so left out of the initial implementation to avoid guessing a wrong season window.
  - Also mentioned but not implemented (irregular/semi-monthly cadence, no confirmed fixed weekly pattern): Thursday Trail Run (1st Wednesday of month, per search results — conflicting day naming on the site) and Gender Diverse Run/Walk (2nd & 4th Thursday).
- Coordinates confirmed via Nominatim: Cal Anderson Park (way 158721036, 47.6170377/-122.3191692 — matches existing `capitol-hill-running-club.yaml`), Seattle Asian Art Museum/Volunteer Park (way 36839785, 47.6302957/-122.3141354), Green Lake Community Center (way 34148647, 47.6802626/-122.3285083).
- No ICS/API feed; implemented as three separate `sources/recurring/*.yaml` files (one per distinct venue/schedule), following the existing pattern used by `capitol-hill-running-club.yaml` and `seattle-running-club-thursday-social-run.yaml`.

**Implemented 2026-07-02**: Monday, Wednesday, and Saturday runs added as recurring calendars. Tuesday Track (seasonal) and the semi-monthly trail/gender-diverse runs left for a future pass once exact dates can be confirmed.
