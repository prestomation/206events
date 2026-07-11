---
name: "WE RISE WINES"
status: notviable
platform: Tock (reservation widget)
url: https://www.werisewines.com/bar-events
tags: [Wine]
firstSeen: 2026-07-11
lastChecked: 2026-07-11
---

Seattle wine bar hosting winemaker pop-ups and themed bar nights.

Investigated 2026-07-11:
- Site is built on Squarespace, but `/bar-events` and `/events` are both
  plain pages (`type: 10`, `itemCount: 0` via `?format=json`) — not a
  Squarespace events collection.
- Event listing/booking is embedded via **Tock** (`exploretock.com`), a
  restaurant reservation platform with no public read-only feed suitable
  for scraping.
- No ICS feed found. Not viable without a real events collection or
  public API.
