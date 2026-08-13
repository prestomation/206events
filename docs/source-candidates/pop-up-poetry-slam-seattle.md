---
name: "Pop-Up Poetry Slam Seattle"
status: candidate
platform: Custom (Wix)
url: https://popuppoetryseattle.com/
tags: [Community]
firstSeen: 2026-08-13
lastChecked: 2026-08-13
pr:
---

Monthly pop-up poetry slam competition with cash prizes, rotating
venues around Seattle (episodes named by neighborhood, e.g. "West
Seattle"). Ticketing via a custom Wix event-details page, not a
third-party platform (no Eventbrite/DICE/Squarespace-commerce
integration found).

Investigated 2026-08-13:

- Site is Wix (`wixstatic.com` image CDN, standard Wix nav).
- `/event-list` currently shows exactly one event — "Episode Two: West
  Seattle featuring Christopher Diaz", **February 5, 2026** — which is
  already in the past as of this check (today is 2026-08-13). No other
  upcoming dates published.
- No ICS/API/structured feed found; would need a 🔴 Low custom HTML
  scraper if the events page were kept current.
- **200 + 0 upcoming events** per the pre-implementation fetch gate —
  do not implement yet. Re-check next cycle in case a new episode gets
  posted.
