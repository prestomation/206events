---
name: "Seattle University"
status: added
platform: Localist ICS
url: https://events.seattleu.edu/
tags: [Education, Community, "Capitol Hill"]
firstSeen: 2026-05-20
lastChecked: 2026-05-20
pr: 374
---
**Seattle University** — `https://events.seattleu.edu/` — Localist calendar platform with public ICS feed.

Investigated 2026-05-20:
- ICS feed at `https://events.seattleu.edu/calendar.ics` returns 200, valid iCalendar format
- 147+ upcoming events (after May 20, 2026) through at least June 2026 and beyond
- Events include public lectures, performances, art exhibitions, film screenings, athletic events, craft workshops, and community programs
- Feed accessible from GitHub Actions IPs (confirmed 200 response)
- Campus at 901 12th Ave, Seattle, WA 98122 (Capitol Hill)

Added 2026-05-20: Implemented as `sources/external/seattle-university.yaml`.
