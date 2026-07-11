---
name: "The Works Seattle"
status: notviable
platform: Squarespace
url: https://www.theworksseattle.com/class-calendar
tags: [Workshops]
firstSeen: 2026-07-11
lastChecked: 2026-07-11
---

DIY craft studio offering hands-on classes and drop-in making.

Investigated 2026-07-11:
- Site is built on Squarespace, but `/class-calendar` and `/class-collection`
  are plain pages (`type: 10`, `itemCount: 0` via `?format=json`) — not a
  Squarespace events collection.
- No third-party booking widget signature detected in the static HTML
  (likely client-side JS rendering of the class list); no ICS feed found.
- Not viable without a real events collection or public API.
