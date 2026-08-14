---
name: Puget Sound Basketball
status: candidate
platform: Custom HTML (Next.js app)
url: https://app.pugetsoundbasketball.com
tags: [Playing-Sports]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Adult recreational basketball league in the Puget Sound region.

**Vetting notes (2026-08-14):** Live, actively operated site (Summer '26
season, current registration open). Has a `/schedule` page listing "Hoops on
Demand" drop-in games with dates, times, skill levels, and venues, plus team
league schedules. Built as a custom Next.js app (`/_next/image` asset paths) —
no public ICS/JSON feed found, so this would need HTML scraping of `/schedule`.
Not yet covered by any existing source. Worth a closer look at whether the
schedule page is scrapable without login (some links go to `/dashboard/hod`,
suggesting some content may be gated behind a player account).
