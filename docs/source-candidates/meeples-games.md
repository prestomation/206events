---
name: Meeples Games Events
status: investigating
platform: Unknown
url: https://meeplesgames.com/events
tags: [Board-Games, West Seattle]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

West Seattle board game cafe hosting game nights, tournaments, and tabletop events.

**Findings (2026-08-14):** Blocked. Direct fetch (curl, browser UA) returns a bare HTML
shell with a meta-refresh to `/.well-known/sgcaptcha/?r=%2Fevents%2F...` — a SiteGround
JS/CAPTCHA challenge, same pattern as meaningful-movies.org and newseattlewaterfront.org.
Would need a proxy/browser-executing fetch to evaluate further. No prior "meeples" ripper
found in `sources/`.
