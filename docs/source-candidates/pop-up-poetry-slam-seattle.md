---
name: "Pop-Up Poetry Slam Seattle"
status: notviable
platform: Custom (Wix)
url: https://popuppoetryseattle.com/
tags: [Community]
firstSeen: 2026-08-13
lastChecked: 2026-09-23
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

2026-09-23: Closed: `/event-list` still shows only the single Feb 5, 2026 "Episode Two: West Seattle" event (Wix `startDate` 2026-02-06T03:00Z), now 7+ months in the past with no new episode posted. Series appears dormant; re-open as a new candidate if new episodes are listed.

2026-09-23 (re-verified): re-fetched `/event-list`. The only Wix event is still
"Episode Two: West Seattle" (`startDate` 2026-02-06T03:00Z); nothing is upcoming.
Notviable confirmed.
