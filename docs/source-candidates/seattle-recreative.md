---
name: "Seattle Recreative"
status: notviable
platform: Acuity Scheduling
url: https://www.seattlerecreative.org/adult-classes
tags: [Workshops]
firstSeen: 2026-07-11
lastChecked: 2026-07-11
---

Nonprofit reuse/making studio offering adult and children's craft classes.

Investigated 2026-07-11:
- Site is built on Squarespace, but `/adult-classes` and `/calendars` are
  plain pages (`type: 10`, `itemCount: 0` via `?format=json`) — not a
  Squarespace events collection.
- Class booking is embedded via **Acuity Scheduling** (`acuityscheduling.com`),
  which has no public read-only feed suitable for scraping open class
  sessions as discrete events.
- Not viable without a real events collection or public API.
