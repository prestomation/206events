---
name: "The Beer Junction"
status: candidate
platform: Squarespace
url: https://www.thebeerjunction.com/upcoming-events
tags: [Beer, "West Seattle"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---
**The Beer Junction** — `https://www.thebeerjunction.com/upcoming-events` — West Seattle beer bar and bottle shop at 4511 California Ave SW. Hosts a monthly bike club ride/meetup plus occasional tap takeovers, draft nights, and anniversary parties.

Investigated 2026-07-01:
- Squarespace confirmed (`Squarespace` server header, `squarespace-cdn.com` assets)
- `/upcoming-events?format=json` returns `upcoming: [1]` — "Beer Junction Bike Club July" on 2026-07-25 (confirmed real future epoch `startDate`)
- `past` array shows 21 entries including monthly Bike Club rides, a 16th Anniversary Party, and a Magic: The Gathering draft night — an actively-used calendar, just currently light on scheduled future events
- Address confirmed via page HTML: 4511 California Ave SW, Seattle, WA 98116
