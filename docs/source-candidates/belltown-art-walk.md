---
name: "Belltown Art Walk"
status: candidate
platform: Recurring (Squarespace static site, no events collection)
url: https://www.belltownartwalk.com/
tags: [Artwalk, Belltown]
firstSeen: 2026-08-28
lastChecked: 2026-08-28
---

Free, self-guided monthly art walk through Belltown galleries and
businesses. Found via a "Seattle art walk gallery night calendar" search.

Investigated 2026-08-28:
- Site confirmed as Squarespace (`server: Squarespace` header), 200 OK
- `/`, `/events`, `/calendar`, `/art-walk` all `?format=json` to plain
  page content or 404 into the site shell — no populated events
  collection; the site is a static mission/donate/gallery-directory page,
  not a calendar
- `/mission` page text confirms the fixed schedule: "Second Friday of
  each month, year-round"

🔥 High confidence as a `sources/recurring/` entry — same pattern as
`rat-city-artwalk.yaml` and the proposed `west-seattle-art-walk.yaml`
(fixed "every 2nd Friday" schedule, self-guided multi-venue walk, no
structured feed to scrape). Confirm the exact time window (search
results suggest 6-9pm) and a representative geographic anchor for `geo`
before implementing.
